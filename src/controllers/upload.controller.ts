import type { RequestHandler, Response } from 'express';
import type { AuthRequest } from '../types/index.js';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import prisma from '../utils/prisma.js';
import { getObjectFromR2, isR2Configured, uploadBufferToR2, validateR2Access } from '../utils/r2.js';
import {
  getSemesterClosedMessage,
  getSemesterSubmissionStatus,
  getSemesterWithScope,
  normalizeSemesterName,
} from '../utils/semester.js';

const uploadRootDir = path.join(process.cwd(), 'uploads', 'evidence');
if (!fs.existsSync(uploadRootDir)) fs.mkdirSync(uploadRootDir, { recursive: true });

const ALLOWED_EVIDENCE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_EVIDENCE_MIME_TO_EXTENSIONS = new Map<string, string[]>([
  ['application/pdf', ['.pdf']],
  ['application/msword', ['.doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/pjpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
]);

const CONTENT_TYPE_BY_EXTENSION = new Map<string, string>([
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
]);

type EvidenceFilePayload = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const criterionIdRegex = /^\d+\.\d+$/;

const resolveEvidenceExtension = (file: Express.Multer.File) => {
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();

  const allowedExtByMime = ALLOWED_EVIDENCE_MIME_TO_EXTENSIONS.get(mimetype) || [];
  if (ext && ALLOWED_EVIDENCE_EXTENSIONS.has(ext) && allowedExtByMime.includes(ext)) {
    return ext;
  }

  return allowedExtByMime[0] || '';
};

const hasAllowedEvidenceType = (file: Express.Multer.File) => Boolean(resolveEvidenceExtension(file));

export const upload: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
    fields: 12,
    fieldSize: 64 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!hasAllowedEvidenceType(file)) {
      cb(new Error('Chi ho tro: PDF, Word, hinh anh'));
      return;
    }
    cb(null, true);
  },
}).array('files', 10);

const sanitizeSegment = (value: string) => {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'unknown';
};

const parseDetails = (raw: unknown): Record<string, any> => {
  let parsed: unknown = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof parsed !== 'string') break;
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, any>;
};

const normalizeStoredFiles = (raw: unknown): Array<{ path: string; name?: string; size?: number }> => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { path: item };
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const filePath = typeof record.path === 'string' ? record.path : '';
      if (!filePath) return null;
      return {
        path: filePath,
        name: typeof record.name === 'string' ? record.name : undefined,
        size: typeof record.size === 'number' ? record.size : undefined,
      };
    })
    .filter((item): item is { path: string; name?: string; size?: number } => Boolean(item));
};

const toCriterionToken = (criterionId: string) => criterionId.replace(/\D/g, '');

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fileBaseWithoutExt = (filePath: string) => {
  const normalizedPath = filePath
    .replace(/^r2:/i, '')
    .replace(/^uploads\/evidence\//i, '')
    .replace(/\\/g, '/');
  const fileName = path.posix.basename(normalizedPath);
  const ext = path.posix.extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
};

const getExtensionForFile = (file: Express.Multer.File) => {
  return resolveEvidenceExtension(file);
};

const compressImageTo720p = async (
  file: Express.Multer.File,
  extension: string,
): Promise<EvidenceFilePayload> => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (!mimetype.startsWith('image/') || extension === '.gif') {
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  const transformer = sharp(file.buffer)
    .rotate()
    .resize({
      width: 1280,
      height: 720,
      fit: 'inside',
      withoutEnlargement: true,
    });

  let buffer: Buffer;
  let outputMimeType = file.mimetype;

  if (extension === '.jpg' || extension === '.jpeg') {
    buffer = await transformer.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    outputMimeType = 'image/jpeg';
  } else if (extension === '.png') {
    buffer = await transformer.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    outputMimeType = 'image/png';
  } else if (extension === '.webp') {
    buffer = await transformer.webp({ quality: 80 }).toBuffer();
    outputMimeType = 'image/webp';
  } else {
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  return {
    buffer,
    mimetype: outputMimeType,
    size: buffer.length,
  };
};

const decodeEvidenceKey = (rawKey: string) => {
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
};

const normalizeLocalEvidenceKey = (value: string) =>
  String(value || '')
    .replace(/^uploads\/evidence\//i, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .trim();

const resolveLocalEvidencePath = (rawKey: string) => {
  const normalized = normalizeLocalEvidenceKey(rawKey);
  if (!normalized || normalized.includes('\0')) return null;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;

  const basePath = path.resolve(uploadRootDir);
  const candidatePath = path.resolve(basePath, ...segments);
  if (candidatePath !== basePath && !candidatePath.startsWith(`${basePath}${path.sep}`)) {
    return null;
  }

  return candidatePath;
};

const applyCommonEvidenceHeaders = (res: Response) => {
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};

const getNextIndexForCriterion = async (studentId: number, studentCode: string, criterionToken: string) => {
  const pattern = new RegExp(`^${escapeRegex(studentCode)}-${escapeRegex(criterionToken)}-(\\d+)$`, 'i');
  const rows = await (prisma.trainingScore as any).findMany({
    where: { student_id: studentId },
    select: { details: true },
  });

  let maxIndex = 0;

  for (const row of rows) {
    const details = parseDetails(row.details);
    for (const detail of Object.values(details)) {
      if (!detail || typeof detail !== 'object') continue;
      const files = normalizeStoredFiles((detail as Record<string, unknown>).files);

      for (const file of files) {
        const base = fileBaseWithoutExt(file.path);
        const matched = base.match(pattern);
        if (!matched) continue;
        const parsedIndex = Number(matched[1]);
        if (!Number.isNaN(parsedIndex) && parsedIndex > maxIndex) {
          maxIndex = parsedIndex;
        }
      }
    }
  }

  return maxIndex + 1;
};

const saveLocally = async (
  file: EvidenceFilePayload,
  classFolder: string,
  studentFolder: string,
  finalFileName: string,
) => {
  const relativePath = path.posix.join(classFolder, studentFolder, finalFileName);
  const fullPath = path.join(uploadRootDir, classFolder, studentFolder, finalFileName);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, file.buffer);

  return {
    name: finalFileName,
    path: relativePath,
    size: file.size,
  };
};

const saveToR2 = async (
  file: EvidenceFilePayload,
  classFolder: string,
  studentFolder: string,
  finalFileName: string,
) => {
  const objectKey = `${classFolder}/${studentFolder}/${finalFileName}`;
  const key = await uploadBufferToR2({
    buffer: file.buffer,
    contentType: file.mimetype,
    originalName: finalFileName,
    objectKey,
  });

  return {
    name: finalFileName,
    path: `r2:${key}`,
    size: file.size,
  };
};

const upsertEvidenceToTrainingScore = async ({
  studentId,
  semester,
  criterionId,
  files,
}: {
  studentId: number;
  semester: string;
  criterionId: string;
  files: Array<{ name: string; path: string; size: number }>;
}) => {
  const existing = await (prisma.trainingScore as any).findFirst({
    where: {
      student_id: studentId,
      semester_id: semester,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!existing) {
    return (prisma.trainingScore as any).create({
      data: {
        student_id: studentId,
        semester_id: semester,
        y_thuc: 0,
        hoat_dong: 0,
        ky_luat: 0,
        total: 0,
        status: 'PENDING',
        details: {
          [criterionId]: {
            score: 0,
            files,
          },
        },
      },
    });
  }

  const details = parseDetails(existing.details);
  const currentCriterion = details[criterionId] && typeof details[criterionId] === 'object'
    ? (details[criterionId] as Record<string, unknown>)
    : {};
  const existingFiles = normalizeStoredFiles(currentCriterion.files);

  details[criterionId] = {
    ...currentCriterion,
    score: Number(currentCriterion.score || 0),
    files: [...existingFiles, ...files],
  };

  return (prisma.trainingScore as any).update({
    where: { id: existing.id },
    data: {
      details,
      status: 'PENDING',
      admin_y_thuc: null,
      admin_hoat_dong: null,
      admin_ky_luat: null,
      admin_total: null,
      admin_details: null,
      admin_notes: null,
    },
  });
};

export const uploadEvidence = (req: AuthRequest, res: Response) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    const files = (req as any).files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Khong co file nao duoc gui' });
    }

    const criterionId = String((req.body as any)?.criterionId || '').trim();
    const semester = normalizeSemesterName((req.body as any)?.semester);
    const bodyStudentId = Number((req.body as any)?.student_id || (req.body as any)?.studentId || 0);
    const requestRole = String(req.user?.role || '').toUpperCase();
    const studentIdFromToken = Number(req.user?.studentId || 0);

    if (!criterionId || !criterionIdRegex.test(criterionId)) {
      return res.status(400).json({ message: 'criterionId khong hop le' });
    }
    if (!semester) {
      return res.status(400).json({ message: 'Thieu hoc ky (semester)' });
    }

    const studentId = requestRole === 'STUDENT' ? studentIdFromToken : bodyStudentId;
    if (!studentId || Number.isNaN(studentId)) {
      return res.status(400).json({ message: 'Khong xac dinh duoc sinh vien upload' });
    }

    const criterionToken = toCriterionToken(criterionId);
    if (!criterionToken) {
      return res.status(400).json({ message: 'Muc minh chung khong hop le' });
    }

    try {
      const student = await (prisma.student as any).findUnique({
        where: { id: studentId },
        select: { id: true, student_code: true, class_id: true },
      });

      if (!student) {
        return res.status(404).json({ message: 'Khong tim thay sinh vien' });
      }

      const classId = String(student.class_id || '').trim().toUpperCase();
      const semesterConfig = await getSemesterWithScope(semester);
      const submissionStatus = getSemesterSubmissionStatus({
        semesterName: semester,
        semester: semesterConfig,
        classId,
      });

      if (!submissionStatus.isOpen) {
        return res.status(400).json({
          message: getSemesterClosedMessage(submissionStatus),
          submission: submissionStatus,
        });
      }

      const studentCode = sanitizeSegment(String(student.student_code || `SV${studentId}`)).toUpperCase();
      const classFolder = sanitizeSegment(String(student.class_id || 'unknown-class'));
      const studentFolder = studentCode;
      const startIndex = await getNextIndexForCriterion(studentId, studentCode, criterionToken);
      const useR2 = isR2Configured();

      if (useR2) {
        const validation = await validateR2Access();
        if (!validation.ok) {
          return res.status(500).json({
            message: `R2 chua san sang: ${validation.message}`,
          });
        }
      }

      const saved = await Promise.all(
        files.map(async (file, offset) => {
          const index = startIndex + offset;
          const extension = getExtensionForFile(file);
          const finalFileName = `${studentCode}-${criterionToken}-${index}${extension}`;
          const payload = await compressImageTo720p(file, extension);
          return useR2
            ? saveToR2(payload, classFolder, studentFolder, finalFileName)
            : saveLocally(payload, classFolder, studentFolder, finalFileName);
        }),
      );

      const updatedScore = await upsertEvidenceToTrainingScore({
        studentId,
        semester,
        criterionId,
        files: saved,
      });

      return res.json({
        message: useR2 ? 'Upload thanh cong len Cloudflare R2' : 'Upload thanh cong',
        files: saved,
        storage: useR2 ? 'r2' : 'local',
        criterionId,
        semester,
        trainingScoreId: updatedScore?.id,
      });
    } catch (uploadError: any) {
      console.error('Evidence upload failed:', uploadError);
      return res.status(500).json({ message: uploadError?.message || 'Khong the luu minh chung' });
    }
  });
};

export const getEvidenceFile = async (req: AuthRequest, res: Response) => {
  const rawKey = String(req.params.encodedKey || '').trim();
  if (!rawKey) {
    return res.status(400).json({ message: 'Thieu ma file minh chung' });
  }

  const decodedKey = decodeEvidenceKey(rawKey);

  const streamFromR2 = async (objectKey: string) => {
    const response = await getObjectFromR2(objectKey);
    if (!response) return false;

    if (response.contentType) res.setHeader('Content-Type', response.contentType);
    if (response.contentLength) res.setHeader('Content-Length', response.contentLength);
    if (response.eTag) res.setHeader('ETag', response.eTag);
    if (response.lastModified) res.setHeader('Last-Modified', response.lastModified.toUTCString());
    applyCommonEvidenceHeaders(res);

    response.body.on('error', (streamError) => {
      console.error('Evidence R2 stream failed:', streamError);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Khong the doc minh chung tu Cloudflare R2' });
      } else {
        res.destroy(streamError as Error);
      }
    });

    response.body.pipe(res);
    return true;
  };

  try {
    if (decodedKey.toLowerCase().startsWith('r2:')) {
      if (!isR2Configured()) {
        return res.status(500).json({ message: 'Cloudflare R2 chua duoc cau hinh' });
      }

      const served = await streamFromR2(decodedKey.slice(3));
      if (!served) {
        return res.status(404).json({ message: 'Khong tim thay minh chung' });
      }
      return;
    }

    const localFilePath = resolveLocalEvidencePath(decodedKey);
    if (localFilePath) {
      try {
        const stats = await fsp.stat(localFilePath);
        if (!stats.isFile()) {
          return res.status(404).json({ message: 'Khong tim thay minh chung' });
        }

        const extension = path.extname(localFilePath).toLowerCase();
        const contentType = CONTENT_TYPE_BY_EXTENSION.get(extension);
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', String(stats.size));
        applyCommonEvidenceHeaders(res);

        const localStream = fs.createReadStream(localFilePath);
        localStream.on('error', (streamError) => {
          console.error('Evidence local stream failed:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Khong the doc minh chung tu bo nho cuc bo' });
          } else {
            res.destroy(streamError as Error);
          }
        });

        localStream.pipe(res);
        return;
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    if (isR2Configured()) {
      const served = await streamFromR2(decodedKey);
      if (served) return;
    }

    return res.status(404).json({ message: 'Khong tim thay minh chung' });
  } catch (error) {
    console.error('Evidence proxy failed:', error);
    return res.status(500).json({ message: 'Khong the doc minh chung' });
  }
};

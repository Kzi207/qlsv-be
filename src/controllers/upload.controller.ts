import type { RequestHandler, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import multer from 'multer';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import prisma from '../utils/prisma';
import { getObjectFromR2, isR2Configured, uploadBufferToR2, validateR2Access } from '../utils/r2';
import {
  getSemesterClosedMessage,
  getSemesterSubmissionStatus,
  getSemesterWithScope,
  normalizeSemesterName,
} from '../utils/semester';

const uploadRootDir = path.join(process.cwd(), 'uploads', 'evidence');
if (!fs.existsSync(uploadRootDir)) fs.mkdirSync(uploadRootDir, { recursive: true });

const allowedFileRegex = /pdf|doc|docx|jpg|jpeg|png|gif|webp/i;
const criterionIdRegex = /^\d+\.\d+$/;

export const upload: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (allowedFileRegex.test(ext)) cb(null, true);
    else cb(new Error('Chi ho tro: PDF, Word, hinh anh'));
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
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext) return ext;

  const mimetype = String(file.mimetype || '').toLowerCase();
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'application/pdf') return '.pdf';
  if (mimetype === 'application/msword') return '.doc';
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  return '';
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
  file: Express.Multer.File,
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
  file: Express.Multer.File,
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
          return useR2
            ? saveToR2(file, classFolder, studentFolder, finalFileName)
            : saveLocally(file, classFolder, studentFolder, finalFileName);
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

  if (!isR2Configured()) {
    return res.status(500).json({ message: 'Cloudflare R2 chua duoc cau hinh' });
  }

  const objectKey = (() => {
    try {
      return decodeURIComponent(rawKey);
    } catch {
      return rawKey;
    }
  })();

  try {
    const response = await getObjectFromR2(objectKey);
    if (!response) {
      return res.status(404).json({ message: 'Khong tim thay minh chung' });
    }

    const contentType = response.contentType;
    const contentLength = response.contentLength;
    const eTag = response.eTag;
    const lastModified = response.lastModified;

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (eTag) res.setHeader('ETag', eTag);
    if (lastModified) res.setHeader('Last-Modified', lastModified.toUTCString());
    res.setHeader('Cache-Control', 'private, max-age=3600');

    response.body.pipe(res);
  } catch (error) {
    console.error('Evidence proxy failed:', error);
    return res.status(500).json({ message: 'Khong the doc minh chung tu Cloudflare R2' });
  }
};

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { normalizeSemesterName } from '../utils/semester.js';
import type { AuthRequest } from '../types/index.js';

interface QrAwardActivity {
  source: 'QR_ATTENDANCE';
  attendanceId: number;
  sessionId: number;
  activityName: string;
  points: number;
  checkedInAt: string;
}

const EARTH_RADIUS_METERS = 6371e3;
const criterionIdRegex = /^\d+\.\d+$/;
const sectionIdRegex = /^sec-[1-5]$/i;

const isPrismaUniqueViolation = (error: unknown, fields: string[]) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown })?.target;
  if (!Array.isArray(target)) return false;
  return fields.every((field) => target.includes(field));
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const parseFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalDate = (value: unknown): Date | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const hasInputValue = (value: unknown): boolean => String(value ?? '').trim() !== '';

const parseDetails = (raw: unknown): Record<string, any> => {
  let parsed = raw;
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
      if (typeof item === 'string') return { path: item };
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, any>;
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

const normalizeQrActivities = (raw: unknown): QrAwardActivity[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, any>;
      const source = String(record.source || '').trim().toUpperCase();
      if (source && source !== 'QR_ATTENDANCE') return null;
      const sessionId = Number(record.sessionId || record.session_id || 0);
      const attendanceId = Number(record.attendanceId || record.attendance_id || 0);
      const points = Number(record.points || 0);
      const checkedInAt = String(record.checkedInAt || record.checked_in_at || '').trim();
      const activityName = String(record.activityName || record.activity_name || '').trim();
      if (!sessionId || !attendanceId || !Number.isFinite(points) || points <= 0 || !checkedInAt) return null;
      return {
        source: 'QR_ATTENDANCE' as const,
        sessionId,
        attendanceId,
        points,
        checkedInAt,
        activityName: activityName || 'Hoat dong QR',
      };
    })
    .filter((item): item is QrAwardActivity => Boolean(item));
};

const computeTrainingTotalsFromDetails = (details: Record<string, any>) => {
  let sec1 = 0;
  let sec2 = 0;
  let sec3 = 0;
  let sec4 = 0;
  let sec5 = 0;
  for (const [criterionId, payload] of Object.entries(details)) {
    if (!payload || typeof payload !== 'object') continue;
    const score = Number((payload as any).score || 0);
    if (!Number.isFinite(score)) continue;
    const sectionToken = String(criterionId || '').split('.')[0];
    if (sectionToken === '1') sec1 += score;
    else if (sectionToken === '2') sec2 += score;
    else if (sectionToken === '3') sec3 += score;
    else if (sectionToken === '4') sec4 += score;
    else if (sectionToken === '5') sec5 += score;
  }
  const y_thuc = Math.min(sec1, 20);
  const hoat_dong = Math.min(sec2 + sec3, 45);
  const ky_luat = Math.min(sec4 + sec5, 35);
  const total = Math.min(y_thuc + hoat_dong + ky_luat, 100);
  return { y_thuc, hoat_dong, ky_luat, total };
};

const normalizeClassId = (value: unknown): string => String(value || '').trim().toUpperCase();

const normalizeIp = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1')
    .toLowerCase();

const extractClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] || '' : String(forwarded || '');
  const firstForwarded = rawForwarded.split(',')[0]?.trim() || '';
  const fallbackIp = String(req.ip || '').trim();
  return normalizeIp(firstForwarded || fallbackIp || 'unknown');
};

const parseDayRange = (value: unknown) => {
  const selectedDate = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(selectedDate.getTime())) {
    return null;
  }
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
};

const getRequestRole = (req: AuthRequest): string => String(req.user?.role || '').toUpperCase();

const getStudentIdFromRequest = (req: AuthRequest): number => Number(req.user?.studentId);

const normalizeSessionType = (value: unknown): 'QR_CLASS' | 'ACTIVITY' => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ACTIVITY') return 'ACTIVITY';
  return 'QR_CLASS';
};

const getManagedClassId = (req: AuthRequest, requestedClassId?: string, required = false) => {
  const role = getRequestRole(req);
  const normalizedRequested = normalizeClassId(requestedClassId);

  if (role === 'BCH') {
    const ownClassId = normalizeClassId(req.user?.class_id);
    if (!ownClassId) {
      return { error: { status: 403, message: 'Tai khoan BCH chua duoc gan lop quan ly' } };
    }

    if (normalizedRequested && normalizedRequested !== ownClassId) {
      return { error: { status: 403, message: 'BCH chi duoc thao tac tren lop duoc phan cong' } };
    }

    if (!normalizedRequested && !required) {
      return { classId: undefined };
    }

    return { classId: ownClassId };
  }

  if (required && !normalizedRequested) {
    return { error: { status: 400, message: 'Vui long chon lop' } };
  }

  return { classId: normalizedRequested || undefined };
};

const ensureSessionAccess = (req: AuthRequest, sessionClassId?: string | null) => {
  const role = getRequestRole(req);
  if (role !== 'BCH') return null;

  if (!sessionClassId) {
    return null;
  }

  const ownClassId = normalizeClassId(req.user?.class_id);
  if (!ownClassId || ownClassId !== normalizeClassId(sessionClassId)) {
    return { status: 403, message: 'BCH khong duoc xem phien cua lop khac' };
  }

  return null;
};

export const checkAttendance = async (req: Request, res: Response) => {
  const { student_id, date, status } = req.body;
  const dayRange = parseDayRange(date);
  if (!dayRange) {
    return res.status(400).json({ message: 'Ngay diem danh khong hop le' });
  }
  try {
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        student_id: Number(student_id),
        session_id: null,
        date: {
          gte: dayRange.startOfDay,
          lte: dayRange.endOfDay,
        },
      },
    });
    if (existingAttendance) {
      const updatedAttendance = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: { status },
      });
      return res.json(updatedAttendance);
    }
    const attendance = await prisma.attendance.create({
      data: {
        student_id: Number(student_id),
        date: new Date(date),
        status,
      },
    });
    return res.status(201).json(attendance);
  } catch (error) {
    console.error('checkAttendance error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAttendanceByDate = async (req: Request, res: Response) => {
  const { date, classId } = req.query;
  const dayRange = parseDayRange(typeof date === 'string' ? date : undefined);
  if (!dayRange) {
    return res.status(400).json({ message: 'Ngay loc khong hop le' });
  }
  const normalizedClassId = normalizeClassId(classId);
  try {
    const attendance = await prisma.attendance.findMany({
      where: {
        date: {
          gte: dayRange.startOfDay,
          lte: dayRange.endOfDay,
        },
        student: normalizedClassId
          ? {
              class_id: normalizedClassId,
            }
          : undefined,
      },
      include: {
        student: true,
        session: {
          include: {
            class: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }],
    });
    return res.json(attendance);
  } catch (error) {
    console.error('getAttendanceByDate error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAttendanceByStudent = async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const numericStudentId = Number(studentId);
  if (!Number.isFinite(numericStudentId) || numericStudentId <= 0) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }
  try {
    const attendance = await prisma.attendance.findMany({
      where: { student_id: numericStudentId },
      include: {
        session: {
          include: {
            class: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
    return res.json(attendance);
  } catch (error) {
    console.error('getAttendanceByStudent error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createAttendanceSession = async (req: AuthRequest, res: Response) => {
  const { title, subject, sessionDate, lat, lng, radius, class_id } = req.body;
  const sessionType = normalizeSessionType(req.body?.session_type ?? req.body?.sessionType);
  const checkInStartAtInput = req.body?.check_in_start_at ?? req.body?.checkInStartAt ?? req.body?.startAt ?? '';
  const checkInEndAtInput = req.body?.check_in_end_at ?? req.body?.checkInEndAt ?? req.body?.endAt ?? '';
  const rawSectionId = String(req.body?.drl_section_id ?? req.body?.drlSectionId ?? req.body?.sectionId ?? '')
    .trim()
    .toLowerCase();
  const rawCriterionId = String(req.body?.drl_criterion_id ?? req.body?.drlCriterionId ?? req.body?.criterionId ?? '').trim();
  const parsedDrlPoints = parseFiniteNumber(req.body?.drl_points ?? req.body?.drlPoints ?? req.body?.points);
  const rawSemesterName = normalizeSemesterName(req.body?.drl_semester_id ?? req.body?.drlSemesterId ?? req.body?.semester ?? '');

  const managedClassResult = getManagedClassId(req, class_id, sessionType === 'QR_CLASS');
  if (managedClassResult.error) {
    return res.status(managedClassResult.error.status).json({ message: managedClassResult.error.message });
  }

  const parsedLat = parseFiniteNumber(lat);
  const parsedLng = parseFiniteNumber(lng);
  const parsedRadius = parseFiniteNumber(radius);
  const normalizedClassId = managedClassResult.classId;
  const parsedSessionDate = sessionDate ? new Date(sessionDate) : new Date();
  const hasStartAtInput = hasInputValue(checkInStartAtInput);
  const hasEndAtInput = hasInputValue(checkInEndAtInput);
  const parsedCheckInStartAt = parseOptionalDate(checkInStartAtInput);
  const parsedCheckInEndAt = parseOptionalDate(checkInEndAtInput);
  const hasDrlConfigInput = Boolean(rawSectionId || rawCriterionId || parsedDrlPoints !== null);

  if (!title || !String(title).trim()) {
    return res.status(400).json({ message: 'Vui long nhap ten phien diem danh' });
  }
  if (
    parsedLat === null ||
    parsedLng === null ||
    parsedRadius === null ||
    parsedRadius <= 0 ||
    Number.isNaN(parsedSessionDate.getTime())
  ) {
    return res.status(400).json({ message: 'Du lieu vi tri hoac ban kinh khong hop le' });
  }
  if ((hasStartAtInput && !parsedCheckInStartAt) || (hasEndAtInput && !parsedCheckInEndAt)) {
    return res.status(400).json({ message: 'Thoi gian diem danh khong hop le' });
  }
  if (
    parsedCheckInStartAt &&
    parsedCheckInEndAt &&
    parsedCheckInStartAt.getTime() >= parsedCheckInEndAt.getTime()
  ) {
    return res.status(400).json({ message: 'Thoi gian bat dau phai nho hon thoi gian ket thuc' });
  }

  if (hasDrlConfigInput) {
    if (!sectionIdRegex.test(rawSectionId)) {
      return res.status(400).json({ message: 'Muc lon DRL khong hop le' });
    }
    if (!criterionIdRegex.test(rawCriterionId)) {
      return res.status(400).json({ message: 'Muc nho DRL khong hop le' });
    }
    if (!parsedDrlPoints || parsedDrlPoints <= 0) {
      return res.status(400).json({ message: 'Diem cong hoat dong phai lon hon 0' });
    }
    const sectionToken = rawSectionId.replace('sec-', '').trim();
    const criterionSectionToken = rawCriterionId.split('.')[0];
    if (criterionSectionToken !== sectionToken) {
      return res.status(400).json({ message: 'Muc lon va muc nho DRL khong khop nhau' });
    }
  }

  try {
    let targetClass = null;
    if (normalizedClassId) {
      targetClass = await prisma.class.findUnique({
        where: { name: normalizedClassId },
        select: {
          name: true,
          active_semester_id: true,
        },
      });
      if (!targetClass) {
        return res.status(404).json({ message: 'Khong tim thay lop da chon' });
      }
    }

    let resolvedSemesterId = '';
    if (hasDrlConfigInput) {
      resolvedSemesterId = rawSemesterName || normalizeSemesterName(targetClass?.active_semester_id);
      if (!resolvedSemesterId) {
        return res.status(400).json({
          message: 'Hoc ky hien hanh chua duoc xac dinh. Vui long chon lop co hoc ky hoac chon truc tiep hoc ky cho hoat dong.',
        });
      }
      const semester = await prisma.semester.findUnique({
        where: { name: resolvedSemesterId },
        select: { name: true },
      });
      if (!semester) {
        return res.status(400).json({ message: 'Hoc ky DRL duoc chon khong ton tai' });
      }
    }

    const qrToken = crypto.randomBytes(32).toString('hex');
    const session = await prisma.$transaction(async (tx) => {
      if (normalizedClassId) {
        await tx.attendanceSession.updateMany({
          where: {
            class_id: normalizedClassId,
            isActive: true,
          },
          data: {
            isActive: false,
            endedAt: new Date(),
          },
        });
      }
      return tx.attendanceSession.create({
        data: {
          session_type: sessionType,
          title: String(title).trim(),
          subject: String(subject || '').trim(),
          sessionDate: parsedSessionDate,
          check_in_start_at: parsedCheckInStartAt,
          check_in_end_at: parsedCheckInEndAt,
          lat: parsedLat,
          lng: parsedLng,
          radius: parsedRadius,
          qrToken,
          class_id: normalizedClassId || null,
          drl_section_id: hasDrlConfigInput ? rawSectionId : null,
          drl_criterion_id: hasDrlConfigInput ? rawCriterionId : null,
          drl_points: hasDrlConfigInput ? Math.round(parsedDrlPoints || 0) : null,
          drl_semester_id: hasDrlConfigInput ? resolvedSemesterId : null,
        },
        include: {
          class: true,
        },
      });
    });

    return res.status(201).json(session);
  } catch (error) {
    console.error('createAttendanceSession error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAttendanceSessions = async (req: AuthRequest, res: Response) => {
  const { classId, isActive, date, limit, sessionType } = req.query;
  const managedClassResult = getManagedClassId(req, typeof classId === 'string' ? classId : undefined, false);
  if (managedClassResult.error) {
    return res.status(managedClassResult.error.status).json({ message: managedClassResult.error.message });
  }
  const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedClassId = managedClassResult.classId;
  const parsedIsActive =
    typeof isActive === 'string'
      ? isActive.toLowerCase() === 'true'
        ? true
        : isActive.toLowerCase() === 'false'
        ? false
        : undefined
      : undefined;
  const dayRange = typeof date === 'string' ? parseDayRange(date) : null;
  const parsedSessionType = typeof sessionType === 'string' ? normalizeSessionType(sessionType) : undefined;
  try {
    const where: any = {
      isActive: parsedIsActive,
      sessionDate: dayRange
        ? {
            gte: dayRange.startOfDay,
            lte: dayRange.endOfDay,
          }
        : undefined,
      session_type: parsedSessionType,
    };
    if (normalizedClassId) {
      where.class_id = normalizedClassId;
    } else {
      if (parsedSessionType === 'QR_CLASS') {
        where.NOT = { class_id: null };
      }
    }
    const sessions = await prisma.attendanceSession.findMany({
      where,
      include: {
        class: true,
        _count: {
          select: {
            attendances: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { sessionDate: 'desc' }, { createdAt: 'desc' }],
      take: numericLimit,
    });
    return res.json(
      sessions.map((session) => ({
        ...session,
        attendeeCount: session._count.attendances,
      })),
    );
  } catch (error) {
    console.error('getAttendanceSessions error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getActiveSessions = async (req: AuthRequest, res: Response) => {
  const role = getRequestRole(req);
  let classIdFilter: string | undefined;
  const now = new Date();
  if (role === 'BCH') {
    const managedClassResult = getManagedClassId(req, undefined, true);
    if (managedClassResult.error) {
      return res.status(managedClassResult.error.status).json({ message: managedClassResult.error.message });
    }
    classIdFilter = managedClassResult.classId;
  }
  if (role === 'STUDENT') {
    const studentId = getStudentIdFromRequest(req);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(403).json({ message: 'Only students can view active QR sessions' });
    }
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { class_id: true },
    });
    classIdFilter = student?.class_id;
  }
  try {
    const where: any = {
      isActive: true,
    };
    if (role === 'STUDENT') {
      where.OR = [
        {
          check_in_start_at: null,
        },
        {
          check_in_start_at: {
            lte: now,
          },
        },
      ];
      where.AND = [
        {
          OR: [
            { check_in_end_at: null },
            {
              check_in_end_at: {
                gte: now,
              },
            },
          ],
        },
      ];
    }
    if (classIdFilter) {
      where.class_id = classIdFilter;
    }
    const sessions = await prisma.attendanceSession.findMany({
      where,
      include: {
        class: true,
        _count: {
          select: {
            attendances: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return res.json(
      sessions.map((session) => ({
        ...session,
        attendeeCount: session._count.attendances,
      })),
    );
  } catch (error) {
    console.error('getActiveSessions error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const qrCheckIn = async (req: AuthRequest, res: Response) => {
  const { qrToken, lat, lng } = req.body;
  const studentId = getStudentIdFromRequest(req);
  const parsedLat = parseFiniteNumber(lat);
  const parsedLng = parseFiniteNumber(lng);
  const clientIp = extractClientIp(req);
  const deviceInfo = req.headers['user-agent'] || 'unknown';

  if (typeof qrToken !== 'string' || !qrToken.trim()) {
    return res.status(400).json({ message: 'Thieu ma QR hop le' });
  }
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return res.status(403).json({ message: 'Chi sinh vien moi duoc diem danh QR' });
  }
  if (parsedLat === null || parsedLng === null) {
    return res.status(400).json({ message: 'Vi tri GPS khong hop le' });
  }

  try {
    const session = await prisma.attendanceSession.findFirst({
      where: {
        qrToken: qrToken.trim(),
        isActive: true,
      },
      include: {
        class: true,
      },
    });
    if (!session) {
      return res.status(404).json({ message: 'Phien diem danh khong ton tai hoac da ket thuc' });
    }
    const now = new Date();
    const startAt = session.check_in_start_at ? new Date(session.check_in_start_at) : null;
    const endAt = session.check_in_end_at ? new Date(session.check_in_end_at) : null;

    if (startAt && now.getTime() < startAt.getTime()) {
      return res.status(400).json({
        message: 'Phien diem danh chua bat dau',
        startAt: startAt.toISOString(),
      });
    }
    if (endAt && now.getTime() > endAt.getTime()) {
      return res.status(400).json({
        message: 'Phien diem danh da het thoi gian',
        endAt: endAt.toISOString(),
      });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        attendanceProfile: true,
      },
    });
    if (!student) {
      return res.status(404).json({ message: 'Khong tim thay sinh vien' });
    }

    if (session.class_id) {
      if (normalizeClassId(student.class_id) !== normalizeClassId(session.class_id)) {
        return res.status(403).json({ message: 'Sinh vien khong thuoc lop cua phien diem danh nay' });
      }
    }

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        student_id: studentId,
        session_id: session.id,
      },
    });
    if (existingAttendance) {
      return res.status(400).json({ message: 'Sinh vien da diem danh cho phien nay' });
    }

    const sessionDistance = getDistance(parsedLat, parsedLng, session.lat, session.lng);
    if (sessionDistance > session.radius) {
      return res.status(400).json({
        message: 'Vi tri hien tai nam ngoai ban kinh cho phep cua lop hoc',
        distance: Math.round(sessionDistance),
        limit: Math.round(session.radius),
      });
    }

    const attendanceProfile = student.attendanceProfile;
    const baselineCreated = !attendanceProfile;
    let verifiedIp = true;
    let verifiedLocation = true;
    let profileDistance = null;

    if (attendanceProfile) {
      if (normalizeIp(attendanceProfile.firstIpAddress) !== 'unknown') {
        verifiedIp = normalizeIp(attendanceProfile.firstIpAddress) === normalizeIp(clientIp);
      }
      profileDistance = getDistance(
        parsedLat,
        parsedLng,
        attendanceProfile.firstLatitude,
        attendanceProfile.firstLongitude,
      );
      verifiedLocation = profileDistance <= session.radius;
      if (!verifiedIp) {
        return res.status(400).json({ message: 'IP hien tai khong khop voi lan xac minh dau tien' });
      }
      if (!verifiedLocation) {
        return res.status(400).json({
          message: 'Vi tri hien tai khong khop voi toa do da luu tren he thong',
          profileDistance: Math.round(profileDistance),
          limit: Math.round(session.radius),
        });
      }
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      if (!attendanceProfile) {
        await tx.studentAttendanceProfile.create({
          data: {
            student_id: studentId,
            firstIpAddress: clientIp,
            firstLatitude: parsedLat,
            firstLongitude: parsedLng,
            lastIpAddress: clientIp,
            lastLatitude: parsedLat,
            lastLongitude: parsedLng,
            lastCheckInAt: new Date(),
            totalVerifiedCheckIns: 1,
          },
        });
      } else {
        await tx.studentAttendanceProfile.update({
          where: { student_id: studentId },
          data: {
            lastIpAddress: clientIp,
            lastLatitude: parsedLat,
            lastLongitude: parsedLng,
            lastCheckInAt: new Date(),
            totalVerifiedCheckIns: {
              increment: 1,
            },
          },
        });
      }

      const attendance = await tx.attendance.create({
        data: {
          student_id: studentId,
          session_id: session.id,
          status: 'present',
          ipAddress: clientIp,
          latitude: parsedLat,
          longitude: parsedLng,
          deviceInfo,
          baselineCreated,
          verifiedIp,
          verifiedLocation,
          profileDistance,
          sessionDistance,
        },
        include: {
          student: true,
          session: {
            include: {
              class: true,
            },
          },
        },
      });

      let trainingAward = null;
      const criterionId = String(session.drl_criterion_id || '').trim();
      const sectionId = String(session.drl_section_id || '').trim().toLowerCase();
      const semesterId = normalizeSemesterName(session.drl_semester_id);
      const awardPoints = Number(session.drl_points || 0);

      if (
        criterionIdRegex.test(criterionId) &&
        sectionIdRegex.test(sectionId) &&
        semesterId &&
        Number.isFinite(awardPoints) &&
        awardPoints > 0
      ) {
        const existingScore = await tx.trainingScore.findFirst({
          where: {
            student_id: studentId,
            semester_id: semesterId,
          },
          orderBy: { createdAt: 'desc' },
        });

        const details = parseDetails(existingScore?.details);
        const currentCriterion =
          details[criterionId] && typeof details[criterionId] === 'object' ? details[criterionId] : {};
        const existingFiles = normalizeStoredFiles(currentCriterion.files);
        const existingActivities = normalizeQrActivities(currentCriterion.activities);
        const activityName = String(session.title || session.subject || 'Hoat dong QR').trim();
        const alreadyApplied = existingActivities.some(
          (item) => item.sessionId === session.id || item.attendanceId === attendance.id,
        );

        const qrActivity = {
          source: 'QR_ATTENDANCE' as const,
          attendanceId: attendance.id,
          sessionId: session.id,
          activityName: activityName || 'Hoat dong QR',
          points: awardPoints,
          checkedInAt: attendance.date.toISOString(),
        };

        const previousScore = Number(currentCriterion.score || 0);
        const nextScore = alreadyApplied ? previousScore : previousScore + awardPoints;
        const mergedActivities = alreadyApplied ? existingActivities : [...existingActivities, qrActivity];

        details[criterionId] = {
          ...currentCriterion,
          score: nextScore,
          files: existingFiles,
          activities: mergedActivities,
        };

        const totals = computeTrainingTotalsFromDetails(details);
        let updatedScore;
        if (existingScore) {
          updatedScore = await tx.trainingScore.update({
            where: { id: existingScore.id },
            data: {
              details,
              y_thuc: totals.y_thuc,
              hoat_dong: totals.hoat_dong,
              ky_luat: totals.ky_luat,
              total: totals.total,
              status: 'PENDING',
              admin_y_thuc: null,
              admin_hoat_dong: null,
              admin_ky_luat: null,
              admin_total: null,
              admin_details: null as any,
              admin_notes: null,
            },
          });
        } else {
          updatedScore = await tx.trainingScore.create({
            data: {
              student_id: studentId,
              semester_id: semesterId,
              y_thuc: totals.y_thuc,
              hoat_dong: totals.hoat_dong,
              ky_luat: totals.ky_luat,
              total: totals.total,
              status: 'PENDING',
              details,
            },
          });
        }

        trainingAward = {
          trainingScoreId: Number(updatedScore.id),
          criterionId,
          sectionId,
          semester: semesterId,
          points: awardPoints,
          newScore: Number(nextScore),
          activityName: qrActivity.activityName,
        };
      }

      return { attendance, trainingAward };
    });

    return res.status(201).json({
      attendance: transactionResult.attendance,
      verification: {
        baselineCreated,
        verifiedIp,
        verifiedLocation,
        sessionDistance: Math.round(sessionDistance),
        profileDistance: profileDistance === null ? null : Math.round(profileDistance),
      },
      trainingAward: transactionResult.trainingAward,
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['student_id', 'session_id'])) {
      return res.status(409).json({ message: 'Sinh vien da diem danh cho phien nay' });
    }
    console.error('qrCheckIn error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getSessionAttendees = async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;
  const numericSessionId = Number(sessionId);
  if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
    return res.status(400).json({ message: 'Session ID khong hop le' });
  }
  try {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: numericSessionId },
      select: {
        class_id: true,
      },
    });
    if (!session) {
      return res.status(404).json({ message: 'Khong tim thay phien diem danh' });
    }
    const accessError = ensureSessionAccess(req, session.class_id);
    if (accessError) {
      return res.status(accessError.status).json({ message: accessError.message });
    }
    const attendees = await prisma.attendance.findMany({
      where: { session_id: numericSessionId },
      include: {
        student: true,
      },
      orderBy: { date: 'asc' },
    });
    return res.json(attendees);
  } catch (error) {
    console.error('getSessionAttendees error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getSessionSummary = async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;
  const numericSessionId = Number(sessionId);
  if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
    return res.status(400).json({ message: 'Session ID khong hop le' });
  }
  try {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: numericSessionId },
      include: {
        class: true,
      },
    });
    if (!session) {
      return res.status(404).json({ message: 'Khong tim thay phien diem danh' });
    }
    const accessError = ensureSessionAccess(req, session.class_id);
    if (accessError) {
      return res.status(accessError.status).json({ message: accessError.message });
    }
    let students: any[] = [];
    let attendances: any[] = [];

    if (session.class_id) {
      const [studentsRes, attendancesRes] = await Promise.all([
        prisma.student.findMany({
          where: {
            class_id: session.class_id,
          },
          include: {
            attendanceProfile: true,
          },
          orderBy: [{ order_number: 'asc' }, { name: 'asc' }],
        }),
        prisma.attendance.findMany({
          where: {
            session_id: numericSessionId,
          },
          include: {
            student: true,
          },
          orderBy: [{ date: 'asc' }],
        }),
      ]);
      students = studentsRes;
      attendances = attendancesRes;
    } else {
      attendances = await prisma.attendance.findMany({
        where: {
          session_id: numericSessionId,
        },
        include: {
          student: {
            include: {
              attendanceProfile: true,
            },
          },
        },
        orderBy: [{ date: 'asc' }],
      });
      students = attendances.map((a) => ({
        ...a.student,
        attendanceProfile: (a.student as any).attendanceProfile,
      }));
    }

    const attendanceMap = new Map(attendances.map((attendance) => [attendance.student_id, attendance]));
    const checkedIn = attendances.length;
    const totalStudents = session.class_id ? students.length : checkedIn;
    const absentCount = session.class_id ? Math.max(totalStudents - checkedIn, 0) : 0;
    const attendanceRate = totalStudents > 0 ? Number(((checkedIn / totalStudents) * 100).toFixed(2)) : 100;
    return res.json({
      session,
      stats: {
        totalStudents,
        checkedIn,
        absentCount,
        attendanceRate,
        baselineCreatedCount: attendances.filter((item) => item.baselineCreated).length,
        verifiedIpCount: attendances.filter((item) => item.verifiedIp !== false).length,
        verifiedLocationCount: attendances.filter((item) => item.verifiedLocation !== false).length,
      },
      students: students.map((student) => {
        const attendance = attendanceMap.get(student.id);
        return {
          id: student.id,
          name: student.name,
          student_code: student.student_code,
          class_id: student.class_id,
          order_number: student.order_number,
          attendance: attendance
            ? {
                id: attendance.id,
                status: attendance.status,
                checkedInAt: attendance.date,
                ipAddress: attendance.ipAddress,
                latitude: attendance.latitude,
                longitude: attendance.longitude,
                baselineCreated: attendance.baselineCreated,
                verifiedIp: attendance.verifiedIp,
                verifiedLocation: attendance.verifiedLocation,
                profileDistance: attendance.profileDistance,
                sessionDistance: attendance.sessionDistance,
              }
            : null,
          profile: student.attendanceProfile
            ? {
                firstIpAddress: student.attendanceProfile.firstIpAddress,
                firstLatitude: student.attendanceProfile.firstLatitude,
                firstLongitude: student.attendanceProfile.firstLongitude,
                firstCheckInAt: student.attendanceProfile.firstCheckInAt,
                lastCheckInAt: student.attendanceProfile.lastCheckInAt,
                totalVerifiedCheckIns: student.attendanceProfile.totalVerifiedCheckIns,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error('getSessionSummary error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const endAttendanceSession = async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;
  const numericSessionId = Number(sessionId);
  if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
    return res.status(400).json({ message: 'Session ID khong hop le' });
  }
  try {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: numericSessionId },
      select: {
        class_id: true,
      },
    });
    if (!session) {
      return res.status(404).json({ message: 'Khong tim thay phien diem danh' });
    }
    const accessError = ensureSessionAccess(req, session.class_id);
    if (accessError) {
      return res.status(accessError.status).json({ message: accessError.message });
    }
    const updatedSession = await prisma.attendanceSession.update({
      where: { id: numericSessionId },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
      include: {
        class: true,
      },
    });
    return res.json(updatedSession);
  } catch (error) {
    console.error('endAttendanceSession error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const manualSessionCheckIn = async (req: AuthRequest, res: Response) => {
  const { sessionId, studentId, status } = req.body;
  const numericSessionId = Number(sessionId);
  const numericStudentId = Number(studentId);

  if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
    return res.status(400).json({ message: 'Session ID khong hop le' });
  }
  if (!Number.isFinite(numericStudentId) || numericStudentId <= 0) {
    return res.status(400).json({ message: 'Student ID khong hop le' });
  }

  try {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: numericSessionId },
    });
    if (!session) {
      return res.status(404).json({ message: 'Khong tim thay phien diem danh' });
    }

    const accessError = ensureSessionAccess(req, session.class_id);
    if (accessError) {
      return res.status(accessError.status).json({ message: accessError.message });
    }

    const student = await prisma.student.findUnique({
      where: { id: numericStudentId },
    });
    if (!student) {
      return res.status(404).json({ message: 'Khong tim thay sinh vien' });
    }

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        student_id: numericStudentId,
        session_id: numericSessionId,
      },
    });

    if (status === 'absent') {
      // Revert/Delete Attendance
      if (!existingAttendance) {
        return res.json({ message: 'Sinh vien chua tung diem danh' });
      }

      await prisma.$transaction(async (tx) => {
        // Delete attendance record
        await tx.attendance.delete({
          where: { id: existingAttendance.id },
        });

        // Revert DRL if needed
        const criterionId = String(session.drl_criterion_id || '').trim();
        const sectionId = String(session.drl_section_id || '').trim().toLowerCase();
        const semesterId = normalizeSemesterName(session.drl_semester_id);
        const awardPoints = Number(session.drl_points || 0);

        if (
          criterionIdRegex.test(criterionId) &&
          sectionIdRegex.test(sectionId) &&
          semesterId &&
          Number.isFinite(awardPoints) &&
          awardPoints > 0
        ) {
          const existingScore = await tx.trainingScore.findFirst({
            where: {
              student_id: numericStudentId,
              semester_id: semesterId,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (existingScore) {
            const details = parseDetails(existingScore.details);
            const currentCriterion =
              details[criterionId] && typeof details[criterionId] === 'object' ? details[criterionId] : {};
            const existingFiles = normalizeStoredFiles(currentCriterion.files);
            const existingActivities = normalizeQrActivities(currentCriterion.activities);

            // Filter out this session's activity
            const filteredActivities = existingActivities.filter(
              (item) => item.sessionId !== session.id && item.attendanceId !== existingAttendance.id,
            );

            const wasApplied = existingActivities.length !== filteredActivities.length;
            const newScore = wasApplied ? Math.max(0, Number(currentCriterion.score || 0) - awardPoints) : Number(currentCriterion.score || 0);

            details[criterionId] = {
              ...currentCriterion,
              score: newScore,
              files: existingFiles,
              activities: filteredActivities,
            };

            const totals = computeTrainingTotalsFromDetails(details);
            await tx.trainingScore.update({
              where: { id: existingScore.id },
              data: {
                details,
                y_thuc: totals.y_thuc,
                hoat_dong: totals.hoat_dong,
                ky_luat: totals.ky_luat,
                total: totals.total,
              },
            });
          }
        }
      });

      return res.json({ message: 'Da xoa diem danh' });
    } else {
      // Mark as Present
      if (existingAttendance) {
        return res.json({ message: 'Sinh vien da diem danh roi' });
      }

      await prisma.$transaction(async (tx) => {
        const attendance = await tx.attendance.create({
          data: {
            student_id: numericStudentId,
            session_id: session.id,
            status: 'present',
            ipAddress: 'manual',
            latitude: 0,
            longitude: 0,
            deviceInfo: 'manual_admin',
            baselineCreated: false,
            verifiedIp: true,
            verifiedLocation: true,
            profileDistance: 0,
            sessionDistance: 0,
          },
        });

        const criterionId = String(session.drl_criterion_id || '').trim();
        const sectionId = String(session.drl_section_id || '').trim().toLowerCase();
        const semesterId = normalizeSemesterName(session.drl_semester_id);
        const awardPoints = Number(session.drl_points || 0);

        if (
          criterionIdRegex.test(criterionId) &&
          sectionIdRegex.test(sectionId) &&
          semesterId &&
          Number.isFinite(awardPoints) &&
          awardPoints > 0
        ) {
          const existingScore = await tx.trainingScore.findFirst({
            where: {
              student_id: numericStudentId,
              semester_id: semesterId,
            },
            orderBy: { createdAt: 'desc' },
          });

          const details = parseDetails(existingScore?.details);
          const currentCriterion =
            details[criterionId] && typeof details[criterionId] === 'object' ? details[criterionId] : {};
          const existingFiles = normalizeStoredFiles(currentCriterion.files);
          const existingActivities = normalizeQrActivities(currentCriterion.activities);
          const activityName = String(session.title || session.subject || 'Hoat dong QR').trim();

          const qrActivity = {
            source: 'QR_ATTENDANCE' as const,
            attendanceId: attendance.id,
            sessionId: session.id,
            activityName: activityName || 'Hoat dong QR',
            points: awardPoints,
            checkedInAt: attendance.date.toISOString(),
          };

          const previousScore = Number(currentCriterion.score || 0);
          const nextScore = previousScore + awardPoints;
          const mergedActivities = [...existingActivities, qrActivity];

          details[criterionId] = {
            ...currentCriterion,
            score: nextScore,
            files: existingFiles,
            activities: mergedActivities,
          };

          const totals = computeTrainingTotalsFromDetails(details);
          if (existingScore) {
            await tx.trainingScore.update({
              where: { id: existingScore.id },
              data: {
                details,
                y_thuc: totals.y_thuc,
                hoat_dong: totals.hoat_dong,
                ky_luat: totals.ky_luat,
                total: totals.total,
                status: 'PENDING',
                admin_y_thuc: null,
                admin_hoat_dong: null,
                admin_ky_luat: null,
                admin_total: null,
                admin_details: null as any,
                admin_notes: null,
              },
            });
          } else {
            await tx.trainingScore.create({
              data: {
                student_id: numericStudentId,
                semester_id: semesterId,
                y_thuc: totals.y_thuc,
                hoat_dong: totals.hoat_dong,
                ky_luat: totals.ky_luat,
                total: totals.total,
                status: 'PENDING',
                details,
              },
            });
          }
        }
      });

      return res.json({ message: 'Da diem danh thu cong' });
    }
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['student_id', 'session_id'])) {
      return res.status(409).json({ message: 'Sinh vien da diem danh cho phien nay' });
    }
    console.error('manualSessionCheckIn error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const exportSessionAttendanceExcel = async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;
  const numericSessionId = Number(sessionId);
  if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
    return res.status(400).json({ message: 'Session ID khong hop le' });
  }

  try {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: numericSessionId },
      include: { class: true },
    });

    if (!session) {
      return res.status(404).json({ message: 'Khong tim thay phien diem danh' });
    }

    const accessError = ensureSessionAccess(req, session.class_id);
    if (accessError) {
      return res.status(accessError.status).json({ message: accessError.message });
    }

    let students: any[] = [];
    let attendances: any[] = [];

    if (session.class_id) {
      const [studentsRes, attendancesRes] = await Promise.all([
        prisma.student.findMany({
          where: { class_id: session.class_id },
          orderBy: [{ order_number: 'asc' }, { name: 'asc' }],
        }),
        prisma.attendance.findMany({
          where: { session_id: numericSessionId },
          orderBy: [{ date: 'asc' }],
        }),
      ]);
      students = studentsRes;
      attendances = attendancesRes;
    } else {
      attendances = await prisma.attendance.findMany({
        where: { session_id: numericSessionId },
        include: { student: true },
        orderBy: [{ date: 'asc' }],
      });
      students = attendances.map((a) => a.student);
    }

    const attendanceMap = new Map(attendances.map((att) => [att.student_id, att]));

    const ExcelJS = await import('exceljs');
    const ExcelJSModule = (ExcelJS.default || ExcelJS) as any;
    const workbook = new ExcelJSModule.Workbook();
    const sheet = workbook.addWorksheet('Danh Sách Điểm Danh');

    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'MSSV', key: 'student_code', width: 15 },
      { header: 'Họ và tên', key: 'name', width: 25 },
      { header: 'Lớp', key: 'class_id', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 20 },
      { header: 'Thời gian quét', key: 'time', width: 25 },
      { header: 'IP Address', key: 'ipAddress', width: 15 },
      { header: 'Xác minh vị trí', key: 'verifiedLocation', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };

    students.forEach((student, index) => {
      const attendance = attendanceMap.get(student.id);
      sheet.addRow({
        stt: index + 1,
        student_code: student.student_code,
        name: student.name,
        class_id: student.class_id,
        status: attendance ? 'Đã điểm danh' : 'Chưa điểm danh',
        time: attendance ? new Date(attendance.date).toLocaleString('vi-VN') : '--',
        ipAddress: attendance ? (attendance.ipAddress === 'manual' ? 'Thủ công' : attendance.ipAddress || 'N/A') : '--',
        verifiedLocation: attendance
          ? attendance.verifiedLocation
            ? 'Hợp lệ'
            : 'Không hợp lệ'
          : '--',
      });
    });

    const safeTitle = session.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="diem-danh-${safeTitle || session.id}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting attendance session:', error);
    res.status(500).json({ message: 'Lỗi server khi xuất file excel' });
  }
};

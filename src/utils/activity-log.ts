import type { Request } from 'express';
import prisma from './prisma.js';
import type { AuthRequest } from '../types/index.js';

const normalizeIp = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1');

export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] || '' : String(forwarded || '');
  const firstForwarded = rawForwarded.split(',')[0]?.trim() || '';
  return normalizeIp(firstForwarded || req.ip || 'unknown');
};

export const getDeviceId = (req: Request): string => {
  const headerValue = req.headers['x-device-id'];
  return String(Array.isArray(headerValue) ? headerValue[0] || '' : headerValue || '').trim();
};

export const getUserAgent = (req: Request): string => String(req.headers['user-agent'] || '').trim();

type ActivityLogInput = {
  action: string;
  category: string;
  targetType?: string;
  targetId?: string | number;
  summary: string;
  details?: unknown;
  studentId?: number | null;
  classId?: string | null;
  userId?: number | null;
  username?: string | null;
  userName?: string | null;
  role?: string | null;
};

export const writeActivityLog = async (req: Request, input: ActivityLogInput) => {
  try {
    const authReq = req as AuthRequest;
    await (prisma as any).activityLog.create({
      data: {
        action: input.action,
        category: input.category,
        targetType: input.targetType || null,
        targetId: input.targetId === undefined || input.targetId === null ? null : String(input.targetId),
        summary: input.summary,
        details: input.details === undefined ? undefined : (input.details as any),
        userId: input.userId ?? (authReq.user?.id ? Number(authReq.user.id) : null),
        username: input.username ?? authReq.user?.username ?? null,
        userName: input.userName ?? null,
        role: String(input.role ?? authReq.user?.role ?? '').toUpperCase() || null,
        studentId: input.studentId ?? (authReq.user?.studentId ? Number(authReq.user.studentId) : null),
        classId: input.classId ?? authReq.user?.class_id ?? null,
        ipAddress: getClientIp(req),
        deviceId: getDeviceId(req) || null,
        userAgent: getUserAgent(req) || null,
      },
    });
  } catch (error) {
    console.error('[ActivityLog] Failed to write activity log:', error);
  }
};

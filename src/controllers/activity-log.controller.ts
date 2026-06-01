import type { Response } from 'express';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../types/index.js';

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
};

export const getActivityLogs = async (req: AuthRequest, res: Response) => {
  const role = String(req.user?.role || '').toUpperCase();
  const limit = parsePositiveInt(req.query.limit, 100, 300);
  const page = parsePositiveInt(req.query.page, 1, 10000);
  const skip = (page - 1) * limit;
  const category = String(req.query.category || '').trim();
  const action = String(req.query.action || '').trim();
  const keyword = String(req.query.keyword || '').trim();
  const classId = String(req.query.classId || '').trim();

  const where: Record<string, any> = {};
  const andFilters: Record<string, any>[] = [];
  if (category) where.category = category;
  if (action) where.action = action;

  if (keyword) {
    andFilters.push({
      OR: [
      { summary: { contains: keyword, mode: 'insensitive' } },
      { username: { contains: keyword, mode: 'insensitive' } },
      { userName: { contains: keyword, mode: 'insensitive' } },
      { targetId: { contains: keyword, mode: 'insensitive' } },
      { ipAddress: { contains: keyword, mode: 'insensitive' } },
      { deviceId: { contains: keyword, mode: 'insensitive' } },
      { classId: { contains: keyword, mode: 'insensitive' } },
      ],
    });
  }

  if (role === 'STUDENT') {
    andFilters.push({
      OR: [
        { userId: Number(req.user?.id || 0) },
        { studentId: Number(req.user?.studentId || 0) },
      ],
    });
  } else if (role === 'BCH') {
    where.classId = String(req.user?.class_id || '').trim();
  } else if (classId) {
    where.classId = classId;
  }
  if (andFilters.length) where.AND = andFilters;

  try {
    const [items, total] = await Promise.all([
      (prisma as any).activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (prisma as any).activityLog.count({ where }),
    ]);

    return res.json({ items, total, page, limit });
  } catch (error) {
    console.error('getActivityLogs error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

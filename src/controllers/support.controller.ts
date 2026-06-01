import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';

const ALLOWED_STATUSES = new Set(['NEW', 'IN_PROGRESS', 'RESOLVED']);

const toCleanText = (value: unknown, maxLength: number) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, maxLength);
};

const resolveClientIp = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] || '' : String(forwarded || '');
  const firstForwarded = rawForwarded.split(',')[0]?.trim();
  const ip = firstForwarded || String(req.ip || '').trim();
  return ip || null;
};

const supportRequestRepo = () => (prisma as any).supportRequest;

export const createSupportRequestPublic = async (req: Request, res: Response) => {
  const fullName = toCleanText(req.body?.fullName, 120);
  const email = toCleanText(req.body?.email, 160);
  const phone = toCleanText(req.body?.phone, 40);
  const subject = toCleanText(req.body?.subject, 200);
  const message = toCleanText(req.body?.message, 3000);
  const sourcePage = toCleanText(req.body?.sourcePage, 255);

  if (!fullName) {
    return res.status(400).json({ message: 'Vui long nhap ho va ten' });
  }

  if (!subject) {
    return res.status(400).json({ message: 'Vui long nhap tieu de' });
  }

  if (!message) {
    return res.status(400).json({ message: 'Vui long nhap noi dung ho tro' });
  }

  try {
    const repo = supportRequestRepo();
    if (!repo?.create) {
      return res.status(503).json({ message: 'Support service is not ready' });
    }

    const created = await repo.create({
      data: {
        fullName,
        email: email || null,
        phone: phone || null,
        subject,
        message,
        sourcePage: sourcePage || null,
        ipAddress: resolveClientIp(req),
        userAgent: toCleanText(req.headers['user-agent'], 500) || null,
      },
    });

    return res.status(201).json({
      message: 'Da gui thong tin ho tro thanh cong',
      request: created,
    });
  } catch (error) {
    console.error('Create support request error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getSupportRequests = async (req: Request, res: Response) => {
  const rawStatus = String(req.query?.status || '').trim().toUpperCase();
  const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : '';

  try {
    const repo = supportRequestRepo();
    if (!repo?.findMany) {
      return res.status(503).json({ message: 'Support service is not ready' });
    }

    const items = await repo.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return res.json(items);
  } catch (error) {
    console.error('Get support requests error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateSupportRequestStatus = async (req: Request, res: Response) => {
  const id = Number(req.params?.id);
  const status = String(req.body?.status || '').trim().toUpperCase();

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const repo = supportRequestRepo();
    if (!repo?.update) {
      return res.status(503).json({ message: 'Support service is not ready' });
    }

    const updated = await repo.update({
      where: { id },
      data: { status },
    });

    return res.json(updated);
  } catch (error) {
    console.error('Update support request status error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


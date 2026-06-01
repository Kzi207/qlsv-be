import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { clearAuthCookies, createCsrfToken, setAuthCookies, setCsrfCookie, getCookieValue, CSRF_COOKIE_NAME } from '../utils/security.js';
import { getJwtSecret } from '../utils/env.js';
import { writeActivityLog } from '../utils/activity-log.js';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-password-for-timing-defense', 10);

const applyNoStoreHeaders = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const resolveInternalErrorMessage = (error: unknown) => {
  if (process.env.NODE_ENV === 'production') return 'Server error';

  const raw = error instanceof Error ? error.message : String(error || 'Unknown error');
  if (raw.toLowerCase().includes('database_url')) {
    return 'Backend is missing DATABASE_URL. Configure backend/.env and restart server.';
  }

  return raw;
};

const toSafeUser = (user: any) => ({
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: String(user.role || '').toUpperCase(),
  studentId: user.studentId,
  class_id: user.class_id,
});

export const login = async (req: Request, res: Response) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  try {
    applyNoStoreHeaders(res);

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        name: true,
        email: true,
        role: true,
        studentId: true,
        class_id: true,
      },
    });

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      await writeActivityLog(req, {
        action: 'LOGIN_FAILED',
        category: 'AUTH',
        summary: `Dang nhap that bai cho tai khoan "${username}"`,
        details: { username },
        username,
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await writeActivityLog(req, {
        action: 'LOGIN_FAILED',
        category: 'AUTH',
        targetType: 'User',
        targetId: user.id,
        summary: `Dang nhap that bai cho tai khoan "${username}"`,
        details: { username, userId: user.id },
        userId: user.id,
        username: user.username,
        userName: user.name,
        role: user.role,
        studentId: user.studentId,
        classId: user.class_id,
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        studentId: user.studentId,
        class_id: user.class_id 
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    const csrfToken = createCsrfToken();
    setAuthCookies(req, res, token, csrfToken);
    await writeActivityLog(req, {
      action: 'LOGIN_SUCCESS',
      category: 'AUTH',
      targetType: 'User',
      targetId: user.id,
      summary: `${user.name || user.username} dang nhap thanh cong`,
      details: { username: user.username },
      userId: user.id,
      username: user.username,
      userName: user.name,
      role: user.role,
      studentId: user.studentId,
      classId: user.class_id,
    });

    res.json({
      user: toSafeUser(user),
      csrfToken,
      accessToken: token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: resolveInternalErrorMessage(error) });
  }
};

export const me = async (req: AuthRequest, res: Response) => {
  applyNoStoreHeaders(res);

  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.user.id) },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        studentId: true,
        class_id: true,
      },
    });

    if (!user) {
      clearAuthCookies(req, res);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let csrfToken = getCookieValue(req, CSRF_COOKIE_NAME);
    if (!csrfToken) {
      csrfToken = createCsrfToken();
      setCsrfCookie(req, res, csrfToken);
    }

    return res.json({
      user: toSafeUser(user),
      csrfToken,
    });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const logout = (req: Request, res: Response) => {
  clearAuthCookies(req, res);
  applyNoStoreHeaders(res);
  res.json({ message: 'Logged out' });
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const name = String(req.body?.name || '').trim();
  const emailValue = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: Number(req.user.id) },
      data: {
        name,
        email: emailValue || null,
      },
    });
    await writeActivityLog(req, {
      action: 'PROFILE_UPDATE',
      category: 'AUTH',
      targetType: 'User',
      targetId: updatedUser.id,
      summary: `${updatedUser.name || updatedUser.username} cap nhat ho so ca nhan`,
      details: { name: updatedUser.name, email: updatedUser.email },
      userName: updatedUser.name,
      studentId: updatedUser.studentId,
      classId: updatedUser.class_id,
    });

    return res.json(toSafeUser(updatedUser));
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.user.id) },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });
    await writeActivityLog(req, {
      action: 'PASSWORD_CHANGE',
      category: 'AUTH',
      targetType: 'User',
      targetId: user.id,
      summary: `${user.name || user.username} doi mat khau`,
      details: { username: user.username },
      userName: user.name,
      studentId: user.studentId,
      classId: user.class_id,
    });

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

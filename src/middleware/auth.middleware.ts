import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE_NAME, getCookieValue } from '../utils/security';

export interface AuthRequest extends Request {
  user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const tokenFromCookie = getCookieValue(req, AUTH_COOKIE_NAME);
  const tokenFromHeader = req.header('Authorization')?.replace('Bearer ', '');
  const tokenFromQuery = req.query.token as string;
  const token = tokenFromCookie || tokenFromHeader || tokenFromQuery;

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

export const roleMiddleware = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const requestRole = String(req.user?.role || '').toUpperCase();
    const allowedRoles = roles.map((role) => role.toUpperCase());

    if (!requestRole || !allowedRoles.includes(requestRole)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

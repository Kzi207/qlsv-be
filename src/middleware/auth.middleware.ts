import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE_NAME, getCookieValue } from '../utils/security.js';
import { getJwtSecret } from '../utils/env.js';
import type { AuthPayload, AuthRequest } from '../types/index.js';

const getTokenFromAuthorizationHeader = (authorizationHeader?: string) => {
  const headerValue = String(authorizationHeader || '').trim();
  if (!headerValue) return '';

  const [scheme, token, ...rest] = headerValue.split(/\s+/);
  if (rest.length > 0) return '';
  if (String(scheme || '').toLowerCase() !== 'bearer') return '';

  return token || '';
};

const getTokenFromQuery = (req: Request) => {
  if (process.env.ALLOW_QUERY_TOKEN_AUTH !== 'true') return '';
  const token = req.query.token;
  return typeof token === 'string' ? token.trim() : '';
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const tokenFromCookie = getCookieValue(req, AUTH_COOKIE_NAME);
  const tokenFromHeader = getTokenFromAuthorizationHeader(req.header('Authorization'));
  const tokenFromQuery = getTokenFromQuery(req);
  const token = tokenFromCookie || tokenFromHeader || tokenFromQuery;

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || typeof decoded === 'string') {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = decoded as AuthPayload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token is not valid' });
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

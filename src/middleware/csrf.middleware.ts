import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE_NAME, getCookieValue } from '../utils/security';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXCLUDED_PATHS = new Set(['/api/auth/login']);

export const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Normalize path by removing trailing slash for comparison
  const path = req.path.replace(/\/$/, '') || '/';
  if (EXCLUDED_PATHS.has(path)) {
    return next();
  }

  const csrfCookie = (getCookieValue(req, CSRF_COOKIE_NAME) || '').trim();
  const rawHeader = req.header('x-csrf-token') || req.header('X-CSRF-Token') || '';
  const csrfHeader = (rawHeader.split(',')[0] ?? '').trim();

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    const reason = !csrfCookie ? 'Cookie missing' : (!csrfHeader ? 'Header missing' : 'Token mismatch');
    console.warn(`CSRF Validation Failed for ${req.method} ${req.path}: ${reason}`);
    
    return res.status(403).json({ 
      message: 'CSRF token is missing or invalid',
      debug: process.env.NODE_ENV === 'development' ? {
        reason,
        hasCookie: !!csrfCookie,
        hasHeader: !!csrfHeader,
        path: req.path,
        method: req.method,
        receivedCookies: Object.keys(req.cookies || {}),
        hasAuthHeader: !!req.header('Authorization')
      } : undefined
    });
  }

  return next();
};

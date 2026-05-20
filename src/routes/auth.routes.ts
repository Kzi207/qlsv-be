import { Router } from 'express';
import { changePassword, login, logout, me, updateProfile } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.middleware.js';

const router = Router();
const loginRateLimiter = createRateLimitMiddleware({
  keyPrefix: 'auth-login',
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many login attempts. Please try again in a few minutes.',
});

router.post('/login', loginRateLimiter, login);
router.get('/me', authMiddleware, me);
router.patch('/profile', authMiddleware, updateProfile);
router.patch('/change-password', authMiddleware, changePassword);
router.post('/logout', logout);

export default router;

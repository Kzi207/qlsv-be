import { Router } from 'express';
import { changePassword, login, logout, me, updateProfile } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me', authMiddleware, me);
router.patch('/profile', authMiddleware, updateProfile);
router.patch('/change-password', authMiddleware, changePassword);
router.post('/logout', logout);

export default router;

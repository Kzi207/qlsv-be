import { Router } from 'express';
import { getClasses, createClass, deleteClass, updateClass } from '../controllers/class.controller';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authMiddleware, getClasses);
router.post('/', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), createClass);
router.put('/:name', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), updateClass);
router.delete('/:name', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), deleteClass);

export default router;

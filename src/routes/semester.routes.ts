import { Router } from 'express';
import { getSemesters, createSemester, deleteSemester, updateSemester } from '../controllers/semester.controller';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authMiddleware, getSemesters);
router.post('/', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), createSemester);
router.put('/:name', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), updateSemester);
router.delete('/:name', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), deleteSemester);

export default router;

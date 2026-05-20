import { Router } from 'express';
import { getSemesters, createSemester, deleteSemester, updateSemester, clearAllSemesterData } from '../controllers/semester.controller.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware.js';
const router = Router();
router.get('/', authMiddleware, getSemesters);
router.post('/', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), createSemester);
router.put('/:name', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), updateSemester);
router.delete('/:name', authMiddleware, roleMiddleware(['ADMIN', 'BCH']), deleteSemester);
router.post('/:name/danger-zone/clear-all', authMiddleware, roleMiddleware(['ADMIN']), clearAllSemesterData);
export default router;
//# sourceMappingURL=semester.routes.js.map
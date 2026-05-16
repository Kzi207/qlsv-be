import { Router } from 'express';
import { getStudents, createStudent, updateStudent, deleteStudent } from '../controllers/student.controller';
import { authMiddleware } from '../middleware/auth.middleware';
const router = Router();
router.use(authMiddleware);
router.get('/', getStudents);
router.post('/', createStudent);
router.put('/:id', updateStudent);
router.delete('/:id', deleteStudent);
export default router;
//# sourceMappingURL=student.routes.js.map
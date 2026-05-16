import { Router } from 'express';
import { checkAttendance, getAttendanceByDate, getAttendanceByStudent } from '../controllers/attendance.controller';
import { authMiddleware } from '../middleware/auth.middleware';
const router = Router();
router.use(authMiddleware);
router.post('/', checkAttendance);
router.get('/', getAttendanceByDate);
router.get('/:studentId', getAttendanceByStudent);
export default router;
//# sourceMappingURL=attendance.routes.js.map
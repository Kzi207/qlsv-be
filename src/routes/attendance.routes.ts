import { Router } from 'express';
import { 
  checkAttendance, 
  getAttendanceByDate, 
  getAttendanceByStudent, 
  createAttendanceSession, 
  getAttendanceSessions,
  getActiveSessions, 
  qrCheckIn, 
  getSessionAttendees,
  getSessionSummary,
  endAttendanceSession,
} from '../controllers/attendance.controller';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/sessions', roleMiddleware(['ADMIN', 'BCH']), getAttendanceSessions);
router.get('/sessions/active', getActiveSessions);
router.post('/qr-check-in', qrCheckIn);

// Admin & BCH routes
router.post('/session', roleMiddleware(['ADMIN', 'BCH']), createAttendanceSession);
router.patch('/sessions/:sessionId/end', roleMiddleware(['ADMIN', 'BCH']), endAttendanceSession);
router.get('/sessions/:sessionId/attendees', roleMiddleware(['ADMIN', 'BCH']), getSessionAttendees);
router.get('/sessions/:sessionId/summary', roleMiddleware(['ADMIN', 'BCH']), getSessionSummary);
router.post('/', roleMiddleware(['ADMIN', 'BCH']), checkAttendance);
router.get('/', roleMiddleware(['ADMIN', 'BCH']), getAttendanceByDate);
router.get('/student/:studentId', getAttendanceByStudent);

export default router;

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
  manualSessionCheckIn,
  exportSessionAttendanceExcel,
} from '../controllers/attendance.controller.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.middleware.js';

const router = Router();
const activeSessionsRateLimiter = createRateLimitMiddleware({
  keyPrefix: 'attendance-active-sessions',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many session queries. Please try again shortly.',
});
const qrCheckInRateLimiter = createRateLimitMiddleware({
  keyPrefix: 'attendance-qr-checkin',
  windowMs: 30 * 1000,
  max: 15,
  message: 'Too many QR check-in attempts. Please wait a moment.',
});

router.use(authMiddleware);

router.get('/sessions', roleMiddleware(['ADMIN', 'BCH']), getAttendanceSessions);
router.get('/sessions/active', activeSessionsRateLimiter, getActiveSessions);
router.post('/qr-check-in', qrCheckInRateLimiter, qrCheckIn);

// Admin & BCH routes
router.post('/session', roleMiddleware(['ADMIN', 'BCH']), createAttendanceSession);
router.patch('/sessions/:sessionId/end', roleMiddleware(['ADMIN', 'BCH']), endAttendanceSession);
router.post('/sessions/manual', roleMiddleware(['ADMIN', 'BCH']), manualSessionCheckIn);
router.get('/sessions/:sessionId/attendees', roleMiddleware(['ADMIN', 'BCH']), getSessionAttendees);
router.get('/sessions/:sessionId/summary', roleMiddleware(['ADMIN', 'BCH']), getSessionSummary);
router.get('/sessions/:sessionId/export', roleMiddleware(['ADMIN', 'BCH']), exportSessionAttendanceExcel);
router.post('/', roleMiddleware(['ADMIN', 'BCH']), checkAttendance);
router.get('/', roleMiddleware(['ADMIN', 'BCH']), getAttendanceByDate);
router.get('/student/:studentId', getAttendanceByStudent);

export default router;

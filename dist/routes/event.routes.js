import { Router } from 'express';
import { createEvent, getEvents, deleteEvent, getPublicEventDetails, registerEvent, getEventRegistrations, exportEventRegistrationsExcel, getPublicEvents, } from '../controllers/event.controller.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.middleware.js';
const router = Router();
const publicRegisterRateLimiter = createRateLimitMiddleware({
    keyPrefix: 'event-public-register',
    windowMs: 60 * 1000,
    max: 12,
    message: 'Too many registration attempts. Please try again in a minute.',
});
// Public endpoints
router.get('/public', getPublicEvents);
router.get('/public/:id', getPublicEventDetails);
router.post('/public/:id/register', publicRegisterRateLimiter, registerEvent);
// Protected endpoints (ADMIN and BCH)
router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN', 'BCH']));
router.post('/', createEvent);
router.get('/', getEvents);
router.delete('/:id', deleteEvent);
router.get('/:id/registrations', getEventRegistrations);
router.get('/:id/registrations/export', exportEventRegistrationsExcel);
export default router;
//# sourceMappingURL=event.routes.js.map
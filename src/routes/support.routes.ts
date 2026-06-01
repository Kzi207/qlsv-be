import { Router } from 'express';
import {
  createSupportRequestPublic,
  getSupportRequests,
  updateSupportRequestStatus,
} from '../controllers/support.controller.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.middleware.js';

const router = Router();
const publicSupportRateLimiter = createRateLimitMiddleware({
  keyPrefix: 'support-public-submit',
  windowMs: 60 * 1000,
  max: 8,
  message: 'Too many support requests. Please try again later.',
});

router.post('/public', publicSupportRateLimiter, createSupportRequestPublic);

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get('/', getSupportRequests);
router.patch('/:id/status', updateSupportRequestStatus);

export default router;


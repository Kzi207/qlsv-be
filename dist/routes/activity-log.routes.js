import { Router } from 'express';
import { getActivityLogs } from '../controllers/activity-log.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
const router = Router();
router.use(authMiddleware);
router.get('/', getActivityLogs);
export default router;
//# sourceMappingURL=activity-log.routes.js.map
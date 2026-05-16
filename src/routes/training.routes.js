import { Router } from 'express';
import { createOrUpdateTrainingScore, getTrainingScoreByStudent } from '../controllers/training.controller';
import { authMiddleware } from '../middleware/auth.middleware';
const router = Router();
router.use(authMiddleware);
router.post('/', createOrUpdateTrainingScore);
router.get('/:studentId', getTrainingScoreByStudent);
export default router;
//# sourceMappingURL=training.routes.js.map
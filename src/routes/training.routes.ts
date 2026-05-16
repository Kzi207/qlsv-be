import { Router } from 'express';
import { 
  createOrUpdateTrainingScore, 
  getTrainingScoreByStudent, 
  getTrainingScores, 
  getTrainingScoreById,
  approveTrainingScore,
  createTrainingScore,
  getSubmissionStatus,
  exportTrainingScoresExcel,
} from '../controllers/training.controller';
import { getEvidenceFile, uploadEvidence } from '../controllers/upload.controller';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/export', roleMiddleware(['ADMIN']), exportTrainingScoresExcel);
router.get('/submission-status', getSubmissionStatus);
router.get('/evidence/:encodedKey', getEvidenceFile);
router.get('/', (req, res, next) => {
  const { studentId } = req.query;
  if (studentId) return getTrainingScoreByStudent(req, res);
  return getTrainingScores(req, res);
});
router.get('/student/:studentId', getTrainingScoreByStudent);
router.get('/:id', getTrainingScoreById);
router.patch('/:id/approve', roleMiddleware(['ADMIN', 'BCH']), approveTrainingScore);
router.post('/upload-evidence', uploadEvidence);
router.post('/', createTrainingScore);

export default router;

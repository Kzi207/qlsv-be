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
  submitStudentCustomEvidence,
  getStudentCustomEvidence,
  getAllCustomEvidence,
  reviewCustomEvidence,
} from '../controllers/training.controller.js';
import { getEvidenceFile, uploadEvidence } from '../controllers/upload.controller.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/export', roleMiddleware(['ADMIN']), exportTrainingScoresExcel);
router.get('/submission-status', getSubmissionStatus);
router.get('/evidence/student', getStudentCustomEvidence);
router.get('/evidence/all', roleMiddleware(['ADMIN', 'BCH']), getAllCustomEvidence);
router.post('/evidence/review', roleMiddleware(['ADMIN', 'BCH']), reviewCustomEvidence);
router.post('/evidence/submit', submitStudentCustomEvidence);
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

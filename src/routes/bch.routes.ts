import { Router } from 'express';
import { 
  createBchAccount, 
  getBchAccounts, 
  updateBchAccount, 
  deleteBchAccount, 
  assignStudents, 
  getAssignments,
  exportBchAssignments 
} from '../controllers/bch.controller';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Only ADMIN can manage BCH accounts and assignments
router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.post('/', createBchAccount);
router.get('/', getBchAccounts);
router.put('/:id', updateBchAccount);
router.delete('/:id', deleteBchAccount);

router.post('/assign', assignStudents);
router.get('/export-assignments', exportBchAssignments);
router.get('/:bchUserId/assignments', getAssignments);

export default router;

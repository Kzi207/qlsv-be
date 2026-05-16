import { Router } from 'express';
import { getStudents, createStudent, updateStudent, deleteStudent, createStudentAccount, deleteStudentAccount, importStudentsExcel, getStudentTemplate, deleteClassStudents, exportStudentAccounts, getStudentStats } from '../controllers/student.controller';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

// Public routes (for all authenticated users)
router.get('/stats', getStudentStats);

// Protected routes (ADMIN & BCH only)
const adminBchOnly = roleMiddleware(['ADMIN', 'BCH']);

router.get('/', adminBchOnly, getStudents);
router.get('/template', adminBchOnly, getStudentTemplate);
router.get('/export-accounts', adminBchOnly, exportStudentAccounts);
router.post('/', adminBchOnly, createStudent);
router.post('/import', adminBchOnly, upload.single('file'), importStudentsExcel);
router.put('/:id', adminBchOnly, updateStudent);
router.delete('/:id', adminBchOnly, deleteStudent);
router.delete('/class/:classId', adminBchOnly, deleteClassStudents);
router.post('/:id/account', adminBchOnly, createStudentAccount);
router.delete('/:id/account', adminBchOnly, deleteStudentAccount);

export default router;

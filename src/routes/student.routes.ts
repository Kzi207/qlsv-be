import { Router } from 'express';
import { getStudents, createStudent, updateStudent, deleteStudent, createStudentAccount, deleteStudentAccount, importStudentsExcel, getStudentTemplate, deleteClassStudents, exportStudentAccounts, getStudentStats, getDashboardStats } from '../controllers/student.controller.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';

const router = Router();

const ALLOWED_EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls']);
const ALLOWED_EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
    fields: 8,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();

    if (!ALLOWED_EXCEL_EXTENSIONS.has(ext) || !ALLOWED_EXCEL_MIMES.has(mimetype)) {
      cb(new Error('Chi chap nhan tep Excel (.xlsx, .xls)'));
      return;
    }

    cb(null, true);
  },
});

router.use(authMiddleware);

// Public routes (for all authenticated users)
router.get('/stats', getStudentStats);
router.get('/dashboard-stats', roleMiddleware(['ADMIN', 'BCH']), getDashboardStats);

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

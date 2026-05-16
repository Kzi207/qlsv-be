import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import classRoutes from './routes/class.routes';
import semesterRoutes from './routes/semester.routes';
import trainingRoutes from './routes/training.routes';
import attendanceRoutes from './routes/attendance.routes';
import bchRoutes from './routes/bch.routes';
import { getAllowedOrigins } from './utils/security';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';
import { csrfMiddleware } from './middleware/csrf.middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

const allowedOrigins = getAllowedOrigins();
console.log('Allowed Origins:', allowedOrigins);

app.set('trust proxy', 1);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token'],
}));
app.use(securityHeadersMiddleware);
app.use(express.json());
app.use(cookieParser());
app.use(csrfMiddleware);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/bch', bchRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('Student Management System API is running');
});

export default app;

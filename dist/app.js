import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
import classRoutes from './routes/class.routes.js';
import semesterRoutes from './routes/semester.routes.js';
import trainingRoutes from './routes/training.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import bchRoutes from './routes/bch.routes.js';
import eventRoutes from './routes/event.routes.js';
import supportRoutes from './routes/support.routes.js';
import chatbotRoutes from './routes/chatbot.routes.js';
import activityLogRoutes from './routes/activity-log.routes.js';
import { getAllowedOrigins } from './utils/security.js';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware.js';
import { csrfMiddleware } from './middleware/csrf.middleware.js';
import { getJwtSecret } from './utils/env.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
];
const loadedPaths = new Set();
let loadedEnvPath = '';
for (const candidate of envCandidates) {
    if (loadedPaths.has(candidate) || !fs.existsSync(candidate))
        continue;
    loadedPaths.add(candidate);
    const result = dotenv.config({ path: candidate });
    if (!result.error) {
        loadedEnvPath = candidate;
        break;
    }
}
if (!loadedEnvPath && process.env.NODE_ENV !== 'production') {
    console.warn('[Config] No .env file found. Relying on system environment variables.');
}
if (!String(process.env.DATABASE_URL || '').trim()) {
    throw new Error('Missing DATABASE_URL. Create backend/.env (or project-root .env) and set DATABASE_URL before starting backend.');
}
getJwtSecret();
const app = express();
const allowedOrigins = getAllowedOrigins();
const allowedOriginSet = new Set(allowedOrigins.map((origin) => origin.toLowerCase()));
const resolveCorsOrigin = (origin, callback) => {
    if (!origin) {
        callback(null, true);
        return;
    }
    const normalizedOrigin = origin.toLowerCase();
    callback(null, allowedOriginSet.has(normalizedOrigin));
};
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({
    origin: resolveCorsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token', 'X-Device-Id', 'x-device-id'],
}));
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());
app.use(csrfMiddleware);
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/bch', bchRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/activity-logs', activityLogRoutes);
// Health check
app.get('/', (req, res) => {
    res.send('Student Management System API is running');
});
export default app;
//# sourceMappingURL=app.js.map
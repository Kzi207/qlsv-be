import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import trainingRoutes from './routes/training.routes';
import attendanceRoutes from './routes/attendance.routes';
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/attendance', attendanceRoutes);
// Health check
app.get('/', (req, res) => {
    res.send('Student Management System API is running');
});
export default app;
//# sourceMappingURL=app.js.map
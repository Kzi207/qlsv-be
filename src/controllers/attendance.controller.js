import { Request, Response } from 'express';
import prisma from '../utils/prisma';
export const checkAttendance = async (req, res) => {
    const { student_id, date, status } = req.body;
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const existingAttendance = await prisma.attendance.findFirst({
            where: {
                student_id,
                date: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });
        if (existingAttendance) {
            const updatedAttendance = await prisma.attendance.update({
                where: { id: existingAttendance.id },
                data: { status },
            });
            return res.json(updatedAttendance);
        }
        const attendance = await prisma.attendance.create({
            data: { student_id, date: new Date(date), status },
        });
        res.status(201).json(attendance);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
export const getAttendanceByDate = async (req, res) => {
    const { date } = req.query;
    try {
        const searchDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(searchDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(searchDate);
        endOfDay.setHours(23, 59, 59, 999);
        const attendance = await prisma.attendance.findMany({
            where: {
                date: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: {
                student: true,
            },
        });
        res.json(attendance);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
export const getAttendanceByStudent = async (req, res) => {
    const { studentId } = req.params;
    try {
        const attendance = await prisma.attendance.findMany({
            where: { student_id: Number(studentId) },
            orderBy: { date: 'desc' },
        });
        res.json(attendance);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
//# sourceMappingURL=attendance.controller.js.map
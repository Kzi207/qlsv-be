import { Request, Response } from 'express';
import prisma from '../utils/prisma';
export const getStudents = async (req, res) => {
    try {
        const students = await prisma.student.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(students);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
export const createStudent = async (req, res) => {
    const { name, student_code, email, class_id } = req.body;
    try {
        const student = await prisma.student.create({
            data: { name, student_code, email, class_id },
        });
        res.status(201).json(student);
    }
    catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Student code or email already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
};
export const updateStudent = async (req, res) => {
    const { id } = req.params;
    const { name, student_code, email, class_id } = req.body;
    try {
        const student = await prisma.student.update({
            where: { id: Number(id) },
            data: { name, student_code, email, class_id },
        });
        res.json(student);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
export const deleteStudent = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.student.delete({
            where: { id: Number(id) },
        });
        res.json({ message: 'Student deleted' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
//# sourceMappingURL=student.controller.js.map
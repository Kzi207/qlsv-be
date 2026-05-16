import { Request, Response } from 'express';
import prisma from '../utils/prisma';
export const createOrUpdateTrainingScore = async (req, res) => {
    const { student_id, semester, y_thuc, hoat_dong, ky_luat } = req.body;
    const total = y_thuc + hoat_dong + ky_luat;
    try {
        const existingScore = await prisma.trainingScore.findFirst({
            where: { student_id, semester }
        });
        if (existingScore) {
            const updatedScore = await prisma.trainingScore.update({
                where: { id: existingScore.id },
                data: { y_thuc, hoat_dong, ky_luat, total }
            });
            return res.json(updatedScore);
        }
        const trainingScore = await prisma.trainingScore.create({
            data: { student_id, semester, y_thuc, hoat_dong, ky_luat, total },
        });
        res.status(201).json(trainingScore);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
export const getTrainingScoreByStudent = async (req, res) => {
    const { studentId } = req.params;
    try {
        const scores = await prisma.trainingScore.findMany({
            where: { student_id: Number(studentId) },
            orderBy: { semester: 'desc' }
        });
        res.json(scores);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
//# sourceMappingURL=training.controller.js.map
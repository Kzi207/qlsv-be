import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma.js';
import bcrypt from 'bcryptjs';
import { getExcelJS, sendWorkbookAsXlsx } from '../utils/excel.js';
export const createEvent = async (req, res) => {
    const { title, description, allowedClasses } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ message: 'TÃªn sá»± kiá»‡n khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng' });
    }
    try {
        // allowedClasses can be sent as array or semicolon-separated string
        let classesStr = '';
        if (Array.isArray(allowedClasses)) {
            classesStr = allowedClasses.map(c => String(c).trim().toUpperCase()).filter(Boolean).join(';');
        }
        else if (typeof allowedClasses === 'string') {
            classesStr = allowedClasses.split(/[;,]/).map(c => c.trim().toUpperCase()).filter(Boolean).join(';');
        }
        const event = await prisma.event.create({
            data: {
                title: title.trim(),
                description: description ? String(description).trim() : null,
                allowedClasses: classesStr,
            },
        });
        res.status(201).json(event);
    }
    catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ message: 'Lá»—i server khi táº¡o sá»± kiá»‡n' });
    }
};
export const getEvents = async (req, res) => {
    try {
        const events = await prisma.event.findMany({
            include: {
                _count: {
                    select: { registrations: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(events);
    }
    catch (error) {
        console.error('Error getting events:', error);
        res.status(500).json({ message: 'Lá»—i server khi táº£i danh sÃ¡ch sá»± kiá»‡n' });
    }
};
export const deleteEvent = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.event.delete({
            where: { id: Number(id) },
        });
        res.json({ message: 'ÄÃ£ xÃ³a sá»± kiá»‡n thÃ nh cÃ´ng' });
    }
    catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: 'Lá»—i server khi xÃ³a sá»± kiá»‡n' });
    }
};
export const getPublicEventDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const event = await prisma.event.findUnique({
            where: { id: Number(id) },
        });
        if (!event) {
            return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y sá»± kiá»‡n' });
        }
        res.json(event);
    }
    catch (error) {
        console.error('Error getting public event details:', error);
        res.status(500).json({ message: 'Lá»—i server khi táº£i thÃ´ng tin sá»± kiá»‡n' });
    }
};
export const registerEvent = async (req, res) => {
    const { id } = req.params;
    const { studentName, studentCode, classId } = req.body;
    if (!studentName || typeof studentName !== 'string' || !studentName.trim()) {
        return res.status(400).json({ message: 'Vui lÃ²ng nháº­p há» vÃ  tÃªn' });
    }
    if (!studentCode || typeof studentCode !== 'string' || !studentCode.trim()) {
        return res.status(400).json({ message: 'Vui lÃ²ng nháº­p MÃ£ sá»‘ sinh viÃªn' });
    }
    if (!classId || typeof classId !== 'string' || !classId.trim()) {
        return res.status(400).json({ message: 'Vui lÃ²ng chá»n lá»›p há»c' });
    }
    const cleanName = studentName.trim();
    const cleanCode = studentCode.trim().toUpperCase();
    const cleanClass = classId.trim().toUpperCase();
    try {
        const event = await prisma.event.findUnique({
            where: { id: Number(id) },
        });
        if (!event) {
            return res.status(404).json({ message: 'Sá»± kiá»‡n khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ bá»‹ Ä‘Ã³ng' });
        }
        // Check if already registered
        const existingReg = await prisma.eventRegistration.findFirst({
            where: {
                eventId: event.id,
                studentCode: cleanCode,
            },
        });
        if (existingReg) {
            return res.status(400).json({ message: 'Sinh viÃªn mang mÃ£ sá»‘ nÃ y Ä‘Ã£ Ä‘Äƒng kÃ½ tham gia sá»± kiá»‡n nÃ y trÆ°á»›c Ä‘Ã³.' });
        }
        // Check allowedClasses scope (if configured)
        if (event.allowedClasses) {
            const allowedList = event.allowedClasses.split(';').map(c => c.trim().toUpperCase());
            if (allowedList.length > 0 && !allowedList.includes(cleanClass)) {
                return res.status(400).json({
                    message: `Lá»›p ${cleanClass} khÃ´ng thuá»™c danh sÃ¡ch Ä‘Æ°á»£c chá»‰ Ä‘á»‹nh cho sá»± kiá»‡n nÃ y. Vui lÃ²ng chá»n lá»›p há»£p lá»‡.`,
                });
            }
        }
        // Ensure Class exists in system
        await prisma.class.upsert({
            where: { name: cleanClass },
            update: {},
            create: { name: cleanClass },
        });
        // Ensure Student exists in system under that Class
        let student = await prisma.student.findUnique({
            where: { student_code: cleanCode },
        });
        if (!student) {
            // Create student & default password user account
            const defaultEmail = `${cleanCode.toLowerCase()}@student.ctut.edu.vn`;
            student = await prisma.student.create({
                data: {
                    name: cleanName,
                    student_code: cleanCode,
                    email: defaultEmail,
                    class_id: cleanClass,
                },
            });
            const hashedPassword = await bcrypt.hash('1234', 10);
            await prisma.user.create({
                data: {
                    username: cleanCode,
                    password: hashedPassword,
                    name: cleanName,
                    role: 'STUDENT',
                    studentId: student.id,
                },
            });
        }
        else {
            // If student exists but has a different class, update it to cleanClass as requested
            if (student.class_id !== cleanClass) {
                student = await prisma.student.update({
                    where: { id: student.id },
                    data: { class_id: cleanClass },
                });
            }
        }
        // Save registration
        const registration = await prisma.eventRegistration.create({
            data: {
                eventId: event.id,
                studentName: cleanName,
                studentCode: cleanCode,
                classId: cleanClass,
            },
        });
        res.status(201).json({
            message: 'ÄÄƒng kÃ½ tham gia sá»± kiá»‡n thÃ nh cÃ´ng!',
            registration,
        });
    }
    catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            Array.isArray(error.meta?.target) &&
            error.meta.target.includes('eventId') &&
            error.meta.target.includes('studentCode')) {
            return res.status(400).json({ message: 'Sinh vien nay da dang ky tham gia su kien.' });
        }
        console.error('Error registering event:', error);
        res.status(500).json({ message: 'Lá»—i server khi Ä‘Äƒng kÃ½ tham gia sá»± kiá»‡n' });
    }
};
export const getEventRegistrations = async (req, res) => {
    const { id } = req.params;
    try {
        const registrations = await prisma.eventRegistration.findMany({
            where: { eventId: Number(id) },
            orderBy: { registeredAt: 'desc' },
        });
        res.json(registrations);
    }
    catch (error) {
        console.error('Error getting registrations:', error);
        res.status(500).json({ message: 'Lá»—i server khi láº¥y danh sÃ¡ch Ä‘Äƒng kÃ½' });
    }
};
export const exportEventRegistrationsExcel = async (req, res) => {
    const { id } = req.params;
    try {
        const event = await prisma.event.findUnique({
            where: { id: Number(id) },
        });
        if (!event) {
            return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y sá»± kiá»‡n' });
        }
        const registrations = await prisma.eventRegistration.findMany({
            where: { eventId: event.id },
            orderBy: { registeredAt: 'asc' },
        });
        const ExcelJS = await getExcelJS();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Danh SÃ¡ch ÄÄƒng KÃ½');
        sheet.columns = [
            { header: 'STT', key: 'stt', width: 8 },
            { header: 'Há» tÃªn sinh viÃªn', key: 'name', width: 30 },
            { header: 'MÃ£ sá»‘ sinh viÃªn (MSSV)', key: 'student_code', width: 25 },
            { header: 'Lá»›p há»c', key: 'class', width: 15 },
            { header: 'Thá»i gian Ä‘Äƒng kÃ½', key: 'time', width: 25 },
        ];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' }, // Beautiful Indigo brand
        };
        registrations.forEach((reg, index) => {
            sheet.addRow({
                stt: index + 1,
                name: reg.studentName,
                student_code: reg.studentCode,
                class: reg.classId,
                time: new Date(reg.registeredAt).toLocaleString('vi-VN'),
            });
        });
        await sendWorkbookAsXlsx(res, workbook, `danh-sach-dang-ky-${event.id}.xlsx`);
    }
    catch (error) {
        console.error('Error exporting registrations:', error);
        res.status(500).json({ message: 'Lá»—i server khi xuáº¥t file excel' });
    }
};
export const getPublicEvents = async (req, res) => {
    try {
        const events = await prisma.event.findMany({
            select: {
                id: true,
                title: true,
                description: true,
                allowedClasses: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(events);
    }
    catch (error) {
        console.error('Error getting public events:', error);
        res.status(500).json({ message: 'Lá»—i server khi táº£i danh sÃ¡ch sá»± kiá»‡n cÃ´ng khai' });
    }
};
//# sourceMappingURL=event.controller.js.map
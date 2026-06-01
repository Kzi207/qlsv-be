import prisma from '../utils/prisma.js';
import { normalizeSemesterName, parseSemesterDateInput } from '../utils/semester.js';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { deleteObjectFromR2 } from '../utils/r2.js';
import { getEvidenceUploadRootDir } from '../utils/upload-path.js';
const mapSemesterPayload = (semester) => ({
    name: semester.name,
    startDate: semester.startDate,
    endDate: semester.endDate,
    isGlobal: semester.isGlobal,
    scopeClasses: semester.scopeClasses || [],
    createdAt: semester.createdAt,
    updatedAt: semester.updatedAt,
});
const validateDateRange = (startDate, endDate) => {
    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
        return 'Thoi gian bat dau phai nho hon hoac bang thoi gian ket thuc';
    }
    return null;
};
const normalizeClassNames = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean);
};
const ensureClassesExist = async (classNames) => {
    if (!classNames.length)
        return true;
    const count = await prisma.class.count({
        where: { name: { in: classNames } },
    });
    return count === classNames.length;
};
export const getSemesters = async (req, res) => {
    try {
        const role = String(req.user?.role || '').toUpperCase();
        const classId = String(req.user?.class_id || '').trim().toUpperCase();
        const where = role === 'STUDENT'
            ? {
                OR: [
                    { isGlobal: true },
                    { scopeClasses: { some: { name: classId } } },
                ],
            }
            : undefined;
        const semesters = await prisma.semester.findMany({
            where,
            include: {
                scopeClasses: { select: { name: true } },
            },
            orderBy: [{ startDate: 'desc' }, { name: 'desc' }],
        });
        res.json(semesters.map(mapSemesterPayload));
    }
    catch (error) {
        console.error('Loi khi lay danh sach hoc ky:', error);
        res.status(500).json({ message: 'Loi may chu' });
    }
};
export const createSemester = async (req, res) => {
    const normalizedName = normalizeSemesterName(req.body?.name);
    const startDate = parseSemesterDateInput(req.body?.startDate, 'start');
    const endDate = parseSemesterDateInput(req.body?.endDate, 'end');
    const isGlobal = req.body?.isGlobal !== false;
    const classNames = normalizeClassNames(req.body?.classNames);
    if (!normalizedName) {
        return res.status(400).json({ message: 'Ten hoc ky khong duoc de trong' });
    }
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) {
        return res.status(400).json({ message: dateError });
    }
    if (!isGlobal && classNames.length === 0) {
        return res.status(400).json({ message: 'Hoc ky ap dung theo lop phai co it nhat 1 lop' });
    }
    try {
        const existing = await prisma.semester.findUnique({
            where: { name: normalizedName },
        });
        if (existing) {
            return res.status(400).json({ message: 'Hoc ky nay da ton tai' });
        }
        if (!isGlobal) {
            const allClassesExist = await ensureClassesExist(classNames);
            if (!allClassesExist) {
                return res.status(400).json({ message: 'Danh sach lop ap dung khong hop le' });
            }
        }
        const created = await prisma.semester.create({
            data: {
                name: normalizedName,
                startDate,
                endDate,
                isGlobal,
                scopeClasses: !isGlobal
                    ? {
                        connect: classNames.map((name) => ({ name })),
                    }
                    : undefined,
            },
            include: {
                scopeClasses: { select: { name: true } },
            },
        });
        res.status(201).json(mapSemesterPayload(created));
    }
    catch (error) {
        console.error('Loi khi tao hoc ky:', error);
        res.status(500).json({ message: 'Loi may chu' });
    }
};
export const deleteSemester = async (req, res) => {
    const name = normalizeSemesterName(req.params?.name);
    try {
        const count = await prisma.trainingScore.count({
            where: { semester_id: name },
        });
        if (count > 0) {
            return res.status(400).json({
                message: `Khong the xoa hoc ky nay vi dang co ${count} phieu diem ren luyen lien quan.`,
            });
        }
        await prisma.semester.delete({
            where: { name },
        });
        res.json({ message: `Da xoa thanh cong hoc ky ${name}` });
    }
    catch (error) {
        console.error('Loi khi xoa hoc ky:', error);
        res.status(500).json({ message: 'Loi may chu' });
    }
};
export const updateSemester = async (req, res) => {
    const currentName = normalizeSemesterName(req.params?.name);
    const normalizedNewName = normalizeSemesterName(req.body?.newName || currentName);
    const startDate = parseSemesterDateInput(req.body?.startDate, 'start');
    const endDate = parseSemesterDateInput(req.body?.endDate, 'end');
    const isGlobal = req.body?.isGlobal !== false;
    const classNames = normalizeClassNames(req.body?.classNames);
    if (!normalizedNewName) {
        return res.status(400).json({ message: 'Ten hoc ky khong duoc de trong' });
    }
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) {
        return res.status(400).json({ message: dateError });
    }
    if (!isGlobal && classNames.length === 0) {
        return res.status(400).json({ message: 'Hoc ky ap dung theo lop phai co it nhat 1 lop' });
    }
    try {
        const existing = await prisma.semester.findUnique({
            where: { name: normalizedNewName },
        });
        if (existing && normalizedNewName !== currentName) {
            return res.status(400).json({ message: 'Ten hoc ky moi da ton tai' });
        }
        if (!isGlobal) {
            const allClassesExist = await ensureClassesExist(classNames);
            if (!allClassesExist) {
                return res.status(400).json({ message: 'Danh sach lop ap dung khong hop le' });
            }
        }
        const updated = await prisma.semester.update({
            where: { name: currentName },
            data: {
                name: normalizedNewName,
                startDate,
                endDate,
                isGlobal,
                scopeClasses: {
                    set: !isGlobal ? classNames.map((name) => ({ name })) : [],
                },
            },
            include: {
                scopeClasses: { select: { name: true } },
            },
        });
        if (normalizedNewName !== currentName) {
            await prisma.trainingScore.updateMany({
                where: { semester_id: currentName },
                data: { semester_id: normalizedNewName },
            });
            await prisma.class.updateMany({
                where: { active_semester_id: currentName },
                data: { active_semester_id: normalizedNewName },
            });
        }
        res.json(mapSemesterPayload(updated));
    }
    catch (error) {
        console.error('Loi khi cap nhat hoc ky:', error);
        res.status(500).json({ message: 'Loi may chu' });
    }
};
const uploadRootDir = getEvidenceUploadRootDir();
const parseDetails = (raw) => {
    let parsed = raw;
    for (let i = 0; i < 3; i += 1) {
        if (typeof parsed !== 'string')
            break;
        try {
            parsed = JSON.parse(parsed);
        }
        catch {
            break;
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {};
    return parsed;
};
const normalizeStoredFiles = (raw) => {
    if (!Array.isArray(raw))
        return [];
    return raw
        .map((item) => {
        if (typeof item === 'string') {
            return { path: item };
        }
        if (!item || typeof item !== 'object')
            return null;
        const record = item;
        const filePath = typeof record.path === 'string' ? record.path : '';
        if (!filePath)
            return null;
        return {
            path: filePath,
            name: typeof record.name === 'string' ? record.name : undefined,
            size: typeof record.size === 'number' ? record.size : undefined,
        };
    })
        .filter((item) => Boolean(item));
};
const normalizeLocalEvidenceKey = (value) => String(value || '')
    .replace(/^uploads\/evidence\//i, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .trim();
const resolveLocalEvidencePath = (rawKey) => {
    const normalized = normalizeLocalEvidenceKey(rawKey);
    if (!normalized || normalized.includes('\0'))
        return null;
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0)
        return null;
    if (segments.some((segment) => segment === '.' || segment === '..'))
        return null;
    const basePath = path.resolve(uploadRootDir);
    const candidatePath = path.resolve(basePath, ...segments);
    if (candidatePath !== basePath && !candidatePath.startsWith(`${basePath}${path.sep}`)) {
        return null;
    }
    return candidatePath;
};
export const clearAllSemesterData = async (req, res) => {
    const name = normalizeSemesterName(req.params?.name);
    if (!name) {
        return res.status(400).json({ message: 'Ten hoc ky khong duoc de trong' });
    }
    try {
        // 1. Kiem tra hoc ky ton tai
        const semester = await prisma.semester.findUnique({
            where: { name },
        });
        if (!semester) {
            return res.status(404).json({ message: 'Khong tim thay hoc ky nay' });
        }
        // 2. Lay tat ca cac TrainingScore de extract thong tin file / hinh anh
        const trainingScores = await prisma.trainingScore.findMany({
            where: { semester_id: name },
            select: { details: true, admin_details: true },
        });
        const filePathsToDelete = [];
        const extractFilesFromDetailsObj = (obj) => {
            for (const criterion of Object.values(obj)) {
                if (criterion && typeof criterion === 'object') {
                    const files = normalizeStoredFiles(criterion.files);
                    for (const f of files) {
                        if (f.path) {
                            filePathsToDelete.push(f.path);
                        }
                    }
                }
            }
        };
        for (const score of trainingScores) {
            const detailsObj = parseDetails(score.details);
            const adminDetailsObj = parseDetails(score.admin_details);
            extractFilesFromDetailsObj(detailsObj);
            extractFilesFromDetailsObj(adminDetailsObj);
        }
        const uniquePaths = Array.from(new Set(filePathsToDelete));
        // 3. Tien hanh xoa file tren disk/R2
        let deletedCount = 0;
        for (const filePath of uniquePaths) {
            try {
                if (filePath.toLowerCase().startsWith('r2:')) {
                    const key = filePath.slice(3);
                    const success = await deleteObjectFromR2(key);
                    if (success)
                        deletedCount++;
                }
                else {
                    const localPath = resolveLocalEvidencePath(filePath);
                    if (localPath && fs.existsSync(localPath)) {
                        await fsp.unlink(localPath);
                        deletedCount++;
                    }
                }
            }
            catch (err) {
                console.error(`Loi khi xoa file ${filePath}:`, err);
            }
        }
        // 4. Update cac Class dang active hoc ky nay ve null de tranh vi pham khoa ngoai
        await prisma.class.updateMany({
            where: { active_semester_id: name },
            data: { active_semester_id: null },
        });
        // 5. Xoa TrainingScore
        const deletedScores = await prisma.trainingScore.deleteMany({
            where: { semester_id: name },
        });
        // 6. Xoa AttendanceSession (cascade delete Attendance)
        const deletedSessions = await prisma.attendanceSession.deleteMany({
            where: { drl_semester_id: name },
        });
        // 7. Xoa Semester
        await prisma.semester.delete({
            where: { name },
        });
        res.json({
            message: `Da xoa toan bo du lieu lien quan den hoc ky ${name} thanh cong.`,
            summary: {
                deletedFilesCount: deletedCount,
                deletedScoresCount: deletedScores.count,
                deletedAttendanceSessionsCount: deletedSessions.count,
            },
        });
    }
    catch (error) {
        console.error('Loi khi xoa toan bo du lieu hoc ky:', error);
        res.status(500).json({ message: 'Loi may chu khi xoa du lieu hoc ky' });
    }
};
//# sourceMappingURL=semester.controller.js.map
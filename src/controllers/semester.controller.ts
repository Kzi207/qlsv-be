import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../utils/prisma';
import { normalizeSemesterName, parseSemesterDateInput } from '../utils/semester';

const mapSemesterPayload = (semester: any) => ({
  name: semester.name,
  startDate: semester.startDate,
  endDate: semester.endDate,
  isGlobal: semester.isGlobal,
  scopeClasses: semester.scopeClasses || [],
  createdAt: semester.createdAt,
  updatedAt: semester.updatedAt,
});

const validateDateRange = (startDate: Date | null, endDate: Date | null) => {
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return 'Thoi gian bat dau phai nho hon hoac bang thoi gian ket thuc';
  }
  return null;
};

const normalizeClassNames = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean);
};

const ensureClassesExist = async (classNames: string[]) => {
  if (!classNames.length) return true;
  const count = await (prisma as any).class.count({
    where: { name: { in: classNames } },
  });
  return count === classNames.length;
};

export const getSemesters = async (req: AuthRequest, res: Response) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    const classId = String(req.user?.class_id || '').trim().toUpperCase();

    const where =
      role === 'STUDENT'
        ? {
            OR: [
              { isGlobal: true },
              { scopeClasses: { some: { name: classId } } },
            ],
          }
        : undefined;

    const semesters = await (prisma as any).semester.findMany({
      where,
      include: {
        scopeClasses: { select: { name: true } },
      },
      orderBy: [{ startDate: 'desc' }, { name: 'desc' }],
    });

    res.json(semesters.map(mapSemesterPayload));
  } catch (error) {
    console.error('Loi khi lay danh sach hoc ky:', error);
    res.status(500).json({ message: 'Loi may chu' });
  }
};

export const createSemester = async (req: AuthRequest, res: Response) => {
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
    const existing = await (prisma as any).semester.findUnique({
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

    const created = await (prisma as any).semester.create({
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
  } catch (error) {
    console.error('Loi khi tao hoc ky:', error);
    res.status(500).json({ message: 'Loi may chu' });
  }
};

export const deleteSemester = async (req: AuthRequest, res: Response) => {
  const name = normalizeSemesterName(req.params?.name);

  try {
    const count = await (prisma.trainingScore as any).count({
      where: { semester_id: name },
    });

    if (count > 0) {
      return res.status(400).json({
        message: `Khong the xoa hoc ky nay vi dang co ${count} phieu diem ren luyen lien quan.`,
      });
    }

    await (prisma as any).semester.delete({
      where: { name },
    });

    res.json({ message: `Da xoa thanh cong hoc ky ${name}` });
  } catch (error) {
    console.error('Loi khi xoa hoc ky:', error);
    res.status(500).json({ message: 'Loi may chu' });
  }
};

export const updateSemester = async (req: AuthRequest, res: Response) => {
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
    const existing = await (prisma as any).semester.findUnique({
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

    const updated = await (prisma as any).semester.update({
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
      await (prisma.trainingScore as any).updateMany({
        where: { semester_id: currentName },
        data: { semester_id: normalizedNewName },
      });

      await (prisma as any).class.updateMany({
        where: { active_semester_id: currentName },
        data: { active_semester_id: normalizedNewName },
      });
    }

    res.json(mapSemesterPayload(updated));
  } catch (error) {
    console.error('Loi khi cap nhat hoc ky:', error);
    res.status(500).json({ message: 'Loi may chu' });
  }
};


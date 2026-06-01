import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import bcrypt from 'bcryptjs';
import { getExcelJS, sendWorkbookAsXlsx } from '../utils/excel.js';

export const createBchAccount = async (req: Request, res: Response) => {
  const { username, password, name, email, phone, class_id } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password || '1234', 10);
    const user = await (prisma as any).user.create({
      data: {
        username,
        password: hashedPassword,
        name,
        email,
        phone,
        class_id,
        role: 'BCH'
      }
    });
    res.json(user);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Username already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBchAccounts = async (req: Request, res: Response) => {
  const { class_id } = req.query;

  try {
    const users = await (prisma as any).user.findMany({
      where: {
        role: 'BCH',
        class_id: class_id ? String(class_id) : undefined
      },
      include: {
        assignments: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBchAccount = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, phone, class_id, password } = req.body;

  try {
    const data: any = { name, email, phone, class_id };
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const user = await (prisma as any).user.update({
      where: { id: Number(id) },
      data
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteBchAccount = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await (prisma as any).$transaction([
      (prisma as any).bchAssignment.deleteMany({ where: { bchUserId: Number(id) } }),
      (prisma as any).user.delete({ where: { id: Number(id) } })
    ]);
    res.json({ message: 'BCH account deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const assignStudents = async (req: Request, res: Response) => {
  const { bchUserId, assignments } = req.body; 

  try {
    await (prisma as any).bchAssignment.deleteMany({
      where: { bchUserId: Number(bchUserId) }
    });

    const created = await (prisma as any).bchAssignment.createMany({
      data: assignments.map((a: any) => ({
        bchUserId: Number(bchUserId),
        classId: a.classId,
        fromOrder: Number(a.fromOrder),
        toOrder: Number(a.toOrder)
      }))
    });

    res.json({ message: 'Assignments updated', count: created.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAssignments = async (req: Request, res: Response) => {
  const { bchUserId } = req.params;

  try {
    const assignments = await (prisma as any).bchAssignment.findMany({
      where: { bchUserId: Number(bchUserId) }
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const exportBchAssignments = async (req: Request, res: Response) => {
  const { class_id } = req.query;

  if (!class_id) {
    return res.status(400).json({ message: 'Thiếu tham số class_id' });
  }

  try {
    const students = await prisma.student.findMany({
      where: { class_id: String(class_id) },
      orderBy: { order_number: 'asc' }
    });

    const assignments = await (prisma as any).bchAssignment.findMany({
      where: { classId: String(class_id) },
      include: { bchUser: true }
    });

    const ExcelJS = await getExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Danh sách phân công');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'MSSV', key: 'student_code', width: 15 },
      { header: 'Họ tên', key: 'name', width: 30 },
      { header: 'BCH Phân công', key: 'bch_name', width: 25 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }
    };

    students.forEach((student: any) => {
      const order = student.order_number;
      const matchedAssignments = assignments.filter((a: any) => 
        order >= a.fromOrder && order <= a.toOrder
      );
      
      const bchNames = matchedAssignments.map((a: any) => a.bchUser.name).join(', ');

      worksheet.addRow({
        stt: order,
        student_code: student.student_code,
        name: student.name,
        bch_name: bchNames || '' // Bỏ trống nếu không được phân công cụ thể
      });
    });

    // Add a note at the bottom
    worksheet.addRow([]);
    const noteRow = worksheet.addRow(['Ghi chú: Những sinh viên bỏ trống phần BCH Phân công sẽ do toàn bộ BCH lớp cùng chấm.']);
    noteRow.font = { italic: true, color: { argb: 'FF6B7280' } };

    await sendWorkbookAsXlsx(res, workbook, `phan-cong-${class_id}.xlsx`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi server khi xuất file phân công' });
  }
};

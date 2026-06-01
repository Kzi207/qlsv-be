import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';

export const getClasses = async (req: Request, res: Response) => {
  try {
    const classes = await (prisma as any).class.findMany({
      include: {
        _count: {
          select: { students: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    // Map to a friendlier format
    const result = classes.map((c: any) => ({
      name: c.name,
      studentCount: c._count.students,
      active_semester_id: c.active_semester_id
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách lớp:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
};

export const createClass = async (req: Request, res: Response) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ message: 'Tên lớp không được để trống' });
  }
  
  const normalizedName = name.trim().toUpperCase();
  
  try {
    const existing = await (prisma as any).class.findUnique({
      where: { name: normalizedName }
    });
    
    if (existing) {
      return res.status(400).json({ message: 'Lớp này đã tồn tại' });
    }
    
    const newClass = await (prisma as any).class.create({
      data: { name: normalizedName }
    });
    
    res.status(201).json(newClass);
  } catch (error) {
    console.error('Lỗi khi tạo lớp:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
};

export const deleteClass = async (req: Request, res: Response) => {
  const { name } = req.params;
  
  try {
    // 1. Tìm tất cả sinh viên thuộc lớp này
    const students = await prisma.student.findMany({
      where: { class_id: name as string },
      select: { id: true }
    });
    
    const studentIds = students.map(s => s.id);
    
    // 2. Thực hiện xóa trong một giao dịch
    await prisma.$transaction([
      // Xóa điểm rèn luyện
      prisma.trainingScore.deleteMany({
        where: { student_id: { in: studentIds } }
      }),
      // Xóa điểm danh
      prisma.attendance.deleteMany({
        where: { student_id: { in: studentIds } }
      }),
      // Xóa tài khoản người dùng
      prisma.user.deleteMany({
        where: { studentId: { in: studentIds } }
      }),
      // Xóa sinh viên
      prisma.student.deleteMany({
        where: { id: { in: studentIds } }
      }),
      // Cuối cùng xóa lớp
      (prisma as any).class.delete({
        where: { name: name as string }
      })
    ]);
    
    res.json({ message: `Đã xóa thành công lớp ${name} và toàn bộ dữ liệu liên quan.` });
  } catch (error) {
    console.error('Lỗi khi xóa lớp:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
};

export const updateClass = async (req: Request, res: Response) => {
  const { name } = req.params;
  const { active_semester_id } = req.body;
  
  try {
    const updated = await (prisma as any).class.update({
      where: { name },
      data: { active_semester_id }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Lỗi khi cập nhật lớp:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
};

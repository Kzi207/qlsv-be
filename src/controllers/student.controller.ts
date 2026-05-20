import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import bcrypt from 'bcryptjs';

const removeAccents = (str: string) => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .toLowerCase();
};

export const getStudents = async (req: Request, res: Response) => {
  const { class_id } = req.query;

  try {
    const students = await prisma.student.findMany({
      where: class_id ? { class_id: String(class_id) } : {},
      orderBy: { createdAt: 'desc' },
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createStudent = async (req: Request, res: Response) => {
  const { name, student_code, email, class_id } = req.body;

  try {
    // Đảm bảo lớp học tồn tại
    await (prisma as any).class.upsert({
      where: { name: class_id.trim().toUpperCase() },
      update: {},
      create: { name: class_id.trim().toUpperCase() }
    });

    const student = await prisma.student.create({
      data: {
        name,
        student_code,
        email,
        class_id: class_id.trim().toUpperCase()
      },
    });

    // Tự động tạo tài khoản với mật khẩu mặc định '1234'
    const hashedPassword = await bcrypt.hash('1234', 10);
    await prisma.user.create({
      data: {
        username: student_code,
        password: hashedPassword,
        name: name,
        role: 'STUDENT',
        studentId: student.id
      }
    });

    res.json(student);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Student code or email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, student_code, email, class_id } = req.body;

  try {
    const student = await prisma.student.update({
      where: { id: Number(id) },
      data: { name, student_code, email, class_id },
    });
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.student.delete({
      where: { id: Number(id) },
    });
    res.json({ message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createStudentAccount = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { password = '1234' } = req.body;

  try {
    const student = await prisma.student.findUnique({
      where: { id: Number(id) },
      include: { user: true }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (student.user) {
      // Update existing account
      await prisma.user.update({
        where: { id: student.user.id },
        data: { password: hashedPassword }
      });
    } else {
      // Create new account
      await prisma.user.create({
        data: {
          username: student.student_code,
          password: hashedPassword,
          name: student.name,
          role: 'STUDENT',
          studentId: student.id
        }
      });
    }

    res.json({ message: 'Account created/updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteStudentAccount = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const student = await prisma.student.findUnique({
      where: { id: Number(id) },
      include: { user: true }
    });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
    }

    if (student.user) {
      await prisma.user.delete({
        where: { id: student.user.id }
      });
    }

    res.json({ message: 'Đã xóa tài khoản sinh viên thành công' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi server khi xóa tài khoản' });
  }
};

export const importStudentsExcel = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Vui lòng chọn file excel' });
  }

  try {
    const ExcelJS = await import('exceljs');
    const ExcelJSModule = (ExcelJS.default || ExcelJS) as any;
    const workbook = new ExcelJSModule.Workbook();
    await workbook.xlsx.load(req.file.buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ message: 'File excel không có dữ liệu sheet' });
    }

    console.log(`Bắt đầu đọc file Excel: ${worksheet.name}, tổng số dòng: ${worksheet.actualRowCount}`);

    let headerRowNumber = 1;
    let colMap: Record<string, number> = { stt: 1, last_name: 2, first_name: 3, student_code: 4, email: 5, class_id: 6 };

    // Tìm dòng tiêu đề và ánh xạ cột
    for (let i = 1; i <= Math.min(worksheet.rowCount, 20); i++) {
      const row = worksheet.getRow(i);
      let isHeader = false;
      row.eachCell((cell: any, colNumber: number) => {
        const text = (cell.text || '').toString().toLowerCase();
        if (text.includes('mssv') || text.includes('mã số')) {
          isHeader = true;
          colMap.student_code = colNumber;
        }
        if (text.includes('họ')) colMap.last_name = colNumber;
        if (text.includes('tên')) colMap.first_name = colNumber;
        if (text.includes('lớp')) colMap.class_id = colNumber;
        if (text.includes('stt')) colMap.stt = colNumber;
        if (text.includes('email')) colMap.email = colNumber;
      });
      if (isHeader) {
        headerRowNumber = i;
        break;
      }
    }

    console.log(`Đã xác định dòng tiêu đề: ${headerRowNumber}, Bản đồ cột:`, colMap);

    const students: any[] = [];
    const firstRowsData: any[] = []; // Để debug

    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber <= headerRowNumber) return;

      const getVal = (col: number) => {
        const cell = row.getCell(col);
        const val = cell.value;
        if (!val) return '';
        if (typeof val === 'object' && 'text' in val) return (val.text?.toString() || '').trim();
        if (typeof val === 'object' && 'richText' in val) return (val as any).richText.map((rt: any) => rt.text).join('').trim();
        if (typeof val === 'object' && 'result' in val) return (val.result?.toString() || '').trim();
        return val.toString().trim();
      };

      const student_code = getVal(colMap.student_code!).replace(/\s/g, '').toUpperCase();
      const first_name = getVal(colMap.first_name!);
      const last_name = getVal(colMap.last_name!);
      const stt = getVal(colMap.stt!);
      const email_val = getVal(colMap.email!);
      const class_id = getVal(colMap.class_id!);

      const name = `${last_name} ${first_name}`.trim();

      if (rowNumber <= headerRowNumber + 5) {
        firstRowsData.push({ rowNumber, student_code, first_name, last_name });
      }

      if (student_code && (first_name || last_name)) {
        let email = email_val;
        if (!email || !email.includes('@')) {
          const initials = removeAccents(last_name).split(/\s+/).map(w => w[0]).filter(Boolean).join('');
          const firstNameNorm = removeAccents(first_name || 'sv');
          const codeNorm = removeAccents(student_code);
          email = `${initials}${firstNameNorm}${codeNorm}@student.ctuet.edu.vn`.toLowerCase();
        }

        students.push({
          name: name,
          student_code: student_code,
          email: email,
          class_id: class_id || 'Chưa xếp lớp',
          stt: stt ? Number(stt) : null
        });
      }
    });

    if (students.length === 0) {
      return res.status(400).json({
        message: 'Không tìm thấy dữ liệu sinh viên hợp lệ.',
        debug: {
          headerRowFound: headerRowNumber,
          columnMapping: colMap,
          sampleData: firstRowsData,
          totalRowsInSheet: worksheet.rowCount
        }
      });
    }

    console.log(`Đã bóc tách được ${students.length} sinh viên hợp lệ`);

    if (students.length === 0) {
      return res.status(400).json({ message: 'Không tìm thấy dữ liệu sinh viên. Vui lòng đảm bảo cột 3 (Tên) và cột 4 (MSSV) có dữ liệu.' });
    }

    let count = 0;
    const defaultHashedPassword = await bcrypt.hash('1234', 10);

    // Group students by class to assign order_number correctly
    const classGroups: Record<string, any[]> = {};
    students.forEach(s => {
      const cid = s.class_id || 'UNKNOWN';
      if (!classGroups[cid]) classGroups[cid] = [];
      classGroups[cid]?.push(s);
    });

    // Prepare all operations
    const operations: Promise<any>[] = [];
    let lastError = '';

    for (const classStudents of Object.values(classGroups)) {
      for (let i = 0; i < classStudents.length; i++) {
        const student = classStudents[i];
        const orderNumber = (student.stt !== null && !isNaN(student.stt)) ? student.stt : i + 1;

        const op = (async () => {
          try {
            // Đảm bảo lớp tồn tại trước khi thêm sinh viên (Tránh lỗi Foreign Key)
            if (student.class_id && student.class_id !== 'Chưa xếp lớp') {
              await (prisma as any).class.upsert({
                where: { id: student.class_id },
                update: {},
                create: {
                  id: student.class_id,
                  name: `Lớp ${student.class_id}`
                }
              });
            }

            const studentRecord = await (prisma.student as any).upsert({
              where: { student_code: student.student_code },
              update: {
                name: student.name,
                email: student.email,
                class_id: student.class_id,
                order_number: orderNumber
              },
              create: {
                name: student.name,
                student_code: student.student_code,
                email: student.email,
                class_id: student.class_id,
                order_number: orderNumber
              },
              include: { user: true }
            });

            if (!studentRecord.user) {
              await prisma.user.create({
                data: {
                  username: student.student_code,
                  password: defaultHashedPassword,
                  name: student.name,
                  role: 'STUDENT',
                  studentId: studentRecord.id
                }
              });
            }
            return true;
          } catch (e: any) {
            console.error(`Lỗi khi nhập sinh viên ${student.student_code}:`, e);
            lastError = e.message || 'Lỗi DB';
            return false;
          }
        })();

        operations.push(op);
      }
    }

    // Run all operations and count successes
    const results = await Promise.all(operations);
    count = results.filter(r => r === true).length;

    if (count === 0 && students.length > 0) {
      return res.status(500).json({
        message: `Không thể lưu dữ liệu vào database. Lỗi cuối cùng: ${lastError}`,
        totalParsed: students.length
      });
    }

    res.json({ message: `Đã nhập thành công ${count} sinh viên vào hệ thống.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi server khi nhập file' });
  }
};

export const getStudentTemplate = async (req: Request, res: Response) => {
  try {
    const ExcelJS = await import('exceljs');
    const ExcelJSModule = (ExcelJS.default || ExcelJS) as any;
    const workbook = new ExcelJSModule.Workbook();
    const worksheet = workbook.addWorksheet('Sinh Viên Mẫu');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 10 },
      { header: 'Họ lót', key: 'last_name', width: 25 },
      { header: 'Tên', key: 'first_name', width: 15 },
      { header: 'Mã số sinh viên (MSSV)', key: 'student_code', width: 25 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Lớp', key: 'class_id', width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }
    };

    worksheet.addRow({
      stt: 1,
      last_name: 'Nguyễn Văn',
      first_name: 'A',
      student_code: 'B2100001',
      email: 'a.nv.b2100001@student.abc.edu.vn',
      class_id: 'CNTT1'
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-sinh-vien.xlsx"');
    res.status(200).send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Không thể tạo file mẫu' });
  }
};

export const bulkCreateStudentAccounts = async (req: Request, res: Response) => {
  const { password = '1234' } = req.body;

  try {
    const students = await prisma.student.findMany({
      include: { user: true }
    });

    const hashedPassword = await bcrypt.hash(password, 10);
    let count = 0;

    for (const student of students) {
      if (!student.user) {
        await prisma.user.create({
          data: {
            username: student.student_code,
            password: hashedPassword,
            name: student.name,
            role: 'STUDENT',
            studentId: student.id
          }
        });
        count++;
      }
    }

    res.json({ message: `Đã cấp tài khoản thành công cho ${count} sinh viên mới` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi server khi cấp tài khoản' });
  }
};

export const deleteClassStudents = async (req: Request, res: Response) => {
  const { classId } = req.params;

  try {
    // 1. Tìm tất cả sinh viên thuộc lớp này
    const students = await prisma.student.findMany({
      where: { class_id: classId as string },
      select: { id: true }
    });

    const studentIds = students.map(s => s.id);

    if (studentIds.length === 0) {
      return res.json({ message: `Lớp ${classId} không có sinh viên nào để xóa.` });
    }

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
      // Cuối cùng xóa sinh viên
      prisma.student.deleteMany({
        where: { id: { in: studentIds } }
      })
    ]);

    res.json({ message: `Đã xóa thành công lớp ${classId} và toàn bộ dữ liệu liên quan.` });
  } catch (error) {
    console.error('Lỗi khi xóa lớp:', error);
    res.status(500).json({ message: 'Lỗi máy chủ khi xóa lớp' });
  }
};

export const exportStudentAccounts = async (req: Request, res: Response) => {
  const { class_id, ids } = req.query;

  try {
    const where: any = {};
    if (ids) {
      const idArray = String(ids).split(',').map(Number);
      where.id = { in: idArray };
    } else if (class_id) {
      where.class_id = String(class_id);
    }

    const students = await prisma.student.findMany({
      where,
      include: { user: true },
      orderBy: [
        { class_id: 'asc' },
        { order_number: 'asc' }
      ]
    });

    const ExcelJS = await import('exceljs');
    const ExcelJSModule = (ExcelJS.default || ExcelJS) as any;
    const workbook = new ExcelJSModule.Workbook();
    const sheet = workbook.addWorksheet('Tài khoản sinh viên');

    sheet.columns = [
      { header: 'Lớp', key: 'class', width: 15 },
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'MSSV (Tên đăng nhập)', key: 'username', width: 25 },
      { header: 'Họ tên', key: 'name', width: 30 },
      { header: 'Mật khẩu mặc định', key: 'password', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { 
      type: 'pattern', 
      pattern: 'solid', 
      fgColor: { argb: 'FF059669' } 
    };

    students.forEach(s => {
      sheet.addRow({
        class: s.class_id,
        stt: s.order_number || '',
        username: s.student_code,
        name: s.name,
        password: '1234'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tai-khoan-sinh-vien-${class_id || 'tat-ca'}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi xuất danh sách tài khoản' });
  }
};

export const getStudentStats = async (req: Request, res: Response) => {
  const studentId = (req as any).user.studentId;

  if (!studentId) {
    return res.status(400).json({ message: 'Không tìm thấy thông tin sinh viên' });
  }

  try {
    // 1. Lấy điểm rèn luyện mới nhất
    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      select: { class_id: true }
    });

    if (!student) {
      return res.status(404).json({ message: 'Khong tim thay sinh vien' });
    }

    const latestScore = await prisma.trainingScore.findFirst({
      where: { student_id: Number(studentId) },
      orderBy: { createdAt: 'desc' }
    });

    // 2. Lấy số buổi điểm danh
    const attendanceCount = await prisma.attendance.count({
      where: { student_id: Number(studentId) }
    });

    // 3. Lấy số buổi học cần điểm danh hôm nay
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeSessionsCount = await prisma.attendanceSession.count({
      where: {
        class_id: student.class_id,
        sessionDate: {
          gte: today,
          lt: tomorrow
        },
        isActive: true
      }
    });

    res.json({
      drlScore: latestScore ? (latestScore.admin_total || latestScore.total) : null,
      attendanceCount,
      activeSessionsToday: activeSessionsCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê sinh viên' });
  }
};

import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { sendApprovalEmail, sendSubmissionReceivedEmail, type CriterionReportMeta } from '../utils/training-email.js';
import {
  getSemesterClosedMessage,
  getSemesterSubmissionStatus,
  getSemesterWithScope,
  normalizeSemesterName,
} from '../utils/semester.js';

const parseDetails = (raw: unknown): Record<string, any> => {
  let parsed: unknown = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof parsed !== 'string') break;
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, any>;
};

const normalizeStoredFiles = (raw: unknown) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return { path: item };
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const filePath = typeof record.path === 'string' ? record.path : '';
      if (!filePath) return null;
      return {
        path: filePath,
        name: typeof record.name === 'string' ? record.name : undefined,
        size: typeof record.size === 'number' ? record.size : undefined,
      };
    })
    .filter(Boolean);
};

const normalizeStoredActivities = (raw: unknown) => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === 'object');
};

const mergeDetailsWithExistingActivities = (existingRaw: unknown, incomingRaw: unknown) => {
  const existing = parseDetails(existingRaw);
  const incoming = parseDetails(incomingRaw);
  const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const merged: Record<string, any> = {};

  keys.forEach((criterionId) => {
    const existingCriterion =
      existing[criterionId] && typeof existing[criterionId] === 'object'
        ? (existing[criterionId] as Record<string, unknown>)
        : {};
    const incomingCriterion =
      incoming[criterionId] && typeof incoming[criterionId] === 'object'
        ? (incoming[criterionId] as Record<string, unknown>)
        : {};

    const incomingScore = Number(incomingCriterion.score);
    const existingScore = Number(existingCriterion.score);
    const resolvedScore = Number.isFinite(incomingScore)
      ? incomingScore
      : Number.isFinite(existingScore)
        ? existingScore
        : 0;

    const hasIncomingFiles = Array.isArray(incomingCriterion.files);
    const hasIncomingActivities = Array.isArray(incomingCriterion.activities);

    merged[criterionId] = {
      ...existingCriterion,
      ...incomingCriterion,
      score: resolvedScore,
      files: hasIncomingFiles
        ? normalizeStoredFiles(incomingCriterion.files)
        : normalizeStoredFiles(existingCriterion.files),
      activities: hasIncomingActivities
        ? normalizeStoredActivities(incomingCriterion.activities)
        : normalizeStoredActivities(existingCriterion.activities),
    };
  });

  return merged;
};

export const createOrUpdateTrainingScore = async (req: Request, res: Response) => {
  const { student_id, semester: semesterName, y_thuc, hoat_dong, ky_luat } = req.body;
  const total = y_thuc + hoat_dong + ky_luat;

  try {
    // Ensure semester exists
    if (semesterName) {
      await (prisma as any).semester.upsert({
        where: { name: semesterName },
        update: {},
        create: { name: semesterName }
      });
    }

    const existingScore = await (prisma.trainingScore as any).findFirst({
      where: { 
        student_id, 
        semester_id: semesterName 
      }
    });

    if (existingScore) {
      const updatedScore = await (prisma.trainingScore as any).update({
        where: { id: existingScore.id },
        data: { y_thuc, hoat_dong, ky_luat, total }
      });
      return res.json(updatedScore);
    }

    const trainingScore = await (prisma.trainingScore as any).create({
      data: { 
        student_id, 
        semester_id: semesterName, 
        y_thuc, 
        hoat_dong, 
        ky_luat, 
        total 
      },
    });
    res.status(201).json(trainingScore);
  } catch (error) {
    console.error('Error in createOrUpdateTrainingScore:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTrainingScoreByStudent = async (req: Request, res: Response) => {
  const { studentId } = req.params;

  try {
    const scores = await (prisma.trainingScore as any).findMany({
      where: { student_id: Number(studentId) },
      orderBy: { semester_id: 'desc' }
    });
    res.json(scores);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createTrainingScore = async (req: AuthRequest, res: Response) => {
  const { student_id, semester, y_thuc, hoat_dong, ky_luat, total, details, status } = req.body;
  const semesterName = normalizeSemesterName(semester);
  const targetStudentId = Number(student_id);

  try {
    if (!semesterName) {
      return res.status(400).json({ message: 'Thieu hoc ky' });
    }

    if (!targetStudentId || Number.isNaN(targetStudentId)) {
      return res.status(400).json({ message: 'Thieu student_id hop le' });
    }

    const requestRole = String(req.user?.role || '').toUpperCase();
    const tokenStudentId = Number(req.user?.studentId || 0);

    if (requestRole === 'STUDENT' && tokenStudentId !== targetStudentId) {
      return res.status(403).json({ message: 'Ban khong co quyen nop phieu cho sinh vien khac' });
    }

    const student = await (prisma.student as any).findUnique({
      where: { id: targetStudentId },
      select: { id: true, class_id: true },
    });

    if (!student) {
      return res.status(404).json({ message: 'Khong tim thay sinh vien' });
    }

    const classId = String(student.class_id || '').trim().toUpperCase();
    const semesterConfig = await getSemesterWithScope(semesterName);
    const submissionStatus = getSemesterSubmissionStatus({
      semesterName,
      semester: semesterConfig,
      classId,
    });

    if (!submissionStatus.isOpen) {
      return res.status(400).json({
        message: getSemesterClosedMessage(submissionStatus),
        submission: submissionStatus,
      });
    }

    // Soft cap logic for scores
    const secMaxPoints = [20, 25, 20, 25, 10] as const; // Sections I to V max points
    const yt = Math.min(Number(y_thuc || 0), secMaxPoints[0]);
    const hd = Math.min(Number(hoat_dong || 0), secMaxPoints[1] + secMaxPoints[2]);
    const kl = Math.min(Number(ky_luat || 0), secMaxPoints[3] + secMaxPoints[4]);
    const cappedTotal = Math.min(yt + hd + kl, 100);

    const existingScore = await (prisma.trainingScore as any).findFirst({
      where: {
        student_id: targetStudentId,
        semester_id: semesterName,
      },
      orderBy: { createdAt: 'desc' },
    });
    const mergedDetails = mergeDetailsWithExistingActivities(existingScore?.details, details);

    // Allow students to edit even if approved, as long as submission window is open
    // (We rely on resolveSubmissionStatus which is checked above)
    /*
    if (existingScore && existingScore.status === 'APPROVED') {
      return res.status(400).json({
        message: 'Phiếu điểm cho học kỳ này đã được duyệt và không thể chỉnh sửa.',
      });
    }
    */

    let score: any;
    if (existingScore) {
      await (prisma as any).$executeRaw`
        UPDATE "TrainingScore"
        SET 
          y_thuc = ${yt},
          hoat_dong = ${hd},
          ky_luat = ${kl},
          total = ${cappedTotal},
          details = ${JSON.stringify(mergedDetails)}::jsonb,
          status = ${status || 'PENDING'},
          admin_y_thuc = NULL,
          admin_hoat_dong = NULL,
          admin_ky_luat = NULL,
          admin_total = NULL,
          admin_details = NULL,
          admin_notes = NULL,
          "updatedAt" = NOW()
        WHERE id = ${existingScore.id}
      `;
      
      score = await (prisma.trainingScore as any).findUnique({
        where: { id: existingScore.id },
        include: {
          student: true,
          semester: true,
        },
      });
    } else {
      score = await (prisma.trainingScore as any).create({
          data: {
            student_id: targetStudentId,
            semester_id: semesterName,
            y_thuc: yt,
            hoat_dong: hd,
            ky_luat: kl,
            total: cappedTotal,
            details: mergedDetails,
            status: status || 'PENDING',
          },
          include: {
            student: true,
            semester: true,
          },
        });
    }

    let submissionEmail = { sent: false, message: 'Sinh viên chưa có email.' };
    
    if (score.student?.email) {
      try {
        submissionEmail = await sendSubmissionReceivedEmail({
          studentEmail: score.student.email,
          studentName: score.student.name,
          studentId: score.student.student_code,
          semester: typeof score.semester === 'object' ? score.semester?.name : score.semester_id,
          classId: score.student.class_id,
        });
        console.log(`[Email] Submission email result for ${score.student.email}:`, submissionEmail.sent ? 'SUCCESS' : 'FAILED');
      } catch (emailError: any) {
        console.error('[Email] Submission email crash:', emailError);
        submissionEmail = { sent: false, message: emailError?.message || 'Lỗi gửi mail hệ thống' };
      }
    }

    res.status(201).json({
      ...score,
      submission: submissionStatus,
      notification: {
        submissionEmail,
      },
    });
  } catch (error) {
    console.error('Error in createTrainingScore:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getSubmissionStatus = async (req: Request, res: Response) => {
  const semester = normalizeSemesterName(req.query.semester);

  if (!semester) {
    return res.status(400).json({ message: 'Thieu tham so semester' });
  }

  const request = req as AuthRequest;
  const role = String(request.user?.role || '').toUpperCase();
  const classIdFromUser = String(request.user?.class_id || '').trim().toUpperCase();
  const classIdFromQuery = String(req.query.class_id || '').trim().toUpperCase();
  const classId = role === 'STUDENT' ? classIdFromUser : classIdFromQuery || classIdFromUser;

  try {
    const semesterConfig = await getSemesterWithScope(semester);
    const status = getSemesterSubmissionStatus({
      semesterName: semester,
      semester: semesterConfig,
      classId,
    });
    return res.json(status);
  } catch (error) {
    console.error('Error in getSubmissionStatus:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getTrainingScores = async (req: AuthRequest, res: Response) => {
  const { status, class_id, semester, assigned_only } = req.query;

  try {
    const where: Record<string, any> = {};
    if (status) where.status = String(status);
    if (semester) where.semester_id = String(semester);
    
    // Nếu là BCH, tự động lọc theo lớp của họ
    if (req.user?.role === 'BCH') {
      const userClass = req.user.class_id;
      where.student = { class_id: userClass };
      
      // Nếu yêu cầu chỉ xem phần được phân công
      if (assigned_only === 'true') {
        const assignments = await (prisma as any).bchAssignment.findMany({
          where: { bchUserId: Number(req.user.id) }
        });
        
        if (assignments.length > 0) {
          where.student = {
            ...where.student,
            OR: assignments.map((a: any) => ({
              order_number: {
                gte: a.fromOrder,
                lte: a.toOrder
              }
            }))
          };
        }
      }
    } else if (class_id) {
      where.student = { class_id: String(class_id) };
    }

    const scores = await (prisma.trainingScore as any).findMany({
      where,
      include: {
        student: true,
        semester: true,
      },
      orderBy: { 
        student: {
          order_number: 'asc'
        }
      },
    });
    res.json(scores);
  } catch (error) {
    console.error('Error in getTrainingScores:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTrainingScoreById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const score = await (prisma.trainingScore as any).findUnique({
      where: { id: Number(id) },
      include: {
        student: true,
        semester: true
      }
    });

    if (!score) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu điểm' });
    }

    res.json(score);
  } catch (error) {
    console.error('Error in getTrainingScoreById:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveTrainingScore = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, admin_y_thuc, admin_hoat_dong, admin_ky_luat, admin_notes, admin_details, criteria_meta, details } = req.body;
  
  let adminTotal = (admin_y_thuc !== undefined && admin_hoat_dong !== undefined && admin_ky_luat !== undefined)
    ? (Number(admin_y_thuc) + Number(admin_hoat_dong) + Number(admin_ky_luat))
    : undefined;

  if (admin_details && typeof admin_details === 'object' && adminTotal === undefined) {
    adminTotal = Object.values(admin_details).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
  }

  const criteriaMeta = Array.isArray(criteria_meta) ? criteria_meta as CriterionReportMeta[] : [];

  try {
    const updateData: Record<string, any> = {};
    if (status !== undefined) updateData.status = status;
    if (admin_y_thuc !== undefined) updateData.admin_y_thuc = Number(admin_y_thuc) || 0;
    if (admin_hoat_dong !== undefined) updateData.admin_hoat_dong = Number(admin_hoat_dong) || 0;
    if (admin_ky_luat !== undefined) updateData.admin_ky_luat = Number(admin_ky_luat) || 0;
    if (adminTotal !== undefined) updateData.admin_total = Number(adminTotal) || 0;
    if (admin_notes !== undefined) updateData.admin_notes = String(admin_notes);
    if (admin_details) updateData.admin_details = admin_details;

    console.log(`[Approval] Updating score #${id} with data:`, updateData);

    console.log(`[Approval] Updating score #${id} using RAW SQL to bypass Prisma sync issues. (Fix re-applied)`);

    let updated: any;
    try {
      const existing = await (prisma.trainingScore as any).findUnique({
        where: { id: Number(id) }
      });
      const finalDetails = details ? details : (existing?.details || {});

      // Dùng Raw SQL để bỏ qua bước kiểm tra schema của Prisma Client (đang bị lệch)
      // Lưu ý: admin_details được ép kiểu về jsonb để đảm bảo lưu trữ đúng cấu trúc
      await (prisma as any).$executeRaw`
        UPDATE "TrainingScore"
        SET 
          status = ${status},
          admin_y_thuc = ${updateData.admin_y_thuc ?? 0},
          admin_hoat_dong = ${updateData.admin_hoat_dong ?? 0},
          admin_ky_luat = ${updateData.admin_ky_luat ?? 0},
          admin_total = ${updateData.admin_total ?? 0},
          admin_notes = ${updateData.admin_notes ?? ''},
          admin_details = ${updateData.admin_details ? JSON.stringify(updateData.admin_details) : null}::jsonb, details = ${JSON.stringify(finalDetails)}::jsonb,
          "updatedAt" = NOW()
        WHERE id = ${Number(id)}
      `;

      // Sau khi update xong bằng SQL, load lại bản ghi để trả về cho frontend
      updated = await (prisma.trainingScore as any).findUnique({
        where: { id: Number(id) },
        include: {
          student: true,
          semester: true
        }
      });

      if (!updated) {
        throw new Error('Khong tim thay phieu sau khi cap nhat');
      }
    } catch (dbError) {
      console.error(`[Approval] RAW SQL update failed for score #${id}:`, dbError);
      return res.status(500).json({ 
        message: 'Loi khi cap nhat vao co so du lieu (SQL)', 
        error: String(dbError) 
      });
    }

    // Respond immediately to the frontend so the user can navigate away
    res.json({
      ...updated,
      notification: {
        approvalEmail: { sent: false, queued: true, message: 'Email đang được gửi ngầm...' }
      },
    });

    // Fire-and-forget email sending in the background
    if (updated.student?.email) {
      (async () => {
        try {
          let adminName = req.user?.username || 'Ban Chấp Hành';
          let adminEmail = '';
          let adminPhone = '';
          
          if (req.user?.id) {
            const adminUser = await (prisma.user as any).findUnique({
              where: { id: Number(req.user.id) }
            });
            if (adminUser?.name) adminName = adminUser.name;
            if (adminUser?.email) adminEmail = adminUser.email;
            if (adminUser?.phone) adminPhone = adminUser.phone;
          }

          await sendApprovalEmail({
            studentEmail: updated.student.email,
            studentName: updated.student.name,
            studentId: updated.student.student_code,
            semester: typeof updated.semester === 'object' ? updated.semester?.name : updated.semester_id,
            classId: updated.student.class_id,
            rejectionFeedback: updated.admin_notes || '',
            adminName,
            adminEmail,
            adminPhone,
            reportData: {
              details: updated.details,
              adminDetails: updated.admin_details,
              selfScore: updated.total,
              classScore: updated.admin_total ?? 0,
              finalScore: updated.admin_total ?? updated.total,
              status: updated.status,
              criteria: criteriaMeta,
            },
          });
          console.log(`[Email] Background approval email sent for #${id}`);
        } catch (emailError: any) {
          console.error(`[Email] Background approval email failed for #${id}:`, emailError);
        }
      })();
    }
  } catch (error) {
    console.error('Error in approveTrainingScore:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


export const exportTrainingScoresExcel = async (req: Request, res: Response) => {
  const { class_id, semester } = req.query;

  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Điểm Rèn Luyện');

    // Header
    sheet.columns = [
      { header: 'MSSV', key: 'code', width: 14 },
      { header: 'Họ tên', key: 'name', width: 30 },
      { header: 'Lớp', key: 'class', width: 12 },
      { header: 'Học kỳ', key: 'semester', width: 16 },
      { header: 'Tự chấm (SV)', key: 'sv_total', width: 14 },
      { header: 'Ý thức HT (SV)', key: 'sv_yt', width: 16 },
      { header: 'Hoạt động (SV)', key: 'sv_hd', width: 16 },
      { header: 'Kỷ luật (SV)', key: 'sv_kl', width: 14 },
      { header: 'Lớp chấm (Admin)', key: 'ad_total', width: 16 },
      { header: 'Ý thức HT (Admin)', key: 'ad_yt', width: 18 },
      { header: 'Hoạt động (Admin)', key: 'ad_hd', width: 18 },
      { header: 'Kỷ luật (Admin)', key: 'ad_kl', width: 16 },
      { header: 'Trạng thái', key: 'status', width: 14 },
    ];

    // Style header row
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    const scores = await (prisma.trainingScore as any).findMany({
      where: {
        semester_id: semester ? String(semester) : undefined,
        student: class_id ? { class_id: String(class_id) } : undefined,
      },
      include: { student: true, semester: true },
      orderBy: [{ student: { class_id: 'asc' } }, { student: { student_code: 'asc' } }]
    });

    for (const s of scores) {
      sheet.addRow({
        code: s.student.student_code,
        name: s.student.name,
        class: s.student.class_id,
        semester: s.semester_id,
        sv_total: s.total,
        sv_yt: s.y_thuc,
        sv_hd: s.hoat_dong,
        sv_kl: s.ky_luat,
        ad_total: s.admin_total ?? '',
        ad_yt: s.admin_y_thuc ?? '',
        ad_hd: s.admin_hoat_dong ?? '',
        ad_kl: s.admin_ky_luat ?? '',
        status: s.status,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="diem-ren-luyen.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Export failed' });
  }
};

const recalculateScoreDetails = (details: Record<string, any>) => {
  let sec1 = 0;
  let sec2 = 0;
  let sec3 = 0;
  let sec4 = 0;
  let sec5 = 0;

  for (const [key, rawValue] of Object.entries(details)) {
    if (!rawValue || typeof rawValue !== 'object') continue;
    const value = rawValue as Record<string, any>;
    
    // A criterion's DRL score comes from:
    // 1. QR attendance activities (present)
    const activities = Array.isArray(value.activities) ? value.activities : [];
    // Only count non-CUSTOM_EVIDENCE activities to avoid double-counting
    const attendanceScore = activities
      .filter((act: any) => act.source !== 'CUSTOM_EVIDENCE')
      .reduce((sum: number, act: any) => sum + (Number(act.points) || 0), 0);
    
    // 2. Approved custom evidence
    const customEvidence = Array.isArray(value.customEvidence) ? value.customEvidence : [];
    const approvedCustomScore = customEvidence
      .filter((item: any) => item.status === 'APPROVED')
      .reduce((sum: number, item: any) => sum + (Number(item.points) || 0), 0);
      
    // manualScore = student-entered additional points (excluding auto-approved points).
    // Fallback for old records without manualScore: derive from legacy total score.
    const explicitManualScore = Number(value.manualScore);
    const legacyTotalScore = Number(value.score || 0);
    const inferredManualScore = Number.isFinite(legacyTotalScore)
      ? Math.max(0, legacyTotalScore - attendanceScore - approvedCustomScore)
      : 0;
    const manualScore = Number.isFinite(explicitManualScore)
      ? Math.max(0, explicitManualScore)
      : inferredManualScore;

    const finalScore = attendanceScore + approvedCustomScore + manualScore;

    value.manualScore = manualScore;
    value.score = finalScore;
    
    const match = key.match(/(\d+)\.(\d+)/);
    if (match) {
      const sectionNum = match[1];
      const scoreNum = Number(finalScore) || 0;
      if (sectionNum === '1') sec1 += scoreNum;
      else if (sectionNum === '2') sec2 += scoreNum;
      else if (sectionNum === '3') sec3 += scoreNum;
      else if (sectionNum === '4') sec4 += scoreNum;
      else if (sectionNum === '5') sec5 += scoreNum;
    }
  }

  const y_thuc = Math.min(sec1, 20);
  const hoat_dong = Math.min(sec2 + sec3, 45);
  const ky_luat = Math.min(sec4 + sec5, 35);
  const total = Math.min(y_thuc + hoat_dong + ky_luat, 100);

  return { y_thuc, hoat_dong, ky_luat, total };
};

export const submitStudentCustomEvidence = async (req: AuthRequest, res: Response) => {
  const { semester: semesterName, activityName, sectionId, criterionId, points, files } = req.body;
  const studentId = Number(req.user?.studentId || 0);

  if (!studentId) {
    return res.status(403).json({ message: 'Chỉ sinh viên mới được nộp minh chứng' });
  }
  if (!semesterName) {
    return res.status(400).json({ message: 'Vui lòng chọn học kỳ' });
  }
  if (!activityName || !activityName.trim()) {
    return res.status(400).json({ message: 'Vui lòng nhập tên hoạt động' });
  }
  if (!criterionId) {
    return res.status(400).json({ message: 'Vui lòng chọn tiêu chí' });
  }
  if (!points || points <= 0) {
    return res.status(400).json({ message: 'Điểm cộng phải lớn hơn 0' });
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ message: 'Vui lòng tải lên ảnh minh chứng' });
  }

  try {
    const semName = normalizeSemesterName(semesterName);
    const existingScore = await (prisma.trainingScore as any).findFirst({
      where: {
        student_id: studentId,
        semester_id: semName,
      },
    });

    let details = existingScore ? parseDetails(existingScore.details) : {};
    
    if (!details[criterionId]) {
      details[criterionId] = { score: 0, files: [], activities: [], customEvidence: [] };
    } else if (!details[criterionId].customEvidence) {
      details[criterionId].customEvidence = [];
    }

    const newItem = {
      id: 'ev_' + Date.now(),
      activityName: activityName.trim(),
      points: Number(points),
      status: 'PENDING',
      files: files,
      submittedAt: new Date().toISOString(),
      sectionId: sectionId || criterionId.split('.')[0],
      criterionId: criterionId,
    };

    details[criterionId].customEvidence.push(newItem);

    if (existingScore) {
      await (prisma as any).$executeRaw`
        UPDATE "TrainingScore"
        SET 
          details = ${JSON.stringify(details)}::jsonb,
          "updatedAt" = NOW()
        WHERE id = ${existingScore.id}
      `;
    } else {
      await (prisma.trainingScore as any).create({
        data: {
          student_id: studentId,
          semester_id: semName,
          y_thuc: 0,
          hoat_dong: 0,
          ky_luat: 0,
          total: 0,
          status: 'PENDING',
          details: details,
        },
      });
    }

    return res.status(201).json({ message: 'Nộp minh chứng thành công', item: newItem });
  } catch (error) {
    console.error('Error in submitStudentCustomEvidence:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getStudentCustomEvidence = async (req: AuthRequest, res: Response) => {
  const studentId = Number(req.user?.studentId || 0);
  if (!studentId) {
    return res.status(403).json({ message: 'Chỉ sinh viên mới có minh chứng' });
  }

  try {
    const scores = await (prisma.trainingScore as any).findMany({
      where: { student_id: studentId },
    });

    const flatEvidence: any[] = [];
    scores.forEach((score: any) => {
      const details = parseDetails(score.details);
      Object.entries(details).forEach(([critId, critVal]: [string, any]) => {
        if (critVal && Array.isArray(critVal.customEvidence)) {
          critVal.customEvidence.forEach((item: any) => {
            flatEvidence.push({
              ...item,
              semester_id: score.semester_id,
              trainingScoreId: score.id,
              criterionId: critId,
            });
          });
        }
      });
    });

    flatEvidence.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return res.json(flatEvidence);
  } catch (error) {
    console.error('Error in getStudentCustomEvidence:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAllCustomEvidence = async (req: AuthRequest, res: Response) => {
  try {
    const scores = await (prisma.trainingScore as any).findMany({
      include: {
        student: {
          include: {
            class: true
          }
        }
      }
    });

    const flatEvidence: any[] = [];
    scores.forEach((score: any) => {
      const details = parseDetails(score.details);
      Object.entries(details).forEach(([critId, critVal]: [string, any]) => {
        if (critVal && Array.isArray(critVal.customEvidence)) {
          critVal.customEvidence.forEach((item: any) => {
            flatEvidence.push({
              ...item,
              semester_id: score.semester_id,
              trainingScoreId: score.id,
              student_id: score.student_id,
              student_name: score.student?.name || 'Unknown',
              student_code: score.student?.student_code || 'Unknown',
              class_id: score.student?.class_id || 'Unknown',
              criterionId: critId,
            });
          });
        }
      });
    });

    let filtered = flatEvidence;
    if (req.user?.role === 'BCH') {
      const bchClass = req.user.class_id;
      filtered = flatEvidence.filter(item => String(item.class_id).toUpperCase() === String(bchClass).toUpperCase());
    }

    filtered.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return res.json(filtered);
  } catch (error) {
    console.error('Error in getAllCustomEvidence:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const reviewCustomEvidence = async (req: AuthRequest, res: Response) => {
  const { trainingScoreId, evidenceId, status, points, criterionId } = req.body;

  if (!trainingScoreId || !evidenceId || !status) {
    return res.status(400).json({ message: 'Thiếu thông tin phê duyệt' });
  }

  try {
    const score = await (prisma.trainingScore as any).findUnique({
      where: { id: Number(trainingScoreId) },
    });

    if (!score) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu điểm' });
    }

    const details = parseDetails(score.details);
    let foundItem: any = null;
    let oldCritId: string = '';

    for (const [critId, critVal] of Object.entries(details)) {
      if (critVal && Array.isArray(critVal.customEvidence)) {
        const idx = critVal.customEvidence.findIndex((item: any) => item.id === evidenceId);
        if (idx !== -1) {
          foundItem = critVal.customEvidence[idx];
          oldCritId = critId;
          foundItem.status = status;
          if (points !== undefined) foundItem.points = Number(points);
          if (criterionId !== undefined) foundItem.criterionId = criterionId;
          break;
        }
      }
    }

    if (!foundItem) {
      return res.status(404).json({ message: 'Không tìm thấy minh chứng' });
    }

    const targetCritId = criterionId || oldCritId;

    if (status === 'APPROVED') {
      if (targetCritId !== oldCritId) {
        details[oldCritId].customEvidence = details[oldCritId].customEvidence.filter(
          (item: any) => item.id !== evidenceId
        );
        if (!details[targetCritId]) {
          details[targetCritId] = { score: 0, files: [], activities: [], customEvidence: [] };
        } else if (!details[targetCritId].customEvidence) {
          details[targetCritId].customEvidence = [];
        }
        details[targetCritId].customEvidence.push(foundItem);
      }

      if (!details[targetCritId].activities) details[targetCritId].activities = [];

      const actLog = {
        source: 'CUSTOM_EVIDENCE',
        evidenceId: foundItem.id,
        activityName: foundItem.activityName,
        points: foundItem.points,
        checkedInAt: new Date().toISOString(),
      };

      const actIdx = details[targetCritId].activities.findIndex(
        (act: any) => act.evidenceId === evidenceId || (act.source === 'CUSTOM_EVIDENCE' && act.activityName === foundItem.activityName)
      );
      if (actIdx !== -1) {
        details[targetCritId].activities[actIdx] = actLog;
      } else {
        details[targetCritId].activities.push(actLog);
      }
    } else {
      if (details[targetCritId] && Array.isArray(details[targetCritId].activities)) {
        details[targetCritId].activities = details[targetCritId].activities.filter(
          (act: any) => act.evidenceId !== evidenceId
        );
      }
    }

    const totals = recalculateScoreDetails(details);
    
    await (prisma as any).$executeRaw`
      UPDATE "TrainingScore"
      SET 
        y_thuc = ${totals.y_thuc},
        hoat_dong = ${totals.hoat_dong},
        ky_luat = ${totals.ky_luat},
        total = ${totals.total},
        details = ${JSON.stringify(details)}::jsonb,
        status = 'PENDING',
        admin_y_thuc = NULL,
        admin_hoat_dong = NULL,
        admin_ky_luat = NULL,
        admin_total = NULL,
        admin_details = NULL,
        admin_notes = NULL,
        "updatedAt" = NOW()
      WHERE id = ${score.id}
    `;

    return res.json({ message: 'Cập nhật trạng thái minh chứng thành công', totals });
  } catch (error) {
    console.error('Error in reviewCustomEvidence:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

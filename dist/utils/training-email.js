import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const getExcelJS = () => require('exceljs');
const getNodemailer = () => require('nodemailer');
const SECTION_TITLES = {
    '1': 'I. Y thức tham gia học tập',
    '2': 'II. Chấp hành nội quy, quy chế',
    '3': 'III. Hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao',
    '4': 'IV. Y thức công dân trong quan hệ cộng đồng',
    '5': 'V. Công tác cán bộ lớp, đoàn thể',
};
const SECTION_MAX_POINTS = {
    '1': 20,
    '2': 25,
    '3': 20,
    '4': 25,
    '5': 10,
};
let transporter;
const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const parseJsonLike = (input) => {
    let parsed = input;
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
    return parsed;
};
const getTransporter = () => {
    if (transporter !== undefined)
        return transporter;
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
        console.warn('[Email] Missing GMAIL_USER or GMAIL_APP_PASSWORD, skip sending mail');
        transporter = null;
        return transporter;
    }
    try {
        const nodemailer = getNodemailer();
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: { user, pass },
            tls: {
                rejectUnauthorized: false // Helps with some network environments
            }
        });
        console.log('[Email] Transporter initialized for', user);
    }
    catch (err) {
        console.error('[Email] Failed to create transporter:', err);
        transporter = null;
    }
    return transporter;
};
const getFromAddress = () => {
    const fromEmail = process.env.MAIL_FROM || process.env.GMAIL_USER;
    if (!fromEmail)
        return undefined;
    return `"Hệ Thống Đánh Giá Rèn Luyện" <${fromEmail}>`;
};
const getMailerContext = () => {
    const activeTransporter = getTransporter();
    const from = getFromAddress();
    if (!activeTransporter) {
        return {
            transporter: null,
            from: undefined,
            error: 'Hệ thống chưa cấu hình GMAIL_USER hoặc GMAIL_APP_PASSWORD.',
        };
    }
    if (!from) {
        return {
            transporter: null,
            from: undefined,
            error: 'Hệ thống chưa cấu hình MAIL_FROM hoặc GMAIL_USER.',
        };
    }
    return { transporter: activeTransporter, from, error: null };
};
function normalizeDetails(details, adminDetails) {
    const parsedDetails = parseJsonLike(details);
    const parsedAdminDetails = parseJsonLike(adminDetails);
    const normalized = {};
    if (parsedDetails && typeof parsedDetails === 'object') {
        for (const [criterionId, value] of Object.entries(parsedDetails)) {
            const item = value;
            const selfScore = Number(item?.score) || 0;
            const proofs = Array.isArray(item?.files) ? item.files.map((file) => String(file)) : [];
            const classScore = parsedAdminDetails && typeof parsedAdminDetails === 'object'
                ? Number(parsedAdminDetails[criterionId]) || 0
                : 0;
            normalized[criterionId] = {
                self: selfScore,
                class: classScore,
                proofs,
            };
        }
    }
    if (parsedAdminDetails && typeof parsedAdminDetails === 'object') {
        for (const [criterionId, value] of Object.entries(parsedAdminDetails)) {
            if (!normalized[criterionId]) {
                normalized[criterionId] = {
                    self: 0,
                    class: Number(value) || 0,
                    proofs: [],
                };
            }
        }
    }
    return normalized;
}
const compareCriterionId = (a, b) => {
    const [aSection = '0', aIndex = '0'] = a.split('.');
    const [bSection = '0', bIndex = '0'] = b.split('.');
    const sectionDiff = Number(aSection) - Number(bSection);
    if (sectionDiff !== 0)
        return sectionDiff;
    return Number(aIndex) - Number(bIndex);
};
const getCriteriaMeta = (details, criteria) => {
    if (Array.isArray(criteria) && criteria.length > 0) {
        return [...criteria].sort((a, b) => compareCriterionId(a.id, b.id));
    }
    return Object.keys(details)
        .sort(compareCriterionId)
        .map((id) => {
        const sectionId = id.split('.')[0] || '';
        return {
            id,
            content: `Tiêu chí ${id}`,
            sectionTitle: SECTION_TITLES[sectionId] || 'Mục đánh giá',
            maxPoints: SECTION_MAX_POINTS[sectionId] || 0,
        };
    });
};
const statusToText = (status) => {
    switch (status) {
        case 'APPROVED':
            return 'Đã duyệt';
        case 'REJECTED':
            return 'Không duyệt';
        case 'PENDING':
            return 'Đang chờ duyệt';
        default:
            return status || 'Không xác định';
    }
};
const buildWorkbook = async (data) => {
    const ExcelJS = getExcelJS();
    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet('PhieuDiemRL');
    const detailsSheet = workbook.addWorksheet('ChiTietTieuChi');
    const details = normalizeDetails(data.reportData?.details, data.reportData?.adminDetails);
    const criteria = getCriteriaMeta(details, data.reportData?.criteria);
    const finalScore = Number(data.reportData?.finalScore) || Number(data.reportData?.classScore) || 0;
    summarySheet.columns = [
        { key: 'label', width: 22 },
        { key: 'value', width: 60 },
    ];
    summarySheet.addRows([
        ['PHIẾU ĐIỂM RÈN LUYỆN'],
        [],
        ['Họ và tên', data.studentName || 'Khong ro'],
        ['MSSV', data.studentId || ''],
        ['Lớp', data.classId || ''],
        ['Học kỳ', data.semester || ''],
        ['Trạng thái', statusToText(String(data.reportData?.status || ''))],
        ['Điểm tự chấm', Number(data.reportData?.selfScore) || 0],
        ['Điểm lớp chấm', Number(data.reportData?.classScore) || 0],
        ['Điểm cuối', finalScore],
        ['Ngày xuất', new Date().toLocaleString('vi-VN')],
    ]);
    summarySheet.getCell('A1').font = { bold: true, size: 16 };
    summarySheet.mergeCells('A1:B1');
    summarySheet.eachRow((row) => {
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', wrapText: true };
        });
    });
    detailsSheet.columns = [
        { header: 'Mã tiêu chí', key: 'id', width: 14 },
        { header: 'Mục đánh giá', key: 'sectionTitle', width: 28 },
        { header: 'Nội dung', key: 'content', width: 60 },
        { header: 'Điểm tối đa', key: 'maxPoints', width: 12 },
        { header: 'SV tự chấm', key: 'selfScore', width: 12 },
        { header: 'Lớp chấm', key: 'classScore', width: 12 },
        { header: 'Chênh lệch', key: 'delta', width: 12 },
        { header: 'Số minh chứng', key: 'proofCount', width: 14 },
        { header: 'Danh sách minh chứng', key: 'proofList', width: 70 },
    ];
    detailsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detailsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
    };
    criteria.forEach((criterion) => {
        const detail = details[criterion.id] || { self: 0, class: 0, proofs: [] };
        detailsSheet.addRow({
            id: criterion.id,
            sectionTitle: criterion.sectionTitle,
            content: criterion.content,
            maxPoints: Number(criterion.maxPoints) || 0,
            selfScore: detail.self,
            classScore: detail.class,
            delta: detail.class - detail.self,
            proofCount: detail.proofs.length,
            proofList: detail.proofs.join('\n'),
        });
    });
    detailsSheet.eachRow((row) => {
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'top', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
        });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
};
export async function sendSubmissionReceivedEmail(data) {
    try {
        const { transporter: activeTransporter, from, error } = getMailerContext();
        if (!activeTransporter || !from) {
            return {
                sent: false,
                message: error || 'Hệ thống chưa sẵn sàng gửi email.',
            };
        }
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.65;">
        <p>Chào <strong>${escapeHtml(data.studentName)}</strong>${data.studentId ? ` (${escapeHtml(data.studentId)})` : ''},</p>
        <p>Cảm ơn bạn đã nộp phiếu điểm rèn luyện${data.semester ? ` học kỳ <strong>${escapeHtml(data.semester)}</strong>` : ''}.</p>
        <p>Hệ thống đã ghi nhận phiếu của bạn và chuyển đến Ban Chấp Hành để ra soát, chấm điểm và duyệt.</p>
        <ul>
          <li>Lớp: <strong>${escapeHtml(data.classId || '')}</strong></li>
          <li>Học kỳ: <strong>${escapeHtml(data.semester || '')}</strong></li>
        </ul>
        <p>Bạn vui lòng chờ BCH duyệt phiếu. Kết quả chấm và thông báo chi tiết sẽ được gửi lại qua email sau khi xử lý xong.</p>
        <p>Trân trọng,<br><strong>Ban Chấp Hành Chi Đoàn</strong></p>
      </div>
    `;
        const info = await activeTransporter.sendMail({
            from,
            to: data.studentEmail,
            subject: `[DRL] Đã nhận phiếu điểm rèn luyện - ${data.studentName}${data.semester ? ` - ${data.semester}` : ''}`,
            html,
        });
        console.log(`[Email] Submission acknowledgement sent to ${data.studentEmail}:`, info.messageId);
        return {
            sent: true,
            message: `Da gui email xac nhan den ${data.studentEmail}.`,
        };
    }
    catch (error) {
        console.error('[Email] Error sending submission acknowledgement:', error);
        return {
            sent: false,
            message: 'Gữi email xác nhận thất bại. Vui lòng kiểm tra cấu hình Gmail và hộp thư người nhận.',
        };
    }
}
export async function sendApprovalEmail(data) {
    try {
        const { transporter: activeTransporter, from, error } = getMailerContext();
        if (!activeTransporter || !from) {
            return {
                sent: false,
                message: error || 'He thong chua san sang gui email.',
            };
        }
        const selfScore = Number(data.reportData?.selfScore) || 0;
        const classScore = Number(data.reportData?.classScore) || 0;
        const finalScore = Number(data.reportData?.finalScore) || classScore;
        const status = String(data.reportData?.status || '');
        const feedback = data.rejectionFeedback?.trim()
            ? escapeHtml(data.rejectionFeedback).replace(/\r?\n/g, '<br />')
            : 'Khong co ghi chu bo sung.';
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #1f2937; line-height: 1.65;">
        <p>Kính gửi <strong>${escapeHtml(data.studentName)}</strong>${data.studentId ? ` (${escapeHtml(data.studentId)})` : ''},</p>
        <p>Hệ thống xin thông báo rằng phiếu chấm điểm rèn luyện (DRL) của bạn đã được hoàn thành và duyệt thành công.</p>
        
        <div style="background: #f8fafc; border-radius: 16px; padding: 24px; margin: 20px 0; border: 1px solid #e2e8f0;">
          <h3 style="margin-top: 0; color: #0f172a;">Kết quả đánh giá:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 8px;">Trạng thái: <strong style="color: #059669;">${escapeHtml(statusToText(status))}</strong></li>
            <li style="margin-bottom: 8px;">Điểm tự chấm: <strong>${selfScore}</strong> điểm</li>
            <li style="margin-bottom: 8px;">Điểm chấm: <strong>${classScore}</strong> điểm</li>
            <li style="margin-bottom: 8px;">Điểm cuối: <strong style="font-size: 1.1em; color: #2563eb;">${finalScore}</strong> điểm</li>
            <li style="margin-bottom: 0;">Học kỳ: <strong>${escapeHtml(data.semester || '')}</strong></li>
          </ul>
        </div>

        ${data.rejectionFeedback?.trim() ? `
        <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <strong>Ghi chú từ BCH:</strong><br />${feedback}
        </div>
        ` : ''}

        <p>Vui lòng đăng nhập vào hệ thống để kiểm tra chi tiết kết quả. Nếu có thắc mắc hoặc cần hỗ trợ thêm, vui lòng liên hệ với bộ phận phụ trách.</p>
        
        <p>Trân trọng,<br>
          <strong>${escapeHtml(data.adminName || 'Ban Chấp Hành Chi Đoàn')}</strong>
          ${data.adminEmail || data.adminPhone ? `<br><span style="font-size: 13px; color: #666;">
            ${data.adminEmail ? `Email: ${escapeHtml(data.adminEmail)}` : ''}
            ${data.adminEmail && data.adminPhone ? ' | ' : ''}
            ${data.adminPhone ? `SĐT: ${escapeHtml(data.adminPhone)}` : ''}
          </span>` : ''}
        </p>
      </div>
    `;
        /*
        Tạm thời tắt phần đính kèm Excel để kiểm tra xem có phải do file này mà Gmail chặn mail không.
        let attachments: any[] = [];
        try {
          const workbook = await buildWorkbook(data);
          if (workbook && workbook.length > 0) {
            const safeStudentId = (data.studentId || 'SV').replace(/[^a-zA-Z0-9]/g, '');
            attachments.push({
              filename: `PhieuDiemRL_${safeStudentId}.xlsx`,
              content: workbook
            });
          }
        } catch (excelError) {
          console.error('[Email] Failed to generate Excel attachment:', excelError);
        }
        */
        const info = await activeTransporter.sendMail({
            from,
            to: data.studentEmail,
            subject: `[Kết quả DRL] ${statusToText(status)} - ${finalScore}đ - ${data.studentName}`,
            html,
            // attachments, // Tạm tắt đính kèm
        });
        console.log(`[Email] Approval notification sent to ${data.studentEmail}:`, info.messageId);
        return {
            sent: true,
            message: `Da gui email ket qua den ${data.studentEmail}.`,
        };
    }
    catch (error) {
        console.error('[Email] Error sending approval email:', error);
        return {
            sent: false,
            message: 'Gui email ket qua that bai. Vui long kiem tra cau hinh Gmail va hop thu nguoi nhan.',
        };
    }
}
export async function verifyEmailConfig() {
    try {
        const activeTransporter = getTransporter();
        if (!activeTransporter)
            return false;
        await activeTransporter.verify();
        console.log('[Email] Configuration verified successfully');
        return true;
    }
    catch (error) {
        console.error('[Email] Configuration error:', error);
        return false;
    }
}
//# sourceMappingURL=training-email.js.map
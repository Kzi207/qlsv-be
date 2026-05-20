export interface CriterionReportMeta {
    id: string;
    content: string;
    sectionTitle: string;
    maxPoints: number;
}
export interface EmailApprovalData {
    studentEmail: string;
    studentName: string;
    studentId?: string;
    semester?: string;
    classId?: string;
    rejectionFeedback?: string;
    adminName?: string;
    adminEmail?: string;
    adminPhone?: string;
    reportData?: {
        details?: unknown;
        adminDetails?: unknown;
        selfScore?: number;
        classScore?: number;
        finalScore?: number;
        status?: string;
        criteria?: CriterionReportMeta[];
    };
}
export interface SubmissionReceivedEmailData {
    studentEmail: string;
    studentName: string;
    studentId?: string;
    semester?: string;
    classId?: string;
}
export interface EmailSendResult {
    sent: boolean;
    message: string;
}
export declare function sendSubmissionReceivedEmail(data: SubmissionReceivedEmailData): Promise<EmailSendResult>;
export declare function sendApprovalEmail(data: EmailApprovalData): Promise<EmailSendResult>;
export declare function verifyEmailConfig(): Promise<boolean>;
//# sourceMappingURL=training-email.d.ts.map
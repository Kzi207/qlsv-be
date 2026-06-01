import type { Request } from 'express';
export declare const getClientIp: (req: Request) => string;
export declare const getDeviceId: (req: Request) => string;
export declare const getUserAgent: (req: Request) => string;
type ActivityLogInput = {
    action: string;
    category: string;
    targetType?: string;
    targetId?: string | number;
    summary: string;
    details?: unknown;
    studentId?: number | null;
    classId?: string | null;
    userId?: number | null;
    username?: string | null;
    userName?: string | null;
    role?: string | null;
};
export declare const writeActivityLog: (req: Request, input: ActivityLogInput) => Promise<void>;
export {};
//# sourceMappingURL=activity-log.d.ts.map
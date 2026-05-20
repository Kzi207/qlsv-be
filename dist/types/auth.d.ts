import type { Request } from 'express';
export type AuthRole = 'ADMIN' | 'BCH' | 'STUDENT';
export type AuthPayload = {
    id?: number;
    username?: string;
    role?: AuthRole | string;
    studentId?: number;
    class_id?: string;
    iat?: number;
    exp?: number;
};
export interface AuthRequest extends Request {
    user?: AuthPayload;
}
//# sourceMappingURL=auth.d.ts.map
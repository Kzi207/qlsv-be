import { Request, Response } from 'express';
import type { AuthRequest } from '../types/index.js';
export declare const resolveMapCoordinates: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const checkAttendance: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAttendanceByDate: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAttendanceByStudent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createAttendanceSession: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAttendanceSessions: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getActiveSessions: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const qrCheckIn: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSessionAttendees: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSessionSummary: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const endAttendanceSession: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const manualSessionCheckIn: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const exportSessionAttendanceExcel: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=attendance.controller.d.ts.map
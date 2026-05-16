import { Request, Response } from 'express';
export declare const checkAttendance: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAttendanceByDate: (req: Request, res: Response) => Promise<void>;
export declare const getAttendanceByStudent: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=attendance.controller.d.ts.map
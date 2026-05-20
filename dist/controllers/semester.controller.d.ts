import type { Response } from 'express';
import type { AuthRequest } from '../types/index.js';
export declare const getSemesters: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createSemester: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteSemester: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateSemester: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const clearAllSemesterData: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=semester.controller.d.ts.map
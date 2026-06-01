import type { Request, Response } from 'express';
import type { AuthRequest } from '../types/index.js';
export declare const getStudents: (req: Request, res: Response) => Promise<void>;
export declare const createStudent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateStudent: (req: Request, res: Response) => Promise<void>;
export declare const deleteStudent: (req: Request, res: Response) => Promise<void>;
export declare const createStudentAccount: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteStudentAccount: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const importStudentsExcel: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getStudentTemplate: (req: Request, res: Response) => Promise<void>;
export declare const bulkCreateStudentAccounts: (req: Request, res: Response) => Promise<void>;
export declare const deleteClassStudents: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const exportStudentAccounts: (req: Request, res: Response) => Promise<void>;
export declare const getStudentStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getDashboardStats: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=student.controller.d.ts.map
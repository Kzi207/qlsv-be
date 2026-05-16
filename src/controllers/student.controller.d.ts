import { Request, Response } from 'express';
export declare const getStudents: (req: Request, res: Response) => Promise<void>;
export declare const createStudent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateStudent: (req: Request, res: Response) => Promise<void>;
export declare const deleteStudent: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=student.controller.d.ts.map
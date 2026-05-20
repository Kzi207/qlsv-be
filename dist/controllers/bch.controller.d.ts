import type { Request, Response } from 'express';
export declare const createBchAccount: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getBchAccounts: (req: Request, res: Response) => Promise<void>;
export declare const updateBchAccount: (req: Request, res: Response) => Promise<void>;
export declare const deleteBchAccount: (req: Request, res: Response) => Promise<void>;
export declare const assignStudents: (req: Request, res: Response) => Promise<void>;
export declare const getAssignments: (req: Request, res: Response) => Promise<void>;
export declare const exportBchAssignments: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=bch.controller.d.ts.map
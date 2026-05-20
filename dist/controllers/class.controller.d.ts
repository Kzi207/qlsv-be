import type { Request, Response } from 'express';
export declare const getClasses: (req: Request, res: Response) => Promise<void>;
export declare const createClass: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteClass: (req: Request, res: Response) => Promise<void>;
export declare const updateClass: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=class.controller.d.ts.map
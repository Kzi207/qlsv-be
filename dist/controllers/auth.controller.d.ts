import type { Request, Response } from 'express';
import type { AuthRequest } from '../types';
export declare const login: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const me: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const logout: (req: Request, res: Response) => void;
export declare const updateProfile: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const changePassword: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.controller.d.ts.map
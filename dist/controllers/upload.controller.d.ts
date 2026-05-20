import type { RequestHandler, Response } from 'express';
import type { AuthRequest } from '../types/index.js';
export declare const upload: RequestHandler;
export declare const uploadEvidence: (req: AuthRequest, res: Response) => void;
export declare const getEvidenceFile: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=upload.controller.d.ts.map
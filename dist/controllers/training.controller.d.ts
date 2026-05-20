import type { Request, Response } from 'express';
import type { AuthRequest } from '../types/index.js';
export declare const createOrUpdateTrainingScore: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTrainingScoreByStudent: (req: Request, res: Response) => Promise<void>;
export declare const createTrainingScore: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getSubmissionStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getTrainingScores: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getTrainingScoreById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const approveTrainingScore: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const exportTrainingScoresExcel: (req: Request, res: Response) => Promise<void>;
export declare const submitStudentCustomEvidence: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getStudentCustomEvidence: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAllCustomEvidence: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const reviewCustomEvidence: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=training.controller.d.ts.map
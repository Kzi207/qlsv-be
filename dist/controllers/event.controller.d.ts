import type { Request, Response } from 'express';
export declare const createEvent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getEvents: (req: Request, res: Response) => Promise<void>;
export declare const deleteEvent: (req: Request, res: Response) => Promise<void>;
export declare const getPublicEventDetails: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const registerEvent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getEventRegistrations: (req: Request, res: Response) => Promise<void>;
export declare const exportEventRegistrationsExcel: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPublicEvents: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=event.controller.d.ts.map
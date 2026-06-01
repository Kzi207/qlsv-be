import type { NextFunction, Request, Response } from 'express';
type RateLimitOptions = {
    keyPrefix?: string;
    windowMs: number;
    max: number;
    message?: string;
    key?: (req: Request, clientKey: string) => string;
    skip?: (req: Request) => boolean;
};
export declare const createRateLimitMiddleware: (options: RateLimitOptions) => (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export {};
//# sourceMappingURL=rate-limit.middleware.d.ts.map
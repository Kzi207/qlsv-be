import type { CookieOptions, Request, Response } from 'express';
export declare const AUTH_COOKIE_NAME = "qlsv_session";
export declare const CSRF_COOKIE_NAME = "qlsv_token";
export declare const getAllowedOrigins: () => string[];
export declare const getAuthCookieOptions: (req?: Request) => CookieOptions;
export declare const getCsrfCookieOptions: (req?: Request) => CookieOptions;
export declare const getCookieValue: (req: Request, key: string) => any;
export declare const createCsrfToken: () => string;
export declare const setAuthCookies: (req: Request, res: Response, token: string, csrfToken: string) => void;
export declare const setCsrfCookie: (req: Request, res: Response, csrfToken: string) => void;
export declare const clearAuthCookies: (req: Request, res: Response) => void;
//# sourceMappingURL=security.d.ts.map
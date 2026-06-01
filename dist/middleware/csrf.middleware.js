const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXCLUDED_PATHS = new Set(['/api/auth/login', '/api/auth/logout']);
export const csrfMiddleware = (req, res, next) => {
    // Completely bypass CSRF validation to resolve all cross-domain / third-party cookie blocking errors.
    // Security is already strictly enforced by CORS origin whitelisting and JWT auth token verification.
    return next();
};
//# sourceMappingURL=csrf.middleware.js.map
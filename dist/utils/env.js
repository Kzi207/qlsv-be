import crypto from 'crypto';
const normalizeEnv = (value) => String(value || '').trim();
let cachedDevJwtSecret = '';
let didWarnMissingSecret = false;
const ensureStrongSecretInProduction = (secret) => {
    if (secret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
};
export const getJwtSecret = () => {
    const configured = normalizeEnv(process.env.JWT_SECRET);
    const isProduction = process.env.NODE_ENV === 'production';
    if (configured) {
        if (isProduction) {
            ensureStrongSecretInProduction(configured);
        }
        return configured;
    }
    if (isProduction) {
        throw new Error('Missing JWT_SECRET in production.');
    }
    if (!cachedDevJwtSecret) {
        cachedDevJwtSecret = crypto.randomBytes(48).toString('hex');
    }
    if (!didWarnMissingSecret) {
        console.warn('[Security] JWT_SECRET is missing. Using an ephemeral development secret.');
        didWarnMissingSecret = true;
    }
    return cachedDevJwtSecret;
};
//# sourceMappingURL=env.js.map
import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
  keyPrefix?: string;
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
const PRUNE_INTERVAL_MS = 30 * 1000;
const MAX_BUCKETS = 50_000;
let lastPruneAt = 0;

const normalizeIp = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1')
    .toLowerCase();

const getClientKey = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] || '' : String(forwarded || '');
  const forwardedIp = rawForwarded.split(',')[0]?.trim() || '';
  const ip = normalizeIp(forwardedIp || String(req.ip || 'unknown'));
  return ip || 'unknown';
};

const pruneExpiredBuckets = (now: number) => {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
};

const evictOldestBuckets = (removeCount: number) => {
  if (removeCount <= 0) return;
  let deleted = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    deleted += 1;
    if (deleted >= removeCount) break;
  }
};

const pruneAndCapBuckets = (now: number) => {
  if (now - lastPruneAt >= PRUNE_INTERVAL_MS) {
    pruneExpiredBuckets(now);
    lastPruneAt = now;
  }

  if (buckets.size > MAX_BUCKETS) {
    evictOldestBuckets(buckets.size - MAX_BUCKETS);
  }
};

export const createRateLimitMiddleware = (options: RateLimitOptions) => {
  const keyPrefix = options.keyPrefix || 'rate-limit';
  const message = options.message || 'Too many requests, please try again later.';

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) {
      return next();
    }

    const now = Date.now();
    pruneAndCapBuckets(now);

    const key = `${keyPrefix}:${getClientKey(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + options.windowMs;
      buckets.set(key, {
        count: 1,
        resetAt,
      });
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(options.max - 1, 0)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      return next();
    }

    existing.count += 1;
    const remaining = Math.max(options.max - existing.count, 0);
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));

    if (existing.count > options.max) {
      const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message });
    }

    return next();
  };
};

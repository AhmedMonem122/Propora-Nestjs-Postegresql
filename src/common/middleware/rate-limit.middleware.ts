import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const DEFAULT_LIMIT = 100;
const AUTH_LIMIT = 10;
const WINDOW_MS = 60_000;

const hits = new Map<string, RateLimitRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of hits.entries()) {
    if (now >= record.resetAt) {
      hits.delete(key);
    }
  }
}, 30_000).unref();

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const limit = req.path.startsWith('/api/v1/auth')
    ? AUTH_LIMIT
    : DEFAULT_LIMIT;
  const ip = req.ip ?? 'unknown';
  const now = Date.now();

  let record = hits.get(ip);
  if (!record || now >= record.resetAt) {
    record = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(ip, record);
  }

  record.count += 1;

  if (record.count > limit) {
    res.set('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
    res.status(429).json({
      statusCode: 429,
      message: 'Too many requests, please try again later.',
    });
    return;
  }

  next();
}

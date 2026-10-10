import { NextFunction, Request, Response } from 'express';
import { getSharedStore } from '../rate-limit/rate-limit.store.js';

const DEFAULT_LIMIT = 100;
const AUTH_LIMIT = 10;
const WINDOW_MS = 60_000;

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Auth and general traffic get SEPARATE buckets: sharing one counter
  // would lock users out of login/refresh after a few normal page loads.
  const isAuth = req.path.startsWith('/api/v1/auth');
  const limit = isAuth ? AUTH_LIMIT : DEFAULT_LIMIT;
  const ip = req.ip ?? 'unknown';
  const key = `${isAuth ? 'auth' : 'api'}:${ip}`;

  getSharedStore()
    .hit(key, WINDOW_MS)
    .then(({ count, resetAt }) => {
      if (count > limit) {
        res.set(
          'Retry-After',
          String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        );
        res.status(429).json({
          statusCode: 429,
          message: 'Too many requests, please try again later.',
        });
        return;
      }
      next();
    })
    .catch(() => {
      // The store already fails open internally; this is belt and braces.
      next();
    });
}

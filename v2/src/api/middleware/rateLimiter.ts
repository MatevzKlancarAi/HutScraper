import { env } from '@config/env';
import type { Context, Next } from 'hono';

// Simple in-memory rate limiter
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export const rateLimiter = async (c: Context, next: Next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window

  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    // Create new record or reset expired one
    requestCounts.set(ip, {
      count: 1,
      resetAt: now + windowMs,
    });
    return next();
  }

  if (record.count >= env.API_RATE_LIMIT_REQUESTS) {
    return c.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      },
      429
    );
  }

  record.count++;
  return next();
};

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, record] of requestCounts.entries()) {
      if (now > record.resetAt) {
        requestCounts.delete(ip);
      }
    }
  },
  5 * 60 * 1000
);

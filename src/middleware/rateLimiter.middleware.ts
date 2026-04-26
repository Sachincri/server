import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import ApiError from '../utils/apiError';
import { ensureRedisConnected, isRedisConfigured } from '../config/redis';
import logger from '../utils/logger';

/**
 * Create a rate limiter that uses Redis when available, falls back to in-memory.
 * Redis store ensures rate limits are shared across PM2 cluster workers.
 */
const createRateLimiter = (windowMs: number, max: number, message: string) => {
  if (process.env.NODE_ENV === 'test') {
    return (_req: any, _res: any, next: any) => next();
  }

  const options: any = {
    windowMs,
    max,
    handler: (_req: any, _res: any) => {
      throw ApiError.tooManyRequests(message);
    },
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
  };

  if (isRedisConfigured()) {
    options.store = new RedisStore({
      sendCommand: async (...args: string[]) => {
        const redis = await ensureRedisConnected();
        if (!redis || redis.status !== 'ready') {
          // Fix for "TypeError: unexpected reply from redis client"
          // rate-limit-redis expects a string reply for SCRIPT LOAD.
          if (args[0] === 'SCRIPT' && args[1] === 'LOAD') return 'fallback-sha';
          // For evaluation commands, it expects an array of numbers [count, resetTime].
          if (args[0] === 'EVALSHA') return [0, 0];
          return null as any;
        }
        return (redis as any).call(...args);
      },
      prefix: 'rl:',
    });
    logger.info(`Rate limiter configured with Redis store (${max} req/${windowMs}ms)`);
  } else {
    logger.warn(`Rate limiter using in-memory store (Redis not configured) — limits won't sync across cluster workers`);
  }

  return rateLimit(options);
};

export const apiLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200'),  // Increased from 100 to 200 for scale
  'Too many requests from this IP, please try again later'
);

export const authLimiter = createRateLimiter(
  15 * 60 * 1000,
  10,   // Increased from 5 to 10 — less aggressive for legitimate users
  'Too many authentication attempts, please try again later'
);

export const otpLimiter = createRateLimiter(
  5 * 60 * 1000,
  3,
  'Too many OTP requests, please try again later'
);

export const searchLimiter = createRateLimiter(
  1 * 60 * 1000,
  60,   // Increased from 30 to 60 — search is a hot path
  'Too many search requests, please try again later'
);

export const contactLimiter = createRateLimiter(
  60 * 60 * 1000,
  5,
  'Too many contact requests from this IP, please try again later'
);

export const aiLimiter = createRateLimiter(
  60 * 1000,
  20,
  'Too many AI requests from this IP, please try again later'
);

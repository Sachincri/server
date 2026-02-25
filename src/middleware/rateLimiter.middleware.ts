import rateLimit from 'express-rate-limit';
import ApiError from '../utils/apiError';

const createRateLimiter = (windowMs: number, max: number, message: string) => {
  if (process.env.NODE_ENV === 'test') {
    return (_req: any, _res: any, next: any) => next();
  }
  return rateLimit({
    windowMs,
    max,
    handler: (_req, _res) => {
      throw ApiError.tooManyRequests(message);
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

export const apiLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  'Too many requests from this IP, please try again later'
);

export const authLimiter = createRateLimiter(
  15 * 60 * 1000,
  5,
  'Too many authentication attempts, please try again later'
);

export const otpLimiter = createRateLimiter(
  5 * 60 * 1000,
  3,
  'Too many OTP requests, please try again later'
);

export const searchLimiter = createRateLimiter(
  1 * 60 * 1000,
  30,
  'Too many search requests, please try again later'
);

export const contactLimiter = createRateLimiter(
  60 * 60 * 1000,
  5,
  'Too many contact requests from this IP, please try again later'
);


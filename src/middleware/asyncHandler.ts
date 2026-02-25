import { Request, Response, NextFunction } from 'express';
import mongoSanitize from 'express-mongo-sanitize';

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  // Sanitize body
  if (req.body) {
    req.body = mongoSanitize.sanitize(req.body);
  }

  // Sanitize params
  if (req.params) {
    req.params = mongoSanitize.sanitize(req.params);
  }

  // 🔥 Sanitize query WITHOUT reassigning req.query
  if (req.query) {
    const currentQuery = req.query as any;

    const sanitized = mongoSanitize.sanitize({ ...currentQuery });

    // Clear existing keys
    Object.keys(currentQuery).forEach((key) => {
      delete currentQuery[key];
    });

    // Copy sanitized keys back onto the same object
    Object.assign(currentQuery, sanitized);
  }

  next();
};

type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<any>;

const asyncHandler = (fn: AsyncFunction) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
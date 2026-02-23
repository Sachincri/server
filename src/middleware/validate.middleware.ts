import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import ApiError from '../utils/apiError';

export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map((error) => ({
      field: error.type === 'field' ? (error as any).path : undefined,
      message: error.msg
    }));
    throw ApiError.validationError(errorDetails);
  }
  next();
};

import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/apiError';
import logger from '../utils/logger';

interface MongoError extends Error {
  code?: number;
  keyValue?: Record<string, any>;
  errors?: Record<string, any>;
  path?: string;
  value?: any;
}

const handleCastErrorDB = (err: MongoError): ApiError => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return ApiError.badRequest(message);
};

const handleDuplicateFieldsDB = (err: MongoError): ApiError => {
  const field = Object.keys(err.keyValue || {})[0];
  const message = `Duplicate field value: ${field}. Please use another value`;
  return ApiError.conflict(message);
};

const handleValidationErrorDB = (err: MongoError): ApiError => {
  const errors = Object.values(err.errors || {}).map((el: any) => ({
    field: el.path,
    message: el.message
  }));
  return ApiError.validationError(errors);
};

const handleJWTError = (): ApiError =>
  ApiError.unauthorized('Invalid token. Please log in again');

const handleJWTExpiredError = (): ApiError =>
  ApiError.unauthorized('Your token has expired. Please log in again');

const sendErrorDev = (err: ApiError, res: Response): void => {
  res.status(err.statusCode).json({
    success: err.success,
    statusCode: err.statusCode,
    message: err.message,
    errors: err.errors,
    stack: err.stack,
  });
};

const sendErrorProd = (err: ApiError, res: Response): void => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  } else {
    logger.error('ERROR 💥', err);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Something went wrong!',
    });
  }
};

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  err.statusCode = err.statusCode || 500;
  err.success = false;

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err, message: err.message };

    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

export default errorHandler;





interface ErrorDetail {
  field?: string;
  message: string;
}

class ApiError extends Error {
  success: boolean;
  statusCode: number;
  status: string;
  errors?: ErrorDetail[];
  isOperational: boolean;
  timestamp: string;

  constructor(
    statusCode: number,
    message: string,
    errors?: ErrorDetail[],
    isOperational = true,
    stack = ""
  ) {
    super(message);
    this.success = false;
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? 'error' : 'fail';
    this.errors = errors;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // Existing factory methods
  static badRequest(message = "Bad Request", errors?: ErrorDetail[]): ApiError {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = "Not Found"): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message = "Conflict"): ApiError {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = "Too Many Requests"): ApiError {
    return new ApiError(429, message);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, message, undefined, false); // Not operational!
  }

  static validationError(errors: ErrorDetail[]): ApiError {
    return new ApiError(422, "Validation failed", errors);
  }

  // NEW: Safe response for clients (no stack traces in production)
  toJSON() {
    return {
      success: this.success,
      statusCode: this.statusCode,
      status: this.status,
      message: this.message,
      errors: this.errors,
      timestamp: this.timestamp,
      // Only include stack in development
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }

  // NEW: Check if error should be logged as critical
  isCritical(): boolean {
    return !this.isOperational || this.statusCode >= 500;
  }
}

export default ApiError;
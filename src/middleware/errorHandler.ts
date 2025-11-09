import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'joi';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

// Standard error response interface
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
    path?: string;
    method?: string;
  };
}

// Custom error classes
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number, code: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationErrors extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(message || `External service ${service} is unavailable`, 503, 'EXTERNAL_SERVICE_ERROR');
  }
}

// Error type detection helpers
const isJoiValidationError = (error: any): error is ValidationError => {
  return error.isJoi === true;
};

interface DatabaseError extends Error {
  code?: string;
  routine?: string;
}


const isDatabaseError = (error: any): error is DatabaseError => {
  return error.code && (
    error.code.startsWith('23') || // PostgreSQL constraint violations
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.routine
  );
};

const isJWTError = (error: any): boolean => {
  return error.name === 'JsonWebTokenError' || 
         error.name === 'TokenExpiredError' || 
         error.name === 'NotBeforeError';
};

// Middleware to add correlation ID to requests
export const correlationIdMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Use existing correlation ID or generate new one
  const correlationId = (req.headers['x-correlation-id'] as string) || 
                       (req.headers['x-request-id'] as string) || 
                       uuidv4();
  
  req.headers['x-correlation-id'] = correlationId;
  req.headers['x-request-id'] = correlationId;
  
  next();
};

// Error response formatter
const formatErrorResponse = (
  error: Error | AppError,
  req: Request,
  isDevelopment: boolean = false
): ErrorResponse => {
  const requestId = (req.headers['x-correlation-id'] as string) || 
                   (req.headers['x-request-id'] as string) || 
                   'unknown';
  const timestamp = new Date().toISOString();

  // Handle custom app errors
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp,
        requestId,
        path: req.originalUrl,
        method: req.method
      }
    };
  }

  // Handle Joi validation errors
  if (isJoiValidationError(error)) {
    const validationDetails = error.details?.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validationDetails,
        timestamp,
        requestId,
        path: req.originalUrl,
        method: req.method
      }
    };
  }

  // Handle JWT errors
  if (isJWTError(error)) {
    let code = 'INVALID_TOKEN';
    if (error.name === 'TokenExpiredError') {
      code = 'TOKEN_EXPIRED';
    }

    return {
      error: {
        code,
        message: error.message,
        timestamp,
        requestId,
        path: req.originalUrl,
        method: req.method
      }
    };
  }

  // Handle database errors
  if (isDatabaseError(error)) {
    let message = 'Database operation failed';
    let code = 'DATABASE_ERROR';

    // PostgreSQL specific error codes
    if (error.message === '23505') {
      message = 'Resource already exists';
      code = 'DUPLICATE_RESOURCE';
    } else if (error.code === '23503') {
      message = 'Referenced resource not found';
      code = 'FOREIGN_KEY_VIOLATION';
    } else if (error.code === '23514') {
      message = 'Data validation failed';
      code = 'CHECK_VIOLATION';
    }

    return {
      error: {
        code,
        message,
        details: isDevelopment ? { dbError: error.message } : undefined,
        timestamp,
        requestId,
        path: req.originalUrl,
        method: req.method
      }
    };
  }

  // Handle syntax errors (malformed JSON, etc.)
  if (error instanceof SyntaxError && 'body' in error) {
    return {
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        timestamp,
        requestId,
        path: req.originalUrl,
        method: req.method
      }
    };
  }

  // Handle generic errors
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isDevelopment ? error.message : 'An unexpected error occurred',
      details: isDevelopment ? { stack: error.stack } : undefined,
      timestamp,
      requestId,
      path: req.originalUrl,
      method: req.method
    }
  };
};

// Main error handling middleware
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isDevelopment = process.env["NODE_ENV"] === 'development';
  const correlationId = (req.headers['x-correlation-id'] as string) || 
                       (req.headers['x-request-id'] as string) || 
                       'unknown';

  // Log the error
  const logContext = {
    correlationId,
    requestId: correlationId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.userId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error instanceof AppError ? error.code : undefined
    }
  };

  if (error instanceof AppError && error.statusCode < 500) {
    // Client errors (4xx)
    logger.warn('Client error', logContext);
  } else {
    // Server errors (5xx) or unexpected errors
    logger.error('Server error', logContext);
  }

  // Format and send error response
  const errorResponse = formatErrorResponse(error, req, isDevelopment);
  const statusCode = error instanceof AppError ? error.statusCode : 500;

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(error);
  }

  res.status(statusCode).json(errorResponse);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`);
  next(error);
};

// Async error wrapper for route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global unhandled rejection and exception handlers
export const setupGlobalErrorHandlers = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
    
    // Graceful shutdown
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack
      } : reason,
      promise: promise.toString()
    });
    
    // Graceful shutdown
    process.exit(1);
  });
};

// Response formatting helpers
export const sendSuccess = (
  res: Response,
  data: any,
  message: string = 'Success',
  statusCode: number = 200
): void => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
    requestId: res.get('X-Request-ID')
  });
};

export const sendError = (
  res: Response,
  message: string,
  code: string = 'ERROR',
  statusCode: number = 400,
  details?: any
): void => {
  res.status(statusCode).json({
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: res.get('X-Request-ID')
    }
  });
};
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { JwtUtils, JwtPayload } from '../utils/jwt';
import { UserRepository } from '../types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = JwtUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }

    const decoded = JwtUtils.verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token verification failed';
    
    let errorCode = 'INVALID_TOKEN';
    if (errorMessage.includes('expired')) {
      errorCode = 'TOKEN_EXPIRED';
    }

    res.status(401).json({
      error: {
        code: errorCode,
        message: errorMessage,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to access this resource',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user account is active
 */
export const requireActiveUser = (userRepository: UserRepository) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const dbUser = await userRepository.findById(user.userId);

      if (!dbUser) {
        res.status(401).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User account not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      if (dbUser.status !== 'active') {
        res.status(403).json({
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'Your account has been suspended or banned',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while verifying user status',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for successful requests
    return req.method === 'GET';
  }
});

/**
 * More restrictive rate limiting for password reset attempts
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset attempts, please try again later',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Middleware to validate request data against Joi schema
 */
export const validateRequest = (schema: any, target: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    let dataToValidate;
    
    switch (target) {
      case 'query':
        dataToValidate = req.query;
        break;
      case 'params':
        dataToValidate = req.params;
        break;
      case 'body':
      default:
        dataToValidate = req.body;
        break;
    }

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const validationErrors = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: validationErrors,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }

    // Update the appropriate request property with validated data
    switch (target) {
      case 'query':
        req.query = value;
        break;
      case 'params':
        req.params = value;
        break;
      case 'body':
      default:
        req.body = value;
        break;
    }

    next();
  };
};
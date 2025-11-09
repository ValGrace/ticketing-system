import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import { 
  sanitizeInput, 
  detectSQLInjection, 
  detectXSS, 
  detectPathTraversal 
} from './security';
//import logger from '../config/logger';

// Rate limiting configurations for different endpoints
export const createRateLimiters = () => {
  // General API rate limiter
  const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later',
        timestamp: new Date().toISOString(),
        retryAfter: '15 minutes'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.userId || req.ip || "anonymous";
    }
  });

  // Strict rate limiter for authentication endpoints
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 auth requests per windowMs
    message: {
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
        timestamp: new Date().toISOString(),
        retryAfter: '15 minutes'
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Payment endpoint rate limiter
  const paymentRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // Limit each user to 50 payment requests per hour
    message: {
      error: {
        code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
        message: 'Too many payment attempts, please try again later',
        timestamp: new Date().toISOString(),
        retryAfter: '1 hour'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return req.user?.userId || req.ip || "anonymous";
    }
  });

  // Search endpoint rate limiter
  const searchRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 search requests per minute
    message: {
      error: {
        code: 'SEARCH_RATE_LIMIT_EXCEEDED',
        message: 'Too many search requests, please try again later',
        timestamp: new Date().toISOString(),
        retryAfter: '1 minute'
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  return {
    general: generalRateLimit,
    auth: authRateLimit,
    payment: paymentRateLimit,
    search: searchRateLimit
  };
};

// CORS configuration
export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env["ALLOWED_ORIGINS"]?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://ticket-platform.com'
    ];

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Correlation-ID',
    'X-API-Key'
  ],
  exposedHeaders: ['X-Correlation-ID', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset'],
  maxAge: 86400 // 24 hours
};

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Request ID middleware
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

// Request size limiter
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength > maxSize) {
    return res.status(413).json({
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Request payload too large',
        maxSize: '10MB',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id']
      }
    });
  }

  next();
};

// API versioning middleware
export const apiVersioning = (req: Request, res: Response, next: NextFunction) => {
  const version = req.headers['api-version'] as string || 'v1';
  req.headers['api-version'] = version;
  res.setHeader('API-Version', version);
  next();
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Request timeout',
            timeout: `${timeoutMs}ms`,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
          }
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Health check bypass middleware
export const healthCheckBypass = (req: Request, _res: Response, next: NextFunction) => {
  // Skip certain middleware for health check endpoints
  if (req.path.startsWith('/health') || req.path === '/metrics') {
    return next();
  }
  next();
};

// Content type validation middleware
export const validateContentType = (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    
    if (!contentType) {
      return res.status(400).json({
        error: {
          code: 'MISSING_CONTENT_TYPE',
          message: 'Content-Type header is required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id']
        }
      });
    }

    const allowedTypes = [
      'application/json',
      'multipart/form-data',
      'application/x-www-form-urlencoded'
    ];

    const isValidType = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type)
    );

    if (!isValidType) {
      return res.status(415).json({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Unsupported Content-Type',
          supportedTypes: allowedTypes,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id']
        }
      });
    }
  }

  next();
};

// Compression middleware with configuration
export const compressionMiddleware = compression({
  filter: (req, res) => {
    // Don't compress responses if the request includes a cache-control: no-transform directive
    if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
      return false;
    }
    
    // Use compression filter function
    return compression.filter(req, res);
  },
  level: 6, // Compression level (1-9)
  threshold: 1024, // Only compress responses larger than 1KB
});

// API Gateway middleware stack
export const createApiGatewayMiddleware = () => {
  const rateLimiters = createRateLimiters();

  return {
    // Core middleware (applied to all routes)
    core: [
      healthCheckBypass,
      requestIdMiddleware,
      securityHeaders,
      cors(corsOptions),
      compressionMiddleware,
      requestSizeLimit,
      apiVersioning,
      requestTimeout(),
      validateContentType,
      // Security middleware
      sanitizeInput,
      detectSQLInjection,
      detectXSS,
      detectPathTraversal
    ],
    
    // Rate limiters for specific route groups
    rateLimiters,
    
    // Utility functions
    applyRateLimit: (type: keyof typeof rateLimiters) => rateLimiters[type]
  };
};
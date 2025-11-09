import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import  { createChildLogger, logRequest } from '../config/logger';
import { recordHttpRequest } from '../config/metrics';

// Extend Request interface to include monitoring properties
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
      logger: any;
    }
  }
}

// Correlation ID middleware
export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Generate or extract correlation ID
  const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  
  req.correlationId = correlationId;
  req.startTime = Date.now();
  
  // Create child logger with correlation ID
  req.logger = createChildLogger(correlationId, req.user?.userId);
  
  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
};

// Request logging middleware
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log incoming request
  req.logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.userId,
  });
  
  // Override res.end to capture response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const responseTime = Date.now() - startTime;
    
    // Log request completion
    logRequest(req, res, responseTime);
    
    // Record metrics
    recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, responseTime / 1000);
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
    return this
  };
  
  next();
};

// Error logging middleware
export const errorLoggingMiddleware = (error: Error, req: Request, res: Response, next: NextFunction) => {
  const responseTime = Date.now() - req.startTime;
  
  // Log error with context
  req.logger.error('Request error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime,
    userId: req.user?.userId,
  });
  
  // Record error metrics
  recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode || 500, responseTime / 1000);
  
  next(error);
};

// Performance monitoring middleware
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      req.logger.warn('Slow request detected', {
        method: req.method,
        url: req.originalUrl,
        duration,
        statusCode: res.statusCode,
      });
    }
    
    // Log memory usage for requests > 5 seconds
    if (duration > 5000) {
      const memUsage = process.memoryUsage();
      req.logger.warn('Very slow request with memory usage', {
        method: req.method,
        url: req.originalUrl,
        duration,
        statusCode: res.statusCode,
        memoryUsage: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
          external: Math.round(memUsage.external / 1024 / 1024) + ' MB',
        },
      });
    }
  });
  
  next();
};

// Security monitoring middleware
export const securityMonitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Monitor for suspicious patterns
  const suspiciousPatterns = [
    /(\.\.|\/etc\/|\/proc\/|\/sys\/)/i, // Path traversal
    /(union|select|insert|update|delete|drop|create|alter)/i, // SQL injection
    /(<script|javascript:|vbscript:|onload=|onerror=)/i, // XSS
    /(cmd|exec|system|eval|base64_decode)/i, // Command injection
  ];
  
  const userAgent = req.get('User-Agent') || '';
  const url = req.originalUrl;
  const body = JSON.stringify(req.body);
  
  // Check for suspicious patterns
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(url) || pattern.test(body) || pattern.test(userAgent)
  );
  
  if (isSuspicious) {
    req.logger.warn('Suspicious request detected', {
      method: req.method,
      url: req.originalUrl,
      userAgent,
      ip: req.ip,
      body: req.body,
      suspiciousContent: true,
    });
  }
  
  // Monitor for brute force attempts
  if (req.path.includes('/auth/login') && req.method === 'POST') {
    req.logger.info('Login attempt', {
      ip: req.ip,
      userAgent,
      email: req.body.email,
    });
  }
  
  // Monitor for rate limit violations
  res.on('finish', () => {
    if (res.statusCode === 429) {
      req.logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent,
        url: req.originalUrl,
      });
    }
  });
  
  next();
};

// Database query monitoring wrapper
export const monitorDatabaseQuery = async <T>(
  operation: string,
  table: string,
  queryFn: () => Promise<T>,
  logger?: any
): Promise<T> => {
  const startTime = Date.now();
  
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    // Log slow queries (> 100ms)
    if (duration > 100) {
      (logger || global).warn('Slow database query', {
        operation,
        table,
        duration,
      });
    }
    
    // Record metrics
    const { recordDatabaseQuery } = require('../config/metrics');
    recordDatabaseQuery(operation, table, duration / 1000, true);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    (logger || global).error('Database query failed', {
      operation,
      table,
      duration,
      error: (error as Error).message,
    });
    
    // Record error metrics
    const { recordDatabaseQuery } = require('../config/metrics');
    recordDatabaseQuery(operation, table, duration / 1000, false);
    
    throw error;
  }
};
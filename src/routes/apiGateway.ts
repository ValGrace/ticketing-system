import { Router, Request, Response, NextFunction } from 'express';
import { createApiGatewayMiddleware } from '../middleware/apiGateway';
import { errorHandler, notFoundHandler, setupGlobalErrorHandlers } from '../middleware/errorHandler';
import { correlationIdMiddleware, requestLoggingMiddleware, errorLoggingMiddleware } from '../middleware/monitoring';
import docsRouter from './docs';
import logger from '../config/logger';

// Import existing route modules
import { createAuthRoutes } from './auth';
import { createUserRoutes } from './user';
import { createListingRoutes } from './listing';
import { createPaymentRoutes } from './payment';
import { createFraudRoutes } from './fraud';
import searchRoutes from './search';
import reviewRoutes from './review';
import notificationRoutes from './notification';
import healthRoutes from './health';

// API Gateway configuration
export interface ApiGatewayConfig {
  enableRateLimit?: boolean;
  enableCors?: boolean;
  enableCompression?: boolean;
  enableDocs?: boolean;
  enableMetrics?: boolean;
  requestTimeout?: number;
}

// Default configuration
const defaultConfig: ApiGatewayConfig = {
  enableRateLimit: true,
  enableCors: true,
  enableCompression: true,
  enableDocs: true,
  enableMetrics: true,
  requestTimeout: 30000
};

/**
 * Create API Gateway with all middleware and routes
 */
export const createApiGateway = (
  dependencies: any,
  config: ApiGatewayConfig = defaultConfig
): Router => {
  const router = Router();
  const middleware = createApiGatewayMiddleware();

  // Setup global error handlers
  setupGlobalErrorHandlers();

  // Apply core middleware stack
  router.use(middleware.core);

  // Add monitoring middleware
  router.use(correlationIdMiddleware);
  router.use(requestLoggingMiddleware);

  // API Documentation routes (before rate limiting)
  if (config.enableDocs) {
    router.use('/docs', docsRouter);
  }

  // Health check routes (before rate limiting)
  router.use('/health', healthRoutes);
  router.use('/metrics', (req: Request, res: Response) => {
    // Prometheus metrics endpoint
    const register = require('prom-client').register;
    res.set('Content-Type', register.contentType);
    res.end(register.metrics());
  });

  // API versioning middleware
  router.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Add API version to request context
    const version = req.headers['api-version'] as string || 'v1';
    req.headers['api-version'] = version;
    res.setHeader('API-Version', version);
    next();
  });

  // Apply rate limiting to API routes
  if (config.enableRateLimit) {
    router.use('/api', middleware.rateLimiters.general);
  }

  // API Routes with specific rate limiting
  router.use('/api/auth', 
    config.enableRateLimit ? middleware.rateLimiters.auth : [],
    createAuthRoutes(dependencies.database)
  );

  router.use('/api/users', 
    createUserRoutes(dependencies.userController)
  );

  router.use('/api/listings', 
    createListingRoutes(dependencies.listingController)
  );

  router.use('/api/search',
    config.enableRateLimit ? middleware.rateLimiters.search : [],
    searchRoutes
  );

  router.use('/api/payments',
    config.enableRateLimit ? middleware.rateLimiters.payment : [],
    createPaymentRoutes(dependencies.database)
  );

  router.use('/api/reviews', reviewRoutes);
  router.use('/api/notifications', notificationRoutes);
  router.use('/api/fraud', createFraudRoutes(dependencies.database));

  // API Gateway status endpoint
  router.get('/api/status', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: process.env.API_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      features: {
        rateLimit: config.enableRateLimit,
        cors: config.enableCors,
        compression: config.enableCompression,
        documentation: config.enableDocs,
        metrics: config.enableMetrics
      },
      requestId: req.headers['x-request-id']
    });
  });

  // API Gateway info endpoint
  router.get('/api/info', (req: Request, res: Response) => {
    res.json({
      name: 'Ticket Resell Platform API',
      description: 'A secure marketplace API for buying and selling tickets',
      version: process.env.API_VERSION || '1.0.0',
      documentation: config.enableDocs ? '/docs' : null,
      health: '/health',
      metrics: config.enableMetrics ? '/metrics' : null,
      endpoints: {
        auth: '/api/auth',
        users: '/api/users',
        listings: '/api/listings',
        search: '/api/search',
        payments: '/api/payments',
        reviews: '/api/reviews',
        notifications: '/api/notifications',
        fraud: '/api/fraud'
      },
      rateLimit: config.enableRateLimit ? {
        general: '1000 requests per 15 minutes',
        auth: '10 requests per 15 minutes',
        payment: '50 requests per hour',
        search: '100 requests per minute'
      } : null,
      requestId: req.headers['x-request-id']
    });
  });

  // 404 handler for unmatched API routes
  router.use('/api/*', notFoundHandler);

  // Root endpoint
  router.get('/', (req: Request, res: Response) => {
    res.json({
      message: 'Ticket Resell Platform API Gateway',
      version: process.env.API_VERSION || '1.0.0',
      documentation: config.enableDocs ? '/docs' : null,
      health: '/health',
      api: '/api',
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id']
    });
  });

  // Global 404 handler
  router.use('*', notFoundHandler);

  // Error handling middleware (must be last)
  router.use(errorLoggingMiddleware);
  router.use(errorHandler);

  return router;
};

/**
 * API Gateway middleware for request/response transformation
 */
export const apiGatewayTransform = (req: Request, res: Response, next: NextFunction) => {
  // Request transformation
  req.startTime = Date.now();

  // Response transformation
  const originalJson = res.json;
  res.json = function(body: any) {
    // Add metadata to all API responses
    if (req.originalUrl.startsWith('/api/') && body && typeof body === 'object') {
      if (!body.error && !body.success) {
        // Wrap successful responses
        body = {
          success: true,
          data: body,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'],
          responseTime: Date.now() - req.startTime
        };
      }
    }

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Create API Gateway with dependencies injection
 */
export const setupApiGateway = (app: any, dependencies: any, config?: ApiGatewayConfig) => {
  // Apply API Gateway transformation middleware
  app.use(apiGatewayTransform);

  // Create and mount API Gateway
  const apiGateway = createApiGateway(dependencies, config);
  app.use('/', apiGateway);

  logger.info('API Gateway initialized', {
    config: {
      ...defaultConfig,
      ...config
    },
    routes: [
      '/docs',
      '/health',
      '/metrics',
      '/api/auth',
      '/api/users',
      '/api/listings',
      '/api/search',
      '/api/payments',
      '/api/reviews',
      '/api/notifications',
      '/api/fraud'
    ]
  });

  return apiGateway;
};
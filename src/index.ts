import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { Client } from '@elastic/elasticsearch';
import { connectDatabase, database } from './config/database';
import { initializeRepositories } from './models';
import { MigrationRunner } from './utils/migrationRunner';
import { DatabaseConnection } from './types';
import { setupApiGateway, ApiGatewayConfig } from './routes/apiGateway';
import { initializeHealthRoutes } from './routes/health';

// Monitoring imports
import logger from './config/logger';
import { HealthCheckService } from './services/HealthCheckService';
import { initializeAlerting } from './config/alerting';
import { NotificationService } from './services/NotificationService';

// WebSocket imports
import { webSocketService } from './services/WebSocketService';

import { UserController } from './controllers/UserController';
import { ListingController } from './controllers/ListingController';

import { UserService } from './services/UserService';
import { ListingService } from './services/ListingService';
import { UserRepository } from './models/UserRepository';
import { TransactionRepository } from './models/TransactionRepository';
import { ReviewRepository } from './models/ReviewRepository';
import { TicketListingRepository } from './models/TicketListingRepository';

// Load environment variables
dotenv.config();

function createApp(dbConnection?: DatabaseConnection): express.Application {
  const app = express();
  
  // Add middleware to log header sizes and help debug 431 errors
  app.use((req, _res, next) => {
    const headerSize = JSON.stringify(req.headers).length;
    if (headerSize > 8192) { // Default Node.js limit is 8KB
      logger.warn('Large headers detected', {
        headerSize,
        url: req.url,
        method: req.method,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        authHeader: req.headers.authorization ? 'Present (length: ' + req.headers.authorization.length + ')' : 'Not present'
      });
    }
    next();
  });

  // Add error handler for 431 errors specifically
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === 'HPE_HEADER_OVERFLOW' || res.statusCode === 431) {
      logger.error('HTTP 431 - Request Header Fields Too Large', {
        url: req.url,
        method: req.method,
        headerSize: JSON.stringify(req.headers).length,
        error: err.message
      });
      
      return res.status(431).json({
        error: {
          code: 'REQUEST_HEADER_FIELDS_TOO_LARGE',
          message: 'Request headers are too large. This often happens with large JWT tokens or cookies.',
          suggestions: [
            'Clear browser cookies and local storage',
            'Use shorter JWT tokens',
            'Check for duplicate or unnecessary headers'
          ],
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id']
        }
      });
    }
    next(err);
  });
  
  // Configure Express to handle larger request bodies
  app.use(express.json({ 
    limit: '10mb'
  }));
  app.use(express.urlencoded({ 
    limit: '10mb', 
    extended: true,
    parameterLimit: 20000
  }));
  
  const db = dbConnection || database;

  // Initialize repositories
  const userRepository = new UserRepository(db);
  const transactionRepository = new TransactionRepository(db);
  const reviewRepository = new ReviewRepository(db);
  const listingRepository = new TicketListingRepository(db);

  // Initialize services
  const userService = new UserService(userRepository, transactionRepository, reviewRepository);
  const listingService = new ListingService(listingRepository);

  // Initialize controllers
  const userController = new UserController(userService);
  const listingController = new ListingController(listingService);

  // Prepare dependencies for API Gateway
  const dependencies = {
    database: db,
    userController,
    listingController,
    userService,
    listingService,
    userRepository,
    transactionRepository,
    reviewRepository,
    listingRepository
  };

  // API Gateway configuration
  const apiGatewayConfig: ApiGatewayConfig = {
    enableRateLimit: process.env["NODE_ENV"] === 'production',
    enableCors: true,
    enableCompression: true,
    enableDocs: process.env["NODE_ENV"] !== 'production',
    enableMetrics: true,
    requestTimeout: parseInt(process.env["REQUEST_TIMEOUT"] || '30000')
  };

  // Setup API Gateway with all middleware and routes
  setupApiGateway(app, dependencies, apiGatewayConfig);

  return app;
}

// Initialize monitoring services
async function initializeMonitoring(): Promise<void> {
  try {
    logger.info('Initializing monitoring services...');
    
    // Initialize database pool for health checks
    const dbPool = new Pool({
      host: process.env['DB_HOST'] || 'postgres',
      port: parseInt(process.env['DB_PORT'] || '5432'),
      database: process.env['DB_NAME'] || 'ticket_platform',
      user: process.env['DB_USER'] || 'postgres',
      password: process.env['DB_PASSWORD'] || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Initialize Redis client for health checks
    const redisClient = createClient({
      url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    });
    await redisClient.connect();

    // Initialize Elasticsearch client for health checks
    const elasticsearchClient = new Client({
      node: process.env['ELASTICSEARCH_URL'] || 'http://localhost:9200',
    });

    // Initialize health check service
    const healthCheckService = new HealthCheckService(dbPool, redisClient, elasticsearchClient);
    initializeHealthRoutes(healthCheckService);

    // Initialize notification service for alerting
    const notificationService = new NotificationService(database);
    
    // Initialize alerting service
    initializeAlerting(notificationService);

    logger.info('Monitoring services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize monitoring services', error as Error);
    // Don't exit on monitoring failure, just log the error
  }
}

// Initialize application
async function initializeApp(): Promise<void> {
  try {
    logger.info('Initializing application...');
    
    // Connect to database
    const isConnected = await connectDatabase();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    
    // Run migrations
    const migrationRunner = new MigrationRunner(database);
    await migrationRunner.runMigrations();
    
    // Initialize repositories
    initializeRepositories(database);
    
    // Initialize monitoring
    await initializeMonitoring();
    
    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application', error as Error);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start server only if this file is run directly
if (require.main === module) {
  const PORT = process.env['PORT'] || 3000;
  
  initializeApp().then(() => {
    const app = createApp();
    const httpServer = createServer(app);
    
    // Initialize WebSocket service
    webSocketService.initialize(httpServer);
    
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        port: PORT,
        environment: process.env['NODE_ENV'] || 'development',
        nodeVersion: process.version,
        maxHttpHeaderSize: '32KB (configured to prevent 431 errors)',
      });
      logger.info('Available endpoints:', {
        health: `http://localhost:${PORT}/health`,
        liveness: `http://localhost:${PORT}/health/live`,
        readiness: `http://localhost:${PORT}/health/ready`,
        metrics: `http://localhost:${PORT}/metrics`,
        info: `http://localhost:${PORT}/health/info`,
        websocket: `ws://localhost:${PORT}`,
      });
    });

    // Graceful shutdown
    const gracefulShutdown = () => {
      logger.info('Starting graceful shutdown...');
      webSocketService.shutdown();
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }).catch((error) => {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  });
}

const app = createApp();
export { createApp };
export default app;

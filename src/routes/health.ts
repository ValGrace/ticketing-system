import { Router, Request, Response } from 'express';
import { HealthCheckService } from '../services/HealthCheckService';
import { register } from '../config/metrics';
import logger from '../config/logger';

const router = Router();

// Initialize health check service (will be injected via dependency injection)
let healthCheckService: HealthCheckService;

export const initializeHealthRoutes = (service: HealthCheckService) => {
  healthCheckService = service;
};

// Basic health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.getSystemHealth();
    
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check endpoint failed', error as Error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check service unavailable',
    });
  }
});

// Liveness probe - simple check that the application is running
router.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
});

// Readiness probe - check if the application is ready to serve traffic
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    // Check critical services only
    const [databaseHealth, redisHealth] = await Promise.all([
      healthCheckService.checkDatabase(),
      healthCheckService.checkRedis(),
    ]);
    
    const isReady = databaseHealth.status === 'healthy' && redisHealth.status === 'healthy';
    
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      services: {
        database: databaseHealth.status,
        redis: redisHealth.status,
      },
    });
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

// Detailed health check for individual services
router.get('/health/database', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.checkDatabase();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Database health check failed', error as Error);
    res.status(503).json({
      service: 'database',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database health check failed',
    });
  }
});

router.get('/health/redis', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.checkRedis();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Redis health check failed', error as Error);
    res.status(503).json({
      service: 'redis',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Redis health check failed',
    });
  }
});

router.get('/health/elasticsearch', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.checkElasticsearch();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Elasticsearch health check failed', error as Error);
    res.status(503).json({
      service: 'elasticsearch',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Elasticsearch health check failed',
    });
  }
});

// Metrics endpoint for Prometheus
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Metrics endpoint failed', error as Error);
    res.status(500).json({
      error: 'Failed to generate metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

// System information endpoint
router.get('/health/info', (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  
  res.json({
    application: {
      name: 'ticket-resell-platform',
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
      uptime: process.uptime(),
      pid: process.pid,
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuUsage: process.cpuUsage(),
      memoryUsage: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB',
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
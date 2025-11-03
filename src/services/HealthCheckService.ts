import { Pool } from 'pg';
import { createClient } from 'redis';
import { Client } from '@elastic/elasticsearch';
import logger from '../config/logger';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  responseTime: number;
  details?: any;
  error?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: HealthCheckResult[];
  uptime: number;
  version: string;
}

export class HealthCheckService {
  private dbPool: Pool;
  private redisClient: any;
  private elasticsearchClient: Client;

  constructor(dbPool: Pool, redisClient: any, elasticsearchClient: Client) {
    this.dbPool = dbPool;
    this.redisClient = redisClient;
    this.elasticsearchClient = elasticsearchClient;
  }

  async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const service = 'database';

    try {
      const client = await this.dbPool.connect();
      const result = await client.query('SELECT 1 as health_check');
      client.release();

      const responseTime = Date.now() - startTime;

      return {
        service,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          totalConnections: this.dbPool.totalCount,
          idleConnections: this.dbPool.idleCount,
          waitingConnections: this.dbPool.waitingCount,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Database health check failed', error as Error);

      return {
        service,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const service = 'redis';

    try {
      await this.redisClient.ping();
      const responseTime = Date.now() - startTime;

      const info = await this.redisClient.info('memory');
      const memoryInfo = this.parseRedisInfo(info);

      return {
        service,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          connected: this.redisClient.isReady,
          memoryUsed: memoryInfo['used_memory_human'],
          memoryPeak: memoryInfo['used_memory_peak_human'],
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Redis health check failed', error as Error);

      return {
        service,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  async checkElasticsearch(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const service = 'elasticsearch';

    try {
      const health = await this.elasticsearchClient.cluster.health();
      const responseTime = Date.now() - startTime;

      const status = health.status === 'green' ? 'healthy' :
        health.status === 'yellow' ? 'degraded' : 'unhealthy';

      return {
        service,
        status,
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          clusterName: health.cluster_name,
          status: health.status,
          numberOfNodes: health.number_of_nodes,
          numberOfDataNodes: health.number_of_data_nodes,
          activePrimaryShards: health.active_primary_shards,
          activeShards: health.active_shards,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Elasticsearch health check failed', error as Error);

      return {
        service,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  async checkExternalServices(): Promise<HealthCheckResult[]> {
    const checks: Promise<HealthCheckResult>[] = [];

    // Check payment gateway (Stripe/M-Pesa)
    checks.push(this.checkPaymentGateway());

    // Check email service
    checks.push(this.checkEmailService());

    // Check file storage (AWS S3)
    checks.push(this.checkFileStorage());

    return Promise.all(checks);
  }

  private async checkPaymentGateway(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const service = 'payment_gateway';

    try {
      // Simple connectivity check - in production, you might want to use a test endpoint
      const response = await fetch('https://api.stripe.com/v1', {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${process.env['STRIPE_SECRET_KEY']}`,
        },
      });

      const responseTime = Date.now() - startTime;

      return {
        service,
        status: response.ok ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          statusCode: response.status,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        service,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  private async checkEmailService(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const service = 'email_service';

    try {
      // Simple DNS lookup for email service
      const response = await fetch('https://api.sendgrid.com/v3', {
        method: 'HEAD',
      });

      const responseTime = Date.now() - startTime;

      return {
        service,
        status: response.ok ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        service,
        status: 'degraded', // Email is not critical for core functionality
        timestamp: new Date().toISOString(),
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  private async checkFileStorage(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const service = 'file_storage';

    try {
      // Simple connectivity check to AWS S3
      const response = await fetch('https://s3.amazonaws.com', {
        method: 'HEAD',
      });

      const responseTime = Date.now() - startTime;

      return {
        service,
        status: response.ok ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        service,
        status: 'degraded', // File storage is not critical for core functionality
        timestamp: new Date().toISOString(),
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const startTime = Date.now();

    try {
      // Run all health checks in parallel
      const [
        databaseHealth,
        redisHealth,
        elasticsearchHealth,
        ...externalServices
      ] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkElasticsearch(),
        ...await this.checkExternalServices(),
      ]);

      const services = [
        databaseHealth,
        redisHealth,
        elasticsearchHealth,
        ...externalServices,
      ];

      // Determine overall system status
      const hasUnhealthy = services.some(s => s.status === 'unhealthy');
      const hasDegraded = services.some(s => s.status === 'degraded');

      let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
      if (hasUnhealthy) {
        overallStatus = 'unhealthy';
      } else if (hasDegraded) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'healthy';
      }

      const result: SystemHealth = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services,
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
      };

      logger.info('System health check completed', {
        status: overallStatus,
        duration: Date.now() - startTime,
        servicesChecked: services.length,
      });

      return result;
    } catch (error) {
      logger.error('System health check failed', error as Error);

      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: [],
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
      };
    }
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = info.split('\r\n');

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          result[key] = value;
        }
      }
    }

    return result;
  }
}
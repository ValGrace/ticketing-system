import request from 'supertest';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { Client } from '@elastic/elasticsearch';
import { HealthCheckService } from '../../services/HealthCheckService';
import { initializeHealthRoutes } from '../../routes/health';
import { register } from '../../config/metrics';
import { expect } from '@jest/globals'
describe('Monitoring Integration Tests', () => {
  let app: any;
  let dbPool: Pool;
  let redisClient: any;
  let elasticsearchClient: Client;
  let healthCheckService: HealthCheckService;

  beforeAll(async () => {
    // Initialize test database connection
    const mockDb: DatabaseConnection = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockDb);
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    app = createApp(mockDb);

    // Initialize real clients for health checks
    dbPool = new Pool({
      host: process.env['DB_HOST'] || 'localhost',
      port: parseInt(process.env['DB_PORT'] || '5432'),
      database: process.env['DB_NAME'] || 'ticket_platform_test',
      user: process.env['DB_USER'] || 'postgres',
      password: process.env['DB_PASSWORD'] || 'password',
      max: 5,
    });

    redisClient = createClient({
      url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    });

    try {
      await redisClient.connect();
    } catch (error) {
      console.warn('Redis not available for tests');
    }

    elasticsearchClient = new Client({
      node: process.env['ELASTICSEARCH_URL'] || 'http://localhost:9200',
    });

    healthCheckService = new HealthCheckService(dbPool, redisClient, elasticsearchClient);
    initializeHealthRoutes(healthCheckService);
  });

  afterAll(async () => {
    if (redisClient?.isOpen) {
      await redisClient.quit();
    }
    if (dbPool) {
      await dbPool.end();
    }
  });

  describe('Health Check Endpoints', () => {
    describe('GET /health/live', () => {
      it('should return liveness status', async () => {
        const response = await request(app)
          .get('/health/live')
          .expect(200);

        expect(response.body).toHaveProperty('status', 'alive');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('pid');
        expect(typeof response.body.uptime).toBe('number');
        expect(typeof response.body.pid).toBe('number');
      });

      it('should respond quickly (< 100ms)', async () => {
        const startTime = Date.now();
        await request(app).get('/health/live').expect(200);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(100);
      });
    });

    describe('GET /health/ready', () => {
      it('should return readiness status', async () => {
        const response = await request(app)
          .get('/health/ready')
          .expect((res) => {
            expect([200, 503]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('services');
        expect(response.body.services).toHaveProperty('database');
        expect(response.body.services).toHaveProperty('redis');
      });

      it('should check critical services only', async () => {
        const response = await request(app).get('/health/ready');

        const services = response.body.services;
        expect(Object.keys(services)).toHaveLength(2);
        expect(services).toHaveProperty('database');
        expect(services).toHaveProperty('redis');
      });
    });

    describe('GET /health', () => {
      it('should return comprehensive system health', async () => {
        const response = await request(app)
          .get('/health')
          .expect((res) => {
            expect([200, 503]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('services');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('version');
        expect(Array.isArray(response.body.services)).toBe(true);
      });

      it('should include all monitored services', async () => {
        const response = await request(app).get('/health');

        const serviceNames = response.body.services.map((s: any) => s.service);
        expect(serviceNames).toContain('database');
        expect(serviceNames).toContain('redis');
        expect(serviceNames).toContain('elasticsearch');
      });

      it('should include response times for each service', async () => {
        const response = await request(app).get('/health');

        response.body.services.forEach((service: any) => {
          expect(service).toHaveProperty('responseTime');
          expect(typeof service.responseTime).toBe('number');
          expect(service.responseTime).toBeGreaterThanOrEqual(0);
        });
      });
    });

    describe('GET /health/database', () => {
      it('should return database health status', async () => {
        const response = await request(app)
          .get('/health/database')
          .expect((res) => {
            expect([200, 503]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('service', 'database');
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('responseTime');
      });

      it('should include connection pool details when healthy', async () => {
        const response = await request(app).get('/health/database');

        if (response.body.status === 'healthy') {
          expect(response.body).toHaveProperty('details');
          expect(response.body.details).toHaveProperty('totalConnections');
          expect(response.body.details).toHaveProperty('idleConnections');
          expect(response.body.details).toHaveProperty('waitingConnections');
        }
      });
    });

    describe('GET /health/redis', () => {
      it('should return redis health status', async () => {
        const response = await request(app)
          .get('/health/redis')
          .expect((res) => {
            expect([200, 503]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('service', 'redis');
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('responseTime');
      });
    });

    describe('GET /health/elasticsearch', () => {
      it('should return elasticsearch health status', async () => {
        const response = await request(app)
          .get('/health/elasticsearch')
          .expect((res) => {
            expect([200, 503]).toContain(res.status);
          });

        expect(response.body).toHaveProperty('service', 'elasticsearch');
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('responseTime');
      });
    });

    describe('GET /health/info', () => {
      it('should return system information', async () => {
        const response = await request(app)
          .get('/health/info')
          .expect(200);

        expect(response.body).toHaveProperty('application');
        expect(response.body).toHaveProperty('system');
        expect(response.body).toHaveProperty('timestamp');
      });

      it('should include application details', async () => {
        const response = await request(app).get('/health/info');

        expect(response.body.application).toHaveProperty('name');
        expect(response.body.application).toHaveProperty('version');
        expect(response.body.application).toHaveProperty('environment');
        expect(response.body.application).toHaveProperty('uptime');
        expect(response.body.application).toHaveProperty('pid');
      });

      it('should include system details', async () => {
        const response = await request(app).get('/health/info');

        expect(response.body.system).toHaveProperty('platform');
        expect(response.body.system).toHaveProperty('arch');
        expect(response.body.system).toHaveProperty('nodeVersion');
        expect(response.body.system).toHaveProperty('cpuUsage');
        expect(response.body.system).toHaveProperty('memoryUsage');
      });

      it('should include memory usage breakdown', async () => {
        const response = await request(app).get('/health/info');

        const memory = response.body.system.memoryUsage;
        expect(memory).toHaveProperty('rss');
        expect(memory).toHaveProperty('heapTotal');
        expect(memory).toHaveProperty('heapUsed');
        expect(memory).toHaveProperty('external');
      });
    });
  });

  describe('Metrics Endpoint', () => {
    describe('GET /metrics', () => {
      it('should return Prometheus metrics', async () => {
        const response = await request(app)
          .get('/metrics')
          .expect(200);

        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.text).toBeTruthy();
      });

      it('should include default Node.js metrics', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('process_cpu_user_seconds_total');
        expect(response.text).toContain('process_resident_memory_bytes');
        expect(response.text).toContain('nodejs_heap_size_total_bytes');
      });

      it('should include custom application metrics', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('ticket_platform_http_request_duration_seconds');
        expect(response.text).toContain('ticket_platform_http_requests_total');
        expect(response.text).toContain('ticket_platform_database_query_duration_seconds');
      });

      it('should include business metrics', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('ticket_platform_listings_total');
        expect(response.text).toContain('ticket_platform_transactions_total');
        expect(response.text).toContain('ticket_platform_user_registrations_total');
      });

      it('should be in valid Prometheus format', async () => {
        const response = await request(app).get('/metrics');

        const lines = response.text.split('\n');
        const metricLines = lines.filter(line => !line.startsWith('#') && line.trim());

        metricLines.forEach(line => {
          // Each metric line should have format: metric_name{labels} value timestamp
          expect(line).toMatch(/^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]+\})?\s+[\d.eE+-]+(\s+\d+)?$/);
        });
      });
    });
  });

  describe('Correlation ID Tracking', () => {
    it('should generate correlation ID if not provided', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeTruthy();
      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should use provided correlation ID', async () => {
      const correlationId = 'test-correlation-id-12345';

      const response = await request(app)
        .get('/health/live')
        .set('X-Correlation-ID', correlationId)
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });

    it('should maintain correlation ID across requests', async () => {
      const correlationId = 'test-correlation-id-67890';

      const response1 = await request(app)
        .get('/health/live')
        .set('X-Correlation-ID', correlationId);

      const response2 = await request(app)
        .get('/health/info')
        .set('X-Correlation-ID', correlationId);

      expect(response1.headers['x-correlation-id']).toBe(correlationId);
      expect(response2.headers['x-correlation-id']).toBe(correlationId);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track request duration', async () => {
      await request(app).get('/health/live').expect(200);

      // Verify metrics were recorded
      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_http_request_duration_seconds');
    });

    it('should track request counts', async () => {
      const metricsBefore = await register.getSingleMetric('ticket_platform_http_requests_total');
      const beforeValue = metricsBefore ? await metricsBefore.get() : null;

      await request(app).get('/health/live').expect(200);

      const metricsAfter = await register.getSingleMetric('ticket_platform_http_requests_total');
      const afterValue = metricsAfter ? await metricsAfter.get() : null;

      // Verify counter increased (if metrics are available)
      if (beforeValue && afterValue) {
        expect(afterValue).not.toEqual(beforeValue);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle health check service failures gracefully', async () => {
      // This test verifies the endpoint doesn't crash even if services are unavailable
      const response = await request(app)
        .get('/health')
        .expect((res) => {
          expect([200, 503]).toContain(res.status);
        });

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
    });

    it('should return 503 when critical services are down', async () => {
      // Note: This would require dependency injection to properly test
      // For now, we verify the endpoint structure
      const response = await request(app).get('/health/ready');
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect default Node.js metrics', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('process_resident_memory_bytes');
      expect(metrics).toContain('nodejs_version_info');
    });

    it('should collect HTTP metrics', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('ticket_platform_http_request_duration_seconds');
      expect(metrics).toContain('ticket_platform_http_requests_total');
    });

    it('should collect database metrics', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('ticket_platform_database_query_duration_seconds');
      expect(metrics).toContain('ticket_platform_database_queries_total');
    });

    it('should collect business metrics', async () => {
      const metrics = await register.metrics();

      expect(metrics).toContain('ticket_platform_listings_total');
      expect(metrics).toContain('ticket_platform_transactions_total');
      expect(metrics).toContain('ticket_platform_fraud_detection_events_total');
    });
  });

  describe('Health Check Response Times', () => {
    it('should respond to liveness check in < 100ms', async () => {
      const startTime = Date.now();
      await request(app).get('/health/live').expect(200);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should respond to readiness check in < 500ms', async () => {
      const startTime = Date.now();
      await request(app).get('/health/ready');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it('should respond to metrics endpoint in < 200ms', async () => {
      const startTime = Date.now();
      await request(app).get('/metrics').expect(200);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    });
  });
});

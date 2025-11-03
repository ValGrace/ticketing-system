import request from 'supertest';
import { register } from '../../config/metrics';
import logger from '../../config/logger';
import { createApp } from '../../index';

describe('Monitoring Integration Tests', () => {
  let app: any;

  beforeAll(async () => {
    // Create test app instance
    app = createApp();
  });

  describe('Health Check Endpoints', () => {
    test('GET /health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        pid: expect.any(Number),
      });
    });

    test('GET /metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('ticket_platform_');
    });

    test('GET /health/info should return system information', async () => {
      const response = await request(app)
        .get('/health/info')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('application');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.application).toHaveProperty('name', 'ticket-resell-platform');
      expect(response.body.application).toHaveProperty('uptime');
      expect(response.body.system).toHaveProperty('platform');
      expect(response.body.system).toHaveProperty('memoryUsage');
    });
  });



  describe('Metrics Collection', () => {
    test('should collect HTTP request metrics', async () => {
      // Make a request to generate metrics
      await request(app).get('/health/live');
      
      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_http_requests_total');
      expect(metrics).toContain('ticket_platform_http_request_duration_seconds');
    });

    test('should collect default system metrics', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_process_cpu_user_seconds_total');
      expect(metrics).toContain('ticket_platform_process_resident_memory_bytes');
      expect(metrics).toContain('ticket_platform_nodejs_heap_size_total_bytes');
    });

    test('should have custom business metrics defined', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_listings_total');
      expect(metrics).toContain('ticket_platform_transactions_total');
      expect(metrics).toContain('ticket_platform_fraud_detection_events_total');
    });
  });

  describe('Logging', () => {
    test('should log with correlation ID', () => {
      const correlationId = 'test-correlation-id';
      const childLogger = logger.child({ correlationId });
      
      // Mock the logger to capture output
      const logSpy = jest.spyOn(childLogger, 'info');
      
      childLogger.info('Test message', { testData: 'value' });
      
      expect(logSpy).toHaveBeenCalledWith('Test message', { testData: 'value' });
      logSpy.mockRestore();
    });

    test('should log errors with stack trace', () => {
      const error = new Error('Test error');
      const logSpy = jest.spyOn(logger, 'error');
      
      logger.error('Test error occurred', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
      
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('Performance Monitoring', () => {
    test('should track response times', async () => {
      const startTime = Date.now();
      
      await request(app).get('/health/live');
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(responseTime).toBeGreaterThan(0);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });

    test('should handle concurrent requests', async () => {
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/health/live')
      );
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });


});


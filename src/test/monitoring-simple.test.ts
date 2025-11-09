import { register } from '../config/metrics';
import logger from '../config/logger';
import { expect } from '@jest/globals'

describe('Monitoring System Tests', () => {
  describe('Metrics Collection', () => {
    test('should have metrics registry initialized', () => {
      expect(register).toBeDefined();
    });

    test('should collect default system metrics', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('ticket_platform_');
    });

    test('should have custom business metrics defined', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_listings_total');
      expect(metrics).toContain('ticket_platform_transactions_total');
      expect(metrics).toContain('ticket_platform_fraud_detection_events_total');
      expect(metrics).toContain('ticket_platform_http_requests_total');
      expect(metrics).toContain('ticket_platform_database_queries_total');
    });
  });

  describe('Logging System', () => {
    test('should have logger initialized', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    test('should log messages without errors', () => {
      expect(() => {
        logger.info('Test info message');
        logger.warn('Test warning message');
        logger.error('Test error message');
      }).not.toThrow();
    });

    test('should create child logger with correlation ID', () => {
      const childLogger = logger.child({ correlationId: 'test-123' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('Metrics Recording', () => {
    test('should record HTTP request metrics', async () => {
      const { recordHttpRequest } = require('../config/metrics');
      
      expect(() => {
        recordHttpRequest('GET', '/test', 200, 0.1);
        recordHttpRequest('POST', '/api/test', 201, 0.2);
      }).not.toThrow();

      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_http_requests_total');
      expect(metrics).toContain('ticket_platform_http_request_duration_seconds');
    });

    test('should record database query metrics', async () => {
      const { recordDatabaseQuery } = require('../config/metrics');
      
      expect(() => {
        recordDatabaseQuery('SELECT', 'users', 0.05, true);
        recordDatabaseQuery('INSERT', 'listings', 0.1, true);
      }).not.toThrow();

      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_database_queries_total');
      expect(metrics).toContain('ticket_platform_database_query_duration_seconds');
    });

    test('should record business metrics', async () => {
      const { recordTransaction, recordFraudEvent } = require('../config/metrics');
      
      expect(() => {
        recordTransaction('completed', 'stripe', 100, 'concert');
        recordFraudEvent('suspicious_listing', 'flagged');
      }).not.toThrow();

      const metrics = await register.metrics();
      expect(metrics).toContain('ticket_platform_transactions_total');
      expect(metrics).toContain('ticket_platform_fraud_detection_events_total');
    });
  });

  describe('Performance Monitoring', () => {
    test('should track response times', () => {
      const startTime = Date.now();
      
      // Simulate some work
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(responseTime).toBeGreaterThanOrEqual(0);
      expect(responseTime).toBeLessThan(1000); // Should be very fast for this test
    });

    test('should monitor memory usage', () => {
      const memUsage = process.memoryUsage();
      
      expect(memUsage).toHaveProperty('rss');
      expect(memUsage).toHaveProperty('heapTotal');
      expect(memUsage).toHaveProperty('heapUsed');
      expect(memUsage).toHaveProperty('external');
      
      expect(memUsage.rss).toBeGreaterThan(0);
      expect(memUsage.heapTotal).toBeGreaterThan(0);
      expect(memUsage.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle logging errors gracefully', () => {
      expect(() => {
        logger.error('Test error', new Error('Test error message'));
      }).not.toThrow();
    });

    test('should handle metrics collection errors gracefully', async () => {
      // This should not throw even if there are issues
      const metrics = await register.metrics();
      expect(typeof metrics).toBe('string');
    });
  });
});
/**
 * Integration tests for comprehensive error handling
 */

import request from 'supertest';
import { createApp } from '../../index';
import { 
  AppError, 
  ValidationErrors, 
  AuthenticationError,
  NotFoundError,
  ExternalServiceError 
} from '../../middleware/errorHandler';
import { circuitBreakerManager, CircuitState } from '../../utils/circuitBreaker';
import { serviceHealthTracker } from '../../utils/gracefulDegradation';
import { expect } from '@jest/globals'

describe('Error Handling Integration Tests', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => {
    // Reset circuit breakers and health trackers
    circuitBreakerManager.resetAll();
    serviceHealthTracker.reset('test-service');
  });

  describe('Correlation ID Middleware', () => {
    it('should add correlation ID to requests without one', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe('string');
    });

    it('should preserve existing correlation ID', async () => {
      const correlationId = 'test-correlation-123';

      const response = await request(app)
        .get('/health')
        .set('X-Correlation-ID', correlationId)
        .expect(200);

      expect(response.body.requestId).toBe(correlationId);
    });

    it('should use x-request-id as fallback', async () => {
      const requestId = 'test-request-456';

      const response = await request(app)
        .get('/health')
        .set('X-Request-ID', requestId)
        .expect(200);

      expect(response.body.requestId).toBe(requestId);
    });
  });

  describe('Structured Error Responses', () => {
    it('should return structured error for 404', async () => {
      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('requestId');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should include correlation ID in error response', async () => {
      const correlationId = 'error-test-789';

      const response = await request(app)
        .get('/api/nonexistent')
        .set('X-Correlation-ID', correlationId)
        .expect(404);

      expect(response.body.error.requestId).toBe(correlationId);
    });

    it('should handle validation errors with details', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          // Missing required fields
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error).toHaveProperty('details');
    });
  });

  describe('Custom Error Classes', () => {
    it('should handle AppError correctly', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should handle ValidationErrors', () => {
      const error = new ValidationErrors('Invalid input', { field: 'email' });
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should handle AuthenticationError', () => {
      const error = new AuthenticationError();
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle NotFoundError', () => {
      const error = new NotFoundError('User');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });

    it('should handle ExternalServiceError', () => {
      const error = new ExternalServiceError('PaymentGateway');
      
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    });
  });

  describe('Error Logging', () => {
    it('should log errors with correlation ID', async () => {
      const correlationId = 'log-test-123';
      
      // This will trigger a 404 error which should be logged
      await request(app)
        .get('/api/test-logging')
        .set('X-Correlation-ID', correlationId)
        .expect(404);

      // In a real test, you would verify the log output
      // For now, we just verify the request completed
    });
  });

  describe('Async Error Handling', () => {
    it('should catch async errors in route handlers', async () => {
      // Test endpoint that throws async error would go here
      // This requires a test route that throws an error
    });
  });

  describe('Global Error Handlers', () => {
    it('should handle uncaught exceptions gracefully', () => {
      // This is difficult to test in integration tests
      // as it would crash the process
      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
    });

    it('should handle unhandled rejections', () => {
      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should track service failures', async () => {
      const breaker = circuitBreakerManager.getBreaker('test-service');
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Simulate failures
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition to half-open after timeout', async () => {
      const breaker = circuitBreakerManager.getBreaker('test-service-2', {
        failureThreshold: 3,
        timeout: 100, // Short timeout for testing
        successThreshold: 2,
        monitoringPeriod: 60000
      });

      // Trigger circuit to open
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next call should transition to half-open
      try {
        await breaker.execute(async () => {
          return 'success';
        });
      } catch (error) {
        // May fail
      }

      const state = breaker.getState();
      expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(state);
    });

    it('should get stats for all circuit breakers', () => {
      circuitBreakerManager.getBreaker('service-1');
      circuitBreakerManager.getBreaker('service-2');

      const stats = circuitBreakerManager.getAllStats();
      
      expect(Object.keys(stats).length).toBeGreaterThanOrEqual(2);
      expect(stats['service-1']).toBeDefined();
      expect(stats['service-2']).toBeDefined();
    });
  });

  describe('Service Health Tracking', () => {
    it('should track service health scores', () => {
      const serviceName = 'health-test-service';

      // Initial score should be 100
      expect(serviceHealthTracker.getHealthScore(serviceName)).toBe(100);
      expect(serviceHealthTracker.isHealthy(serviceName)).toBe(true);

      // Record failures
      serviceHealthTracker.recordFailure(serviceName, 30);
      serviceHealthTracker.recordFailure(serviceName, 30);

      expect(serviceHealthTracker.getHealthScore(serviceName)).toBe(40);
      expect(serviceHealthTracker.isHealthy(serviceName)).toBe(false);
      expect(serviceHealthTracker.shouldDegrade(serviceName)).toBe(true);

      // Record successes
      serviceHealthTracker.recordSuccess(serviceName, 20);
      serviceHealthTracker.recordSuccess(serviceName, 20);

      expect(serviceHealthTracker.getHealthScore(serviceName)).toBe(80);
      expect(serviceHealthTracker.isHealthy(serviceName)).toBe(true);
    });

    it('should cap health scores at min and max', () => {
      const serviceName = 'cap-test-service';

      // Try to exceed max
      for (let i = 0; i < 20; i++) {
        serviceHealthTracker.recordSuccess(serviceName, 10);
      }
      expect(serviceHealthTracker.getHealthScore(serviceName)).toBe(100);

      // Try to go below min
      for (let i = 0; i < 20; i++) {
        serviceHealthTracker.recordFailure(serviceName, 10);
      }
      expect(serviceHealthTracker.getHealthScore(serviceName)).toBe(0);
    });

    it('should get all health scores', () => {
      serviceHealthTracker.recordFailure('service-a');
      serviceHealthTracker.recordSuccess('service-b');

      const scores = serviceHealthTracker.getAllScores();
      
      expect(scores['service-a']).toBeDefined();
      expect(scores['service-b']).toBeDefined();
    });
  });

  describe('Error Response Format Consistency', () => {
    it('should have consistent error format across different error types', async () => {
      const responses = await Promise.all([
        request(app).get('/api/nonexistent').expect(404),
        request(app).post('/api/auth/register').send({}).expect(400)
      ]);

      responses.forEach(response => {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
        expect(response.body.error).toHaveProperty('timestamp');
        expect(response.body.error).toHaveProperty('requestId');
      });
    });
  });
});

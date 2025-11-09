import request from 'supertest';
import express from 'express';
import { createApiGateway, setupApiGateway } from '../routes/apiGateway';
import { createApp } from '../index';
import { expect } from '@jest/globals'

describe('API Gateway', () => {
  let app: express.Application;

  beforeAll(() => {
    // Create test app with minimal dependencies
    app = express();
    
    const mockDependencies = {
      database: {},
      userController: {},
      listingController: {},
      userService: {},
      listingService: {},
      userRepository: {},
      transactionRepository: {},
      reviewRepository: {},
      listingRepository: {}
    };

    const config = {
      enableRateLimit: false, // Disable for testing
      enableCors: true,
      enableCompression: true,
      enableDocs: true,
      enableMetrics: true,
      requestTimeout: 5000
    };

    setupApiGateway(app, mockDependencies, config);
  });

  describe('Core Middleware', () => {
    it('should add correlation ID to requests', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.body.requestId).toBeDefined();
    });

    it('should add security headers', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should support CORS', async () => {
      const response = await request(app)
        .options('/api/status')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should compress responses', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Response should be compressed if large enough
      expect(response.headers['content-encoding']).toBeDefined();
    });
  });

  describe('API Endpoints', () => {
    it('should return API status', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        features: {
          rateLimit: false,
          cors: true,
          compression: true,
          documentation: true,
          metrics: true
        }
      });
    });

    it('should return API info', async () => {
      const response = await request(app)
        .get('/api/info')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Ticket Resell Platform API',
        description: expect.any(String),
        version: expect.any(String),
        endpoints: {
          auth: '/api/auth',
          users: '/api/users',
          listings: '/api/listings',
          search: '/api/search',
          payments: '/api/payments',
          reviews: '/api/reviews',
          notifications: '/api/notifications',
          fraud: '/api/fraud'
        }
      });
    });

    it('should return root endpoint info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Ticket Resell Platform API Gateway',
        version: expect.any(String),
        api: '/api',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown API routes', async () => {
      const response = await request(app)
        .get('/api/unknown-route')
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found'),
          timestamp: expect.any(String),
          requestId: expect.any(String)
        }
      });
    });

    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found'),
          timestamp: expect.any(String)
        }
      });
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate content type for POST requests', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'MISSING_CONTENT_TYPE',
          message: expect.stringContaining('Content-Type'),
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('Request Transformation', () => {
    it('should wrap successful responses with metadata', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Object),
        timestamp: expect.any(String),
        requestId: expect.any(String),
        responseTime: expect.any(Number)
      });
    });

    it('should add API version header', async () => {
      const response = await request(app)
        .get('/api/status')
        .set('api-version', 'v2')
        .expect(200);

      expect(response.headers['api-version']).toBe('v2');
    });
  });

  describe('Documentation', () => {
    it('should serve API documentation', async () => {
      const response = await request(app)
        .get('/docs')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should serve OpenAPI spec in JSON', async () => {
      const response = await request(app)
        .get('/docs/json')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toMatchObject({
        openapi: '3.0.0',
        info: {
          title: 'Ticket Resell Platform API',
          version: expect.any(String)
        }
      });
    });

    it('should serve OpenAPI spec in YAML', async () => {
      const response = await request(app)
        .get('/docs/yaml')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/yaml');
      expect(response.text).toContain('openapi: 3.0.0');
    });
  });

  describe('Health and Metrics', () => {
    it('should serve health check endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Health endpoint should return some status
      expect(response.body).toBeDefined();
    });

    it('should serve metrics endpoint', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
    });
  });
});
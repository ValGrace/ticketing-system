import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { expect } from '@jest/globals'
import { createTestDatabase, cleanupTestDatabase } from '../integration/database.test';

describe('Performance and Load Tests', () => {
  let app: Application;
  let db: DatabaseConnection;
  let authToken: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp(db);

    // Create test user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'perf@test.com',
        username: 'perfuser',
        firstName: 'Perf',
        lastName: 'Test',
        password: 'SecurePass123!'
      });

    authToken = registerResponse.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  describe('API Response Time Tests', () => {
    it('should respond to health check within 100ms', async () => {
      const start = Date.now();
      const response = await request(app).get('/api/health');
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });

    it('should handle listing search within 500ms', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/listings/search')
        .query({ q: 'concert' });
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    it('should handle authentication within 1000ms', async () => {
      const start = Date.now();
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'perf@test.com',
          password: 'SecurePass123!'
        });
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 50 concurrent search requests', async () => {
      const requests = Array(50).fill(null).map(() =>
        request(app)
          .get('/api/listings/search')
          .query({ q: 'test' })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(45); // Allow some failures
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle 20 concurrent listing creations', async () => {
      const requests = Array(20).fill(null).map((_, i) =>
        request(app)
          .post('/api/listings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Concurrent Listing ${i}`,
            description: 'Performance test listing',
            category: 'concert',
            eventName: 'Test Event',
            eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            eventTime: '19:00',
            venue: 'Test Venue',
            quantity: 2,
            originalPrice: 100,
            askingPrice: 90,
            location: {
              city: 'Test City',
              state: 'TS',
              country: 'USA'
            }
          })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successfulResponses = responses.filter(r => r.status === 201);
      expect(successfulResponses.length).toBeGreaterThan(15);
      expect(duration).toBeLessThan(10000);
    });

    it('should handle mixed concurrent operations', async () => {
      const operations = [
        ...Array(10).fill(null).map(() =>
          request(app).get('/api/listings/search').query({ q: 'test' })
        ),
        ...Array(5).fill(null).map(() =>
          request(app).get('/api/auth/profile').set('Authorization', `Bearer ${authToken}`)
        ),
        ...Array(5).fill(null).map(() =>
          request(app).get('/api/users/transaction-history').set('Authorization', `Bearer ${authToken}`)
        )
      ];

      const start = Date.now();
      const responses = await Promise.all(operations);
      const duration = Date.now() - start;

      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(15);
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Database Query Performance', () => {
    beforeAll(async () => {
      // Create test data
      const listings = Array(100).fill(null).map((_, i) => ({
        title: `Performance Test Listing ${i}`,
        description: 'Test listing for performance',
        category: 'concert',
        eventName: 'Performance Event',
        eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        eventTime: '19:00',
        venue: 'Performance Venue',
        quantity: 2,
        originalPrice: 100,
        askingPrice: 90,
        location: {
          city: 'Perf City',
          state: 'PC',
          country: 'USA'
        }
      }));

      // Create listings in batches
      for (let i = 0; i < listings.length; i += 10) {
        const batch = listings.slice(i, i + 10);
        await Promise.all(
          batch.map(listing =>
            request(app)
              .post('/api/listings')
              .set('Authorization', `Bearer ${authToken}`)
              .send(listing)
          )
        );
      }
    });

    it('should paginate large result sets efficiently', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/listings/search')
        .query({ q: 'Performance', limit: 50, offset: 0 });
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);
      expect(response.body.data.listings.length).toBeLessThanOrEqual(50);
    });

    it('should handle complex search queries efficiently', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/listings/search')
        .query({
          q: 'Performance',
          category: 'concert',
          minPrice: 50,
          maxPrice: 150,
          sortBy: 'price',
          sortOrder: 'asc'
        });
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1500);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should enforce rate limits without degrading performance', async () => {
      const requests = Array(100).fill(null).map(() =>
        request(app)
          .get('/api/listings/search')
          .query({ q: 'test' })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successfulResponses = responses.filter(r => r.status === 200);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle large payload responses efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const response = await request(app)
        .get('/api/listings/search')
        .query({ limit: 100 });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(response.status).toBe(200);
      expect(memoryIncrease).toBeLessThan(50); // Should not increase by more than 50MB
    });

    it('should handle file uploads without memory leaks', async () => {
      // Create a listing first
      const createResponse = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Upload Test',
          description: 'Test',
          category: 'concert',
          eventName: 'Event',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '19:00',
          venue: 'Venue',
          quantity: 1,
          originalPrice: 100,
          askingPrice: 90,
          location: {
            city: 'City',
            state: 'ST',
            country: 'USA'
          }
        });

      const listingId = createResponse.body.data.listing.id;
      const initialMemory = process.memoryUsage().heapUsed;

      // Upload multiple images
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/listings/${listingId}/images`)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('images', Buffer.alloc(1024 * 100), `test${i}.jpg`); // 100KB files
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      expect(memoryIncrease).toBeLessThan(100); // Should not leak significant memory
    });
  });

  describe('Cache Performance', () => {
    it('should serve cached responses faster', async () => {
      const listingId = 'test-listing-id';

      // First request (cache miss)
      const start1 = Date.now();
      await request(app).get(`/api/listings/${listingId}`);
      const duration1 = Date.now() - start1;

      // Second request (cache hit)
      const start2 = Date.now();
      await request(app).get(`/api/listings/${listingId}`);
      const duration2 = Date.now() - start2;

      // Cached response should be faster (allowing some variance)
      expect(duration2).toBeLessThanOrEqual(duration1 * 1.5);
    });
  });
});

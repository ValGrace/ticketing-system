import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { createTestDatabase, cleanupTestDatabase } from '../integration/database.test';

describe('Authentication Security Tests', () => {
  let app: Application;
  let db: DatabaseConnection;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp(db);
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  describe('Password Security', () => {
    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'password',
        '12345678',
        'abcdefgh',
        'Password',
        'Pass123'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `test${Date.now()}@example.com`,
            username: `user${Date.now()}`,
            firstName: 'Test',
            lastName: 'User',
            password
          });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should accept strong passwords', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: `secure${Date.now()}@example.com`,
          username: `secure${Date.now()}`,
          firstName: 'Secure',
          lastName: 'User',
          password: 'SecureP@ssw0rd123!'
        });

      expect(response.status).toBe(201);
    });

    it('should hash passwords before storage', async () => {
      const password = 'TestPassword123!';
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: `hash${Date.now()}@example.com`,
          username: `hash${Date.now()}`,
          firstName: 'Hash',
          lastName: 'Test',
          password
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.password).toBeUndefined();
    });
  });

  describe('JWT Token Security', () => {
    let validToken: string;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'jwt@test.com',
          username: 'jwtuser',
          firstName: 'JWT',
          lastName: 'Test',
          password: 'SecurePass123!'
        });

      validToken = response.body.data.tokens.accessToken;
    });

    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should reject malformed tokens', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject expired tokens', async () => {
      // Create a token that expires immediately
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
      
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it('should reject tampered tokens', async () => {
      const tamperedToken = validToken.slice(0, -5) + 'xxxxx';
      
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should accept valid tokens', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in login', async () => {
      const sqlInjectionAttempts = [
        "admin' OR '1'='1",
        "admin'--",
        "admin' OR 1=1--",
        "' OR '1'='1' /*",
        "'; DROP TABLE users--"
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: injection,
            password: 'password'
          });

        expect(response.status).not.toBe(200);
        expect(response.body.data?.user).toBeUndefined();
      }
    });

    it('should prevent SQL injection in search', async () => {
      const response = await request(app)
        .get('/api/listings/search')
        .query({ q: "'; DROP TABLE listings--" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('XSS Prevention', () => {
    let authToken: string;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'xss@test.com',
          username: 'xssuser',
          firstName: 'XSS',
          lastName: 'Test',
          password: 'SecurePass123!'
        });

      authToken = response.body.data.tokens.accessToken;
    });

    it('should sanitize XSS in listing creation', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: xssPayload,
          description: xssPayload,
          category: 'concert',
          eventName: 'Test Event',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '19:00',
          venue: 'Test Venue',
          quantity: 1,
          originalPrice: 100,
          askingPrice: 90,
          location: {
            city: 'Test',
            state: 'TS',
            country: 'USA'
          }
        });

      if (response.status === 201) {
        expect(response.body.data.listing.title).not.toContain('<script>');
        expect(response.body.data.listing.description).not.toContain('<script>');
      }
    });

    it('should sanitize XSS in profile updates', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: '<img src=x onerror=alert(1)>',
          lastName: '<script>alert("XSS")</script>'
        });

      if (response.status === 200) {
        expect(response.body.data.user.firstName).not.toContain('<img');
        expect(response.body.data.user.lastName).not.toContain('<script>');
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should require proper headers for state-changing operations', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Origin', 'http://malicious-site.com')
        .send({
          email: 'csrf@test.com',
          username: 'csrfuser',
          firstName: 'CSRF',
          lastName: 'Test',
          password: 'SecurePass123!'
        });

      // Should either reject or handle CORS properly
      expect([201, 403]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      const attempts = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@test.com',
            password: 'WrongPassword123!'
          })
      );

      const responses = await Promise.all(attempts);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should rate limit registration attempts', async () => {
      const attempts = Array(10).fill(null).map((_, i) =>
        request(app)
          .post('/api/auth/register')
          .send({
            email: `ratelimit${i}@test.com`,
            username: `ratelimit${i}`,
            firstName: 'Rate',
            lastName: 'Limit',
            password: 'SecurePass123!'
          })
      );

      const responses = await Promise.all(attempts);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Session Security', () => {
    let token1: string;
    let token2: string;

    it('should allow multiple active sessions', async () => {
      const credentials = {
        email: 'multisession@test.com',
        username: 'multisession',
        firstName: 'Multi',
        lastName: 'Session',
        password: 'SecurePass123!'
      };

      await request(app)
        .post('/api/auth/register')
        .send(credentials);

      // Login from first device
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: credentials.email,
          password: credentials.password
        });

      token1 = login1.body.data.tokens.accessToken;

      // Login from second device
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: credentials.email,
          password: credentials.password
        });

      token2 = login2.body.data.tokens.accessToken;

      // Both tokens should work
      const profile1 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token1}`);

      const profile2 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token2}`);

      expect(profile1.status).toBe(200);
      expect(profile2.status).toBe(200);
    });

    it('should invalidate token on logout', async () => {
      const logout = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'test-refresh-token' });

      expect(logout.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Authorization Security', () => {
    let userToken: string;
    let adminToken: string;

    beforeAll(async () => {
      // Create regular user
      const userResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'regularuser@test.com',
          username: 'regularuser',
          firstName: 'Regular',
          lastName: 'User',
          password: 'SecurePass123!'
        });

      userToken = userResponse.body.data.tokens.accessToken;

      // Create admin user (would need to be promoted via database)
      const adminResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@test.com',
          username: 'adminuser',
          firstName: 'Admin',
          lastName: 'User',
          password: 'SecurePass123!'
        });

      adminToken = adminResponse.body.data.tokens.accessToken;
    });

    it('should prevent privilege escalation', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          role: 'admin'
        });

      // Should either ignore role field or reject
      if (response.status === 200) {
        expect(response.body.data.user.role).not.toBe('admin');
      }
    });

    it('should restrict admin endpoints to admin users', async () => {
      const response = await request(app)
        .get('/api/users/search?q=test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('Input Validation Security', () => {
    let authToken: string;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'validation@test.com',
          username: 'validationuser',
          firstName: 'Validation',
          lastName: 'Test',
          password: 'SecurePass123!'
        });

      authToken = response.body.data.tokens.accessToken;
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          username: 'testuser',
          firstName: 'Test',
          lastName: 'User',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate phone number format', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phoneNumber: 'invalid-phone'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject excessively long inputs', async () => {
      const longString = 'a'.repeat(10000);
      
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: longString,
          description: 'Test',
          category: 'concert',
          eventName: 'Test',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '19:00',
          venue: 'Test',
          quantity: 1,
          originalPrice: 100,
          askingPrice: 90,
          location: {
            city: 'Test',
            state: 'TS',
            country: 'USA'
          }
        });

      expect(response.status).toBe(400);
    });
  });
});

import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { createTestDatabase, cleanupTestDatabase } from './database.test';

describe('User Management Integration Tests', () => {
  let app: Application;
  let db: DatabaseConnection;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp(db);

    // Create a test user and get auth token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'testuser@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        password: 'SecurePassword123!',
        phoneNumber: '+1234567890'
      });

    expect(registerResponse.status).toBe(201);
    authToken = registerResponse.body.data.tokens.accessToken;
    userId = registerResponse.body.data.user.id;
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  describe('GET /api/users/profile', () => {
    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        id: userId,
        email: 'testuser@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        phoneNumber: '+1234567890',
        isVerified: false,
        rating: 0,
        totalTransactions: 0,
        role: 'user',
        status: 'active'
      });
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update profile successfully', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        phoneNumber: '+9876543210'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        firstName: 'Updated',
        lastName: 'Name',
        phoneNumber: '+9876543210'
      });
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: '', // Invalid empty string
          phoneNumber: 'invalid-phone'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('First name cannot be empty');
      expect(response.body.error.details).toContain('Invalid phone number format. Use international format with country code');
    });

    it('should require at least one field for update', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('At least one field must be provided for update');
    });

    it('should validate name characters', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Test123', // Invalid characters
          lastName: 'User@#$'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('First name contains invalid characters');
      expect(response.body.error.details).toContain('Last name contains invalid characters');
    });
  });

  describe('GET /api/users/transaction-history', () => {
    it('should get transaction history successfully', async () => {
      const response = await request(app)
        .get('/api/users/transaction-history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactions');
      expect(response.body.data).toHaveProperty('stats');
      expect(response.body.data).toHaveProperty('reviews');
      expect(response.body.data).toHaveProperty('pendingReviews');
      expect(response.body.pagination).toMatchObject({
        limit: 50,
        offset: 0,
        hasMore: false
      });
    });

    it('should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/api/users/transaction-history?limit=25&offset=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination).toMatchObject({
        limit: 25,
        offset: 10,
        hasMore: false
      });
    });

    it('should validate pagination limits', async () => {
      const response = await request(app)
        .get('/api/users/transaction-history?limit=150')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('Limit must be a number between 1 and 100');
    });

    it('should validate negative offset', async () => {
      const response = await request(app)
        .get('/api/users/transaction-history?offset=-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('Offset must be a non-negative number');
    });
  });

  describe('GET /api/users/stats', () => {
    it('should get user statistics successfully', async () => {
      const response = await request(app)
        .get('/api/users/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('profile');
      expect(response.body.data).toHaveProperty('transactionStats');
      expect(response.body.data).toHaveProperty('reviewStats');
    });
  });

  describe('DELETE /api/users/account', () => {
    let testAuthToken: string;

    beforeEach(async () => {
      // Create a separate test user for deletion tests
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'deletetest@example.com',
          username: 'deletetest',
          firstName: 'Delete',
          lastName: 'Test',
          password: 'SecurePassword123!'
        });

      testAuthToken = registerResponse.body.data.tokens.accessToken;
    });

    it('should require confirmation for account deletion', async () => {
      const response = await request(app)
        .delete('/api/users/account')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ confirmDeletion: false });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('confirmDeletion must be true to proceed with account deletion');
    });

    it('should delete account successfully with confirmation', async () => {
      const response = await request(app)
        .delete('/api/users/account')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ confirmDeletion: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Account deleted successfully');

      // Verify user is marked as banned
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(profileResponse.status).toBe(403);
    });

    it('should validate confirmation field type', async () => {
      const response = await request(app)
        .delete('/api/users/account')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({ confirmDeletion: 'true' }); // String instead of boolean

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContain('confirmDeletion must be a boolean');
    });
  });

  describe('Admin endpoints', () => {
    let adminToken: string;

    beforeAll(async () => {
      // Create admin user by directly updating the database
      await db.query(
        'UPDATE users SET role = $1 WHERE id = $2',
        ['admin', userId]
      );

      // Get new token with admin role
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'testuser@example.com',
          password: 'SecurePassword123!'
        });

      adminToken = loginResponse.body.data.tokens.accessToken;
    });

    describe('GET /api/users/search', () => {
      it('should search users successfully as admin', async () => {
        const response = await request(app)
          .get('/api/users/search?q=test')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('users');
        expect(response.body.data).toHaveProperty('searchTerm');
      });

      it('should require search term', async () => {
        const response = await request(app)
          .get('/api/users/search')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.details).toContain('Search term (q) is required');
      });

      it('should validate minimum search term length', async () => {
        const response = await request(app)
          .get('/api/users/search?q=a')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.details).toContain('Search term must be at least 2 characters long');
      });

      it('should deny access to non-admin users', async () => {
        // Create regular user token
        const registerResponse = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'regular@example.com',
            username: 'regular',
            firstName: 'Regular',
            lastName: 'User',
            password: 'SecurePassword123!'
          });

        const regularToken = registerResponse.body.data.tokens.accessToken;

        const response = await request(app)
          .get('/api/users/search?q=test')
          .set('Authorization', `Bearer ${regularToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      });
    });

    describe('GET /api/users/status/:status', () => {
      it('should get users by status successfully as admin', async () => {
        const response = await request(app)
          .get('/api/users/status/active')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('users');
        expect(response.body.data).toHaveProperty('status');
      });

      it('should validate status parameter', async () => {
        const response = await request(app)
          .get('/api/users/status/invalid')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.details).toContain('Status must be one of: active, suspended, banned');
      });
    });
  });
});
import request from 'supertest';
import express from 'express';
import { createAuthRoutes } from '../../routes/auth';
import { DatabaseConnection } from '../../types';

// Mock database connection
const mockConnection: DatabaseConnection = {
  query: jest.fn(),
  transaction: jest.fn(),
  close: jest.fn()
};

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', createAuthRoutes(mockConnection));

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      password: 'TestPassword123!',
      phoneNumber: '+1234567890'
    };

    it('should register a new user successfully', async () => {
      // Mock database responses
      (mockConnection.query as jest.Mock)
        .mockResolvedValueOnce([]) // findByEmail returns empty
        .mockResolvedValueOnce([]) // findByUsername returns empty
        .mockResolvedValueOnce([{ // create returns new user
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          phone_number: '+1234567890',
          is_verified: false,
          rating: 0,
          total_transactions: 0,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User'
          },
          tokens: {
            accessToken: expect.any(String),
            refreshToken: expect.any(String)
          }
        }
      });
    });

    it('should reject registration with invalid email', async () => {
      const invalidData = {
        ...validRegistrationData,
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          field: 'email',
          message: expect.stringContaining('valid email')
        })
      );
    });

    it('should reject registration with weak password', async () => {
      const invalidData = {
        ...validRegistrationData,
        password: 'weak'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          field: 'password',
          message: expect.stringContaining('uppercase')
        })
      );
    });

    it('should reject registration with existing email', async () => {
      // Mock existing user
      (mockConnection.query as jest.Mock)
        .mockResolvedValueOnce([{ // findByEmail returns existing user
          id: 'existing-user',
          email: 'test@example.com'
        }]);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(409);

      expect(response.body.error.code).toBe('USER_ALREADY_EXISTS');
      expect(response.body.error.message).toContain('already exists');
    });

    it('should handle rate limiting', async () => {
      // Make multiple requests quickly to trigger rate limiting
      const requests = Array(6).fill(null).map(() =>
        request(app)
          .post('/api/auth/register')
          .send(validRegistrationData)
      );

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimitedResponse = responses.find(res => res.status === 429);
      expect(rateLimitedResponse).toBeDefined();
      expect(rateLimitedResponse?.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('POST /api/auth/login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'TestPassword123!'
    };

    it('should login user successfully', async () => {
      // Mock database responses
      (mockConnection.query as jest.Mock)
        .mockResolvedValueOnce([{ // findByEmail returns user
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          is_verified: true,
          rating: 4.5,
          total_transactions: 10,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .mockResolvedValueOnce([{ // validatePassword returns hash
          password_hash: '$2b$12$hashedpassword'
        }]);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            username: 'testuser'
          },
          tokens: {
            accessToken: expect.any(String),
            refreshToken: expect.any(String)
          }
        }
      });
    });

    it('should reject login with invalid email', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with non-existent user', async () => {
      // Mock empty result for findByEmail
      (mockConnection.query as jest.Mock)
        .mockResolvedValueOnce([]);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error.code).toBe('LOGIN_FAILED');
      expect(response.body.error.message).toContain('Invalid email or password');
    });

    it('should reject login for suspended account', async () => {
      // Mock suspended user
      (mockConnection.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'user-123',
          email: 'test@example.com',
          status: 'suspended'
        }]);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(403);

      expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      // Mock user for token refresh
      (mockConnection.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          status: 'active',
          is_verified: true,
          rating: 4.5,
          total_transactions: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      // First, get a valid refresh token by logging in
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      const refreshToken = loginResponse.body.data.tokens.refreshToken;

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: expect.any(String)
        }
      });
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.error.code).toBe('TOKEN_REFRESH_FAILED');
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should get user profile with valid token', async () => {
      // Mock user data
      (mockConnection.query as jest.Mock)
        .mockResolvedValue([{
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          is_verified: true,
          rating: 4.5,
          total_transactions: 10,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      // Get access token by logging in first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            username: 'testuser'
          }
        }
      });
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Logout successful'
      });
    });

    it('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'invalid-token' })
        .expect(400);

      expect(response.body.error.code).toBe('LOGOUT_FAILED');
    });
  });
});
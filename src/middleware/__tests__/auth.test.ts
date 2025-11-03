import { Request, Response, NextFunction } from 'express';
import { authenticateToken, requireRole, validateRequest } from '../auth';
import { JwtUtils } from '../../utils/jwt';
import Joi from 'joi';

// Mock JwtUtils
jest.mock('../../utils/jwt');
const mockJwtUtils = JwtUtils as jest.Mocked<typeof JwtUtils>;

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user' as const
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };
      mockJwtUtils.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtUtils.verifyAccessToken.mockReturnValue(mockPayload);

      await authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual(mockPayload);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      mockRequest.headers = {};
      mockJwtUtils.extractTokenFromHeader.mockReturnValue(null);

      await authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };
      mockJwtUtils.extractTokenFromHeader.mockReturnValue('invalid-token');
      mockJwtUtils.verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid access token');
      });

      await authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle expired token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };
      mockJwtUtils.extractTokenFromHeader.mockReturnValue('expired-token');
      mockJwtUtils.verifyAccessToken.mockImplementation(() => {
        throw new Error('Access token expired');
      });

      await authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow user with required role', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'admin'
      };

      const middleware = requireRole(['admin', 'moderator']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject user without required role', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      };

      const middleware = requireRole(['admin', 'moderator']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to access this resource',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated user', () => {
      delete mockRequest.user;

      const middleware = requireRole(['admin']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateRequest', () => {
    const testSchema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required()
    });

    it('should validate valid request body', () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject invalid request body', () => {
      mockRequest.body = {
        email: 'invalid-email',
        password: 'short'
      };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              field: 'email',
              message: expect.stringContaining('valid email')
            }),
            expect.objectContaining({
              field: 'password',
              message: expect.stringContaining('at least 8')
            })
          ]),
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should strip unknown fields', () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
        unknownField: 'should be removed'
      };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
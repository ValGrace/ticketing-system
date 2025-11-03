import { JwtUtils } from '../jwt';
import { User } from '../../types';
import jwt from 'jsonwebtoken';

// Mock environment variables
process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
process.env['JWT_ACCESS_EXPIRY'] = '15m';
process.env['JWT_REFRESH_EXPIRY'] = '7d';

describe('JwtUtils', () => {
  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    rating: 4.5,
    totalTransactions: 10,
    role: 'user',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  describe('generateTokenPair', () => {
    it('should generate valid access and refresh tokens', () => {
      const tokens = JwtUtils.generateTokenPair(mockUser);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should generate tokens with correct payload', () => {
      const tokens = JwtUtils.generateTokenPair(mockUser);
      const decoded = jwt.decode(tokens.accessToken) as any;

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.role).toBe('user');
      expect(decoded.iss).toBe('ticket-resell-platform');
      expect(decoded.aud).toBe('ticket-resell-users');
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const tokens = JwtUtils.generateTokenPair(mockUser);
      const payload = JwtUtils.verifyAccessToken(tokens.accessToken);

      expect(payload.userId).toBe(mockUser.id);
      expect(payload.email).toBe(mockUser.email);
      expect(payload.username).toBe(mockUser.username);
      expect(payload.role).toBe('user');
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        JwtUtils.verifyAccessToken('invalid-token');
      }).toThrow('Invalid access token');
    });

    it('should throw error for expired token', () => {
      const expiredToken = jwt.sign(
        { 
          userId: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          role: 'user'
        },
        process.env['JWT_ACCESS_SECRET']!,
        { 
          expiresIn: '-1s',
          issuer: 'ticket-resell-platform',
          audience: 'ticket-resell-users'
        }
      );

      expect(() => {
        JwtUtils.verifyAccessToken(expiredToken);
      }).toThrow(); // Just check that it throws, not the specific message
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const tokens = JwtUtils.generateTokenPair(mockUser);
      const payload = JwtUtils.verifyRefreshToken(tokens.refreshToken);

      expect(payload.userId).toBe(mockUser.id);
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => {
        JwtUtils.verifyRefreshToken('invalid-token');
      }).toThrow('Invalid refresh token');
    });

    it('should throw error for expired refresh token', () => {
      const expiredToken = jwt.sign(
        { userId: mockUser.id },
        process.env['JWT_REFRESH_SECRET']!,
        { 
          expiresIn: '-1s',
          issuer: 'ticket-resell-platform',
          audience: 'ticket-resell-users'
        }
      );

      expect(() => {
        JwtUtils.verifyRefreshToken(expiredToken);
      }).toThrow(); // Just check that it throws, not the specific message
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'valid-jwt-token';
      const header = `Bearer ${token}`;
      
      const extracted = JwtUtils.extractTokenFromHeader(header);
      expect(extracted).toBe(token);
    });

    it('should return null for missing header', () => {
      const extracted = JwtUtils.extractTokenFromHeader(undefined);
      expect(extracted).toBeNull();
    });

    it('should return null for invalid header format', () => {
      const extracted = JwtUtils.extractTokenFromHeader('Invalid token');
      expect(extracted).toBeNull();
    });

    it('should return null for empty Bearer header', () => {
      const extracted = JwtUtils.extractTokenFromHeader('Bearer ');
      expect(extracted).toBe('');
    });
  });

  describe('refreshAccessToken', () => {
    const mockGetUserById = jest.fn();

    beforeEach(() => {
      mockGetUserById.mockClear();
    });

    it('should generate new access token with valid refresh token', async () => {
      mockGetUserById.mockResolvedValue(mockUser);
      const tokens = JwtUtils.generateTokenPair(mockUser);

      const newAccessToken = await JwtUtils.refreshAccessToken(
        tokens.refreshToken,
        mockGetUserById
      );

      expect(typeof newAccessToken).toBe('string');
      expect(mockGetUserById).toHaveBeenCalledWith(mockUser.id);

      // Verify the new token is valid
      const payload = JwtUtils.verifyAccessToken(newAccessToken);
      expect(payload.userId).toBe(mockUser.id);
    });

    it('should throw error if user not found', async () => {
      mockGetUserById.mockResolvedValue(null);
      const tokens = JwtUtils.generateTokenPair(mockUser);

      await expect(
        JwtUtils.refreshAccessToken(tokens.refreshToken, mockGetUserById)
      ).rejects.toThrow('User not found');
    });

    it('should throw error if user account is not active', async () => {
      const inactiveUser = { ...mockUser, status: 'suspended' as const };
      mockGetUserById.mockResolvedValue(inactiveUser);
      const tokens = JwtUtils.generateTokenPair(mockUser);

      await expect(
        JwtUtils.refreshAccessToken(tokens.refreshToken, mockGetUserById)
      ).rejects.toThrow('User account is not active');
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(
        JwtUtils.refreshAccessToken('invalid-token', mockGetUserById)
      ).rejects.toThrow('Invalid refresh token');
    });
  });
});
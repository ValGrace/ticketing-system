import jwt from 'jsonwebtoken';
import { User } from '../types';

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  role: 'user' | 'admin' | 'moderator';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JwtUtils {
  private static readonly ACCESS_TOKEN_SECRET = process.env['JWT_ACCESS_SECRET'] || 'access-secret-key';
  private static readonly REFRESH_TOKEN_SECRET = process.env['JWT_REFRESH_SECRET'] || 'refresh-secret-key';
  private static readonly ACCESS_TOKEN_EXPIRY = process.env['JWT_ACCESS_EXPIRY'] || '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = process.env['JWT_REFRESH_EXPIRY'] || '7d';

  /**
   * Generate access and refresh token pair for a user
   */
  static generateTokenPair(user: User): TokenPair {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    };

    const accessToken = jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'ticket-resell-platform',
      audience: 'ticket-resell-users'
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(
      { userId: user.id },
      this.REFRESH_TOKEN_SECRET,
      {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        issuer: 'ticket-resell-platform',
        audience: 'ticket-resell-users'
      } as jwt.SignOptions
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode access token
   */
  static verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: 'ticket-resell-platform',
        audience: 'ticket-resell-users'
      }) as JwtPayload;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Access token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid access token');
      }
      throw new Error('Token verification failed');
    }
  }

  /**
   * Verify and decode refresh token
   */
  static verifyRefreshToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, this.REFRESH_TOKEN_SECRET, {
        issuer: 'ticket-resell-platform',
        audience: 'ticket-resell-users'
      }) as { userId: string };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      }
      throw new Error('Refresh token verification failed');
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Generate a new access token using a refresh token
   */
  static async refreshAccessToken(refreshToken: string, getUserById: (id: string) => Promise<User | null>): Promise<string> {
    const decoded = this.verifyRefreshToken(refreshToken);
    const user = await getUserById(decoded.userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'active') {
      throw new Error('User account is not active');
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'ticket-resell-platform',
      audience: 'ticket-resell-users'
    } as jwt.SignOptions);
  }
}
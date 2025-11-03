import { Request, Response } from 'express';
import { AuthService, LoginCredentials } from '../services/AuthService';
import { CreateUserInput } from '../types';

export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Register a new user
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const input: CreateUserInput = req.body;
      const result = await this.authService.register(input);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: result.user,
          tokens: result.tokens
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      
      let statusCode = 400;
      let errorCode = 'REGISTRATION_FAILED';

      if (errorMessage.includes('already exists') || errorMessage.includes('already taken')) {
        statusCode = 409;
        errorCode = 'USER_ALREADY_EXISTS';
      } else if (errorMessage.includes('Password validation failed')) {
        errorCode = 'INVALID_PASSWORD';
      }

      res.status(statusCode).json({
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  /**
   * Login user
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const credentials: LoginCredentials = req.body;
      const result = await this.authService.login(credentials);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          tokens: result.tokens
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      
      let statusCode = 401;
      let errorCode = 'LOGIN_FAILED';

      if (errorMessage.includes('suspended') || errorMessage.includes('banned')) {
        statusCode = 403;
        errorCode = 'ACCOUNT_SUSPENDED';
      }

      res.status(statusCode).json({
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  /**
   * Refresh access token
   */
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const result = await this.authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.accessToken
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';

      res.status(401).json({
        error: {
          code: 'TOKEN_REFRESH_FAILED',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  /**
   * Get current user profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const user = await this.authService.getUserProfile(userId);

      if (!user) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User profile not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          user
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve profile';

      res.status(500).json({
        error: {
          code: 'PROFILE_RETRIEVAL_FAILED',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  /**
   * Change user password
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { currentPassword, newPassword } = req.body;

      await this.authService.changePassword(userId, currentPassword, newPassword);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password change failed';
      
      let statusCode = 400;
      let errorCode = 'PASSWORD_CHANGE_FAILED';

      if (errorMessage.includes('Current password is incorrect')) {
        statusCode = 401;
        errorCode = 'INVALID_CURRENT_PASSWORD';
      } else if (errorMessage.includes('Password validation failed')) {
        errorCode = 'INVALID_NEW_PASSWORD';
      }

      res.status(statusCode).json({
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  /**
   * Logout user
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      await this.authService.logout(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Logout successful',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed';

      res.status(400).json({
        error: {
          code: 'LOGOUT_FAILED',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };
}
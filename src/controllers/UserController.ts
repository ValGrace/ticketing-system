import { Request, Response } from 'express';
import { UserService, UpdateUserProfileInput } from '../services/UserService';

export class UserController {
  constructor(private userService: UserService) {}

  /**
   * Get current user profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const user = await this.userService.getUserProfile(userId);

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
   * Update user profile
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const updates: UpdateUserProfileInput = req.body;

      const updatedUser = await this.userService.updateUserProfile(userId, updates);

      if (!updatedUser) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: updatedUser
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      
      let statusCode = 400;
      let errorCode = 'PROFILE_UPDATE_FAILED';

      if (errorMessage.includes('User not found')) {
        statusCode = 404;
        errorCode = 'USER_NOT_FOUND';
      } else if (errorMessage.includes('inactive user')) {
        statusCode = 403;
        errorCode = 'ACCOUNT_INACTIVE';
      } else if (errorMessage.includes('validation') || errorMessage.includes('Invalid')) {
        errorCode = 'VALIDATION_ERROR';
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
   * Get user transaction history
   */
  getTransactionHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const offset = parseInt(req.query['offset'] as string) || 0;

      // Validate pagination parameters
      if (limit < 1 || limit > 100) {
        res.status(400).json({
          error: {
            code: 'INVALID_PAGINATION',
            message: 'Limit must be between 1 and 100',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      if (offset < 0) {
        res.status(400).json({
          error: {
            code: 'INVALID_PAGINATION',
            message: 'Offset must be non-negative',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const history = await this.userService.getUserTransactionHistory(userId, limit, offset);

      res.status(200).json({
        success: true,
        message: 'Transaction history retrieved successfully',
        data: history,
        pagination: {
          limit,
          offset,
          hasMore: history.transactions.length === limit
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve transaction history';
      
      let statusCode = 500;
      let errorCode = 'TRANSACTION_HISTORY_FAILED';

      if (errorMessage.includes('User not found')) {
        statusCode = 404;
        errorCode = 'USER_NOT_FOUND';
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
   * Get user statistics
   */
  getUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const stats = await this.userService.getUserStats(userId);

      res.status(200).json({
        success: true,
        message: 'User statistics retrieved successfully',
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve user statistics';
      
      let statusCode = 500;
      let errorCode = 'USER_STATS_FAILED';

      if (errorMessage.includes('User not found')) {
        statusCode = 404;
        errorCode = 'USER_NOT_FOUND';
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
   * Delete user account
   */
  deleteAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { confirmDeletion } = req.body;

      // Require explicit confirmation
      if (confirmDeletion !== true) {
        res.status(400).json({
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'Account deletion requires explicit confirmation',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const deleted = await this.userService.deleteUserAccount(userId);

      if (!deleted) {
        res.status(500).json({
          error: {
            code: 'DELETION_FAILED',
            message: 'Failed to delete user account',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Account deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Account deletion failed';
      
      let statusCode = 400;
      let errorCode = 'ACCOUNT_DELETION_FAILED';

      if (errorMessage.includes('User not found')) {
        statusCode = 404;
        errorCode = 'USER_NOT_FOUND';
      } else if (errorMessage.includes('active transactions')) {
        statusCode = 409;
        errorCode = 'ACTIVE_TRANSACTIONS_EXIST';
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

  // Admin endpoints

  /**
   * Search users (admin only)
   */
  searchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { q: searchTerm } = req.query;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const offset = parseInt(req.query['offset'] as string) || 0;

      if (!searchTerm || typeof searchTerm !== 'string') {
        res.status(400).json({
          error: {
            code: 'MISSING_SEARCH_TERM',
            message: 'Search term is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const users = await this.userService.searchUsers(searchTerm, limit, offset);

      res.status(200).json({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users,
          searchTerm
        },
        pagination: {
          limit,
          offset,
          hasMore: users.length === limit
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'User search failed';

      res.status(500).json({
        error: {
          code: 'USER_SEARCH_FAILED',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  /**
   * Get users by status (admin only)
   */
  getUsersByStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status } = req.params;
      const limit = parseInt(req.query['limit'] as string) || 50;
      const offset = parseInt(req.query['offset'] as string) || 0;

      if (!status || !['active', 'suspended', 'banned'].includes(status)) {
        res.status(400).json({
          error: {
            code: 'INVALID_STATUS',
            message: 'Status must be one of: active, suspended, banned',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const users = await this.userService.getUsersByStatus(
        status as 'active' | 'suspended' | 'banned', 
        limit, 
        offset
      );

      res.status(200).json({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users,
          status
        },
        pagination: {
          limit,
          offset,
          hasMore: users.length === limit
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve users by status';

      res.status(500).json({
        error: {
          code: 'USER_STATUS_RETRIEVAL_FAILED',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };
}
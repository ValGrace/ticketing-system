import { Request, Response } from 'express';
import { UserController } from '../UserController';
import { UserService } from '../../services/UserService';
import { User } from '../../types';

// Mock the UserService
jest.mock('../../services/UserService');

describe('UserController', () => {
  let userController: UserController;
  let mockUserService: jest.Mocked<UserService>;
  let mockRequest: Partial<Request> & { user?: any };
  let mockResponse: Partial<Response>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'John',
    lastName: 'Doe',
    phoneNumber: '+1234567890',
    profileImage: 'https://example.com/avatar.jpg',
    isVerified: true,
    rating: 4.5,
    totalTransactions: 10,
    role: 'user',
    status: 'active',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  beforeEach(() => {
    mockUserService = new UserService({} as any, {} as any, {} as any) as jest.Mocked<UserService>;
    userController = new UserController(mockUserService);

    mockRequest = {
      user: { userId: 'user-1', email: 'test@example.com', username: 'testuser', role: 'user' },
      body: {},
      query: {},
      params: {},
      headers: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile successfully', async () => {
      mockUserService.getUserProfile.mockResolvedValue(mockUser);

      await userController.getProfile(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.getUserProfile).toHaveBeenCalledWith('user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile retrieved successfully',
        data: { user: mockUser },
        timestamp: expect.any(String)
      });
    });

    it('should return 404 when user not found', async () => {
      mockUserService.getUserProfile.mockResolvedValue(null);

      await userController.getProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });

    it('should handle service errors', async () => {
      mockUserService.getUserProfile.mockRejectedValue(new Error('Database error'));

      await userController.getProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'PROFILE_RETRIEVAL_FAILED',
          message: 'Database error',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('updateProfile', () => {
    const updateData = {
      firstName: 'Jane',
      lastName: 'Smith'
    };

    it('should update profile successfully', async () => {
      const updatedUser = { ...mockUser, ...updateData };
      mockRequest.body = updateData;
      mockUserService.updateUserProfile.mockResolvedValue(updatedUser);

      await userController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.updateUserProfile).toHaveBeenCalledWith('user-1', updateData);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully',
        data: { user: updatedUser },
        timestamp: expect.any(String)
      });
    });

    it('should return 404 when user not found', async () => {
      mockRequest.body = updateData;
      mockUserService.updateUserProfile.mockResolvedValue(null);

      await userController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });

    it('should handle validation errors', async () => {
      mockRequest.body = updateData;
      mockUserService.updateUserProfile.mockRejectedValue(new Error('Invalid phone number format'));

      await userController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid phone number format',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });

    it('should handle inactive user error', async () => {
      mockRequest.body = updateData;
      mockUserService.updateUserProfile.mockRejectedValue(new Error('Cannot update profile for inactive user'));

      await userController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Cannot update profile for inactive user',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('getTransactionHistory', () => {
    const mockHistory = {
      transactions: [],
      stats: {
        totalTransactions: 10,
        totalSpent: 500,
        totalEarned: 300,
        averageTransactionValue: 80
      },
      reviews: {
        totalReviews: 5,
        averageRating: 4.5,
        ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
        recentReviews: []
      },
      pendingReviews: []
    };

    it('should return transaction history successfully', async () => {
      mockRequest.query = { limit: '25', offset: '0' };
      mockUserService.getUserTransactionHistory.mockResolvedValue(mockHistory);

      await userController.getTransactionHistory(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.getUserTransactionHistory).toHaveBeenCalledWith('user-1', 25, 0);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Transaction history retrieved successfully',
        data: mockHistory,
        pagination: {
          limit: 25,
          offset: 0,
          hasMore: false
        },
        timestamp: expect.any(String)
      });
    });

    it('should use default pagination values', async () => {
      mockRequest.query = {};
      mockUserService.getUserTransactionHistory.mockResolvedValue(mockHistory);

      await userController.getTransactionHistory(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.getUserTransactionHistory).toHaveBeenCalledWith('user-1', 50, 0);
    });

    it('should validate pagination parameters', async () => {
      mockRequest.query = { limit: '150' };

      await userController.getTransactionHistory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_PAGINATION',
          message: 'Limit must be between 1 and 100',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });

    it('should handle negative offset', async () => {
      mockRequest.query = { offset: '-1' };

      await userController.getTransactionHistory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_PAGINATION',
          message: 'Offset must be non-negative',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('deleteAccount', () => {
    it('should delete account successfully', async () => {
      mockRequest.body = { confirmDeletion: true };
      mockUserService.deleteUserAccount.mockResolvedValue(true);

      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.deleteUserAccount).toHaveBeenCalledWith('user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Account deleted successfully',
        timestamp: expect.any(String)
      });
    });

    it('should require confirmation', async () => {
      mockRequest.body = { confirmDeletion: false };

      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.deleteUserAccount).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Account deletion requires explicit confirmation',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });

    it('should handle active transactions error', async () => {
      mockRequest.body = { confirmDeletion: true };
      mockUserService.deleteUserAccount.mockRejectedValue(new Error('Cannot delete account with active transactions'));

      await userController.deleteAccount(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'ACTIVE_TRANSACTIONS_EXIST',
          message: 'Cannot delete account with active transactions',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('searchUsers', () => {
    it('should search users successfully', async () => {
      const users = [mockUser];
      mockRequest.query = { q: 'john', limit: '25', offset: '0' };
      mockUserService.searchUsers.mockResolvedValue(users);

      await userController.searchUsers(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.searchUsers).toHaveBeenCalledWith('john', 25, 0);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users,
          searchTerm: 'john'
        },
        pagination: {
          limit: 25,
          offset: 0,
          hasMore: false
        },
        timestamp: expect.any(String)
      });
    });

    it('should require search term', async () => {
      mockRequest.query = {};

      await userController.searchUsers(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'MISSING_SEARCH_TERM',
          message: 'Search term is required',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });
  });

  describe('getUsersByStatus', () => {
    it('should get users by status successfully', async () => {
      const users = [mockUser];
      mockRequest.params = { status: 'active' };
      mockRequest.query = { limit: '25', offset: '0' };
      mockUserService.getUsersByStatus.mockResolvedValue(users);

      await userController.getUsersByStatus(mockRequest as Request, mockResponse as Response);

      expect(mockUserService.getUsersByStatus).toHaveBeenCalledWith('active', 25, 0);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users,
          status: 'active'
        },
        pagination: {
          limit: 25,
          offset: 0,
          hasMore: false
        },
        timestamp: expect.any(String)
      });
    });

    it('should validate status parameter', async () => {
      mockRequest.params = { status: 'invalid' };

      await userController.getUsersByStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_STATUS',
          message: 'Status must be one of: active, suspended, banned',
          timestamp: expect.any(String),
          requestId: 'unknown'
        }
      });
    });
  });
});
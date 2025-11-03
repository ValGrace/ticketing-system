import { UserService, UpdateUserProfileInput } from '../UserService';
import { User, Transaction } from '../../types';
import { UserRepository } from '../../models/UserRepository';
import { TransactionRepository } from '../../models/TransactionRepository';
import { ReviewRepository } from '../../models/ReviewRepository';

// Mock the repositories
jest.mock('../../models/UserRepository');
jest.mock('../../models/TransactionRepository');
jest.mock('../../models/ReviewRepository');

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockTransactionRepository: jest.Mocked<TransactionRepository>;
  let mockReviewRepository: jest.Mocked<ReviewRepository>;

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
    mockUserRepository = new UserRepository({} as any) as jest.Mocked<UserRepository>;
    mockTransactionRepository = new TransactionRepository({} as any) as jest.Mocked<TransactionRepository>;
    mockReviewRepository = new ReviewRepository({} as any) as jest.Mocked<ReviewRepository>;

    userService = new UserService(
      mockUserRepository,
      mockTransactionRepository,
      mockReviewRepository
    );

    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return user profile when user exists', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.getUserProfile('user-1');

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-1');
    });

    it('should return null when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await userService.getUserProfile('nonexistent');

      expect(result).toBeNull();
      expect(mockUserRepository.findById).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('updateUserProfile', () => {
    const validUpdates: UpdateUserProfileInput = {
      firstName: 'Jane',
      lastName: 'Smith',
      phoneNumber: '+9876543210',
      profileImage: 'https://example.com/new-avatar.jpg'
    };

    it('should update user profile successfully', async () => {
      const updatedUser = { ...mockUser, ...validUpdates };
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUserProfile('user-1', validUpdates);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-1');
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-1', validUpdates);
    });

    it('should throw error when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.updateUserProfile('nonexistent', validUpdates))
        .rejects.toThrow('User not found');

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when user is not active', async () => {
      const inactiveUser = { ...mockUser, status: 'suspended' as const };
      mockUserRepository.findById.mockResolvedValue(inactiveUser);

      await expect(userService.updateUserProfile('user-1', validUpdates))
        .rejects.toThrow('Cannot update profile for inactive user');

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should validate firstName', async () => {
      await expect(userService.updateUserProfile('user-1', { firstName: '' }))
        .rejects.toThrow('First name must be a non-empty string');

      await expect(userService.updateUserProfile('user-1', { firstName: 'a'.repeat(51) }))
        .rejects.toThrow('First name must be 50 characters or less');
    });

    it('should validate lastName', async () => {
      await expect(userService.updateUserProfile('user-1', { lastName: '' }))
        .rejects.toThrow('Last name must be a non-empty string');

      await expect(userService.updateUserProfile('user-1', { lastName: 'a'.repeat(51) }))
        .rejects.toThrow('Last name must be 50 characters or less');
    });

    it('should validate phoneNumber', async () => {
      await expect(userService.updateUserProfile('user-1', { phoneNumber: 'invalid' }))
        .rejects.toThrow('Invalid phone number format');
    });

    it('should validate profileImage', async () => {
      await expect(userService.updateUserProfile('user-1', { profileImage: 'a'.repeat(501) }))
        .rejects.toThrow('Profile image URL must be 500 characters or less');
    });
  });

  describe('getUserTransactionHistory', () => {
    const mockTransactions: Transaction[] = [
      {
        id: 'tx-1',
        listingId: 'listing-1',
        buyerId: 'user-1',
        sellerId: 'user-2',
        quantity: 2,
        totalAmount: 100,
        platformFee: 5,
        paymentIntentId: 'pi_123',
        status: 'completed',
        escrowReleaseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const mockStats = {
      totalTransactions: 10,
      totalSpent: 500,
      totalEarned: 300,
      averageTransactionValue: 80
    };

    const mockReviewStats = {
      totalReviews: 5,
      averageRating: 4.5,
      ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
      recentReviews: []
    };

    const mockPendingReviews: any[] = [];

    it('should return comprehensive transaction history', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockTransactionRepository.findUserTransactionHistory.mockResolvedValue(mockTransactions);
      mockTransactionRepository.getTransactionStats.mockResolvedValue(mockStats);
      mockReviewRepository.getReviewStats.mockResolvedValue(mockReviewStats);
      mockReviewRepository.findPendingReviews.mockResolvedValue(mockPendingReviews);

      const result = await userService.getUserTransactionHistory('user-1', 50, 0);

      expect(result).toEqual({
        transactions: mockTransactions,
        stats: mockStats,
        reviews: mockReviewStats,
        pendingReviews: mockPendingReviews
      });

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-1');
      expect(mockTransactionRepository.findUserTransactionHistory).toHaveBeenCalledWith('user-1', 50, 0);
      expect(mockTransactionRepository.getTransactionStats).toHaveBeenCalledWith('user-1');
      expect(mockReviewRepository.getReviewStats).toHaveBeenCalledWith('user-1');
      expect(mockReviewRepository.findPendingReviews).toHaveBeenCalledWith('user-1');
    });

    it('should throw error when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserTransactionHistory('nonexistent'))
        .rejects.toThrow('User not found');
    });
  });

  describe('deleteUserAccount', () => {
    it('should delete user account successfully when no active transactions', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockTransactionRepository.findByBuyerId.mockResolvedValue([]);
      mockTransactionRepository.findBySellerId.mockResolvedValue([]);
      
      const deletedUser = { 
        ...mockUser, 
        status: 'banned' as const,
        email: 'deleted_user-1@deleted.com',
        username: 'deleted_user-1',
        firstName: 'Deleted',
        lastName: 'User'
      };
      mockUserRepository.update.mockResolvedValue(deletedUser);

      const result = await userService.deleteUserAccount('user-1');

      expect(result).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith('user-1', {
        status: 'banned',
        email: 'deleted_user-1@deleted.com',
        username: 'deleted_user-1',
        firstName: 'Deleted',
        lastName: 'User',
        phoneNumber: undefined,
        profileImage: undefined
      });
    });

    it('should throw error when user has active transactions', async () => {
      const activeTransaction: Transaction = {
        id: 'tx-1',
        listingId: 'listing-1',
        buyerId: 'user-1',
        sellerId: 'user-2',
        quantity: 1,
        totalAmount: 50,
        platformFee: 2.5,
        paymentIntentId: 'pi_123',
        status: 'pending',
        escrowReleaseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockTransactionRepository.findByBuyerId.mockResolvedValue([activeTransaction]);
      mockTransactionRepository.findBySellerId.mockResolvedValue([]);

      await expect(userService.deleteUserAccount('user-1'))
        .rejects.toThrow('Cannot delete account with active transactions');

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.deleteUserAccount('nonexistent'))
        .rejects.toThrow('User not found');
    });
  });

  describe('getUserStats', () => {
    const mockStats = {
      totalTransactions: 10,
      totalSpent: 500,
      totalEarned: 300,
      averageTransactionValue: 80
    };

    const mockReviewStats = {
      totalReviews: 5,
      averageRating: 4.5,
      ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 },
      recentReviews: []
    };

    it('should return user statistics', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockTransactionRepository.getTransactionStats.mockResolvedValue(mockStats);
      mockReviewRepository.getReviewStats.mockResolvedValue(mockReviewStats);

      const result = await userService.getUserStats('user-1');

      expect(result).toEqual({
        profile: mockUser,
        transactionStats: mockStats,
        reviewStats: mockReviewStats
      });
    });

    it('should throw error when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserStats('nonexistent'))
        .rejects.toThrow('User not found');
    });
  });

  describe('searchUsers', () => {
    it('should search users successfully', async () => {
      const searchResults = [mockUser];
      mockUserRepository.searchUsers.mockResolvedValue(searchResults);

      const result = await userService.searchUsers('john', 50, 0);

      expect(result).toEqual(searchResults);
      expect(mockUserRepository.searchUsers).toHaveBeenCalledWith('john', 50, 0);
    });
  });

  describe('getUsersByStatus', () => {
    it('should get users by status successfully', async () => {
      const users = [mockUser];
      mockUserRepository.findByStatus.mockResolvedValue(users);

      const result = await userService.getUsersByStatus('active', 50, 0);

      expect(result).toEqual(users);
      expect(mockUserRepository.findByStatus).toHaveBeenCalledWith('active', 50, 0);
    });
  });
});
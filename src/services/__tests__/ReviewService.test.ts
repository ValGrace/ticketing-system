import { ReviewService } from '../ReviewService';
import { ReviewRepository } from '../../models/ReviewRepository';
import { UserRepository } from '../../models/UserRepository';
import { TransactionRepository } from '../../models/TransactionRepository';
import { Review, CreateReviewInput, Transaction, User } from '../../types';

// Mock the repositories
jest.mock('../../models/ReviewRepository');
jest.mock('../../models/UserRepository');
jest.mock('../../models/TransactionRepository');

describe('ReviewService', () => {
  let reviewService: ReviewService;
  let mockReviewRepository: jest.Mocked<ReviewRepository>;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockTransactionRepository: jest.Mocked<TransactionRepository>;

  const mockTransaction: Transaction = {
    id: 'transaction-1',
    listingId: 'listing-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    quantity: 2,
    totalAmount: 100,
    platformFee: 10,
    paymentIntentId: 'pi_123',
    status: 'completed',
    escrowReleaseDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    rating: 4.5,
    totalTransactions: 10,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
  };

  const mockReview: Review = {
    id: 'review-1',
    transactionId: 'transaction-1',
    reviewerId: 'buyer-1',
    revieweeId: 'seller-1',
    rating: 5,
    comment: 'Great seller, fast delivery!',
    type: 'buyer_to_seller',
    createdAt: new Date(),
    isVisible: true,
  };

  beforeEach(() => {
    mockReviewRepository = new ReviewRepository({} as any) as jest.Mocked<ReviewRepository>;
    mockUserRepository = new UserRepository({} as any) as jest.Mocked<UserRepository>;
    mockTransactionRepository = new TransactionRepository({} as any) as jest.Mocked<TransactionRepository>;

    reviewService = new ReviewService(
      mockReviewRepository,
      mockUserRepository,
      mockTransactionRepository
    );

    jest.clearAllMocks();
  });

  describe('createReview', () => {
    const validReviewInput: CreateReviewInput = {
      transactionId: 'transaction-1',
      reviewerId: 'buyer-1',
      revieweeId: 'seller-1',
      rating: 5,
      comment: 'Great seller, fast delivery!',
      type: 'buyer_to_seller',
    };

    it('should create a review successfully', async () => {
      mockTransactionRepository.findById.mockResolvedValue(mockTransaction);
      mockReviewRepository.create.mockResolvedValue(mockReview);
      mockReviewRepository.calculateAverageRating.mockResolvedValue(4.8);
      mockUserRepository.updateRating.mockResolvedValue();

      const result = await reviewService.createReview(validReviewInput);

      expect(result).toEqual(mockReview);
      expect(mockTransactionRepository.findById).toHaveBeenCalledWith('transaction-1');
      expect(mockReviewRepository.create).toHaveBeenCalledWith(validReviewInput);
      expect(mockUserRepository.updateRating).toHaveBeenCalledWith('seller-1', 4.8);
    });

    it('should throw error if transaction not found', async () => {
      mockTransactionRepository.findById.mockResolvedValue(null);

      await expect(reviewService.createReview(validReviewInput)).rejects.toThrow(
        'Failed to create review: Transaction not found'
      );
    });

    it('should throw error if transaction not completed', async () => {
      const incompleteTransaction = { ...mockTransaction, status: 'pending' as const };
      mockTransactionRepository.findById.mockResolvedValue(incompleteTransaction);

      await expect(reviewService.createReview(validReviewInput)).rejects.toThrow(
        'Failed to create review: Reviews can only be created for completed transactions'
      );
    });

    it('should throw error if reviewer not part of transaction', async () => {
      const invalidReviewInput = { ...validReviewInput, reviewerId: 'invalid-user' };
      mockTransactionRepository.findById.mockResolvedValue(mockTransaction);

      await expect(reviewService.createReview(invalidReviewInput)).rejects.toThrow(
        'Failed to create review: You can only review transactions you were part of'
      );
    });

    it('should throw error if reviewee is invalid', async () => {
      const invalidReviewInput = { ...validReviewInput, revieweeId: 'invalid-user' };
      mockTransactionRepository.findById.mockResolvedValue(mockTransaction);

      await expect(reviewService.createReview(invalidReviewInput)).rejects.toThrow(
        'Failed to create review: Invalid reviewee for this transaction'
      );
    });

    it('should reject review with inappropriate content', async () => {
      const inappropriateReviewInput = {
        ...validReviewInput,
        comment: 'This seller is a scam artist and fraud!'
      };
      mockTransactionRepository.findById.mockResolvedValue(mockTransaction);

      await expect(reviewService.createReview(inappropriateReviewInput)).rejects.toThrow(
        'Failed to create review: Review content violates community guidelines'
      );
    });

    it('should reject review with excessive capitalization', async () => {
      const capsReviewInput = {
        ...validReviewInput,
        comment: 'THIS SELLER IS ABSOLUTELY AMAZING AND FANTASTIC!'
      };
      mockTransactionRepository.findById.mockResolvedValue(mockTransaction);

      await expect(reviewService.createReview(capsReviewInput)).rejects.toThrow(
        'Failed to create review: Review content violates community guidelines'
      );
    });

    it('should reject review that is too short', async () => {
      const shortReviewInput = {
        ...validReviewInput,
        comment: 'Good'
      };
      mockTransactionRepository.findById.mockResolvedValue(mockTransaction);

      await expect(reviewService.createReview(shortReviewInput)).rejects.toThrow(
        'Failed to create review: Review content violates community guidelines'
      );
    });
  });

  describe('getReviewsByUser', () => {
    it('should return paginated reviews for a user', async () => {
      const mockReviews = [mockReview];
      mockReviewRepository.findByRevieweeId.mockResolvedValue(mockReviews);
      mockReviewRepository.calculateAverageRating.mockResolvedValue(4.5);

      const result = await reviewService.getReviewsByUser('seller-1', 10, 0);

      expect(result).toEqual({
        reviews: mockReviews,
        total: 1,
        averageRating: 4.5,
      });
      expect(mockReviewRepository.findByRevieweeId).toHaveBeenCalledWith('seller-1');
      expect(mockReviewRepository.calculateAverageRating).toHaveBeenCalledWith('seller-1');
    });

    it('should handle pagination correctly', async () => {
      const mockReviews = Array.from({ length: 25 }, (_, i) => ({
        ...mockReview,
        id: `review-${i + 1}`,
      }));
      mockReviewRepository.findByRevieweeId.mockResolvedValue(mockReviews);
      mockReviewRepository.calculateAverageRating.mockResolvedValue(4.5);

      const result = await reviewService.getReviewsByUser('seller-1', 10, 10);

      expect(result.reviews).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.reviews[0]?.id).toBe('review-11');
    });
  });

  describe('getUserReviewStats', () => {
    it('should return comprehensive review statistics', async () => {
      const mockStats = {
        totalReviews: 10,
        averageRating: 4.5,
        ratingDistribution: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 },
        recentReviews: [mockReview],
      };
      mockReviewRepository.getReviewStats.mockResolvedValue(mockStats);

      const result = await reviewService.getUserReviewStats('seller-1');

      expect(result).toEqual(mockStats);
      expect(mockReviewRepository.getReviewStats).toHaveBeenCalledWith('seller-1');
    });
  });

  describe('getPendingReviews', () => {
    it('should return pending reviews for a user', async () => {
      const mockPendingReviews = [
        {
          transactionId: 'transaction-1',
          otherPartyId: 'seller-1',
          otherPartyName: 'John Doe',
          reviewType: 'buyer_to_seller' as const,
          transactionDate: new Date(),
        },
      ];
      mockReviewRepository.findPendingReviews.mockResolvedValue(mockPendingReviews);

      const result = await reviewService.getPendingReviews('buyer-1');

      expect(result).toEqual(mockPendingReviews);
      expect(mockReviewRepository.findPendingReviews).toHaveBeenCalledWith('buyer-1');
    });
  });

  describe('updateReviewVisibility', () => {
    it('should update review visibility for admin user', async () => {
      const adminUser = { ...mockUser, role: 'admin' as const };
      mockUserRepository.findById.mockResolvedValue(adminUser);
      mockReviewRepository.updateVisibility.mockResolvedValue(true);

      const result = await reviewService.updateReviewVisibility('review-1', false, 'admin-1');

      expect(result).toBe(true);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('admin-1');
      expect(mockReviewRepository.updateVisibility).toHaveBeenCalledWith('review-1', false);
    });

    it('should update review visibility for moderator user', async () => {
      const moderatorUser = { ...mockUser, role: 'moderator' as const };
      mockUserRepository.findById.mockResolvedValue(moderatorUser);
      mockReviewRepository.updateVisibility.mockResolvedValue(true);

      const result = await reviewService.updateReviewVisibility('review-1', false, 'moderator-1');

      expect(result).toBe(true);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('moderator-1');
      expect(mockReviewRepository.updateVisibility).toHaveBeenCalledWith('review-1', false);
    });

    it('should throw error for regular user trying to moderate', async () => {
      const regularUser = { ...mockUser, role: 'user' as const };
      mockUserRepository.findById.mockResolvedValue(regularUser);

      await expect(
        reviewService.updateReviewVisibility('review-1', false, 'user-1')
      ).rejects.toThrow('Failed to update review visibility: Insufficient permissions to moderate reviews');
    });

    it('should throw error if moderator not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        reviewService.updateReviewVisibility('review-1', false, 'invalid-user')
      ).rejects.toThrow('Failed to update review visibility: Insufficient permissions to moderate reviews');
    });
  });

  describe('getReviewById', () => {
    it('should return a review by ID', async () => {
      mockReviewRepository.findById.mockResolvedValue(mockReview);

      const result = await reviewService.getReviewById('review-1');

      expect(result).toEqual(mockReview);
      expect(mockReviewRepository.findById).toHaveBeenCalledWith('review-1');
    });

    it('should return null if review not found', async () => {
      mockReviewRepository.findById.mockResolvedValue(null);

      const result = await reviewService.getReviewById('invalid-review');

      expect(result).toBeNull();
    });
  });

  describe('getReviewsByTransaction', () => {
    it('should return reviews for a transaction', async () => {
      const mockReviews = [mockReview];
      mockReviewRepository.findByTransactionId.mockResolvedValue(mockReviews);

      const result = await reviewService.getReviewsByTransaction('transaction-1');

      expect(result).toEqual(mockReviews);
      expect(mockReviewRepository.findByTransactionId).toHaveBeenCalledWith('transaction-1');
    });
  });

  describe('getReviewsByReviewer', () => {
    it('should return reviews written by a reviewer', async () => {
      const mockReviews = [mockReview];
      mockReviewRepository.findByReviewerId.mockResolvedValue(mockReviews);

      const result = await reviewService.getReviewsByReviewer('buyer-1');

      expect(result).toEqual(mockReviews);
      expect(mockReviewRepository.findByReviewerId).toHaveBeenCalledWith('buyer-1');
    });
  });

  describe('flagReviewForModeration', () => {
    it('should flag a review for moderation', async () => {
      mockReviewRepository.updateVisibility.mockResolvedValue(true);

      const result = await reviewService.flagReviewForModeration('review-1', 'Inappropriate content');

      expect(result).toBe(true);
      expect(mockReviewRepository.updateVisibility).toHaveBeenCalledWith('review-1', false);
    });
  });

  describe('getReviewsRequiringModeration', () => {
    it('should return reviews that require moderation', async () => {
      const lowRatingReview = {
        ...mockReview,
        rating: 1,
        comment: 'This seller was terrible and provided fake tickets that did not work at all.',
      };
      const normalReview = { ...mockReview, rating: 5 };
      
      mockReviewRepository.findAll.mockResolvedValue([lowRatingReview, normalReview]);

      const result = await reviewService.getReviewsRequiringModeration();

      expect(result).toEqual([lowRatingReview]);
    });
  });
});
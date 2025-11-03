import request from 'supertest';
import express from 'express';
import { ReviewController } from '../ReviewController';
import { ReviewService } from '../../services/ReviewService';
import { Review } from '../../types';

// Mock the ReviewService
jest.mock('../../services/ReviewService');
jest.mock('../../config/database', () => ({
  getConnection: jest.fn(() => ({
    query: jest.fn(),
    transaction: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('ReviewController', () => {
  let app: express.Application;
  let mockReviewService: jest.Mocked<ReviewService>;
  let reviewController: ReviewController;

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

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    role: 'user',
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock the ReviewService
    mockReviewService = {
      createReview: jest.fn(),
      getReviewsByUser: jest.fn(),
      getUserReviewStats: jest.fn(),
      getPendingReviews: jest.fn(),
      getReviewsByTransaction: jest.fn(),
      getReviewsByReviewer: jest.fn(),
      getReviewById: jest.fn(),
      updateReviewVisibility: jest.fn(),
      flagReviewForModeration: jest.fn(),
      getReviewsRequiringModeration: jest.fn(),
    } as any;

    reviewController = new ReviewController();
    (reviewController as any).reviewService = mockReviewService;

    // Add middleware to simulate authenticated user
    app.use((req: any, _res, next) => {
      req.user = mockUser;
      req.headers['x-request-id'] = 'test-request-id';
      next();
    });

    // Setup routes
    app.post('/reviews', reviewController.createReview.bind(reviewController));
    app.get('/reviews/user/:userId', reviewController.getReviewsByUser.bind(reviewController));
    app.get('/reviews/user/:userId/stats', reviewController.getUserReviewStats.bind(reviewController));
    app.get('/reviews/pending', reviewController.getPendingReviews.bind(reviewController));
    app.get('/reviews/transaction/:transactionId', reviewController.getReviewsByTransaction.bind(reviewController));
    app.get('/reviews/my-reviews', reviewController.getMyReviews.bind(reviewController));
    app.patch('/reviews/:reviewId/visibility', reviewController.updateReviewVisibility.bind(reviewController));
    app.get('/reviews/:reviewId', reviewController.getReviewById.bind(reviewController));

    jest.clearAllMocks();
  });

  describe('POST /reviews', () => {
    const validReviewData = {
      transactionId: 'transaction-1',
      revieweeId: 'seller-1',
      rating: 5,
      comment: 'Great seller!',
      type: 'buyer_to_seller',
    };

    it('should create a review successfully', async () => {
      mockReviewService.createReview.mockResolvedValue(mockReview);

      const response = await request(app)
        .post('/reviews')
        .send(validReviewData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          id: 'review-1',
          rating: 5,
          comment: 'Great seller, fast delivery!',
        }),
        message: 'Review created successfully',
      });
      expect(mockReviewService.createReview).toHaveBeenCalledWith({
        ...validReviewData,
        reviewerId: 'user-1',
      });
    });

    it('should return 400 if review creation fails', async () => {
      mockReviewService.createReview.mockRejectedValue(new Error('Transaction not found'));

      const response = await request(app)
        .post('/reviews')
        .send(validReviewData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('REVIEW_CREATION_FAILED');
      expect(response.body.error.message).toBe('Transaction not found');
    });
  });

  describe('GET /reviews/user/:userId', () => {
    it('should return user reviews with pagination', async () => {
      const mockResult = {
        reviews: [mockReview],
        total: 1,
        averageRating: 4.5,
      };
      mockReviewService.getReviewsByUser.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/reviews/user/seller-1')
        .query({ limit: '10', offset: '0' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockResult,
        pagination: {
          limit: 10,
          offset: 0,
          total: 1,
        },
      });
      expect(mockReviewService.getReviewsByUser).toHaveBeenCalledWith('seller-1', 10, 0);
    });

    it('should use default pagination values', async () => {
      const mockResult = {
        reviews: [mockReview],
        total: 1,
        averageRating: 4.5,
      };
      mockReviewService.getReviewsByUser.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/reviews/user/seller-1');

      expect(response.status).toBe(200);
      expect(mockReviewService.getReviewsByUser).toHaveBeenCalledWith('seller-1', 20, 0);
    });

    it('should return 500 if service fails', async () => {
      mockReviewService.getReviewsByUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/reviews/user/seller-1');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('REVIEWS_FETCH_FAILED');
    });
  });

  describe('GET /reviews/user/:userId/stats', () => {
    it('should return user review statistics', async () => {
      const mockStats = {
        totalReviews: 10,
        averageRating: 4.5,
        ratingDistribution: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 },
        recentReviews: [mockReview],
      };
      mockReviewService.getUserReviewStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/reviews/user/seller-1/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockStats,
      });
      expect(mockReviewService.getUserReviewStats).toHaveBeenCalledWith('seller-1');
    });

    it('should return 500 if service fails', async () => {
      mockReviewService.getUserReviewStats.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/reviews/user/seller-1/stats');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('REVIEW_STATS_FAILED');
    });
  });

  describe('GET /reviews/pending', () => {
    it('should return pending reviews for authenticated user', async () => {
      const mockPendingReviews = [
        {
          transactionId: 'transaction-1',
          otherPartyId: 'seller-1',
          otherPartyName: 'John Doe',
          reviewType: 'buyer_to_seller' as const,
          transactionDate: new Date(),
        },
      ];
      mockReviewService.getPendingReviews.mockResolvedValue(mockPendingReviews);

      const response = await request(app)
        .get('/reviews/pending');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockPendingReviews,
      });
      expect(mockReviewService.getPendingReviews).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /reviews/transaction/:transactionId', () => {
    it('should return reviews for a transaction', async () => {
      mockReviewService.getReviewsByTransaction.mockResolvedValue([mockReview]);

      const response = await request(app)
        .get('/reviews/transaction/transaction-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [mockReview],
      });
      expect(mockReviewService.getReviewsByTransaction).toHaveBeenCalledWith('transaction-1');
    });
  });

  describe('GET /reviews/my-reviews', () => {
    it('should return reviews written by authenticated user', async () => {
      mockReviewService.getReviewsByReviewer.mockResolvedValue([mockReview]);

      const response = await request(app)
        .get('/reviews/my-reviews');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [mockReview],
      });
      expect(mockReviewService.getReviewsByReviewer).toHaveBeenCalledWith('user-1');
    });
  });

  describe('PATCH /reviews/:reviewId/visibility', () => {
    it('should update review visibility successfully', async () => {
      mockReviewService.updateReviewVisibility.mockResolvedValue(true);

      const response = await request(app)
        .patch('/reviews/review-1/visibility')
        .send({ isVisible: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Review hidden successfully',
      });
      expect(mockReviewService.updateReviewVisibility).toHaveBeenCalledWith('review-1', false, 'user-1');
    });

    it('should return 404 if review not found', async () => {
      mockReviewService.updateReviewVisibility.mockResolvedValue(false);

      const response = await request(app)
        .patch('/reviews/review-1/visibility')
        .send({ isVisible: false });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('REVIEW_NOT_FOUND');
    });

    it('should return 400 if service fails', async () => {
      mockReviewService.updateReviewVisibility.mockRejectedValue(new Error('Insufficient permissions'));

      const response = await request(app)
        .patch('/reviews/review-1/visibility')
        .send({ isVisible: false });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('REVIEW_VISIBILITY_UPDATE_FAILED');
    });
  });

  describe('GET /reviews/:reviewId', () => {
    it('should return a review by ID', async () => {
      mockReviewService.getReviewById.mockResolvedValue(mockReview);

      const response = await request(app)
        .get('/reviews/review-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockReview,
      });
      expect(mockReviewService.getReviewById).toHaveBeenCalledWith('review-1');
    });

    it('should return 404 if review not found', async () => {
      mockReviewService.getReviewById.mockResolvedValue(null);

      const response = await request(app)
        .get('/reviews/review-1');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('REVIEW_NOT_FOUND');
    });

    it('should return 500 if service fails', async () => {
      mockReviewService.getReviewById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/reviews/review-1');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('REVIEW_FETCH_FAILED');
    });
  });
});
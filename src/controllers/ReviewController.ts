import { Request, Response } from 'express';
import { ReviewService } from '../services/ReviewService';
import { ReviewRepository } from '../models/ReviewRepository';
import { UserRepository } from '../models/UserRepository';
import { TransactionRepository } from '../models/TransactionRepository';
import { database } from '../config/database';
import { CreateReviewInput } from '../types';

export class ReviewController {
  private reviewService: ReviewService;

  constructor() {
    const connection = database;
    const reviewRepository = new ReviewRepository(connection);
    const userRepository = new UserRepository(connection);
    const transactionRepository = new TransactionRepository(connection);
    
    this.reviewService = new ReviewService(reviewRepository, userRepository, transactionRepository);
  }

  createReview = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId, revieweeId, rating, comment, type } = req.body;
      const reviewerId = req.user!.userId;

      const reviewInput: CreateReviewInput = {
        transactionId,
        reviewerId,
        revieweeId,
        rating,
        comment,
        type,
      };

      const review = await this.reviewService.createReview(reviewInput);

      res.status(201).json({
        success: true,
        data: review,
        message: 'Review created successfully'
      });
    } catch (error) {
      console.error('Error creating review:', error);
      res.status(400).json({
        error: {
          code: 'REVIEW_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create review',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getReviewsByUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query['limit'] as string) || 20;
      const offset = parseInt(req.query['offset'] as string) || 0;

      if (!userId) {
        res.status(400).json({
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const result = await this.reviewService.getReviewsByUser(userId, limit, offset);

      res.json({
        success: true,
        data: result,
        pagination: {
          limit,
          offset,
          total: result.total
        }
      });
    } catch (error) {
      console.error('Error getting user reviews:', error);
      res.status(500).json({
        error: {
          code: 'REVIEWS_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch reviews',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getUserReviewStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const stats = await this.reviewService.getUserReviewStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting user review stats:', error);
      res.status(500).json({
        error: {
          code: 'REVIEW_STATS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch review statistics',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getPendingReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const pendingReviews = await this.reviewService.getPendingReviews(userId);

      res.json({
        success: true,
        data: pendingReviews
      });
    } catch (error) {
      console.error('Error getting pending reviews:', error);
      res.status(500).json({
        error: {
          code: 'PENDING_REVIEWS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch pending reviews',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getReviewsByTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;

      if (!transactionId) {
        res.status(400).json({
          error: {
            code: 'MISSING_TRANSACTION_ID',
            message: 'Transaction ID is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const reviews = await this.reviewService.getReviewsByTransaction(transactionId);

      res.json({
        success: true,
        data: reviews
      });
    } catch (error) {
      console.error('Error getting transaction reviews:', error);
      res.status(500).json({
        error: {
          code: 'TRANSACTION_REVIEWS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch transaction reviews',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getMyReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const reviewerId = req.user!.userId;

      const reviews = await this.reviewService.getReviewsByReviewer(reviewerId);

      res.json({
        success: true,
        data: reviews
      });
    } catch (error) {
      console.error('Error getting user\'s reviews:', error);
      res.status(500).json({
        error: {
          code: 'MY_REVIEWS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch your reviews',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  updateReviewVisibility = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reviewId } = req.params;
      const { isVisible } = req.body;
      const moderatorId = req.user!.userId;

      if (!reviewId) {
        res.status(400).json({
          error: {
            code: 'MISSING_REVIEW_ID',
            message: 'Review ID is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const success = await this.reviewService.updateReviewVisibility(reviewId, isVisible, moderatorId);

      if (!success) {
        res.status(404).json({
          error: {
            code: 'REVIEW_NOT_FOUND',
            message: 'Review not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      res.json({
        success: true,
        message: `Review ${isVisible ? 'shown' : 'hidden'} successfully`
      });
    } catch (error) {
      console.error('Error updating review visibility:', error);
      res.status(400).json({
        error: {
          code: 'REVIEW_VISIBILITY_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update review visibility',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getReviewById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reviewId } = req.params;

      if (!reviewId) {
        res.status(400).json({
          error: {
            code: 'MISSING_REVIEW_ID',
            message: 'Review ID is required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const review = await this.reviewService.getReviewById(reviewId);

      if (!review) {
        res.status(404).json({
          error: {
            code: 'REVIEW_NOT_FOUND',
            message: 'Review not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: review
      });
    } catch (error) {
      console.error('Error getting review by ID:', error);
      res.status(500).json({
        error: {
          code: 'REVIEW_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch review',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  // Additional methods for review moderation and management
  flagReviewForModeration = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reviewId } = req.params;
      const { reason } = req.body;

      if (!reviewId || !reason) {
        res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'Review ID and reason are required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      const success = await this.reviewService.flagReviewForModeration(reviewId, reason);

      if (!success) {
        res.status(404).json({
          error: {
            code: 'REVIEW_NOT_FOUND',
            message: 'Review not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      res.json({
        success: true,
        message: 'Review flagged for moderation successfully'
      });
    } catch (error) {
      console.error('Error flagging review for moderation:', error);
      res.status(500).json({
        error: {
          code: 'REVIEW_FLAG_FAILED',
          message: error instanceof Error ? error.message : 'Failed to flag review',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };

  getReviewsForModeration = async (req: Request, res: Response): Promise<void> => {
    try {
      const reviews = await this.reviewService.getReviewsRequiringModeration();

      res.json({
        success: true,
        data: reviews
      });
    } catch (error) {
      console.error('Error getting reviews for moderation:', error);
      res.status(500).json({
        error: {
          code: 'MODERATION_REVIEWS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch reviews for moderation',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  };
}
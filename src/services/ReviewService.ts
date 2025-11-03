import { ReviewRepository } from '../models/ReviewRepository';
import { UserRepository } from '../models/UserRepository';
import { TransactionRepository } from '../models/TransactionRepository';
import { Review, CreateReviewInput } from '../types';

export class ReviewService {
  constructor(
    private reviewRepository: ReviewRepository,
    private userRepository: UserRepository,
    private transactionRepository: TransactionRepository
  ) {}

  async createReview(input: CreateReviewInput): Promise<Review> {
    try {
      // Validate that the transaction exists and is completed
      const transaction = await this.transactionRepository.findById(input.transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'completed') {
        throw new Error('Reviews can only be created for completed transactions');
      }

      // Validate that the reviewer is part of the transaction
      if (transaction.buyerId !== input.reviewerId && transaction.sellerId !== input.reviewerId) {
        throw new Error('You can only review transactions you were part of');
      }

      // Validate that the reviewee is the other party in the transaction
      const expectedRevieweeId = transaction.buyerId === input.reviewerId 
        ? transaction.sellerId 
        : transaction.buyerId;

      if (expectedRevieweeId !== input.revieweeId) {
        throw new Error('Invalid reviewee for this transaction');
      }

      // Content moderation - check for inappropriate content
      if (input.comment) {
        const moderationResult = await this.moderateContent(input.comment);
        if (!moderationResult.approved) {
          throw new Error(`Review content violates community guidelines: ${moderationResult.reason}`);
        }
      }

      // Create the review
      const review = await this.reviewRepository.create(input);

      // Update the reviewee's rating
      await this.updateUserRating(input.revieweeId);

      return review;
    } catch (error) {
      throw new Error(`Failed to create review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getReviewsByUser(userId: string, limit: number = 20, offset: number = 0): Promise<{
    reviews: Review[];
    total: number;
    averageRating: number;
  }> {
    try {
      const reviews = await this.reviewRepository.findByRevieweeId(userId);
      const averageRating = await this.reviewRepository.calculateAverageRating(userId);

      // Apply pagination
      const paginatedReviews = reviews.slice(offset, offset + limit);

      return {
        reviews: paginatedReviews,
        total: reviews.length,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      };
    } catch (error) {
      throw new Error(`Failed to get reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserReviewStats(userId: string): Promise<{
    totalReviews: number;
    averageRating: number;
    ratingDistribution: { [rating: number]: number };
    recentReviews: Review[];
  }> {
    try {
      return await this.reviewRepository.getReviewStats(userId);
    } catch (error) {
      throw new Error(`Failed to get review stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPendingReviews(userId: string): Promise<{
    transactionId: string;
    otherPartyId: string;
    otherPartyName: string;
    reviewType: Review['type'];
    transactionDate: Date;
  }[]> {
    try {
      return await this.reviewRepository.findPendingReviews(userId);
    } catch (error) {
      throw new Error(`Failed to get pending reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getReviewsByTransaction(transactionId: string): Promise<Review[]> {
    try {
      return await this.reviewRepository.findByTransactionId(transactionId);
    } catch (error) {
      throw new Error(`Failed to get transaction reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getReviewsByReviewer(reviewerId: string): Promise<Review[]> {
    try {
      return await this.reviewRepository.findByReviewerId(reviewerId);
    } catch (error) {
      throw new Error(`Failed to get reviewer's reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getReviewById(reviewId: string): Promise<Review | null> {
    try {
      return await this.reviewRepository.findById(reviewId);
    } catch (error) {
      throw new Error(`Failed to get review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateReviewVisibility(reviewId: string, isVisible: boolean, moderatorId: string): Promise<boolean> {
    try {
      // Verify the moderator has permission (this would typically check user role)
      const moderator = await this.userRepository.findById(moderatorId);
      if (!moderator || (moderator.role !== 'admin' && moderator.role !== 'moderator')) {
        throw new Error('Insufficient permissions to moderate reviews');
      }

      return await this.reviewRepository.updateVisibility(reviewId, isVisible);
    } catch (error) {
      throw new Error(`Failed to update review visibility: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async updateUserRating(userId: string): Promise<void> {
    try {
      const averageRating = await this.reviewRepository.calculateAverageRating(userId);
      await this.userRepository.updateRating(userId, averageRating);
    } catch (error) {
      // Log error but don't throw - rating update failure shouldn't prevent review creation
      console.error(`Failed to update user rating for user ${userId}:`, error);
    }
  }

  private async moderateContent(content: string): Promise<{ approved: boolean; reason?: string }> {
    // Simple content moderation - in production, this would use more sophisticated methods
    const prohibitedWords = [
      'spam', 'scam', 'fraud', 'fake', 'cheat', 'steal', 'illegal',
      // Add more prohibited words as needed
    ];

    const lowercaseContent = content.toLowerCase();
    
    // Check for prohibited words
    for (const word of prohibitedWords) {
      if (lowercaseContent.includes(word)) {
        return {
          approved: false,
          reason: `Contains prohibited word: ${word}`
        };
      }
    }

    // Check for excessive capitalization (more than 50% caps)
    const capsCount = (content.match(/[A-Z]/g) || []).length;
    const totalLetters = (content.match(/[A-Za-z]/g) || []).length;
    if (totalLetters > 0 && (capsCount / totalLetters) > 0.5) {
      return {
        approved: false,
        reason: 'Excessive use of capital letters'
      };
    }

    // Check for repeated characters (more than 3 in a row)
    if (/(.)\1{3,}/.test(content)) {
      return {
        approved: false,
        reason: 'Contains excessive repeated characters'
      };
    }

    // Check minimum meaningful content length
    if (content.trim().length < 10) {
      return {
        approved: false,
        reason: 'Review content too short to be meaningful'
      };
    }

    return { approved: true };
  }

  async flagReviewForModeration(reviewId: string, reason: string): Promise<boolean> {
    try {
      // In a real implementation, this would create a moderation queue entry
      // For now, we'll just hide the review
      console.log(`Flagging review ${reviewId} for moderation. Reason: ${reason}`);
      return await this.reviewRepository.updateVisibility(reviewId, false);
    } catch (error) {
      throw new Error(`Failed to flag review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getReviewsRequiringModeration(): Promise<Review[]> {
    try {
      // This would typically query a moderation queue
      // For now, return reviews with certain characteristics that might need review
      const allReviews = await this.reviewRepository.findAll();
      
      return allReviews.filter(review => {
        // Flag reviews with very low ratings and comments for manual review
        return review.rating === 1 && review.comment && review.comment.length > 50;
      });
    } catch (error) {
      throw new Error(`Failed to get reviews for moderation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
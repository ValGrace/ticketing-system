import { BaseRepository } from './BaseRepository';
import {
    Review,
    ReviewEntity,
    CreateReviewInput,
    ReviewRepository as IReviewRepository,
    DatabaseConnection
} from '../types';

export class ReviewRepository extends BaseRepository<Review, ReviewEntity, CreateReviewInput> implements IReviewRepository {
    constructor(connection: DatabaseConnection) {
        super(connection, 'reviews');
    }

    protected getSelectFields(): string {
        return `
      id, transaction_id, reviewer_id, reviewee_id, rating, 
      comment, type, is_visible, created_at
    `;
    }

    protected mapEntityToModel(entity: ReviewEntity): Review {
        const review: Review = {
            id: entity.id,
            transactionId: entity.transaction_id,
            reviewerId: entity.reviewer_id,
            revieweeId: entity.reviewee_id,
            rating: entity.rating,
            type: entity.type,
            createdAt: this.formatDate(entity.created_at),
            isVisible: entity.is_visible,
        };

        if (entity.comment) {
            review.comment = entity.comment;
        }

        return review;
    }

    protected mapCreateInputToEntity(input: CreateReviewInput): Partial<ReviewEntity> {
        const entity: Partial<ReviewEntity> = {
            transaction_id: input.transactionId,
            reviewer_id: input.reviewerId,
            reviewee_id: input.revieweeId,
            rating: input.rating,
            type: input.type,
            is_visible: true,
        };

        if (input.comment) {
            entity.comment = input.comment;
        }

        return entity;
    }

    override async create(input: CreateReviewInput): Promise<Review> {
        return this.connection.transaction(async (client) => {
            // Verify the transaction exists and involves the reviewer
            const transactionQuery = `
        SELECT buyer_id, seller_id, status
        FROM transactions
        WHERE id = $1 AND status = 'completed'
      `;

            const transactionResult = await client.query<{
                buyer_id: string;
                seller_id: string;
                status: string;
            }>(transactionQuery, [input.transactionId]);

            if (transactionResult.length === 0) {
                throw new Error('Transaction not found or not completed');
            }

            const transaction = transactionResult[0]!;

            // Verify reviewer is part of the transaction
            if (transaction.buyer_id !== input.reviewerId && transaction.seller_id !== input.reviewerId) {
                throw new Error('Reviewer is not part of this transaction');
            }

            // Verify reviewee is the other party in the transaction
            const expectedRevieweeId = transaction.buyer_id === input.reviewerId
                ? transaction.seller_id
                : transaction.buyer_id;

            if (expectedRevieweeId !== input.revieweeId) {
                throw new Error('Invalid reviewee for this transaction');
            }

            // Verify review type matches the reviewer's role
            const expectedType = transaction.buyer_id === input.reviewerId
                ? 'buyer_to_seller'
                : 'seller_to_buyer';

            if (expectedType !== input.type) {
                throw new Error('Review type does not match reviewer role');
            }

            // Check if review already exists
            const existingReviewQuery = `
        SELECT id FROM reviews
        WHERE transaction_id = $1 AND reviewer_id = $2 AND type = $3
      `;

            const existingReview = await client.query(existingReviewQuery, [
                input.transactionId,
                input.reviewerId,
                input.type
            ]);

            if (existingReview.length > 0) {
                throw new Error('Review already exists for this transaction');
            }

            // Create the review
            return super.create(input);
        });
    }

    async findByRevieweeId(revieweeId: string): Promise<Review[]> {
        const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE reviewee_id = $1 AND is_visible = true
      ORDER BY created_at DESC
    `;

        const result = await this.connection.query<ReviewEntity>(query, [revieweeId]);

        return result.map(entity => this.mapEntityToModel(entity));
    }

    async findByTransactionId(transactionId: string): Promise<Review[]> {
        const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE transaction_id = $1
      ORDER BY created_at DESC
    `;

        const result = await this.connection.query<ReviewEntity>(query, [transactionId]);

        return result.map(entity => this.mapEntityToModel(entity));
    }

    async calculateAverageRating(userId: string): Promise<number> {
        const query = `
      SELECT AVG(rating) as average_rating
      FROM ${this.tableName}
      WHERE reviewee_id = $1 AND is_visible = true
    `;

        const result = await this.connection.query<{ average_rating: string | null }>(query, [userId]);

        const averageRating = result[0]?.average_rating;

        return averageRating ? parseFloat(averageRating) : 0;
    }

    async findByReviewerId(reviewerId: string): Promise<Review[]> {
        const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE reviewer_id = $1
      ORDER BY created_at DESC
    `;

        const result = await this.connection.query<ReviewEntity>(query, [reviewerId]);

        return result.map(entity => this.mapEntityToModel(entity));
    }

    async findByRating(rating: number): Promise<Review[]> {
        const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE rating = $1 AND is_visible = true
      ORDER BY created_at DESC
    `;

        const result = await this.connection.query<ReviewEntity>(query, [rating]);

        return result.map(entity => this.mapEntityToModel(entity));
    }

    async updateVisibility(id: string, isVisible: boolean): Promise<boolean> {
        const query = `
      UPDATE ${this.tableName}
      SET is_visible = $2
      WHERE id = $1
    `;

        const result = await this.connection.query(query, [id, isVisible]);

        return (result as any).rowCount > 0;
    }

    async getReviewStats(userId: string): Promise<{
        totalReviews: number;
        averageRating: number;
        ratingDistribution: { [rating: number]: number };
        recentReviews: Review[];
    }> {
        // Get total reviews and average rating
        const statsQuery = `
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating
      FROM ${this.tableName}
      WHERE reviewee_id = $1 AND is_visible = true
    `;

        const statsResult = await this.connection.query<{
            total_reviews: string;
            average_rating: string | null;
        }>(statsQuery, [userId]);

        // Get rating distribution
        const distributionQuery = `
      SELECT rating, COUNT(*) as count
      FROM ${this.tableName}
      WHERE reviewee_id = $1 AND is_visible = true
      GROUP BY rating
      ORDER BY rating DESC
    `;

        const distributionResult = await this.connection.query<{
            rating: number;
            count: string;
        }>(distributionQuery, [userId]);

        // Get recent reviews
        const recentReviews = await this.findByRevieweeId(userId);

        const stats = statsResult[0];
        const ratingDistribution: { [rating: number]: number } = {};

        // Initialize distribution with zeros
        for (let i = 1; i <= 5; i++) {
            ratingDistribution[i] = 0;
        }

        // Fill in actual counts
        distributionResult.forEach(row => {
            ratingDistribution[row.rating] = parseInt(row.count);
        });

        return {
            totalReviews: parseInt(stats?.total_reviews || '0'),
            averageRating: stats?.average_rating ? parseFloat(stats.average_rating) : 0,
            ratingDistribution,
            recentReviews: recentReviews.slice(0, 10), // Last 10 reviews
        };
    }

    async findPendingReviews(userId: string): Promise<{
        transactionId: string;
        otherPartyId: string;
        otherPartyName: string;
        reviewType: Review['type'];
        transactionDate: Date;
    }[]> {
        const query = `
      SELECT 
        t.id as transaction_id,
        CASE 
          WHEN t.buyer_id = $1 THEN t.seller_id 
          ELSE t.buyer_id 
        END as other_party_id,
        CASE 
          WHEN t.buyer_id = $1 THEN u_seller.first_name || ' ' || u_seller.last_name
          ELSE u_buyer.first_name || ' ' || u_buyer.last_name 
        END as other_party_name,
        CASE 
          WHEN t.buyer_id = $1 THEN 'buyer_to_seller'::review_type
          ELSE 'seller_to_buyer'::review_type
        END as review_type,
        t.created_at as transaction_date
      FROM transactions t
      LEFT JOIN users u_buyer ON t.buyer_id = u_buyer.id
      LEFT JOIN users u_seller ON t.seller_id = u_seller.id
      LEFT JOIN reviews r ON r.transaction_id = t.id 
        AND r.reviewer_id = $1 
        AND r.type = CASE 
          WHEN t.buyer_id = $1 THEN 'buyer_to_seller'::review_type
          ELSE 'seller_to_buyer'::review_type
        END
      WHERE (t.buyer_id = $1 OR t.seller_id = $1)
        AND t.status = 'completed'
        AND r.id IS NULL
      ORDER BY t.created_at DESC
    `;

        const result = await this.connection.query<{
            transaction_id: string;
            other_party_id: string;
            other_party_name: string;
            review_type: Review['type'];
            transaction_date: string;
        }>(query, [userId]);

        return result.map(row => ({
            transactionId: row.transaction_id,
            otherPartyId: row.other_party_id,
            otherPartyName: row.other_party_name,
            reviewType: row.review_type,
            transactionDate: this.formatDate(row.transaction_date),
        }));
    }
}
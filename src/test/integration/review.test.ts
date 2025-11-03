import request from 'supertest';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { connectDatabase, database } from '../../config/database';
import { MigrationRunner } from '../../utils/migrationRunner';

describe('Review Integration Tests', () => {
  let app: any;
  let db: DatabaseConnection;
  let buyerToken: string;
  let sellerToken: string;
  let buyerId: string;
  let sellerId: string;
  let transactionId: string;
  let listingId: string;

  beforeAll(async () => {
    // Connect to test database
    await connectDatabase();
    db = database;
    
    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();
    
    // Create app
    app = createApp(db);
  });

  beforeEach(async () => {
    // Clean up database
    await db.query('DELETE FROM reviews');
    await db.query('DELETE FROM transactions');
    await db.query('DELETE FROM ticket_listings');
    await db.query('DELETE FROM users');

    // Create test users
    const buyerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'buyer@example.com',
        username: 'buyer123',
        firstName: 'John',
        lastName: 'Buyer',
        password: 'password123',
      });

    const sellerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'seller@example.com',
        username: 'seller123',
        firstName: 'Jane',
        lastName: 'Seller',
        password: 'password123',
      });

    buyerId = buyerResponse.body.data.user.id;
    sellerId = sellerResponse.body.data.user.id;

    // Login users
    const buyerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'buyer@example.com',
        password: 'password123',
      });

    const sellerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'seller@example.com',
        password: 'password123',
      });

    buyerToken = buyerLogin.body.data.token;
    sellerToken = sellerLogin.body.data.token;

    // Create a test listing
    const listingResponse = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Concert Tickets',
        description: 'Great seats for the concert',
        category: 'concert',
        eventName: 'Rock Concert 2024',
        eventDate: '2024-12-31',
        eventTime: '20:00',
        venue: 'Madison Square Garden',
        quantity: 2,
        originalPrice: 100,
        askingPrice: 120,
        location: {
          city: 'New York',
          state: 'NY',
          country: 'USA',
        },
      });

    listingId = listingResponse.body.data.id;

    // Create a completed transaction
    const transactionResult = await db.query(`
      INSERT INTO transactions (
        id, listing_id, buyer_id, seller_id, quantity, total_amount, 
        platform_fee, payment_intent_id, status, escrow_release_date
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 1, 120, 12, 'pi_test_123', 'completed', 
        NOW() + INTERVAL '7 days'
      ) RETURNING id
    `, [listingId, buyerId, sellerId]);

    transactionId = transactionResult[0]!.id;
  });

  afterAll(async () => {
    await db.close();
  });

  describe('POST /api/reviews', () => {
    it('should create a review successfully', async () => {
      const reviewData = {
        transactionId,
        revieweeId: sellerId,
        rating: 5,
        comment: 'Excellent seller, fast delivery and great communication!',
        type: 'buyer_to_seller',
      };

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(reviewData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        transactionId,
        reviewerId: buyerId,
        revieweeId: sellerId,
        rating: 5,
        comment: 'Excellent seller, fast delivery and great communication!',
        type: 'buyer_to_seller',
        isVisible: true,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should allow seller to review buyer', async () => {
      const reviewData = {
        transactionId,
        revieweeId: buyerId,
        rating: 4,
        comment: 'Good buyer, prompt payment!',
        type: 'seller_to_buyer',
      };

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send(reviewData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        transactionId,
        reviewerId: sellerId,
        revieweeId: buyerId,
        rating: 4,
        type: 'seller_to_buyer',
      });
    });

    it('should reject review for non-completed transaction', async () => {
      // Create a pending transaction
      const pendingTransactionResult = await db.query(`
        INSERT INTO transactions (
          id, listing_id, buyer_id, seller_id, quantity, total_amount, 
          platform_fee, payment_intent_id, status, escrow_release_date
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 1, 120, 12, 'pi_test_456', 'pending', 
          NOW() + INTERVAL '7 days'
        ) RETURNING id
      `, [listingId, buyerId, sellerId]);

      const reviewData = {
        transactionId: pendingTransactionResult[0]!.id,
        revieweeId: sellerId,
        rating: 5,
        comment: 'Great seller!',
        type: 'buyer_to_seller',
      };

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(reviewData);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('completed transactions');
    });

    it('should reject duplicate review', async () => {
      // Create first review
      const reviewData = {
        transactionId,
        revieweeId: sellerId,
        rating: 5,
        comment: 'Great seller!',
        type: 'buyer_to_seller',
      };

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(reviewData);

      // Try to create duplicate review
      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(reviewData);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already exists');
    });

    it('should reject review with inappropriate content', async () => {
      const reviewData = {
        transactionId,
        revieweeId: sellerId,
        rating: 1,
        comment: 'This seller is a scam artist and fraud!',
        type: 'buyer_to_seller',
      };

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(reviewData);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('community guidelines');
    });

    it('should require authentication', async () => {
      const reviewData = {
        transactionId,
        revieweeId: sellerId,
        rating: 5,
        comment: 'Great seller!',
        type: 'buyer_to_seller',
      };

      const response = await request(app)
        .post('/api/reviews')
        .send(reviewData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/reviews/user/:userId', () => {
    beforeEach(async () => {
      // Create some test reviews
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          revieweeId: sellerId,
          rating: 5,
          comment: 'Excellent seller!',
          type: 'buyer_to_seller',
        });

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          transactionId,
          revieweeId: buyerId,
          rating: 4,
          comment: 'Good buyer!',
          type: 'seller_to_buyer',
        });
    });

    it('should return reviews for a user', async () => {
      const response = await request(app)
        .get(`/api/reviews/user/${sellerId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reviews).toHaveLength(1);
      expect(response.body.data.reviews[0]).toMatchObject({
        revieweeId: sellerId,
        rating: 5,
        comment: 'Excellent seller!',
      });
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.averageRating).toBe(5);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get(`/api/reviews/user/${sellerId}`)
        .query({ limit: 1, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.pagination).toEqual({
        limit: 1,
        offset: 0,
        total: 1,
      });
    });
  });

  describe('GET /api/reviews/user/:userId/stats', () => {
    beforeEach(async () => {
      // Create multiple reviews with different ratings
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          revieweeId: sellerId,
          rating: 5,
          comment: 'Excellent seller!',
          type: 'buyer_to_seller',
        });
    });

    it('should return comprehensive review statistics', async () => {
      const response = await request(app)
        .get(`/api/reviews/user/${sellerId}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalReviews: 1,
        averageRating: 5,
        ratingDistribution: expect.any(Object),
        recentReviews: expect.any(Array),
      });
    });
  });

  describe('GET /api/reviews/pending', () => {
    it('should return pending reviews for authenticated user', async () => {
      const response = await request(app)
        .get('/api/reviews/pending')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        transactionId,
        otherPartyId: sellerId,
        reviewType: 'buyer_to_seller',
      });
    });

    it('should return empty array after review is created', async () => {
      // Create review
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          revieweeId: sellerId,
          rating: 5,
          comment: 'Great seller!',
          type: 'buyer_to_seller',
        });

      const response = await request(app)
        .get('/api/reviews/pending')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/reviews/transaction/:transactionId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          revieweeId: sellerId,
          rating: 5,
          comment: 'Great seller!',
          type: 'buyer_to_seller',
        });
    });

    it('should return reviews for a transaction', async () => {
      const response = await request(app)
        .get(`/api/reviews/transaction/${transactionId}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        transactionId,
        rating: 5,
      });
    });
  });

  describe('GET /api/reviews/my-reviews', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          revieweeId: sellerId,
          rating: 5,
          comment: 'Great seller!',
          type: 'buyer_to_seller',
        });
    });

    it('should return reviews written by authenticated user', async () => {
      const response = await request(app)
        .get('/api/reviews/my-reviews')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        reviewerId: buyerId,
        revieweeId: sellerId,
        rating: 5,
      });
    });
  });

  describe('GET /api/reviews/:reviewId', () => {
    let reviewId: string;

    beforeEach(async () => {
      const reviewResponse = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          revieweeId: sellerId,
          rating: 5,
          comment: 'Great seller!',
          type: 'buyer_to_seller',
        });

      reviewId = reviewResponse.body.data.id;
    });

    it('should return a specific review', async () => {
      const response = await request(app)
        .get(`/api/reviews/${reviewId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: reviewId,
        rating: 5,
        comment: 'Great seller!',
      });
    });

    it('should return 404 for non-existent review', async () => {
      const response = await request(app)
        .get('/api/reviews/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('REVIEW_NOT_FOUND');
    });
  });
});
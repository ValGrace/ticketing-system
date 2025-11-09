import { Pool } from 'pg';
import { DatabaseConnection } from '../../types';
import { expect } from '@jest/globals'

describe('Database Integration Tests with Test Containers', () => {
  let db: DatabaseConnection;
  let pool: Pool;

  beforeAll(async () => {
    // Initialize test database connection
    pool = new Pool({
      host: process.env["TEST_DB_HOST"] || 'localhost',
      port: parseInt(process.env["TEST_DB_PORT"] || '5432'),
      database: process.env["TEST_DB_NAME"] || 'ticket_resell_test',
      user: process.env["TEST_DB_USER"] || 'postgres',
      password: process.env["TEST_DB_PASSWORD"] || 'postgres'
    });

    db = {
      query: async (text: string, params?: any[]) => {
        const result = await pool.query(text, params);
        return result.rows;
      },
      transaction: async (callback: (client: any) => Promise<any>) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: async () => {
        await pool.end();
      }
    };

    // Run migrations
    await runMigrations(db);
  });

  afterAll(async () => {
    await cleanupDatabase(db);
    await db.close();
  });

  describe('User Table Operations', () => {
    it('should create user with all fields', async () => {
      const result = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        ['dbtest@example.com', 'dbtest', 'DB', 'Test', 'hashed_password', '+1234567890']
      );

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('dbtest@example.com');
      expect(result[0].username).toBe('dbtest');
      expect(result[0].is_verified).toBe(false);
      expect(result[0].rating).toBe(0);
      expect(result[0].status).toBe('active');
    });

    it('should enforce unique email constraint', async () => {
      await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        ['unique@test.com', 'unique1', 'Test', 'User', 'hash']
      );

      await expect(
        db.query(
          `INSERT INTO users (email, username, first_name, last_name, password_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          ['unique@test.com', 'unique2', 'Test', 'User', 'hash']
        )
      ).rejects.toThrow();
    });

    it('should enforce unique username constraint', async () => {
      await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        ['user1@test.com', 'uniqueuser', 'Test', 'User', 'hash']
      );

      await expect(
        db.query(
          `INSERT INTO users (email, username, first_name, last_name, password_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          ['user2@test.com', 'uniqueuser', 'Test', 'User', 'hash']
        )
      ).rejects.toThrow();
    });

    it('should update user rating correctly', async () => {
      const user = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['rating@test.com', 'ratinguser', 'Rating', 'Test', 'hash']
      );

      await db.query(
        `UPDATE users SET rating = $1, total_transactions = $2 WHERE id = $3`,
        [4.5, 10, user[0].id]
      );

      const updated = await db.query(
        `SELECT rating, total_transactions FROM users WHERE id = $1`,
        [user[0].id]
      );

      expect(updated[0].rating).toBe(4.5);
      expect(updated[0].total_transactions).toBe(10);
    });
  });

  describe('Listing Table Operations', () => {
    let userId: string;

    beforeAll(async () => {
      const result = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['listingowner@test.com', 'listingowner', 'Listing', 'Owner', 'hash']
      );
      userId = result[0].id;
    });

    it('should create listing with all required fields', async () => {
      const result = await db.query(
        `INSERT INTO listings (
          seller_id, title, description, category, event_name, event_date,
          event_time, venue, quantity, original_price, asking_price, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          userId,
          'Test Listing',
          'Test Description',
          'concert',
          'Test Event',
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          '19:00',
          'Test Venue',
          2,
          100,
          90,
          JSON.stringify({ city: 'Test', state: 'TS', country: 'USA' })
        ]
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Listing');
      expect(result[0].status).toBe('active');
      expect(result[0].verification_status).toBe('pending');
    });

    it('should enforce foreign key constraint on seller_id', async () => {
      await expect(
        db.query(
          `INSERT INTO listings (
            seller_id, title, description, category, event_name, event_date,
            event_time, venue, quantity, original_price, asking_price, location
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            'non-existent-user-id',
            'Test',
            'Test',
            'concert',
            'Event',
            new Date(),
            '19:00',
            'Venue',
            1,
            100,
            90,
            JSON.stringify({ city: 'Test', state: 'TS', country: 'USA' })
          ]
        )
      ).rejects.toThrow();
    });

    it('should update listing status', async () => {
      const listing = await db.query(
        `INSERT INTO listings (
          seller_id, title, description, category, event_name, event_date,
          event_time, venue, quantity, original_price, asking_price, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          userId,
          'Status Test',
          'Test',
          'concert',
          'Event',
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          '19:00',
          'Venue',
          1,
          100,
          90,
          JSON.stringify({ city: 'Test', state: 'TS', country: 'USA' })
        ]
      );

      await db.query(
        `UPDATE listings SET status = $1 WHERE id = $2`,
        ['sold', listing[0].id]
      );

      const updated = await db.query(
        `SELECT status FROM listings WHERE id = $1`,
        [listing[0].id]
      );

      expect(updated[0].status).toBe('sold');
    });
  });

  describe('Transaction Operations', () => {
    let sellerId: string;
    let buyerId: string;
    let listingId: string;

    beforeAll(async () => {
      const seller = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['txseller@test.com', 'txseller', 'TX', 'Seller', 'hash']
      );
      sellerId = seller[0].id;

      const buyer = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['txbuyer@test.com', 'txbuyer', 'TX', 'Buyer', 'hash']
      );
      buyerId = buyer[0].id;

      const listing = await db.query(
        `INSERT INTO listings (
          seller_id, title, description, category, event_name, event_date,
          event_time, venue, quantity, original_price, asking_price, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          sellerId,
          'TX Test',
          'Test',
          'concert',
          'Event',
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          '19:00',
          'Venue',
          2,
          100,
          90,
          JSON.stringify({ city: 'Test', state: 'TS', country: 'USA' })
        ]
      );
      listingId = listing[0].id;
    });

    it('should create transaction with proper relationships', async () => {
      const result = await db.query(
        `INSERT INTO transactions (
          listing_id, buyer_id, seller_id, quantity, total_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [listingId, buyerId, sellerId, 2, 180, 'pending']
      );

      expect(result).toHaveLength(1);
      expect(result[0].listing_id).toBe(listingId);
      expect(result[0].buyer_id).toBe(buyerId);
      expect(result[0].seller_id).toBe(sellerId);
      expect(result[0].status).toBe('pending');
    });

    it('should handle transaction rollback on error', async () => {
      await expect(
        db.transaction(async (client) => {
          await client.query(
            `INSERT INTO transactions (
              listing_id, buyer_id, seller_id, quantity, total_amount, status
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [listingId, buyerId, sellerId, 1, 90, 'pending']
          );

          // Simulate error
          throw new Error('Transaction error');
        })
      ).rejects.toThrow('Transaction error');

      // Verify transaction was rolled back
      const transactions = await db.query(
        `SELECT * FROM transactions WHERE listing_id = $1 AND total_amount = $2`,
        [listingId, 90]
      );

      expect(transactions).toHaveLength(0);
    });
  });

  describe('Review Operations', () => {
    let reviewerId: string;
    let revieweeId: string;
    let transactionId: string;

    beforeAll(async () => {
      const reviewer = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['reviewer@test.com', 'reviewer', 'Reviewer', 'Test', 'hash']
      );
      reviewerId = reviewer[0].id;

      const reviewee = await db.query(
        `INSERT INTO users (email, username, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['reviewee@test.com', 'reviewee', 'Reviewee', 'Test', 'hash']
      );
      revieweeId = reviewee[0].id;

      const listing = await db.query(
        `INSERT INTO listings (
          seller_id, title, description, category, event_name, event_date,
          event_time, venue, quantity, original_price, asking_price, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          revieweeId,
          'Review Test',
          'Test',
          'concert',
          'Event',
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          '19:00',
          'Venue',
          1,
          100,
          90,
          JSON.stringify({ city: 'Test', state: 'TS', country: 'USA' })
        ]
      );

      const transaction = await db.query(
        `INSERT INTO transactions (
          listing_id, buyer_id, seller_id, quantity, total_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [listing[0].id, reviewerId, revieweeId, 1, 90, 'completed']
      );
      transactionId = transaction[0].id;
    });

    it('should create review with valid rating', async () => {
      const result = await db.query(
        `INSERT INTO reviews (
          transaction_id, reviewer_id, reviewee_id, rating, comment
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [transactionId, reviewerId, revieweeId, 5, 'Great transaction!']
      );

      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(5);
      expect(result[0].comment).toBe('Great transaction!');
    });

    it('should enforce rating constraints', async () => {
      await expect(
        db.query(
          `INSERT INTO reviews (
            transaction_id, reviewer_id, reviewee_id, rating, comment
          ) VALUES ($1, $2, $3, $4, $5)`,
          [transactionId, reviewerId, revieweeId, 6, 'Invalid rating']
        )
      ).rejects.toThrow();
    });
  });

  describe('Complex Queries', () => {
    it('should join users and listings correctly', async () => {
      const result = await db.query(
        `SELECT u.username, l.title, l.asking_price
         FROM users u
         JOIN listings l ON u.id = l.seller_id
         WHERE u.email = $1`,
        ['listingowner@test.com']
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('username');
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('asking_price');
    });

    it('should calculate user statistics correctly', async () => {
      const result = await db.query(
        `SELECT 
          u.id,
          u.username,
          COUNT(DISTINCT t.id) as transaction_count,
          AVG(r.rating) as avg_rating
         FROM users u
         LEFT JOIN transactions t ON u.id = t.seller_id OR u.id = t.buyer_id
         LEFT JOIN reviews r ON u.id = r.reviewee_id
         WHERE u.email = $1
         GROUP BY u.id, u.username`,
        ['txseller@test.com']
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('transaction_count');
      expect(result[0]).toHaveProperty('avg_rating');
    });
  });

  describe('Index Performance', () => {
    it('should use indexes for email lookup', async () => {
      const explain = await db.query(
        `EXPLAIN SELECT * FROM users WHERE email = $1`,
        ['test@example.com']
      );

      const planText = explain.map(row => row['QUERY PLAN']).join(' ');
      expect(planText).toContain('Index');
    });

    it('should use indexes for listing search', async () => {
      const explain = await db.query(
        `EXPLAIN SELECT * FROM listings WHERE category = $1 AND status = $2`,
        ['concert', 'active']
      );

      const planText = explain.map(row => row['QUERY PLAN']).join(' ');
      expect(planText).toContain('Index');
    });
  });
});

async function runMigrations(db: DatabaseConnection): Promise<void> {
  // Run necessary migrations for test database
  // This is a simplified version - in production, use a proper migration tool
  console.log('Running test database migrations...', db);
}

async function cleanupDatabase(db: DatabaseConnection): Promise<void> {
  // Clean up test data
  await db.query('DELETE FROM reviews');
  await db.query('DELETE FROM transactions');
  await db.query('DELETE FROM listings');
  await db.query('DELETE FROM users');
}

import request from 'supertest';
import { createApp } from '../../index';
import { connectDatabase, database } from '../../config/database';
import { MigrationRunner } from '../../utils/migrationRunner';
import { UserRepository } from '../../models/UserRepository';
import { TicketListingRepository } from '../../models/TicketListingRepository';
import { TransactionRepository } from '../../models/TransactionRepository';

import { JwtUtils } from '../../utils/jwt';
import { CreateUserInput, CreateListingInput, User, TicketListing } from '../../types';

describe('Payment Integration Tests', () => {
  let app: any;
  let userRepo: UserRepository;
  let listingRepo: TicketListingRepository;
  let transactionRepo: TransactionRepository;

  let testUser: User;
  let testSeller: User;
  let testListing: TicketListing;
  let userToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    // Connect to test database
    await connectDatabase();
    
    // Run migrations
    const migrationRunner = new MigrationRunner(database);
    await migrationRunner.runMigrations();
    
    // Initialize app
    app = createApp(database);
    
    // Initialize repositories and services
    userRepo = new UserRepository(database);
    listingRepo = new TicketListingRepository(database);
    transactionRepo = new TransactionRepository(database);
  });

  beforeEach(async () => {
    // Clean up test data
    await database.query('DELETE FROM transactions WHERE id LIKE $1', ['test-%']);
    await database.query('DELETE FROM ticket_listings WHERE id LIKE $1', ['test-%']);
    await database.query('DELETE FROM users WHERE id LIKE $1', ['test-%']);
    await database.query('DELETE FROM escrow_accounts WHERE id LIKE $1', ['test-%']);
    await database.query('DELETE FROM dispute_cases WHERE id LIKE $1', ['test-%']);
    await database.query('DELETE FROM refund_requests WHERE id LIKE $1', ['test-%']);

    // Create test users
    const buyerInput: CreateUserInput = {
      email: 'buyer@test.com',
      username: 'testbuyer',
      firstName: 'Test',
      lastName: 'Buyer',
      password: 'password123',
      phoneNumber: '254712345678'
    };

    const sellerInput: CreateUserInput = {
      email: 'seller@test.com',
      username: 'testseller',
      firstName: 'Test',
      lastName: 'Seller',
      password: 'password123',
      phoneNumber: '254712345679'
    };

    testUser = await userRepo.create(buyerInput);
    testSeller = await userRepo.create(sellerInput);

    // Generate tokens
    const userTokens = JwtUtils.generateTokenPair(testUser);
    const sellerTokens = JwtUtils.generateTokenPair(testSeller);
    userToken = userTokens.accessToken;
    sellerToken = sellerTokens.accessToken;

    // Create test listing
    const listingInput: CreateListingInput = {
      sellerId: testSeller.id,
      title: 'Test Concert Ticket',
      description: 'Great seats for the concert',
      category: 'concert',
      eventName: 'Test Concert',
      eventDate: new Date('2024-12-31T20:00:00Z'),
      eventTime: '20:00',
      venue: 'Test Venue',
      quantity: 2,
      originalPrice: 100,
      askingPrice: 120,
      location: {
        city: 'Nairobi',
        state: 'Nairobi',
        country: 'Kenya'
      }
    };

    testListing = await listingRepo.create(listingInput);
  });

  afterAll(async () => {
    await database.close();
  });

  describe('POST /api/payments/initiate', () => {
    it('should initiate payment successfully', async () => {
      const paymentRequest = {
        listingId: testListing.id,
        quantity: 1,
        phoneNumber: '254712345678'
      };

      const response = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send(paymentRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionId');
      expect(response.body.data).toHaveProperty('checkoutRequestId');
      expect(response.body.data).toHaveProperty('message');

      // Verify transaction was created
      const transactions = await transactionRepo.findByBuyerId(testUser.id);
      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.listingId).toBe(testListing.id);
      expect(transactions[0]?.quantity).toBe(1);
      expect(transactions[0]?.totalAmount).toBe(120);
      expect(transactions[0]?.status).toBe('pending');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          listingId: testListing.id,
          quantity: 1,
          phoneNumber: '254712345678'
        });

      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid phone number', async () => {
      const response = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          listingId: testListing.id,
          quantity: 1,
          phoneNumber: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid phone number format');
    });

    it('should return 400 for insufficient quantity', async () => {
      const response = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          listingId: testListing.id,
          quantity: 10, // More than available
          phoneNumber: '254712345678'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Insufficient ticket quantity available');
    });

    it('should return 400 for non-existent listing', async () => {
      const response = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          listingId: '00000000-0000-0000-0000-000000000000',
          quantity: 1,
          phoneNumber: '254712345678'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Listing not found');
    });
  });

  describe('POST /api/payments/mpesa/callback', () => {
    let transaction: any;

    beforeEach(async () => {
      // Create a test transaction
      transaction = await transactionRepo.create({
        listingId: testListing.id,
        buyerId: testUser.id,
        sellerId: testSeller.id,
        quantity: 1,
        totalAmount: 120,
        platformFee: 6
      });

      // Update with checkout request ID
      await transactionRepo.updatePaymentIntentId(transaction.id, 'test-checkout-123');
    });

    it('should process successful payment callback', async () => {
      const callbackData = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant-123',
            CheckoutRequestID: 'test-checkout-123',
            ResultCode: 0,
            ResultDesc: 'Success',
            CallbackMetadata: {
              Item: [
                { Name: 'MpesaReceiptNumber', Value: 'ABC123' },
                { Name: 'Amount', Value: 120 },
                { Name: 'PhoneNumber', Value: '254712345678' }
              ]
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/payments/mpesa/callback')
        .send(callbackData);

      expect(response.status).toBe(200);
      expect(response.body.ResultCode).toBe(0);

      // Verify transaction status was updated
      const updatedTransaction = await transactionRepo.findById(transaction.id);
      expect(updatedTransaction?.status).toBe('paid');

      // Verify escrow account was created
      const escrowQuery = await database.query(
        'SELECT * FROM escrow_accounts WHERE transaction_id = $1',
        [transaction.id]
      );
      expect(escrowQuery).toHaveLength(1);
      expect(escrowQuery[0].status).toBe('held');
    });

    it('should process failed payment callback', async () => {
      const callbackData = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant-123',
            CheckoutRequestID: 'test-checkout-123',
            ResultCode: 1,
            ResultDesc: 'Payment failed'
          }
        }
      };

      const response = await request(app)
        .post('/api/payments/mpesa/callback')
        .send(callbackData);

      expect(response.status).toBe(200);

      // Verify transaction was cancelled
      const updatedTransaction = await transactionRepo.findById(transaction.id);
      expect(updatedTransaction?.status).toBe('cancelled');
    });
  });

  describe('POST /api/payments/transactions/:transactionId/confirm', () => {
    let transaction: any;

    beforeEach(async () => {
      transaction = await transactionRepo.create({
        listingId: testListing.id,
        buyerId: testUser.id,
        sellerId: testSeller.id,
        quantity: 1,
        totalAmount: 120,
        platformFee: 6
      });

      // Set transaction to paid status
      await transactionRepo.updateStatus(transaction.id, 'paid');

      // Create escrow account
      await database.query(
        'INSERT INTO escrow_accounts (id, transaction_id, amount, status, release_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          'test-escrow-1',
          transaction.id,
          120,
          'held',
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
    });

    it('should confirm transfer successfully', async () => {
      const response = await request(app)
        .post(`/api/payments/transactions/${transaction.id}/confirm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('confirmed');

      // Verify transaction status
      const updatedTransaction = await transactionRepo.findById(transaction.id);
      expect(updatedTransaction?.status).toBe('completed');

      // Verify escrow was released
      const escrowQuery = await database.query(
        'SELECT * FROM escrow_accounts WHERE transaction_id = $1',
        [transaction.id]
      );
      expect(escrowQuery[0].status).toBe('released');
    });

    it('should return 400 if not the buyer', async () => {
      const response = await request(app)
        .post(`/api/payments/transactions/${transaction.id}/confirm`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Only the buyer can confirm');
    });
  });

  describe('POST /api/payments/transactions/:transactionId/dispute', () => {
    let transaction: any;

    beforeEach(async () => {
      transaction = await transactionRepo.create({
        listingId: testListing.id,
        buyerId: testUser.id,
        sellerId: testSeller.id,
        quantity: 1,
        totalAmount: 120,
        platformFee: 6
      });

      await transactionRepo.updateStatus(transaction.id, 'paid');
    });

    it('should file dispute successfully', async () => {
      const disputeData = {
        reason: 'ticket_not_received',
        description: 'Seller did not provide tickets after payment'
      };

      const response = await request(app)
        .post(`/api/payments/transactions/${transaction.id}/dispute`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(disputeData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe('ticket_not_received');
      expect(response.body.data.status).toBe('open');

      // Verify transaction status was updated
      const updatedTransaction = await transactionRepo.findById(transaction.id);
      expect(updatedTransaction?.status).toBe('disputed');

      // Verify dispute case was created
      const disputeQuery = await database.query(
        'SELECT * FROM dispute_cases WHERE transaction_id = $1',
        [transaction.id]
      );
      expect(disputeQuery).toHaveLength(1);
      expect(disputeQuery[0].reason).toBe('ticket_not_received');
    });

    it('should return 400 for invalid dispute reason', async () => {
      const response = await request(app)
        .post(`/api/payments/transactions/${transaction.id}/dispute`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          reason: 'invalid_reason',
          description: 'Test description'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid dispute reason');
    });
  });

  describe('POST /api/payments/transactions/:transactionId/refund', () => {
    let transaction: any;

    beforeEach(async () => {
      transaction = await transactionRepo.create({
        listingId: testListing.id,
        buyerId: testUser.id,
        sellerId: testSeller.id,
        quantity: 1,
        totalAmount: 120,
        platformFee: 6
      });

      await transactionRepo.updateStatus(transaction.id, 'cancelled');
    });

    it('should request refund successfully', async () => {
      const refundData = {
        reason: 'transaction_cancelled'
      };

      const response = await request(app)
        .post(`/api/payments/transactions/${transaction.id}/refund`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(refundData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe('transaction_cancelled');

      // Verify refund request was created
      const refundQuery = await database.query(
        'SELECT * FROM refund_requests WHERE transaction_id = $1',
        [transaction.id]
      );
      expect(refundQuery).toHaveLength(1);
      expect(refundQuery[0].reason).toBe('transaction_cancelled');
    });
  });

  describe('GET /api/payments/transactions/:transactionId/status', () => {
    let transaction: any;

    beforeEach(async () => {
      transaction = await transactionRepo.create({
        listingId: testListing.id,
        buyerId: testUser.id,
        sellerId: testSeller.id,
        quantity: 1,
        totalAmount: 120,
        platformFee: 6
      });
    });

    it('should get transaction status', async () => {
      const response = await request(app)
        .get(`/api/payments/transactions/${transaction.id}/status`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionId).toBe(transaction.id);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // This would require mocking the database connection
      // For now, we'll test with invalid data that would cause database errors
      
      const response = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          listingId: 'invalid-uuid',
          quantity: 1,
          phoneNumber: '254712345678'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle multiple rapid requests', async () => {
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/payments/initiate')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            listingId: testListing.id,
            quantity: 1,
            phoneNumber: '254712345678'
          })
      );

      const responses = await Promise.all(requests);
      
      // At least some requests should succeed
      const successfulRequests = responses.filter(r => r.status === 200);
      expect(successfulRequests.length).toBeGreaterThan(0);
    });
  });
});
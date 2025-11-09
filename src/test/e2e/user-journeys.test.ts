import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { createTestDatabase, cleanupTestDatabase } from '../integration/database.test';

describe('End-to-End User Journeys', () => {
  let app: Application;
  let db: DatabaseConnection;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp(db);
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  describe('Complete Ticket Purchase Journey', () => {
    let sellerToken: string;
    let buyerToken: string;
    let listingId: string;
    let transactionId: string;

    it('should complete full purchase flow from listing to review', async () => {
      // Step 1: Seller registers
      const sellerRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'seller@journey.com',
          username: 'seller_journey',
          firstName: 'Seller',
          lastName: 'Journey',
          password: 'SecurePass123!',
          phoneNumber: '+1234567890'
        });

      expect(sellerRegister.status).toBe(201);
      sellerToken = sellerRegister.body.data.tokens.accessToken;

      // Step 2: Seller creates listing
      const createListing = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          title: 'Concert Tickets - E2E Test',
          description: 'Two premium tickets',
          category: 'concert',
          eventName: 'Rock Concert',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '20:00',
          venue: 'Arena',
          seatSection: 'VIP',
          seatRow: '1',
          seatNumber: '10-11',
          quantity: 2,
          originalPrice: 200,
          askingPrice: 180,
          location: {
            city: 'New York',
            state: 'NY',
            country: 'USA'
          }
        });

      expect(createListing.status).toBe(201);
      listingId = createListing.body.data.listing.id;

      // Step 3: Buyer registers
      const buyerRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'buyer@journey.com',
          username: 'buyer_journey',
          firstName: 'Buyer',
          lastName: 'Journey',
          password: 'SecurePass123!',
          phoneNumber: '+9876543210'
        });

      expect(buyerRegister.status).toBe(201);
      buyerToken = buyerRegister.body.data.tokens.accessToken;

      // Step 4: Buyer searches for tickets
      const searchListings = await request(app)
        .get('/api/listings/search')
        .query({ q: 'concert', category: 'concert' });

      expect(searchListings.status).toBe(200);
      expect(searchListings.body.data.listings.length).toBeGreaterThan(0);

      // Step 5: Buyer views listing details
      const viewListing = await request(app)
        .get(`/api/listings/${listingId}`);

      expect(viewListing.status).toBe(200);
      expect(viewListing.body.data.listing.id).toBe(listingId);

      // Step 6: Buyer initiates purchase
      const initiatePurchase = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          listingId,
          quantity: 2,
          paymentMethodId: 'pm_test_card'
        });

      expect(initiatePurchase.status).toBe(201);
      transactionId = initiatePurchase.body.data.transaction.id;
      expect(initiatePurchase.body.data.transaction.status).toBe('pending');

      // Step 7: Payment is processed
      const confirmPayment = await request(app)
        .post(`/api/transactions/${transactionId}/confirm`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          paymentIntentId: 'pi_test_123'
        });

      expect(confirmPayment.status).toBe(200);
      expect(confirmPayment.body.data.transaction.status).toBe('paid');

      // Step 8: Seller confirms ticket transfer
      const confirmTransfer = await request(app)
        .post(`/api/transactions/${transactionId}/transfer`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          transferConfirmed: true
        });

      expect(confirmTransfer.status).toBe(200);

      // Step 9: Buyer leaves review
      const buyerReview = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          transactionId,
          rating: 5,
          comment: 'Great seller, smooth transaction!'
        });

      expect(buyerReview.status).toBe(201);

      // Step 10: Seller leaves review
      const sellerReview = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          transactionId,
          rating: 5,
          comment: 'Excellent buyer, quick payment!'
        });

      expect(sellerReview.status).toBe(201);

      // Step 11: Verify transaction history
      const buyerHistory = await request(app)
        .get('/api/users/transaction-history')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(buyerHistory.status).toBe(200);
      expect(buyerHistory.body.data.transactions.length).toBeGreaterThan(0);

      const sellerHistory = await request(app)
        .get('/api/users/transaction-history')
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(sellerHistory.status).toBe(200);
      expect(sellerHistory.body.data.transactions.length).toBeGreaterThan(0);
    });
  });

  describe('Dispute Resolution Journey', () => {
    let sellerToken: string;
    let buyerToken: string;
    let listingId: string;
    let transactionId: string;

    it('should handle dispute flow', async () => {
      // Setup: Create seller, buyer, and transaction
      const sellerRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'seller_dispute@test.com',
          username: 'seller_dispute',
          firstName: 'Seller',
          lastName: 'Dispute',
          password: 'SecurePass123!'
        });

      sellerToken = sellerRegister.body.data.tokens.accessToken;

      const createListing = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          title: 'Dispute Test Tickets',
          description: 'Test tickets',
          category: 'concert',
          eventName: 'Test Event',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '19:00',
          venue: 'Test Venue',
          quantity: 2,
          originalPrice: 100,
          askingPrice: 90,
          location: {
            city: 'Test City',
            state: 'TS',
            country: 'USA'
          }
        });

      listingId = createListing.body.data.listing.id;

      const buyerRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'buyer_dispute@test.com',
          username: 'buyer_dispute',
          firstName: 'Buyer',
          lastName: 'Dispute',
          password: 'SecurePass123!'
        });

      buyerToken = buyerRegister.body.data.tokens.accessToken;

      const initiatePurchase = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          listingId,
          quantity: 2,
          paymentMethodId: 'pm_test_card'
        });

      transactionId = initiatePurchase.body.data.transaction.id;

      // Buyer files dispute
      const fileDispute = await request(app)
        .post(`/api/transactions/${transactionId}/dispute`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          reason: 'Tickets not received',
          description: 'Seller has not sent the tickets after payment'
        });

      expect(fileDispute.status).toBe(200);
      expect(fileDispute.body.data.transaction.status).toBe('disputed');

      // Seller responds to dispute
      const respondDispute = await request(app)
        .post(`/api/transactions/${transactionId}/dispute/respond`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          response: 'Tickets were sent via email'
        });

      expect(respondDispute.status).toBe(200);

      // Admin reviews and resolves dispute
      // (In real scenario, admin would authenticate)
      const resolveDispute = await request(app)
        .post(`/api/transactions/${transactionId}/dispute/resolve`)
        .send({
          resolution: 'refund',
          notes: 'Refunding buyer due to lack of proof of delivery'
        });

      expect(resolveDispute.status).toBe(200);
    });
  });

  describe('Fraud Detection Journey', () => {
    let fraudsterToken: string;

    it('should detect and flag suspicious activity', async () => {
      // Register suspicious user
      const register = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'fraudster@test.com',
          username: 'fraudster',
          firstName: 'Fraud',
          lastName: 'User',
          password: 'SecurePass123!'
        });

      fraudsterToken = register.body.data.tokens.accessToken;

      // Create multiple listings quickly (suspicious behavior)
      const listings = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/listings')
          .set('Authorization', `Bearer ${fraudsterToken}`)
          .send({
            title: `Suspicious Listing ${i}`,
            description: 'Too good to be true price',
            category: 'concert',
            eventName: 'Event',
            eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            eventTime: '19:00',
            venue: 'Venue',
            quantity: 10,
            originalPrice: 500,
            askingPrice: 50, // Suspiciously low price
            location: {
              city: 'City',
              state: 'ST',
              country: 'USA'
            }
          });

        listings.push(response.body.data?.listing?.id);
      }

      // Check fraud detection flags
      const fraudCheck = await request(app)
        .get('/api/fraud/check')
        .set('Authorization', `Bearer ${fraudsterToken}`);

      expect(fraudCheck.status).toBe(200);
      expect(fraudCheck.body.data.flags.length).toBeGreaterThan(0);
    });
  });

  describe('Mobile User Journey', () => {
    let mobileToken: string;

    it('should support mobile-specific features', async () => {
      // Register mobile user
      const register = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'mobile@test.com',
          username: 'mobile_user',
          firstName: 'Mobile',
          lastName: 'User',
          password: 'SecurePass123!',
          deviceType: 'mobile'
        });

      mobileToken = register.body.data.tokens.accessToken;

      // Create listing with mobile camera capture
      const createListing = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${mobileToken}`)
        .set('User-Agent', 'Mobile App/1.0')
        .send({
          title: 'Mobile Listing',
          description: 'Created from mobile',
          category: 'concert',
          eventName: 'Mobile Event',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '19:00',
          venue: 'Mobile Venue',
          quantity: 2,
          originalPrice: 100,
          askingPrice: 90,
          location: {
            city: 'Mobile City',
            state: 'MC',
            country: 'USA'
          }
        });

      expect(createListing.status).toBe(201);

      // Upload image from mobile camera
      const uploadImage = await request(app)
        .post(`/api/listings/${createListing.body.data.listing.id}/images`)
        .set('Authorization', `Bearer ${mobileToken}`)
        .attach('images', Buffer.from('mobile-camera-image'), 'camera_capture.jpg');

      expect(uploadImage.status).toBe(200);

      // Enable push notifications
      const enableNotifications = await request(app)
        .post('/api/notifications/preferences')
        .set('Authorization', `Bearer ${mobileToken}`)
        .send({
          pushEnabled: true,
          deviceToken: 'mobile_device_token_123'
        });

      expect(enableNotifications.status).toBe(200);
    });
  });
});

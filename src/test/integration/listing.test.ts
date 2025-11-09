import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../index';
import { DatabaseConnection } from '../../types';
import { createTestDatabase, cleanupTestDatabase } from './database.test';
import { expect } from '@jest/globals'

describe('Listing Integration Tests', () => {
  let app: Application;
  let db: DatabaseConnection;
  let authToken: string;
  let userId: string;
  let listingId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp(db);

    // Create test user and get auth token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'seller@example.com',
        username: 'seller',
        firstName: 'Test',
        lastName: 'Seller',
        password: 'SecurePassword123!',
        phoneNumber: '+1234567890'
      });

    authToken = registerResponse.body.data.tokens.accessToken;
    userId = registerResponse.body.data.user.id;
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  describe('POST /api/listings', () => {
    const validListingData = {
      title: 'Concert Tickets - Rock Band',
      description: 'Two tickets for the upcoming rock concert',
      category: 'concert',
      eventName: 'Rock Band Live',
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      eventTime: '19:00',
      venue: 'Madison Square Garden',
      seatSection: 'A',
      seatRow: '10',
      seatNumber: '15-16',
      quantity: 2,
      originalPrice: 150,
      askingPrice: 120,
      location: {
        city: 'New York',
        state: 'NY',
        country: 'USA'
      }
    };

    it('should create listing successfully', async () => {
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validListingData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.listing).toMatchObject({
        title: validListingData.title,
        category: validListingData.category,
        eventName: validListingData.eventName,
        quantity: validListingData.quantity,
        askingPrice: validListingData.askingPrice,
        status: 'active',
        verificationStatus: 'pending'
      });

      listingId = response.body.data.listing.id;
    });

    it('should reject listing without authentication', async () => {
      const response = await request(app)
        .post('/api/listings')
        .send(validListingData);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Incomplete Listing'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject expired event dates', async () => {
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validListingData,
          eventDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('expired');
    });

    it('should validate price constraints', async () => {
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validListingData,
          askingPrice: -10
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate category-specific fields', async () => {
      const response = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validListingData,
          category: 'transportation',
          seatSection: undefined,
          departureLocation: 'New York',
          arrivalLocation: 'Boston'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.listing.category).toBe('transportation');
    });
  });

  describe('GET /api/listings/:id', () => {
    it('should get listing by ID', async () => {
      const response = await request(app)
        .get(`/api/listings/${listingId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.listing.id).toBe(listingId);
    });

    it('should return 404 for non-existent listing', async () => {
      const response = await request(app)
        .get('/api/listings/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('LISTING_NOT_FOUND');
    });
  });

  describe('PUT /api/listings/:id', () => {
    it('should update listing successfully', async () => {
      const response = await request(app)
        .put(`/api/listings/${listingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          askingPrice: 100,
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.listing.askingPrice).toBe(100);
      expect(response.body.data.listing.description).toBe('Updated description');
    });

    it('should reject update from non-owner', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'other@example.com',
          username: 'other',
          firstName: 'Other',
          lastName: 'User',
          password: 'SecurePassword123!'
        });

      const otherToken = otherUserResponse.body.data.tokens.accessToken;

      const response = await request(app)
        .put(`/api/listings/${listingId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          askingPrice: 50
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('DELETE /api/listings/:id', () => {
    it('should delete listing successfully', async () => {
      // Create a new listing to delete
      const createResponse = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'To Be Deleted',
          description: 'Test listing',
          category: 'concert',
          eventName: 'Test Event',
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          eventTime: '19:00',
          venue: 'Test Venue',
          quantity: 1,
          originalPrice: 100,
          askingPrice: 80,
          location: {
            city: 'Test City',
            state: 'TS',
            country: 'USA'
          }
        });

      const deleteListingId = createResponse.body.data.listing.id;

      const response = await request(app)
        .delete(`/api/listings/${deleteListingId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify listing is deleted
      const getResponse = await request(app)
        .get(`/api/listings/${deleteListingId}`);

      expect(getResponse.status).toBe(404);
    });
  });

  describe('POST /api/listings/:id/images', () => {
    it('should upload images successfully', async () => {
      const response = await request(app)
        .post(`/api/listings/${listingId}/images`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('images', Buffer.from('fake-image-data'), 'ticket1.jpg')
        .attach('images', Buffer.from('fake-image-data-2'), 'ticket2.jpg');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.images).toHaveLength(2);
    });

    it('should reject more than 5 images', async () => {
      const response = await request(app)
        .post(`/api/listings/${listingId}/images`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('images', Buffer.from('img1'), 'img1.jpg')
        .attach('images', Buffer.from('img2'), 'img2.jpg')
        .attach('images', Buffer.from('img3'), 'img3.jpg')
        .attach('images', Buffer.from('img4'), 'img4.jpg')
        .attach('images', Buffer.from('img5'), 'img5.jpg')
        .attach('images', Buffer.from('img6'), 'img6.jpg');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('maximum');
    });
  });

  describe('POST /api/listings/:id/sold', () => {
    it('should mark listing as sold', async () => {
      const response = await request(app)
        .post(`/api/listings/${listingId}/sold`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.listing.status).toBe('sold');
    });
  });

  describe('GET /api/listings/user/my-listings', () => {
    it('should get user listings', async () => {
      const response = await request(app)
        .get('/api/listings/user/my-listings')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.listings)).toBe(true);
    });
  });

  describe('GET /api/listings/search', () => {
    it('should search listings with filters', async () => {
      const response = await request(app)
        .get('/api/listings/search')
        .query({
          q: 'concert',
          category: 'concert',
          minPrice: 50,
          maxPrice: 200
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.listings)).toBe(true);
    });
  });

  describe('GET /api/listings/category/:category', () => {
    it('should get listings by category', async () => {
      const response = await request(app)
        .get('/api/listings/category/concert');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/listings/nearby', () => {
    it('should get nearby listings', async () => {
      const response = await request(app)
        .get('/api/listings/nearby')
        .query({
          latitude: 40.7128,
          longitude: -74.0060,
          radius: 50
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

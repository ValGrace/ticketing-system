import request from 'supertest';
import { createApp } from '../../index';
import { connectDatabase, database } from '../../config/database';
import { SearchService } from '../../services/SearchService';
import { TicketListingRepository } from '../../models/TicketListingRepository';
import { UserRepository } from '../../models/UserRepository';
import { CreateListingInput, CreateUserInput } from '../../types';

// Mock Elasticsearch for integration tests
jest.mock('../../services/SearchService');

const mockSearchService = {
  search: jest.fn(),
  searchNearby: jest.fn(),
  getSuggestions: jest.fn(),
  healthCheck: jest.fn(),
  initializeIndex: jest.fn(),
  indexListing: jest.fn(),
  updateListing: jest.fn(),
  removeListing: jest.fn(),
};

// Mock the SearchService constructor to return our mock
(SearchService as jest.MockedClass<typeof SearchService>).mockImplementation(() => mockSearchService as any);

describe('Search Integration Tests', () => {
  let app: any;
  let userRepository: UserRepository;
  let listingRepository: TicketListingRepository;
  let testUserId: string;
  let testListingId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
    userRepository = new UserRepository(database);
    listingRepository = new TicketListingRepository(database);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clean up test data
    await database.query('DELETE FROM ticket_listings WHERE seller_id LIKE $1', ['test-%']);
    await database.query('DELETE FROM users WHERE email LIKE $1', ['test-%']);

    // Create test user
    const testUser: CreateUserInput = {
      email: 'test-search@example.com',
      username: 'testsearchuser',
      firstName: 'Test',
      lastName: 'User',
      password: 'password123',
    };

    const user = await userRepository.create(testUser);
    testUserId = user.id;

    // Create test listing
    const testListing: CreateListingInput = {
      sellerId: testUserId,
      title: 'Test Concert Ticket',
      description: 'Amazing concert ticket for testing',
      category: 'concert',
      eventName: 'Test Concert',
      eventDate: new Date('2024-12-25'),
      eventTime: '20:00',
      venue: 'Test Venue',
      quantity: 2,
      originalPrice: 100,
      askingPrice: 80,
      location: {
        city: 'Test City',
        state: 'TS',
        country: 'Test Country',
        coordinates: [40.7505, -73.9934],
      },
    };

    const listing = await listingRepository.create(testListing);
    testListingId = listing.id;
  });

  afterAll(async () => {
    // Clean up test data
    await database.query('DELETE FROM ticket_listings WHERE seller_id LIKE $1', ['test-%']);
    await database.query('DELETE FROM users WHERE email LIKE $1', ['test-%']);
    await database.close();
  });

  describe('GET /api/search/listings', () => {
    it('should search listings successfully', async () => {
      const mockSearchResult = {
        listings: [
          {
            id: testListingId,
            sellerId: testUserId,
            title: 'Test Concert Ticket',
            description: 'Amazing concert ticket for testing',
            category: 'concert',
            eventName: 'Test Concert',
            eventDate: new Date('2024-12-25'),
            eventTime: '20:00',
            venue: 'Test Venue',
            quantity: 2,
            originalPrice: 100,
            askingPrice: 80,
            images: [],
            status: 'active',
            verificationStatus: 'pending',
            location: {
              city: 'Test City',
              state: 'TS',
              country: 'Test Country',
              coordinates: [40.7505, -73.9934],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        aggregations: {
          categories: [{ key: 'concert', count: 1 }],
          priceRanges: [{ key: '$50-$100', count: 1, from: 50, to: 100 }],
          locations: [{ key: 'Test City', count: 1 }],
        },
      };

      mockSearchService.search.mockResolvedValue(mockSearchResult);

      const response = await request(app)
        .get('/api/search/listings')
        .query({
          q: 'concert',
          category: 'concert',
          minPrice: 50,
          maxPrice: 150,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.listings).toHaveLength(1);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.aggregations).toBeDefined();

      expect(mockSearchService.search).toHaveBeenCalledWith({
        query: 'concert',
        category: 'concert',
        eventName: undefined,
        venue: undefined,
        city: undefined,
        state: undefined,
        country: undefined,
        minPrice: 50,
        maxPrice: 150,
        eventDateFrom: undefined,
        eventDateTo: undefined,
        status: undefined,
        verificationStatus: undefined,
        sortBy: 'relevance',
        limit: 20,
        offset: 0,
      });
    });

    it('should handle location-based search', async () => {
      const mockSearchResult = {
        listings: [],
        total: 0,
      };

      mockSearchService.search.mockResolvedValue(mockSearchResult);

      const response = await request(app)
        .get('/api/search/listings')
        .query({
          q: 'concert',
          latitude: 40.7505,
          longitude: -73.9934,
          radius: 25,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          location: {
            latitude: 40.7505,
            longitude: -73.9934,
            radius: 25,
          },
        })
      );
    });

    it('should handle search service errors', async () => {
      mockSearchService.search.mockRejectedValue(new Error('Search service unavailable'));

      const response = await request(app)
        .get('/api/search/listings')
        .query({ q: 'concert' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to search listings');
    });
  });

  describe('GET /api/search/nearby', () => {
    it('should search nearby listings successfully', async () => {
      const mockSearchResult = {
        listings: [
          {
            id: testListingId,
            sellerId: testUserId,
            title: 'Test Concert Ticket',
            description: 'Amazing concert ticket for testing',
            category: 'concert',
            eventName: 'Test Concert',
            eventDate: new Date('2024-12-25'),
            eventTime: '20:00',
            venue: 'Test Venue',
            quantity: 2,
            originalPrice: 100,
            askingPrice: 80,
            images: [],
            status: 'active',
            verificationStatus: 'pending',
            location: {
              city: 'Test City',
              state: 'TS',
              country: 'Test Country',
              coordinates: [40.7505, -73.9934],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
      };

      mockSearchService.searchNearby.mockResolvedValue(mockSearchResult);

      const response = await request(app)
        .get('/api/search/nearby')
        .query({
          latitude: 40.7505,
          longitude: -73.9934,
          radius: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.listings).toHaveLength(1);

      expect(mockSearchService.searchNearby).toHaveBeenCalledWith(
        40.7505,
        -73.9934,
        10,
        expect.objectContaining({
          sortBy: 'distance',
        })
      );
    });

    it('should return error for invalid coordinates', async () => {
      const response = await request(app)
        .get('/api/search/nearby')
        .query({
          latitude: 'invalid',
          longitude: -73.9934,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid coordinates');
    });

    it('should use default radius', async () => {
      const mockSearchResult = { listings: [], total: 0 };
      mockSearchService.searchNearby.mockResolvedValue(mockSearchResult);

      await request(app)
        .get('/api/search/nearby')
        .query({
          latitude: 40.7505,
          longitude: -73.9934,
        })
        .expect(200);

      expect(mockSearchService.searchNearby).toHaveBeenCalledWith(
        40.7505,
        -73.9934,
        50, // default radius
        expect.any(Object)
      );
    });
  });

  describe('GET /api/search/suggestions', () => {
    it('should get suggestions successfully', async () => {
      const mockSuggestions = [
        { text: 'Test Concert', type: 'event', count: 1.0 },
        { text: 'Test Venue', type: 'venue', count: 0.9 },
      ];

      mockSearchService.getSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.suggestions).toHaveLength(2);
      expect(response.body.data.suggestions[0].text).toBe('Test Concert');

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('test', 10);
    });

    it('should return error for short query', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'a' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid query');
    });

    it('should handle custom limit', async () => {
      const mockSuggestions = [
        { text: 'Test Concert', type: 'event', count: 1.0 },
      ];

      mockSearchService.getSuggestions.mockResolvedValue(mockSuggestions);

      await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'test', limit: 5 })
        .expect(200);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('test', 5);
    });
  });

  describe('GET /api/search/health', () => {
    it('should return healthy status', async () => {
      mockSearchService.healthCheck.mockResolvedValue(true);

      const response = await request(app)
        .get('/api/search/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should return unhealthy status', async () => {
      mockSearchService.healthCheck.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/search/health')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Search service unavailable');
      expect(response.body.data.status).toBe('unhealthy');
    });
  });

  describe('Rate limiting', () => {
    it('should apply rate limiting to search endpoints', async () => {
      mockSearchService.search.mockResolvedValue({ listings: [], total: 0 });

      // Make multiple requests quickly
      const requests = Array(65).fill(null).map(() =>
        request(app)
          .get('/api/search/listings')
          .query({ q: 'test' })
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should apply higher rate limit to suggestions endpoint', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([]);

      // Make multiple requests quickly
      const requests = Array(125).fill(null).map(() =>
        request(app)
          .get('/api/search/suggestions')
          .query({ q: 'test' })
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});
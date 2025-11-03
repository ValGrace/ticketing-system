import request from 'supertest';
import { createApp } from '../../index';

// Mock SearchService for integration tests
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
const { SearchService } = require('../../services/SearchService');
SearchService.mockImplementation(() => mockSearchService);

describe('Search API Integration Tests (Simple)', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/search/listings', () => {
    it('should return search results', async () => {
      const mockSearchResult = {
        listings: [
          {
            id: '1',
            sellerId: 'seller1',
            title: 'Test Concert Ticket',
            description: 'Amazing concert ticket',
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
            verificationStatus: 'verified',
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

      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'concert',
          category: 'concert',
          minPrice: 50,
          maxPrice: 150,
          sortBy: 'relevance',
          limit: 20,
          offset: 0,
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
            id: '1',
            sellerId: 'seller1',
            title: 'Test Concert Ticket',
            description: 'Amazing concert ticket',
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
            verificationStatus: 'verified',
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
});
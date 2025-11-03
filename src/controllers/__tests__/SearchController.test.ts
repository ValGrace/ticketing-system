import { Request, Response } from 'express';
import { SearchController } from '../SearchController';
import { SearchResult, SearchSuggestion } from '../../types';

// Mock SearchService
jest.mock('../../services/SearchService');

const mockSearchService = {
  search: jest.fn(),
  searchNearby: jest.fn(),
  getSuggestions: jest.fn(),
  healthCheck: jest.fn(),
  initializeIndex: jest.fn(),
};

const mockRequest = (query: any = {}) => ({
  query,
}) as Request;

const mockResponse = () => {
  const res = {} as Response;
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res;
};

const mockSearchResult: SearchResult = {
  listings: [
    {
      id: '1',
      sellerId: 'seller1',
      title: 'Concert Ticket',
      description: 'Great ticket',
      category: 'concert',
      eventName: 'Test Event',
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
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ],
  total: 1,
  aggregations: {
    categories: [{ key: 'concert', count: 1 }],
    priceRanges: [{ key: '$50-$100', count: 1, from: 50, to: 100 }],
    locations: [{ key: 'Test City', count: 1 }],
  },
};

const mockSuggestions: SearchSuggestion[] = [
  { text: 'The Beatles', type: 'event', count: 1.0 },
  { text: 'Madison Square Garden', type: 'venue', count: 0.9 },
];

describe('SearchController', () => {
  let searchController: SearchController;

  beforeEach(() => {
    jest.clearAllMocks();
    searchController = new SearchController(mockSearchService as any);
  });

  describe('searchListings', () => {
    it('should search listings successfully', async () => {
      const req = mockRequest({
        q: 'concert',
        category: 'concert',
        minPrice: '50',
        maxPrice: '150',
        limit: '10',
        offset: '0',
      });
      const res = mockResponse();

      mockSearchService.search.mockResolvedValue(mockSearchResult);

      await searchController.searchListings(req, res);

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
        limit: 10,
        offset: 0,
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSearchResult,
      });
    });

    it('should handle location-based search', async () => {
      const req = mockRequest({
        q: 'concert',
        latitude: '40.7505',
        longitude: '-73.9934',
        radius: '25',
      });
      const res = mockResponse();

      mockSearchService.search.mockResolvedValue(mockSearchResult);

      await searchController.searchListings(req, res);

      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'concert',
          location: {
            latitude: 40.7505,
            longitude: -73.9934,
            radius: 25,
          },
        })
      );
    });

    it('should handle search service error', async () => {
      const req = mockRequest({ q: 'concert' });
      const res = mockResponse();

      mockSearchService.search.mockRejectedValue(new Error('Search failed'));

      await searchController.searchListings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to search listings',
        message: 'Search failed',
      });
    });

    it('should use default values for optional parameters', async () => {
      const req = mockRequest({ q: 'concert' });
      const res = mockResponse();

      mockSearchService.search.mockResolvedValue(mockSearchResult);

      await searchController.searchListings(req, res);

      expect(mockSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'relevance',
          limit: 20,
          offset: 0,
        })
      );
    });
  });

  describe('searchNearby', () => {
    it('should search nearby listings successfully', async () => {
      const req = mockRequest({
        latitude: '40.7505',
        longitude: '-73.9934',
        radius: '10',
        q: 'concert',
      });
      const res = mockResponse();

      mockSearchService.searchNearby.mockResolvedValue(mockSearchResult);

      await searchController.searchNearby(req, res);

      expect(mockSearchService.searchNearby).toHaveBeenCalledWith(
        40.7505,
        -73.9934,
        10,
        expect.objectContaining({
          query: 'concert',
          sortBy: 'distance',
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSearchResult,
      });
    });

    it('should use default radius when not provided', async () => {
      const req = mockRequest({
        latitude: '40.7505',
        longitude: '-73.9934',
      });
      const res = mockResponse();

      mockSearchService.searchNearby.mockResolvedValue(mockSearchResult);

      await searchController.searchNearby(req, res);

      expect(mockSearchService.searchNearby).toHaveBeenCalledWith(
        40.7505,
        -73.9934,
        50, // default radius
        expect.any(Object)
      );
    });

    it('should return error for invalid coordinates', async () => {
      const req = mockRequest({
        latitude: 'invalid',
        longitude: '-73.9934',
      });
      const res = mockResponse();

      await searchController.searchNearby(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid coordinates',
        message: 'Latitude and longitude must be valid numbers',
      });
    });

    it('should handle search service error', async () => {
      const req = mockRequest({
        latitude: '40.7505',
        longitude: '-73.9934',
      });
      const res = mockResponse();

      mockSearchService.searchNearby.mockRejectedValue(new Error('Search failed'));

      await searchController.searchNearby(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to search nearby listings',
        message: 'Search failed',
      });
    });
  });

  describe('getSuggestions', () => {
    it('should get suggestions successfully', async () => {
      const req = mockRequest({
        q: 'the',
        limit: '5',
      });
      const res = mockResponse();

      mockSearchService.getSuggestions.mockResolvedValue(mockSuggestions);

      await searchController.getSuggestions(req, res);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('the', 5);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          suggestions: mockSuggestions,
        },
      });
    });

    it('should use default limit when not provided', async () => {
      const req = mockRequest({ q: 'the' });
      const res = mockResponse();

      mockSearchService.getSuggestions.mockResolvedValue(mockSuggestions);

      await searchController.getSuggestions(req, res);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('the', 10);
    });

    it('should return error for short query', async () => {
      const req = mockRequest({ q: 'a' });
      const res = mockResponse();

      await searchController.getSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid query',
        message: 'Query must be at least 2 characters long',
      });
    });

    it('should return error for empty query', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await searchController.getSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid query',
        message: 'Query must be at least 2 characters long',
      });
    });

    it('should handle search service error', async () => {
      const req = mockRequest({ q: 'the' });
      const res = mockResponse();

      mockSearchService.getSuggestions.mockRejectedValue(new Error('Suggestions failed'));

      await searchController.getSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get suggestions',
        message: 'Suggestions failed',
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const req = mockRequest();
      const res = mockResponse();

      mockSearchService.healthCheck.mockResolvedValue(true);

      await searchController.healthCheck(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
        },
      });
    });

    it('should return unhealthy status', async () => {
      const req = mockRequest();
      const res = mockResponse();

      mockSearchService.healthCheck.mockResolvedValue(false);

      await searchController.healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search service unavailable',
        data: {
          status: 'unhealthy',
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle health check error', async () => {
      const req = mockRequest();
      const res = mockResponse();

      mockSearchService.healthCheck.mockRejectedValue(new Error('Health check failed'));

      await searchController.healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Search service health check failed',
        message: 'Health check failed',
      });
    });
  });

  describe('initializeIndex', () => {
    it('should initialize index successfully', async () => {
      const req = mockRequest();
      const res = mockResponse();

      mockSearchService.initializeIndex.mockResolvedValue(undefined);

      await searchController.initializeIndex(req, res);

      expect(mockSearchService.initializeIndex).toHaveBeenCalled();

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Search index initialized successfully',
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle initialization error', async () => {
      const req = mockRequest();
      const res = mockResponse();

      mockSearchService.initializeIndex.mockRejectedValue(new Error('Initialization failed'));

      await searchController.initializeIndex(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to initialize search index',
        message: 'Initialization failed',
      });
    });
  });
});
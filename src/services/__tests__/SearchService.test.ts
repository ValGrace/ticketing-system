import { SearchService } from '../SearchService';
import { TicketListing, SearchFilters } from '../../types';

// Mock Elasticsearch client
jest.mock('@elastic/elasticsearch');

const mockElasticsearchClient = {
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
    refresh: jest.fn(),
  },
  index: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  search: jest.fn(),
  bulk: jest.fn(),
  ping: jest.fn(),
};

const mockListing: TicketListing = {
  id: '1',
  sellerId: 'seller1',
  title: 'Concert Ticket - The Beatles',
  description: 'Amazing concert ticket for The Beatles reunion tour',
  category: 'concert',
  eventName: 'The Beatles Reunion Tour',
  eventDate: new Date('2024-12-25'),
  eventTime: '20:00',
  venue: 'Madison Square Garden',
  seatSection: 'A',
  seatRow: '10',
  seatNumber: '15',
  quantity: 2,
  originalPrice: 150,
  askingPrice: 120,
  images: ['https://example.com/image1.jpg'],
  status: 'active',
  verificationStatus: 'verified',
  location: {
    city: 'New York',
    state: 'NY',
    country: 'USA',
    coordinates: [40.7505, -73.9934],
  },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('SearchService', () => {
  let searchService: SearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    searchService = new SearchService(mockElasticsearchClient as any, 'test_index');
  });

  describe('initializeIndex', () => {
    it('should create index if it does not exist', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(false);
      mockElasticsearchClient.indices.create.mockResolvedValue({});

      await searchService.initializeIndex();

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({
        index: 'test_index',
      });
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith({
        index: 'test_index',
        mappings: expect.any(Object),
        settings: expect.any(Object),
      });
    });

    it('should not create index if it already exists', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(true);

      await searchService.initializeIndex();

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({
        index: 'test_index',
      });
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('should throw error if index creation fails', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(false);
      mockElasticsearchClient.indices.create.mockRejectedValue(new Error('Creation failed'));

      await expect(searchService.initializeIndex()).rejects.toThrow('Creation failed');
    });
  });

  describe('indexListing', () => {
    it('should index a listing successfully', async () => {
      mockElasticsearchClient.index.mockResolvedValue({});
      mockElasticsearchClient.indices.refresh.mockResolvedValue({});

      await searchService.indexListing(mockListing);

      expect(mockElasticsearchClient.index).toHaveBeenCalledWith({
        index: 'test_index',
        id: mockListing.id,
        document: expect.objectContaining({
          id: mockListing.id,
          title: mockListing.title,
          eventName: mockListing.eventName,
          category: mockListing.category,
        }),
      });
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledWith({
        index: 'test_index',
      });
    });

    it('should throw error if indexing fails', async () => {
      mockElasticsearchClient.index.mockRejectedValue(new Error('Indexing failed'));

      await expect(searchService.indexListing(mockListing)).rejects.toThrow('Indexing failed');
    });
  });

  describe('updateListing', () => {
    it('should update a listing successfully', async () => {
      mockElasticsearchClient.update.mockResolvedValue({});

      await searchService.updateListing(mockListing);

      expect(mockElasticsearchClient.update).toHaveBeenCalledWith({
        index: 'test_index',
        id: mockListing.id,
        doc: expect.objectContaining({
          id: mockListing.id,
          title: mockListing.title,
        }),
      });
    });

    it('should throw error if update fails', async () => {
      mockElasticsearchClient.update.mockRejectedValue(new Error('Update failed'));

      await expect(searchService.updateListing(mockListing)).rejects.toThrow('Update failed');
    });
  });

  describe('removeListing', () => {
    it('should remove a listing successfully', async () => {
      mockElasticsearchClient.delete.mockResolvedValue({});

      await searchService.removeListing('listing1');

      expect(mockElasticsearchClient.delete).toHaveBeenCalledWith({
        index: 'test_index',
        id: 'listing1',
      });
    });

    it('should throw error if removal fails', async () => {
      mockElasticsearchClient.delete.mockRejectedValue(new Error('Removal failed'));

      await expect(searchService.removeListing('listing1')).rejects.toThrow('Removal failed');
    });
  });

  describe('search', () => {
    const mockSearchResponse = {
      hits: {
        hits: [
          {
            _source: {
              id: '1',
              sellerId: 'seller1',
              title: 'Concert Ticket',
              description: 'Great ticket',
              category: 'concert',
              eventName: 'Test Event',
              eventDate: '2024-12-25T00:00:00.000Z',
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
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          },
        ],
        total: { value: 1 },
      },
      aggregations: {
        categories: {
          buckets: [{ key: 'concert', doc_count: 1 }],
        },
        price_ranges: {
          buckets: [{ key: '$50-$100', doc_count: 1, from: 50, to: 100 }],
        },
        locations: {
          buckets: [{ key: 'Test City', doc_count: 1 }],
        },
      },
    };

    it('should search listings with basic query', async () => {
      mockElasticsearchClient.search.mockResolvedValue(mockSearchResponse);

      const filters: SearchFilters = {
        query: 'concert',
        limit: 10,
        offset: 0,
      };

      const result = await searchService.search(filters);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'test_index',
        query: expect.any(Object),
        sort: expect.any(Array),
        aggs: expect.any(Object),
        from: 0,
        size: 10,
        _source: true,
      });

      expect(result.listings).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.aggregations).toBeDefined();
    });

    it('should search listings with category filter', async () => {
      mockElasticsearchClient.search.mockResolvedValue(mockSearchResponse);

      const filters: SearchFilters = {
        category: 'concert',
        limit: 20,
      };

      const result = await searchService.search(filters);

      expect(result.listings).toHaveLength(1);
      expect(result.listings[0]?.category).toBe('concert');
    });

    it('should search listings with price range filter', async () => {
      mockElasticsearchClient.search.mockResolvedValue(mockSearchResponse);

      const filters: SearchFilters = {
        minPrice: 50,
        maxPrice: 150,
      };

      const result = await searchService.search(filters);

      expect(result.listings).toHaveLength(1);
      expect(result.listings[0]?.askingPrice).toBeGreaterThanOrEqual(50);
      expect(result.listings[0]?.askingPrice).toBeLessThanOrEqual(150);
    });

    it('should throw error if search fails', async () => {
      mockElasticsearchClient.search.mockRejectedValue(new Error('Search failed'));

      const filters: SearchFilters = { query: 'test' };

      await expect(searchService.search(filters)).rejects.toThrow('Search failed');
    });
  });

  describe('getSuggestions', () => {
    const mockSuggestResponse = {
      suggest: {
        event_suggest: [
          {
            options: [
              { text: 'The Beatles', _score: 1.0 },
              { text: 'The Rolling Stones', _score: 0.8 },
            ],
          },
        ],
        venue_suggest: [
          {
            options: [
              { text: 'Madison Square Garden', _score: 0.9 },
            ],
          },
        ],
        location_suggest: [
          {
            options: [
              { text: 'New York', _score: 0.7 },
            ],
          },
        ],
      },
    };

    it('should get search suggestions', async () => {
      mockElasticsearchClient.search.mockResolvedValue(mockSuggestResponse);

      const suggestions = await searchService.getSuggestions('the', 5);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'test_index',
        suggest: expect.objectContaining({
          event_suggest: expect.any(Object),
          venue_suggest: expect.any(Object),
          location_suggest: expect.any(Object),
        }),
      });

      expect(suggestions).toHaveLength(4);
      expect(suggestions[0]?.text).toBe('The Beatles');
      expect(suggestions[0]?.type).toBe('event');
    });

    it('should throw error if suggestions fail', async () => {
      mockElasticsearchClient.search.mockRejectedValue(new Error('Suggestions failed'));

      await expect(searchService.getSuggestions('test')).rejects.toThrow('Suggestions failed');
    });
  });

  describe('searchNearby', () => {
    it('should search nearby listings', async () => {
      const mockNearbyResponse = {
        hits: {
          hits: [
            {
              _source: mockListing,
            },
          ],
          total: { value: 1 },
        },
      };

      mockElasticsearchClient.search.mockResolvedValue(mockNearbyResponse);

      const result = await searchService.searchNearby(40.7505, -73.9934, 10);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'test_index',
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({
                geo_distance: expect.objectContaining({
                  distance: '10km',
                  'location.coordinates': {
                    lat: 40.7505,
                    lon: -73.9934,
                  },
                }),
              }),
            ]),
          }),
        }),
        sort: expect.arrayContaining([
          expect.objectContaining({
            _geo_distance: expect.any(Object),
          }),
        ]),
        from: 0,
        size: 20,
        _source: true,
      });

      expect(result.listings).toHaveLength(1);
    });
  });

  describe('bulkIndexListings', () => {
    it('should bulk index multiple listings', async () => {
      mockElasticsearchClient.bulk.mockResolvedValue({});
      mockElasticsearchClient.indices.refresh.mockResolvedValue({});

      const listings = [mockListing];

      await searchService.bulkIndexListings(listings);

      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith({
        operations: expect.arrayContaining([
          { index: { _index: 'test_index', _id: mockListing.id } },
          expect.objectContaining({
            id: mockListing.id,
            title: mockListing.title,
          }),
        ]),
      });
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalled();
    });

    it('should handle empty listings array', async () => {
      await searchService.bulkIndexListings([]);

      expect(mockElasticsearchClient.bulk).not.toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true when Elasticsearch is healthy', async () => {
      mockElasticsearchClient.ping.mockResolvedValue({ statusCode: 200 });

      const isHealthy = await searchService.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockElasticsearchClient.ping).toHaveBeenCalled();
    });

    it('should return false when Elasticsearch is unhealthy', async () => {
      mockElasticsearchClient.ping.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await searchService.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });
});
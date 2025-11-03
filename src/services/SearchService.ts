import { Client } from '@elastic/elasticsearch';
import { 
  TicketListing, 
  SearchFilters, 
  SearchResult, 
  SearchSuggestion 
} from '../types';
import { 
  elasticsearchClient, 
  TICKET_LISTINGS_INDEX, 
  TICKET_LISTINGS_MAPPING 
} from '../config/elasticsearch';

export class SearchService {
  private client: Client;
  private indexName: string;

  constructor(client: Client = elasticsearchClient, indexName: string = TICKET_LISTINGS_INDEX) {
    this.client = client;
    this.indexName = indexName;
  }

  /**
   * Initialize the Elasticsearch index with proper mapping
   */
  async initializeIndex(): Promise<void> {
    try {
      const indexExists = await this.client.indices.exists({
        index: this.indexName,
      });

      if (!indexExists) {
        await this.client.indices.create({
          index: this.indexName,
          mappings: TICKET_LISTINGS_MAPPING,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                autocomplete: {
                  type: 'custom',
                  tokenizer: 'autocomplete',
                  filter: ['lowercase']
                },
                autocomplete_search: {
                  type: 'custom',
                  tokenizer: 'keyword',
                  filter: ['lowercase']
                }
              },
              tokenizer: {
                autocomplete: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 10,
                  token_chars: ['letter', 'digit']
                }
              }
            }
          },
        });
      }
    } catch (error) {
      console.error('Error initializing Elasticsearch index:', error);
      throw error;
    }
  }

  /**
   * Index a ticket listing in Elasticsearch
   */
  async indexListing(listing: TicketListing): Promise<void> {
    try {
      const document = this.prepareDocumentForIndexing(listing);
      
      await this.client.index({
        index: this.indexName,
        id: listing.id,
        document,
      });

      // Refresh index to make the document searchable immediately
      await this.client.indices.refresh({ index: this.indexName });
    } catch (error) {
      console.error('Error indexing listing:', error);
      throw error;
    }
  }

  /**
   * Update a ticket listing in Elasticsearch
   */
  async updateListing(listing: TicketListing): Promise<void> {
    try {
      const document = this.prepareDocumentForIndexing(listing);
      
      await this.client.update({
        index: this.indexName,
        id: listing.id,
        doc: document,
      });
    } catch (error) {
      console.error('Error updating listing:', error);
      throw error;
    }
  }

  /**
   * Remove a ticket listing from Elasticsearch
   */
  async removeListing(listingId: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.indexName,
        id: listingId,
      });
    } catch (error) {
      console.error('Error removing listing:', error);
      throw error;
    }
  }

  /**
   * Search for ticket listings with filters and sorting
   */
  async search(filters: SearchFilters): Promise<SearchResult> {
    try {
      const query = this.buildSearchQuery(filters);
      const sort = this.buildSortOptions(filters);
      const aggregations = this.buildAggregations();

      const response = await this.client.search({
        index: this.indexName,
        query,
        sort,
        aggs: aggregations,
        from: filters.offset || 0,
        size: filters.limit || 20,
        _source: true,
      });

      return this.formatSearchResponse(response);
    } catch (error) {
      console.error('Error searching listings:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(query: string, limit: number = 10): Promise<SearchSuggestion[]> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        suggest: {
          event_suggest: {
            prefix: query,
            completion: {
              field: 'eventName.suggest',
              size: limit,
            },
          },
          venue_suggest: {
            prefix: query,
            completion: {
              field: 'venue.suggest',
              size: limit,
            },
          },
          location_suggest: {
            prefix: query,
            completion: {
              field: 'location.city.suggest',
              size: limit,
            },
          },
        },
      });

      return this.formatSuggestions(response);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      throw error;
    }
  }

  /**
   * Search for listings near a specific location
   */
  async searchNearby(
    latitude: number, 
    longitude: number, 
    radius: number = 50, 
    filters: Omit<SearchFilters, 'location'> = {}
  ): Promise<SearchResult> {
    try {
      const baseQuery = this.buildSearchQuery(filters);
      
      const geoQuery = {
        bool: {
          must: [
            baseQuery,
            {
              geo_distance: {
                distance: `${radius}km`,
                'location.coordinates': {
                  lat: latitude,
                  lon: longitude,
                },
              },
            },
          ],
        },
      };

      const sort = [
        {
          _geo_distance: {
            'location.coordinates': {
              lat: latitude,
              lon: longitude,
            },
            order: 'asc',
            unit: 'km',
          },
        },
        ...this.buildSortOptions(filters),
      ];

      const response = await this.client.search({
        index: this.indexName,
        query: geoQuery,
        sort,
        from: filters.offset || 0,
        size: filters.limit || 20,
        _source: true,
      });

      return this.formatSearchResponse(response);
    } catch (error) {
      console.error('Error searching nearby listings:', error);
      throw error;
    }
  }

  /**
   * Prepare a listing document for indexing
   */
  private prepareDocumentForIndexing(listing: TicketListing): any {
    return {
      id: listing.id,
      sellerId: listing.sellerId,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      eventName: listing.eventName,
      eventDate: listing.eventDate,
      eventTime: listing.eventTime,
      venue: listing.venue,
      seatSection: listing.seatSection,
      seatRow: listing.seatRow,
      seatNumber: listing.seatNumber,
      quantity: listing.quantity,
      originalPrice: listing.originalPrice,
      askingPrice: listing.askingPrice,
      images: listing.images,
      status: listing.status,
      verificationStatus: listing.verificationStatus,
      location: {
        city: listing.location.city,
        state: listing.location.state,
        country: listing.location.country,
        coordinates: listing.location.coordinates ? {
          lat: listing.location.coordinates[0],
          lon: listing.location.coordinates[1],
        } : undefined,
      },
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      // Computed fields for ranking
      popularity: 0, // Will be updated based on views, favorites, etc.
      sellerRating: 0, // Will be populated from user data
      priceScore: this.calculatePriceScore(listing.askingPrice, listing.originalPrice),
    };
  }

  /**
   * Build Elasticsearch query based on filters
   */
  private buildSearchQuery(filters: SearchFilters): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Text search
    if (filters.query) {
      must.push({
        multi_match: {
          query: filters.query,
          fields: [
            'title^3',
            'eventName^2',
            'venue^2',
            'description',
            'location.city',
            'location.state',
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Category filter
    if (filters.category) {
      filter.push({ term: { category: filters.category } });
    }

    // Status filter (default to active)
    filter.push({ term: { status: filters.status || 'active' } });

    // Verification status filter
    if (filters.verificationStatus) {
      filter.push({ term: { verificationStatus: filters.verificationStatus } });
    }

    // Price range filters
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const priceRange: any = {};
      if (filters.minPrice !== undefined) priceRange.gte = filters.minPrice;
      if (filters.maxPrice !== undefined) priceRange.lte = filters.maxPrice;
      filter.push({ range: { askingPrice: priceRange } });
    }

    // Date range filters
    if (filters.eventDateFrom || filters.eventDateTo) {
      const dateRange: any = {};
      if (filters.eventDateFrom) dateRange.gte = filters.eventDateFrom;
      if (filters.eventDateTo) dateRange.lte = filters.eventDateTo;
      filter.push({ range: { eventDate: dateRange } });
    }

    // Location filters
    if (filters.city) {
      must.push({
        match: {
          'location.city': {
            query: filters.city,
            fuzziness: 'AUTO',
          },
        },
      });
    }

    if (filters.state) {
      filter.push({ term: { 'location.state.keyword': filters.state } });
    }

    if (filters.country) {
      filter.push({ term: { 'location.country.keyword': filters.country } });
    }

    // Event name filter
    if (filters.eventName) {
      must.push({
        match: {
          eventName: {
            query: filters.eventName,
            fuzziness: 'AUTO',
          },
        },
      });
    }

    // Venue filter
    if (filters.venue) {
      must.push({
        match: {
          venue: {
            query: filters.venue,
            fuzziness: 'AUTO',
          },
        },
      });
    }

    return {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    };
  }

  /**
   * Build sort options based on filters
   */
  private buildSortOptions(filters: SearchFilters): any[] {
    const sort: any[] = [];

    switch (filters.sortBy) {
      case 'price_asc':
        sort.push({ askingPrice: { order: 'asc' } });
        break;
      case 'price_desc':
        sort.push({ askingPrice: { order: 'desc' } });
        break;
      case 'date_asc':
        sort.push({ eventDate: { order: 'asc' } });
        break;
      case 'date_desc':
        sort.push({ eventDate: { order: 'desc' } });
        break;
      case 'relevance':
      default:
        // Elasticsearch default relevance scoring with custom boost
        sort.push({ _score: { order: 'desc' } });
        sort.push({ eventDate: { order: 'asc' } }); // Secondary sort by event date
        break;
    }

    // Always add creation date as final sort criteria for consistency
    sort.push({ createdAt: { order: 'desc' } });

    return sort;
  }

  /**
   * Build aggregations for faceted search
   */
  private buildAggregations(): any {
    return {
      categories: {
        terms: {
          field: 'category',
          size: 10,
        },
      },
      price_ranges: {
        range: {
          field: 'askingPrice',
          ranges: [
            { key: 'Under $50', to: 50 },
            { key: '$50-$100', from: 50, to: 100 },
            { key: '$100-$250', from: 100, to: 250 },
            { key: '$250-$500', from: 250, to: 500 },
            { key: 'Over $500', from: 500 },
          ],
        },
      },
      locations: {
        terms: {
          field: 'location.city.keyword',
          size: 20,
        },
      },
    };
  }

  /**
   * Format Elasticsearch search response
   */
  private formatSearchResponse(response: any): SearchResult {
    const hits = response.hits?.hits || [];
    const total = response.hits?.total?.value || 0;
    
    const listings: TicketListing[] = hits.map((hit: any) => {
      const source = hit._source;
      return {
        id: source.id,
        sellerId: source.sellerId,
        title: source.title,
        description: source.description,
        category: source.category,
        eventName: source.eventName,
        eventDate: new Date(source.eventDate),
        eventTime: source.eventTime,
        venue: source.venue,
        seatSection: source.seatSection,
        seatRow: source.seatRow,
        seatNumber: source.seatNumber,
        quantity: source.quantity,
        originalPrice: source.originalPrice,
        askingPrice: source.askingPrice,
        images: source.images,
        status: source.status,
        verificationStatus: source.verificationStatus,
        location: {
          city: source.location.city,
          state: source.location.state,
          country: source.location.country,
          coordinates: source.location.coordinates ? [
            source.location.coordinates.lat,
            source.location.coordinates.lon,
          ] : undefined,
        },
        createdAt: new Date(source.createdAt),
        updatedAt: new Date(source.updatedAt),
      };
    });

    const aggregations = response.aggregations ? {
      categories: response.aggregations.categories.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
      })),
      priceRanges: response.aggregations.price_ranges.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
        from: bucket.from,
        to: bucket.to,
      })),
      locations: response.aggregations.locations.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
      })),
    } : undefined;

    return {
      listings,
      total,
      ...(aggregations && { aggregations }),
    };
  }

  /**
   * Format search suggestions response
   */
  private formatSuggestions(response: any): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];
    const suggest = response.suggest || {};

    // Event suggestions
    if (suggest.event_suggest) {
      suggest.event_suggest[0]?.options?.forEach((option: any) => {
        suggestions.push({
          text: option.text,
          type: 'event',
          count: option._score,
        });
      });
    }

    // Venue suggestions
    if (suggest.venue_suggest) {
      suggest.venue_suggest[0]?.options?.forEach((option: any) => {
        suggestions.push({
          text: option.text,
          type: 'venue',
          count: option._score,
        });
      });
    }

    // Location suggestions
    if (suggest.location_suggest) {
      suggest.location_suggest[0]?.options?.forEach((option: any) => {
        suggestions.push({
          text: option.text,
          type: 'location',
          count: option._score,
        });
      });
    }

    // Remove duplicates and sort by relevance
    const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
      index === self.findIndex(s => s.text === suggestion.text)
    );

    return uniqueSuggestions.sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  /**
   * Calculate price score for ranking (lower is better for buyers)
   */
  private calculatePriceScore(askingPrice: number, originalPrice: number): number {
    if (originalPrice <= 0) return 0;
    const discount = (originalPrice - askingPrice) / originalPrice;
    return Math.max(0, discount); // Higher score for better deals
  }

  /**
   * Bulk index multiple listings
   */
  async bulkIndexListings(listings: TicketListing[]): Promise<void> {
    if (listings.length === 0) return;

    try {
      const body = listings.flatMap(listing => [
        { index: { _index: this.indexName, _id: listing.id } },
        this.prepareDocumentForIndexing(listing),
      ]);

      await this.client.bulk({ operations: body });
      await this.client.indices.refresh({ index: this.indexName });
    } catch (error) {
      console.error('Error bulk indexing listings:', error);
      throw error;
    }
  }

  /**
   * Health check for Elasticsearch connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('Elasticsearch health check failed:', error);
      return false;
    }
  }
}

export default SearchService;
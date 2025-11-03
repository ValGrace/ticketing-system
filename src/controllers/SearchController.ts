import { Request, Response } from 'express';
import { SearchService } from '../services/SearchService';
import { SearchFilters } from '../types';

export class SearchController {
  private searchService: SearchService;

  constructor(searchService: SearchService = new SearchService()) {
    this.searchService = searchService;
  }

  /**
   * Search for ticket listings
   * GET /api/search/listings
   */
  searchListings = async (req: Request, res: Response): Promise<void> => {
    try {
      const filters: SearchFilters = {
        sortBy: req.query['sortBy'] as any || 'relevance',
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0,
      };

      // Only add properties that have values
      if (req.query['q']) filters.query = req.query['q'] as string;
      if (req.query['category']) filters.category = req.query['category'] as any;
      if (req.query['eventName']) filters.eventName = req.query['eventName'] as string;
      if (req.query['venue']) filters.venue = req.query['venue'] as string;
      if (req.query['city']) filters.city = req.query['city'] as string;
      if (req.query['state']) filters.state = req.query['state'] as string;
      if (req.query['country']) filters.country = req.query['country'] as string;
      if (req.query['minPrice']) filters.minPrice = parseFloat(req.query['minPrice'] as string);
      if (req.query['maxPrice']) filters.maxPrice = parseFloat(req.query['maxPrice'] as string);
      if (req.query['eventDateFrom']) filters.eventDateFrom = new Date(req.query['eventDateFrom'] as string);
      if (req.query['eventDateTo']) filters.eventDateTo = new Date(req.query['eventDateTo'] as string);
      if (req.query['status']) filters.status = req.query['status'] as any;
      if (req.query['verificationStatus']) filters.verificationStatus = req.query['verificationStatus'] as any;

      // Handle location-based search
      if (req.query['latitude'] && req.query['longitude']) {
        filters.location = {
          latitude: parseFloat(req.query['latitude'] as string),
          longitude: parseFloat(req.query['longitude'] as string),
          radius: req.query['radius'] ? parseFloat(req.query['radius'] as string) : 50,
        };
      }

      const result = await this.searchService.search(filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error searching listings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search listings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Search for listings near a specific location
   * GET /api/search/nearby
   */
  searchNearby = async (req: Request, res: Response): Promise<void> => {
    try {
      const latitude = parseFloat(req.query['latitude'] as string);
      const longitude = parseFloat(req.query['longitude'] as string);
      const radius = req.query['radius'] ? parseFloat(req.query['radius'] as string) : 50;

      if (isNaN(latitude) || isNaN(longitude)) {
        res.status(400).json({
          success: false,
          error: 'Invalid coordinates',
          message: 'Latitude and longitude must be valid numbers',
        });
        return;
      }

      const filters: Omit<SearchFilters, 'location'> = {
        sortBy: req.query['sortBy'] as any || 'distance',
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0,
      };

      // Only add properties that have values
      if (req.query['q']) filters.query = req.query['q'] as string;
      if (req.query['category']) filters.category = req.query['category'] as any;
      if (req.query['eventName']) filters.eventName = req.query['eventName'] as string;
      if (req.query['venue']) filters.venue = req.query['venue'] as string;
      if (req.query['city']) filters.city = req.query['city'] as string;
      if (req.query['state']) filters.state = req.query['state'] as string;
      if (req.query['country']) filters.country = req.query['country'] as string;
      if (req.query['minPrice']) filters.minPrice = parseFloat(req.query['minPrice'] as string);
      if (req.query['maxPrice']) filters.maxPrice = parseFloat(req.query['maxPrice'] as string);
      if (req.query['eventDateFrom']) filters.eventDateFrom = new Date(req.query['eventDateFrom'] as string);
      if (req.query['eventDateTo']) filters.eventDateTo = new Date(req.query['eventDateTo'] as string);
      if (req.query['status']) filters.status = req.query['status'] as any;
      if (req.query['verificationStatus']) filters.verificationStatus = req.query['verificationStatus'] as any;

      const result = await this.searchService.searchNearby(latitude, longitude, radius, filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error searching nearby listings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search nearby listings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Get search suggestions for autocomplete
   * GET /api/search/suggestions
   */
  getSuggestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = req.query['q'] as string;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10;

      if (!query || query.trim().length < 2) {
        res.status(400).json({
          success: false,
          error: 'Invalid query',
          message: 'Query must be at least 2 characters long',
        });
        return;
      }

      const suggestions = await this.searchService.getSuggestions(query.trim(), limit);

      res.json({
        success: true,
        data: {
          suggestions,
        },
      });
    } catch (error) {
      console.error('Error getting suggestions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get suggestions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Health check for search service
   * GET /api/search/health
   */
  healthCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      const isHealthy = await this.searchService.healthCheck();

      if (isHealthy) {
        res.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.status(503).json({
          success: false,
          error: 'Search service unavailable',
          data: {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('Error checking search service health:', error);
      res.status(503).json({
        success: false,
        error: 'Search service health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Initialize search index
   * POST /api/search/initialize
   */
  initializeIndex = async (_req: Request, res: Response): Promise<void> => {
    try {
      await this.searchService.initializeIndex();

      res.json({
        success: true,
        data: {
          message: 'Search index initialized successfully',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error initializing search index:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initialize search index',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export default SearchController;
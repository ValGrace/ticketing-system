import { Request, Response } from 'express';
import { ListingService } from '../services/ListingService';
import { CreateListingInput, SearchFilters, TicketListing } from '../types';
import { validateImageFiles } from '../utils/fileUpload';

// Extend Request interface to include user information
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    username: string;
    role: 'user' | 'admin' | 'moderator';
  };
}

export class ListingController {
  constructor(private listingService: ListingService) {
    // Bind methods to preserve 'this' context
    this.createListing = this.createListing.bind(this);
    this.getListing = this.getListing.bind(this);
    this.updateListing = this.updateListing.bind(this);
    this.deleteListing = this.deleteListing.bind(this);
    this.uploadImages = this.uploadImages.bind(this);
    this.searchListings = this.searchListings.bind(this);
    this.getUserListings = this.getUserListings.bind(this);
    this.getListingsByCategory = this.getListingsByCategory.bind(this);
    this.markAsSold = this.markAsSold.bind(this);
    this.getNearbyListings = this.getNearbyListings.bind(this);
  }

  async createListing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const listingData: CreateListingInput = {
        ...req.body,
        sellerId: userId,
        eventDate: new Date(req.body.eventDate)
      };

      const listing = await this.listingService.createListing(listingData);

      res.status(201).json({
        success: true,
        data: listing,
        message: 'Listing created successfully'
      });
    } catch (error) {
      console.error('Error in createListing:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Event date must be in the future')) {
          res.status(400).json({
            error: {
              code: 'INVALID_EVENT_DATE',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }

        if (error.message.includes('required')) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create listing',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async getListing(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Listing ID is required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const listing = await this.listingService.getListingById(id);

      if (!listing) {
        res.status(404).json({
          error: {
            code: 'LISTING_NOT_FOUND',
            message: 'Listing not found',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: listing
      });
    } catch (error) {
      console.error('Error in getListing:', error);
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch listing',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async updateListing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Listing ID is required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const updates = req.body;
      const updatedListing = await this.listingService.updateListing(id, updates, userId);

      if (!updatedListing) {
        res.status(404).json({
          error: {
            code: 'LISTING_NOT_FOUND',
            message: 'Listing not found',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedListing,
        message: 'Listing updated successfully'
      });
    } catch (error) {
      console.error('Error in updateListing:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Unauthorized')) {
          res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }

        if (error.message.includes('Cannot update')) {
          res.status(400).json({
            error: {
              code: 'INVALID_OPERATION',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update listing',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async deleteListing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Listing ID is required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const deleted = await this.listingService.deleteListing(id, userId);

      if (!deleted) {
        res.status(404).json({
          error: {
            code: 'LISTING_NOT_FOUND',
            message: 'Listing not found',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Listing deleted successfully'
      });
    } catch (error) {
      console.error('Error in deleteListing:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Unauthorized')) {
          res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }

        if (error.message.includes('Cannot delete')) {
          res.status(400).json({
            error: {
              code: 'INVALID_OPERATION',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete listing',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async uploadImages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Listing ID is required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        res.status(400).json({
          error: {
            code: 'NO_FILES',
            message: 'No images provided',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      // Validate files
      const validation = validateImageFiles(files);
      if (!validation.isValid) {
        res.status(400).json({
          error: {
            code: 'INVALID_FILES',
            message: 'Invalid image files',
            details: validation.errors,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const imageUrls = await this.listingService.uploadListingImages(id, files, userId);

      res.status(200).json({
        success: true,
        data: {
          images: imageUrls
        },
        message: 'Images uploaded successfully'
      });
    } catch (error) {
      console.error('Error in uploadImages:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Unauthorized')) {
          res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }

        if (error.message.includes('not found')) {
          res.status(404).json({
            error: {
              code: 'LISTING_NOT_FOUND',
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to upload images',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async searchListings(req: Request, res: Response): Promise<void> {
    try {
      const filters: SearchFilters = {};
      
      if (req.query['category']) {
        filters.category = req.query['category'] as TicketListing['category'];
      }
      if (req.query['eventName']) {
        filters.eventName = req.query['eventName'] as string;
      }
      if (req.query['venue']) {
        filters.venue = req.query['venue'] as string;
      }
      if (req.query['city']) {
        filters.city = req.query['city'] as string;
      }
      if (req.query['state']) {
        filters.state = req.query['state'] as string;
      }
      if (req.query['country']) {
        filters.country = req.query['country'] as string;
      }
      if (req.query['minPrice']) {
        filters.minPrice = parseFloat(req.query['minPrice'] as string);
      }
      if (req.query['maxPrice']) {
        filters.maxPrice = parseFloat(req.query['maxPrice'] as string);
      }
      if (req.query['eventDateFrom']) {
        filters.eventDateFrom = new Date(req.query['eventDateFrom'] as string);
      }
      if (req.query['eventDateTo']) {
        filters.eventDateTo = new Date(req.query['eventDateTo'] as string);
      }
      if (req.query['status']) {
        filters.status = req.query['status'] as TicketListing['status'];
      }
      if (req.query['verificationStatus']) {
        filters.verificationStatus = req.query['verificationStatus'] as TicketListing['verificationStatus'];
      }



      const listings = await this.listingService.searchListings(filters);

      res.status(200).json({
        success: true,
        data: listings,
        count: listings.length
      });
    } catch (error) {
      console.error('Error in searchListings:', error);
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to search listings',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async getUserListings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const listings = await this.listingService.getListingsByUser(userId);

      res.status(200).json({
        success: true,
        data: listings,
        count: listings.length
      });
    } catch (error) {
      console.error('Error in getUserListings:', error);
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch user listings',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async getListingsByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;

      if (!category) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Category is required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const validCategories = ['concert', 'sports', 'theater', 'transportation', 'other'];
      if (!validCategories.includes(category)) {
        res.status(400).json({
          error: {
            code: 'INVALID_CATEGORY',
            message: 'Invalid category. Must be one of: ' + validCategories.join(', '),
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const listings = await this.listingService.getListingsByCategory(category as TicketListing['category']);

      res.status(200).json({
        success: true,
        data: listings,
        count: listings.length
      });
    } catch (error) {
      console.error('Error in getListingsByCategory:', error);
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch listings by category',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async markAsSold(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Listing ID is required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const updatedListing = await this.listingService.markListingAsSold(id, userId);

      if (!updatedListing) {
        res.status(404).json({
          error: {
            code: 'LISTING_NOT_FOUND',
            message: 'Listing not found',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedListing,
        message: 'Listing marked as sold'
      });
    } catch (error) {
      console.error('Error in markAsSold:', error);
      
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to mark listing as sold',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async getNearbyListings(req: Request, res: Response): Promise<void> {
    try {
      const { latitude, longitude } = req.query;
      const radiusKm = req.query['radius'] ? parseFloat(req.query['radius'] as string) : 50;

      if (!latitude || !longitude) {
        res.status(400).json({
          error: {
            code: 'MISSING_COORDINATES',
            message: 'Latitude and longitude are required',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);

      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Invalid latitude or longitude',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const listings = await this.listingService.getNearbyListings(lat, lng, radiusKm);

      res.status(200).json({
        success: true,
        data: listings,
        count: listings.length,
        searchRadius: radiusKm
      });
    } catch (error) {
      console.error('Error in getNearbyListings:', error);
      
      if (error instanceof Error && error.message.includes('Invalid')) {
        res.status(400).json({
          error: {
            code: 'INVALID_PARAMETERS',
            message: error.message,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch nearby listings',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}
import { Request, Response } from 'express';
import { ListingController } from '../ListingController';
import { ListingService } from '../../services/ListingService';
import { TicketListing, CreateListingInput } from '../../types';
import { validateImageFiles } from '../../utils/fileUpload';

// Mock the file upload utilities
jest.mock('../../utils/fileUpload');

const mockValidateImageFiles = validateImageFiles as jest.MockedFunction<typeof validateImageFiles>;

describe('ListingController', () => {
  let listingController: ListingController;
  let mockListingService: jest.Mocked<ListingService>;
  let mockRequest: Partial<Request> & { user?: any };
  let mockResponse: Partial<Response>;

  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);

  const mockListing: TicketListing = {
    id: 'listing-1',
    sellerId: 'user-1',
    title: 'Concert Tickets',
    description: 'Great seats for the concert',
    category: 'concert',
    eventName: 'Rock Concert',
    eventDate: futureDate,
    eventTime: '20:00',
    venue: 'Music Hall',
    quantity: 2,
    originalPrice: 100,
    askingPrice: 120,
    images: [],
    status: 'active',
    verificationStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    location: {
      city: 'New York',
      state: 'NY',
      country: 'USA'
    }
  };

  beforeEach(() => {
    mockListingService = {
      createListing: jest.fn(),
      getListingById: jest.fn(),
      updateListing: jest.fn(),
      deleteListing: jest.fn(),
      uploadListingImages: jest.fn(),
      searchListings: jest.fn(),
      getListingsByUser: jest.fn(),
      getListingsByCategory: jest.fn(),
      markListingAsSold: jest.fn(),
      getNearbyListings: jest.fn(),
      getListingsByStatus: jest.fn(),
      markListingAsExpired: jest.fn(),
      getExpiredListings: jest.fn(),
      updateVerificationStatus: jest.fn(),
    } as any;

    listingController = new ListingController(mockListingService);

    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: {
        userId: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      }
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('createListing', () => {
    it('should create listing successfully', async () => {
      const createInput: CreateListingInput = {
        sellerId: 'user-1',
        title: 'Concert Tickets',
        description: 'Great seats',
        category: 'concert',
        eventName: 'Rock Concert',
        eventDate: futureDate,
        eventTime: '20:00',
        venue: 'Music Hall',
        quantity: 2,
        originalPrice: 100,
        askingPrice: 120,
        location: {
          city: 'New York',
          state: 'NY',
          country: 'USA'
        }
      };

      mockRequest.body = {
        ...createInput,
        eventDate: futureDate.toISOString()
      };

      mockListingService.createListing.mockResolvedValue(mockListing);

      await listingController.createListing(mockRequest as any, mockResponse as Response);

      expect(mockListingService.createListing).toHaveBeenCalledWith({
        ...createInput,
        eventDate: futureDate
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockListing,
        message: 'Listing created successfully'
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await listingController.createListing(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          timestamp: expect.any(String)
        }
      });
    });

    it('should handle validation errors', async () => {
      mockRequest.body = { title: 'Test' };
      mockListingService.createListing.mockRejectedValue(new Error('Event date must be in the future'));

      await listingController.createListing(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_EVENT_DATE',
          message: 'Event date must be in the future',
          timestamp: expect.any(String)
        }
      });
    });

    it('should handle internal server errors', async () => {
      mockRequest.body = { title: 'Test' };
      mockListingService.createListing.mockRejectedValue(new Error('Database error'));

      await listingController.createListing(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create listing',
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('getListing', () => {
    it('should get listing successfully', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockListingService.getListingById.mockResolvedValue(mockListing);

      await listingController.getListing(mockRequest as Request, mockResponse as Response);

      expect(mockListingService.getListingById).toHaveBeenCalledWith('listing-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockListing
      });
    });

    it('should return 404 when listing not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockListingService.getListingById.mockResolvedValue(null);

      await listingController.getListing(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
          timestamp: expect.any(String)
        }
      });
    });

    it('should return 400 when ID is missing', async () => {
      mockRequest.params = {};

      await listingController.getListing(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'MISSING_PARAMETER',
          message: 'Listing ID is required',
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('updateListing', () => {
    it('should update listing successfully', async () => {
      const updates = { askingPrice: 150 };
      const updatedListing = { ...mockListing, askingPrice: 150 };

      mockRequest.params = { id: 'listing-1' };
      mockRequest.body = updates;
      mockListingService.updateListing.mockResolvedValue(updatedListing);

      await listingController.updateListing(mockRequest as any, mockResponse as Response);

      expect(mockListingService.updateListing).toHaveBeenCalledWith('listing-1', updates, 'user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: updatedListing,
        message: 'Listing updated successfully'
      });
    });

    it('should return 403 when user is not authorized', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockRequest.body = { title: 'New Title' };
      mockListingService.updateListing.mockRejectedValue(new Error('Unauthorized: You can only update your own listings'));

      await listingController.updateListing(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Unauthorized: You can only update your own listings',
          timestamp: expect.any(String)
        }
      });
    });

    it('should return 400 for invalid operations', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockRequest.body = { askingPrice: 200 };
      mockListingService.updateListing.mockRejectedValue(new Error('Cannot update price, quantity, or event details for sold listings'));

      await listingController.updateListing(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot update price, quantity, or event details for sold listings',
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('deleteListing', () => {
    it('should delete listing successfully', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockListingService.deleteListing.mockResolvedValue(true);

      await listingController.deleteListing(mockRequest as any, mockResponse as Response);

      expect(mockListingService.deleteListing).toHaveBeenCalledWith('listing-1', 'user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Listing deleted successfully'
      });
    });

    it('should return 403 when user is not authorized', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockListingService.deleteListing.mockRejectedValue(new Error('Unauthorized: You can only delete your own listings'));

      await listingController.deleteListing(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('uploadImages', () => {
    const mockFiles = [
      { originalname: 'image1.jpg', buffer: Buffer.from('image1') },
      { originalname: 'image2.jpg', buffer: Buffer.from('image2') }
    ] as Express.Multer.File[];

    it('should upload images successfully', async () => {
      const imageUrls = ['https://s3.amazonaws.com/bucket/image1.jpg', 'https://s3.amazonaws.com/bucket/image2.jpg'];

      mockRequest.params = { id: 'listing-1' };
      mockRequest.files = mockFiles;
      mockValidateImageFiles.mockReturnValue({ isValid: true, errors: [] });
      mockListingService.uploadListingImages.mockResolvedValue(imageUrls);

      await listingController.uploadImages(mockRequest as any, mockResponse as Response);

      expect(mockListingService.uploadListingImages).toHaveBeenCalledWith('listing-1', mockFiles, 'user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { images: imageUrls },
        message: 'Images uploaded successfully'
      });
    });

    it('should return 400 when no files provided', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockRequest.files = [];

      await listingController.uploadImages(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'NO_FILES',
          message: 'No images provided',
          timestamp: expect.any(String)
        }
      });
    });

    it('should return 400 when files are invalid', async () => {
      mockRequest.params = { id: 'listing-1' };
      mockRequest.files = mockFiles;
      mockValidateImageFiles.mockReturnValue({ 
        isValid: false, 
        errors: ['File 1: Invalid file type'] 
      });

      await listingController.uploadImages(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_FILES',
          message: 'Invalid image files',
          details: ['File 1: Invalid file type'],
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('searchListings', () => {
    it('should search listings successfully', async () => {
      const searchResults = [mockListing];
      mockRequest.query = {
        category: 'concert',
        city: 'New York',
        minPrice: '50',
        maxPrice: '200'
      };

      mockListingService.searchListings.mockResolvedValue(searchResults);

      await listingController.searchListings(mockRequest as Request, mockResponse as Response);

      expect(mockListingService.searchListings).toHaveBeenCalledWith({
        category: 'concert',
        city: 'New York',
        minPrice: 50,
        maxPrice: 200
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: searchResults,
        count: 1
      });
    });

    it('should handle search errors', async () => {
      mockListingService.searchListings.mockRejectedValue(new Error('Database error'));

      await listingController.searchListings(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to search listings',
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('getUserListings', () => {
    it('should get user listings successfully', async () => {
      const userListings = [mockListing];
      mockListingService.getListingsByUser.mockResolvedValue(userListings);

      await listingController.getUserListings(mockRequest as any, mockResponse as Response);

      expect(mockListingService.getListingsByUser).toHaveBeenCalledWith('user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: userListings,
        count: 1
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await listingController.getUserListings(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getListingsByCategory', () => {
    it('should get listings by category successfully', async () => {
      const categoryListings = [mockListing];
      mockRequest.params = { category: 'concert' };
      mockListingService.getListingsByCategory.mockResolvedValue(categoryListings);

      await listingController.getListingsByCategory(mockRequest as Request, mockResponse as Response);

      expect(mockListingService.getListingsByCategory).toHaveBeenCalledWith('concert');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: categoryListings,
        count: 1
      });
    });

    it('should return 400 for invalid category', async () => {
      mockRequest.params = { category: 'invalid' };

      await listingController.getListingsByCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_CATEGORY',
          message: 'Invalid category. Must be one of: concert, sports, theater, transportation, other',
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('markAsSold', () => {
    it('should mark listing as sold successfully', async () => {
      const soldListing = { ...mockListing, status: 'sold' as const };
      mockRequest.params = { id: 'listing-1' };
      mockListingService.markListingAsSold.mockResolvedValue(soldListing);

      await listingController.markAsSold(mockRequest as any, mockResponse as Response);

      expect(mockListingService.markListingAsSold).toHaveBeenCalledWith('listing-1', 'user-1');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: soldListing,
        message: 'Listing marked as sold'
      });
    });
  });

  describe('getNearbyListings', () => {
    it('should get nearby listings successfully', async () => {
      const nearbyListings = [mockListing];
      mockRequest.query = {
        latitude: '40.7128',
        longitude: '-74.0060',
        radius: '25'
      };
      mockListingService.getNearbyListings.mockResolvedValue(nearbyListings);

      await listingController.getNearbyListings(mockRequest as Request, mockResponse as Response);

      expect(mockListingService.getNearbyListings).toHaveBeenCalledWith(40.7128, -74.0060, 25);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: nearbyListings,
        count: 1,
        searchRadius: 25
      });
    });

    it('should return 400 when coordinates are missing', async () => {
      mockRequest.query = {};

      await listingController.getNearbyListings(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'MISSING_COORDINATES',
          message: 'Latitude and longitude are required',
          timestamp: expect.any(String)
        }
      });
    });

    it('should return 400 when coordinates are invalid', async () => {
      mockRequest.query = {
        latitude: 'invalid',
        longitude: '-74.0060'
      };

      await listingController.getNearbyListings(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_COORDINATES',
          message: 'Invalid latitude or longitude',
          timestamp: expect.any(String)
        }
      });
    });
  });
});
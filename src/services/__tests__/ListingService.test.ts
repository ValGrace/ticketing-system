import { ListingService } from '../ListingService';
import { TicketListingRepository } from '../../models/TicketListingRepository';
import { TicketListing, CreateListingInput, SearchFilters } from '../../types';
import { uploadFilesToS3, deleteFilesFromS3, extractS3KeyFromUrl } from '../../utils/fileUpload';

// Mock the file upload utilities
jest.mock('../../utils/fileUpload');

const mockUploadFilesToS3 = uploadFilesToS3 as jest.MockedFunction<typeof uploadFilesToS3>;
const mockDeleteFilesFromS3 = deleteFilesFromS3 as jest.MockedFunction<typeof deleteFilesFromS3>;
const mockExtractS3KeyFromUrl = extractS3KeyFromUrl as jest.MockedFunction<typeof extractS3KeyFromUrl>;

describe('ListingService', () => {
  let listingService: ListingService;
  let mockListingRepository: jest.Mocked<TicketListingRepository>;

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

  const mockCreateInput: CreateListingInput = {
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
    location: {
      city: 'New York',
      state: 'NY',
      country: 'USA'
    }
  };

  beforeEach(() => {
    mockListingRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySellerId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      search: jest.fn(),
      findByCategory: jest.fn(),
      findByStatus: jest.fn(),
      updateImages: jest.fn(),
      markAsExpired: jest.fn(),
      findExpiredListings: jest.fn(),
      updateVerificationStatus: jest.fn(),
      findNearby: jest.fn(),
      findAll: jest.fn(),
    } as any;

    listingService = new ListingService(mockListingRepository);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('createListing', () => {
    it('should create a listing successfully', async () => {
      mockListingRepository.create.mockResolvedValue(mockListing);

      const result = await listingService.createListing(mockCreateInput);

      expect(mockListingRepository.create).toHaveBeenCalledWith(mockCreateInput);
      expect(result).toEqual(mockListing);
    });

    it('should throw error for past event date', async () => {
      const pastInput = {
        ...mockCreateInput,
        eventDate: new Date('2020-01-01')
      };

      await expect(listingService.createListing(pastInput)).rejects.toThrow('Event date must be in the future');
      expect(mockListingRepository.create).not.toHaveBeenCalled();
    });

    it('should handle repository errors', async () => {
      // Use a valid future date but mock repository to fail
      const validInput = { ...mockCreateInput };
      mockListingRepository.create.mockRejectedValue(new Error('Database error'));

      await expect(listingService.createListing(validInput)).rejects.toThrow('Database error');
    });
  });

  describe('getListingById', () => {
    it('should return listing when found', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      const result = await listingService.getListingById('listing-1');

      expect(mockListingRepository.findById).toHaveBeenCalledWith('listing-1');
      expect(result).toEqual(mockListing);
    });

    it('should return null when listing not found', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      const result = await listingService.getListingById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle repository errors', async () => {
      mockListingRepository.findById.mockRejectedValue(new Error('Database error'));

      await expect(listingService.getListingById('listing-1')).rejects.toThrow('Failed to fetch listing');
    });
  });

  describe('updateListing', () => {
    it('should update listing successfully', async () => {
      const updates = { askingPrice: 150 };
      const updatedListing = { ...mockListing, askingPrice: 150 };

      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockListingRepository.update.mockResolvedValue(updatedListing);

      const result = await listingService.updateListing('listing-1', updates, 'user-1');

      expect(mockListingRepository.findById).toHaveBeenCalledWith('listing-1');
      expect(mockListingRepository.update).toHaveBeenCalledWith('listing-1', updates);
      expect(result).toEqual(updatedListing);
    });

    it('should throw error when listing not found', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      await expect(listingService.updateListing('listing-1', {}, 'user-1')).rejects.toThrow('Listing not found');
    });

    it('should throw error when user is not the seller', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      await expect(listingService.updateListing('listing-1', {}, 'user-2')).rejects.toThrow('Unauthorized');
    });

    it('should prevent updating sold listings', async () => {
      const soldListing = { ...mockListing, status: 'sold' as const };
      mockListingRepository.findById.mockResolvedValue(soldListing);

      await expect(
        listingService.updateListing('listing-1', { askingPrice: 200 }, 'user-1')
      ).rejects.toThrow('Cannot update price, quantity, or event details for sold listings');
    });

    it('should prevent updating expired listings', async () => {
      const expiredListing = { ...mockListing, status: 'expired' as const };
      mockListingRepository.findById.mockResolvedValue(expiredListing);

      await expect(
        listingService.updateListing('listing-1', { title: 'New Title' }, 'user-1')
      ).rejects.toThrow('Cannot update expired listings');
    });
  });

  describe('deleteListing', () => {
    it('should delete listing successfully', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockListingRepository.delete.mockResolvedValue(true);

      const result = await listingService.deleteListing('listing-1', 'user-1');

      expect(mockListingRepository.findById).toHaveBeenCalledWith('listing-1');
      expect(mockListingRepository.delete).toHaveBeenCalledWith('listing-1');
      expect(result).toBe(true);
    });

    it('should delete associated images', async () => {
      const listingWithImages = {
        ...mockListing,
        images: ['https://s3.amazonaws.com/bucket/image1.jpg', 'https://s3.amazonaws.com/bucket/image2.jpg']
      };

      mockListingRepository.findById.mockResolvedValue(listingWithImages);
      mockListingRepository.delete.mockResolvedValue(true);
      mockExtractS3KeyFromUrl.mockReturnValue('image1.jpg');
      mockDeleteFilesFromS3.mockResolvedValue([true, true]);

      const result = await listingService.deleteListing('listing-1', 'user-1');

      expect(mockDeleteFilesFromS3).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should throw error when listing not found', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      await expect(listingService.deleteListing('listing-1', 'user-1')).rejects.toThrow('Listing not found');
    });

    it('should throw error when user is not the seller', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      await expect(listingService.deleteListing('listing-1', 'user-2')).rejects.toThrow('Unauthorized');
    });

    it('should prevent deleting sold listings', async () => {
      const soldListing = { ...mockListing, status: 'sold' as const };
      mockListingRepository.findById.mockResolvedValue(soldListing);

      await expect(listingService.deleteListing('listing-1', 'user-1')).rejects.toThrow('Cannot delete sold listings');
    });
  });

  describe('uploadListingImages', () => {
    const mockFiles = [
      { originalname: 'image1.jpg', buffer: Buffer.from('image1') },
      { originalname: 'image2.jpg', buffer: Buffer.from('image2') }
    ] as Express.Multer.File[];

    it('should upload images successfully', async () => {
      const uploadResults = [
        { url: 'https://s3.amazonaws.com/bucket/image1.jpg', key: 'listings/listing-1/image1.jpg', originalName: 'image1.jpg', size: 1024 },
        { url: 'https://s3.amazonaws.com/bucket/image2.jpg', key: 'listings/listing-1/image2.jpg', originalName: 'image2.jpg', size: 2048 }
      ];

      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockUploadFilesToS3.mockResolvedValue(uploadResults);
      mockListingRepository.updateImages.mockResolvedValue(true);

      const result = await listingService.uploadListingImages('listing-1', mockFiles, 'user-1');

      expect(mockListingRepository.findById).toHaveBeenCalledWith('listing-1');
      expect(mockUploadFilesToS3).toHaveBeenCalledWith(mockFiles, 'listings/listing-1');
      expect(mockListingRepository.updateImages).toHaveBeenCalledWith('listing-1', [
        'https://s3.amazonaws.com/bucket/image1.jpg',
        'https://s3.amazonaws.com/bucket/image2.jpg'
      ]);
      expect(result).toEqual([
        'https://s3.amazonaws.com/bucket/image1.jpg',
        'https://s3.amazonaws.com/bucket/image2.jpg'
      ]);
    });

    it('should throw error when listing not found', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      await expect(
        listingService.uploadListingImages('listing-1', mockFiles, 'user-1')
      ).rejects.toThrow('Listing not found');
    });

    it('should throw error when user is not the seller', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      await expect(
        listingService.uploadListingImages('listing-1', mockFiles, 'user-2')
      ).rejects.toThrow('Unauthorized');
    });

    it('should clean up uploaded files if database update fails', async () => {
      const uploadResults = [
        { url: 'https://s3.amazonaws.com/bucket/image1.jpg', key: 'listings/listing-1/image1.jpg', originalName: 'image1.jpg', size: 1024 }
      ];

      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockUploadFilesToS3.mockResolvedValue(uploadResults);
      mockListingRepository.updateImages.mockResolvedValue(false);
      mockDeleteFilesFromS3.mockResolvedValue([true]);

      await expect(
        listingService.uploadListingImages('listing-1', mockFiles, 'user-1')
      ).rejects.toThrow('Failed to update listing with image URLs');

      expect(mockDeleteFilesFromS3).toHaveBeenCalledWith(['listings/listing-1/image1.jpg']);
    });
  });

  describe('searchListings', () => {
    it('should search listings successfully', async () => {
      const filters: SearchFilters = { category: 'concert', city: 'New York' };
      const searchResults = [mockListing];

      mockListingRepository.search.mockResolvedValue(searchResults);

      const result = await listingService.searchListings(filters);

      expect(mockListingRepository.search).toHaveBeenCalledWith(filters);
      expect(result).toEqual(searchResults);
    });

    it('should handle repository errors', async () => {
      mockListingRepository.search.mockRejectedValue(new Error('Database error'));

      await expect(listingService.searchListings({})).rejects.toThrow('Failed to search listings');
    });
  });

  describe('markListingAsSold', () => {
    it('should mark listing as sold successfully', async () => {
      const soldListing = { ...mockListing, status: 'sold' as const };

      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockListingRepository.update.mockResolvedValue(soldListing);

      const result = await listingService.markListingAsSold('listing-1', 'user-1');

      expect(result).toEqual(soldListing);
    });
  });

  describe('markListingAsExpired', () => {
    it('should mark listing as expired when event date has passed', async () => {
      const pastListing = { ...mockListing, eventDate: new Date('2020-01-01') };

      mockListingRepository.findById.mockResolvedValue(pastListing);
      mockListingRepository.markAsExpired.mockResolvedValue(true);

      const result = await listingService.markListingAsExpired('listing-1');

      expect(mockListingRepository.markAsExpired).toHaveBeenCalledWith('listing-1');
      expect(result).toBe(true);
    });

    it('should not mark listing as expired when event date is in future', async () => {
      const futureListing = { ...mockListing, eventDate: new Date('2025-12-31') };

      mockListingRepository.findById.mockResolvedValue(futureListing);

      const result = await listingService.markListingAsExpired('listing-1');

      expect(mockListingRepository.markAsExpired).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return false when listing not found', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      const result = await listingService.markListingAsExpired('listing-1');

      expect(result).toBe(false);
    });
  });

  describe('getNearbyListings', () => {
    it('should get nearby listings successfully', async () => {
      const nearbyListings = [mockListing];

      mockListingRepository.findNearby.mockResolvedValue(nearbyListings);

      const result = await listingService.getNearbyListings(40.7128, -74.0060, 25);

      expect(mockListingRepository.findNearby).toHaveBeenCalledWith(40.7128, -74.0060, 25);
      expect(result).toEqual(nearbyListings);
    });

    it('should validate coordinates', async () => {
      await expect(listingService.getNearbyListings(91, -74.0060)).rejects.toThrow('Invalid latitude');
      await expect(listingService.getNearbyListings(40.7128, 181)).rejects.toThrow('Invalid longitude');
      await expect(listingService.getNearbyListings(40.7128, -74.0060, 0)).rejects.toThrow('Invalid radius');
      await expect(listingService.getNearbyListings(40.7128, -74.0060, 1001)).rejects.toThrow('Invalid radius');
    });
  });

  describe('getListingsByUser', () => {
    it('should get user listings successfully', async () => {
      const userListings = [mockListing];

      mockListingRepository.findBySellerId.mockResolvedValue(userListings);

      const result = await listingService.getListingsByUser('user-1');

      expect(mockListingRepository.findBySellerId).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(userListings);
    });
  });

  describe('getListingsByCategory', () => {
    it('should get listings by category successfully', async () => {
      const categoryListings = [mockListing];

      mockListingRepository.findByCategory.mockResolvedValue(categoryListings);

      const result = await listingService.getListingsByCategory('concert');

      expect(mockListingRepository.findByCategory).toHaveBeenCalledWith('concert');
      expect(result).toEqual(categoryListings);
    });
  });

  describe('updateVerificationStatus', () => {
    it('should update verification status successfully', async () => {
      mockListingRepository.updateVerificationStatus.mockResolvedValue(true);

      const result = await listingService.updateVerificationStatus('listing-1', 'verified');

      expect(mockListingRepository.updateVerificationStatus).toHaveBeenCalledWith('listing-1', 'verified');
      expect(result).toBe(true);
    });

    it('should handle repository errors', async () => {
      mockListingRepository.updateVerificationStatus.mockRejectedValue(new Error('Database error'));

      await expect(
        listingService.updateVerificationStatus('listing-1', 'verified')
      ).rejects.toThrow('Failed to update verification status');
    });
  });
});
import { 
  TicketListing, 
  CreateListingInput, 
  SearchFilters,
  TicketListingRepository as ITicketListingRepository
} from '../types';
import { UploadResult, uploadFilesToS3, deleteFilesFromS3, extractS3KeyFromUrl } from '../utils/fileUpload';
import { SearchService } from './SearchService';

export class ListingService {
  private searchService: SearchService;

  constructor(
    private listingRepository: ITicketListingRepository,
    searchService?: SearchService
  ) {
    this.searchService = searchService || new SearchService();
  }

  async createListing(input: CreateListingInput): Promise<TicketListing> {
    try {
      // Validate that event date is in the future
      if (input.eventDate <= new Date()) {
        throw new Error('Event date must be in the future');
      }

      // Create the listing
      const listing = await this.listingRepository.create(input);

      // Index the listing in Elasticsearch
      try {
        await this.searchService.indexListing(listing);
      } catch (searchError) {
        console.error('Error indexing listing in search:', searchError);
        // Don't fail the entire operation if search indexing fails
      }

      return listing;
    } catch (error) {
      console.error('Error creating listing:', error);
      throw error;
    }
  }

  async getListingById(id: string): Promise<TicketListing | null> {
    try {
      return await this.listingRepository.findById(id);
    } catch (error) {
      console.error('Error fetching listing:', error);
      throw new Error('Failed to fetch listing');
    }
  }

  async getListingsByUser(userId: string): Promise<TicketListing[]> {
    try {
      return await this.listingRepository.findBySellerId(userId);
    } catch (error) {
      console.error('Error fetching user listings:', error);
      throw new Error('Failed to fetch user listings');
    }
  }

  async updateListing(
    id: string, 
    updates: Partial<TicketListing>, 
    userId: string
  ): Promise<TicketListing | null> {
    try {
      // First, verify the listing exists and belongs to the user
      const existingListing = await this.listingRepository.findById(id);
      
      if (!existingListing) {
        throw new Error('Listing not found');
      }

      if (existingListing.sellerId !== userId) {
        throw new Error('Unauthorized: You can only update your own listings');
      }

      // Prevent updating certain fields if listing is sold
      if (existingListing.status === 'sold') {
        const restrictedFields = ['askingPrice', 'quantity', 'eventDate', 'eventTime'];
        const hasRestrictedUpdates = restrictedFields.some(field => 
          updates.hasOwnProperty(field as keyof TicketListing)
        );
        
        if (hasRestrictedUpdates) {
          throw new Error('Cannot update price, quantity, or event details for sold listings');
        }
      }

      // Prevent updating expired listings
      if (existingListing.status === 'expired') {
        throw new Error('Cannot update expired listings');
      }

      // Update the listing
      const updatedListing = await this.listingRepository.update(id, updates);
      
      if (!updatedListing) {
        throw new Error('Failed to update listing');
      }

      // Update the listing in Elasticsearch
      try {
        await this.searchService.updateListing(updatedListing);
      } catch (searchError) {
        console.error('Error updating listing in search:', searchError);
        // Don't fail the entire operation if search update fails
      }

      return updatedListing;
    } catch (error) {
      console.error('Error updating listing:', error);
      throw error;
    }
  }

  async deleteListing(id: string, userId: string): Promise<boolean> {
    try {
      // First, verify the listing exists and belongs to the user
      const existingListing = await this.listingRepository.findById(id);
      
      if (!existingListing) {
        throw new Error('Listing not found');
      }

      if (existingListing.sellerId !== userId) {
        throw new Error('Unauthorized: You can only delete your own listings');
      }

      // Prevent deleting sold listings
      if (existingListing.status === 'sold') {
        throw new Error('Cannot delete sold listings');
      }

      // Delete associated images from S3
      if (existingListing.images && existingListing.images.length > 0) {
        const imageKeys = existingListing.images
          .map(url => extractS3KeyFromUrl(url))
          .filter(key => key !== null) as string[];
        
        if (imageKeys.length > 0) {
          await deleteFilesFromS3(imageKeys);
        }
      }

      // Delete the listing
      const deleted = await this.listingRepository.delete(id);
      
      if (!deleted) {
        throw new Error('Failed to delete listing');
      }

      // Remove the listing from Elasticsearch
      try {
        await this.searchService.removeListing(id);
      } catch (searchError) {
        console.error('Error removing listing from search:', searchError);
        // Don't fail the entire operation if search removal fails
      }

      return true;
    } catch (error) {
      console.error('Error deleting listing:', error);
      throw error;
    }
  }

  async uploadListingImages(
    listingId: string, 
    files: Express.Multer.File[], 
    userId: string
  ): Promise<string[]> {
    try {
      // Verify the listing exists and belongs to the user
      const existingListing = await this.listingRepository.findById(listingId);
      
      if (!existingListing) {
        throw new Error('Listing not found');
      }

      if (existingListing.sellerId !== userId) {
        throw new Error('Unauthorized: You can only upload images to your own listings');
      }

      // Upload files to S3
      const uploadResults: UploadResult[] = await uploadFilesToS3(files, `listings/${listingId}`);
      const imageUrls = uploadResults.map(result => result.url);

      // Update listing with new image URLs
      const success = await this.listingRepository.updateImages(listingId, imageUrls);
      
      if (!success) {
        // If database update fails, clean up uploaded files
        const imageKeys = uploadResults.map(result => result.key);
        await deleteFilesFromS3(imageKeys);
        throw new Error('Failed to update listing with image URLs');
      }

      return imageUrls;
    } catch (error) {
      console.error('Error uploading listing images:', error);
      throw error;
    }
  }

  async searchListings(filters: SearchFilters): Promise<TicketListing[]> {
    try {
      return await this.listingRepository.search(filters);
    } catch (error) {
      console.error('Error searching listings:', error);
      throw new Error('Failed to search listings');
    }
  }

  async getListingsByCategory(category: TicketListing['category']): Promise<TicketListing[]> {
    try {
      return await this.listingRepository.findByCategory(category);
    } catch (error) {
      console.error('Error fetching listings by category:', error);
      throw new Error('Failed to fetch listings by category');
    }
  }

  async getListingsByStatus(status: TicketListing['status']): Promise<TicketListing[]> {
    try {
      return await this.listingRepository.findByStatus(status);
    } catch (error) {
      console.error('Error fetching listings by status:', error);
      throw new Error('Failed to fetch listings by status');
    }
  }

  async markListingAsSold(id: string, userId: string): Promise<TicketListing | null> {
    try {
      return await this.updateListing(id, { status: 'sold' }, userId);
    } catch (error) {
      console.error('Error marking listing as sold:', error);
      throw error;
    }
  }

  async markListingAsExpired(id: string): Promise<boolean> {
    try {
      // This method is typically called by a background job
      const listing = await this.listingRepository.findById(id);
      
      if (!listing) {
        return false;
      }

      // Check if event date has passed
      if (listing.eventDate > new Date()) {
        return false; // Event hasn't passed yet
      }

      return await this.listingRepository.markAsExpired(id);
    } catch (error) {
      console.error('Error marking listing as expired:', error);
      return false;
    }
  }

  async getExpiredListings(): Promise<TicketListing[]> {
    try {
      return await this.listingRepository.findExpiredListings();
    } catch (error) {
      console.error('Error fetching expired listings:', error);
      throw new Error('Failed to fetch expired listings');
    }
  }

  async updateVerificationStatus(
    id: string, 
    status: TicketListing['verificationStatus']
  ): Promise<boolean> {
    try {
      // This method is typically called by admin/moderator users
      return await this.listingRepository.updateVerificationStatus(id, status);
    } catch (error) {
      console.error('Error updating verification status:', error);
      throw new Error('Failed to update verification status');
    }
  }

  async getNearbyListings(
    latitude: number, 
    longitude: number, 
    radiusKm: number = 50
  ): Promise<TicketListing[]> {
    try {
      // Validate coordinates
      if (latitude < -90 || latitude > 90) {
        throw new Error('Invalid latitude. Must be between -90 and 90');
      }
      
      if (longitude < -180 || longitude > 180) {
        throw new Error('Invalid longitude. Must be between -180 and 180');
      }

      if (radiusKm <= 0 || radiusKm > 1000) {
        throw new Error('Invalid radius. Must be between 1 and 1000 km');
      }

      return await this.listingRepository.findNearby(latitude, longitude, radiusKm);
    } catch (error) {
      console.error('Error fetching nearby listings:', error);
      throw error;
    }
  }


}
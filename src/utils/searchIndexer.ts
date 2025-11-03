import { SearchService } from '../services/SearchService';
import { TicketListingRepository } from '../models/TicketListingRepository';
import { connectDatabase, database } from '../config/database';

/**
 * Utility class for managing search index operations
 */
export class SearchIndexer {
  private searchService: SearchService;
  private listingRepository: TicketListingRepository;

  constructor(searchService?: SearchService, listingRepository?: TicketListingRepository) {
    this.searchService = searchService || new SearchService();
    this.listingRepository = listingRepository || new TicketListingRepository(database);
  }

  /**
   * Initialize the search index
   */
  async initializeIndex(): Promise<void> {
    console.log('Initializing search index...');
    await this.searchService.initializeIndex();
    console.log('Search index initialized successfully');
  }

  /**
   * Index all existing listings in the database
   */
  async indexAllListings(): Promise<void> {
    console.log('Starting bulk indexing of all listings...');
    
    try {
      // Get all active listings
      const listings = await this.listingRepository.findByStatus('active');
      console.log(`Found ${listings.length} active listings to index`);

      if (listings.length === 0) {
        console.log('No listings to index');
        return;
      }

      // Index in batches to avoid overwhelming Elasticsearch
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < listings.length; i += batchSize) {
        batches.push(listings.slice(i, i + batchSize));
      }

      console.log(`Processing ${batches.length} batches of ${batchSize} listings each`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} listings)`);
        
        await this.searchService.bulkIndexListings(batch);
        
        // Small delay between batches to avoid overwhelming the system
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`Successfully indexed ${listings.length} listings`);
    } catch (error) {
      console.error('Error during bulk indexing:', error);
      throw error;
    }
  }

  /**
   * Reindex all listings (clear and rebuild the index)
   */
  async reindexAllListings(): Promise<void> {
    console.log('Starting complete reindexing...');
    
    try {
      // Initialize/recreate the index
      await this.initializeIndex();
      
      // Index all listings
      await this.indexAllListings();
      
      console.log('Complete reindexing finished successfully');
    } catch (error) {
      console.error('Error during reindexing:', error);
      throw error;
    }
  }

  /**
   * Index listings by seller ID
   */
  async indexListingsBySeller(sellerId: string): Promise<void> {
    console.log(`Indexing listings for seller: ${sellerId}`);
    
    try {
      const listings = await this.listingRepository.findBySellerId(sellerId);
      console.log(`Found ${listings.length} listings for seller ${sellerId}`);

      if (listings.length === 0) {
        console.log('No listings to index for this seller');
        return;
      }

      await this.searchService.bulkIndexListings(listings);
      console.log(`Successfully indexed ${listings.length} listings for seller ${sellerId}`);
    } catch (error) {
      console.error(`Error indexing listings for seller ${sellerId}:`, error);
      throw error;
    }
  }

  /**
   * Index listings by category
   */
  async indexListingsByCategory(category: string): Promise<void> {
    console.log(`Indexing listings for category: ${category}`);
    
    try {
      const listings = await this.listingRepository.findByCategory(category as any);
      console.log(`Found ${listings.length} listings for category ${category}`);

      if (listings.length === 0) {
        console.log('No listings to index for this category');
        return;
      }

      await this.searchService.bulkIndexListings(listings);
      console.log(`Successfully indexed ${listings.length} listings for category ${category}`);
    } catch (error) {
      console.error(`Error indexing listings for category ${category}:`, error);
      throw error;
    }
  }

  /**
   * Remove expired listings from search index
   */
  async removeExpiredListings(): Promise<void> {
    console.log('Removing expired listings from search index...');
    
    try {
      const expiredListings = await this.listingRepository.findExpiredListings();
      console.log(`Found ${expiredListings.length} expired listings to remove`);

      if (expiredListings.length === 0) {
        console.log('No expired listings to remove');
        return;
      }

      for (const listing of expiredListings) {
        try {
          await this.searchService.removeListing(listing.id);
        } catch (error) {
          console.error(`Error removing listing ${listing.id} from search:`, error);
          // Continue with other listings
        }
      }

      console.log(`Processed ${expiredListings.length} expired listings`);
    } catch (error) {
      console.error('Error removing expired listings:', error);
      throw error;
    }
  }

  /**
   * Health check for search service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const isHealthy = await this.searchService.healthCheck();
      console.log(`Search service health: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      return isHealthy;
    } catch (error) {
      console.error('Error checking search service health:', error);
      return false;
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<void> {
    try {
      // This would require additional Elasticsearch client methods
      // For now, just log that we're checking stats
      console.log('Checking index statistics...');
      
      const isHealthy = await this.healthCheck();
      if (isHealthy) {
        console.log('Search service is operational');
      } else {
        console.log('Search service is not available');
      }
    } catch (error) {
      console.error('Error getting index statistics:', error);
    }
  }
}

/**
 * CLI script for running indexing operations
 */
async function runIndexingScript(): Promise<void> {
  const command = process.argv[2];
  
  if (!command) {
    console.log(`
Usage: npm run search:index <command>

Commands:
  init              Initialize the search index
  index-all         Index all existing listings
  reindex           Clear and rebuild the entire index
  health            Check search service health
  stats             Get index statistics
  
Examples:
  npm run search:index init
  npm run search:index index-all
  npm run search:index reindex
    `);
    process.exit(1);
  }

  try {
    // Connect to database
    const isConnected = await connectDatabase();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }

    const indexer = new SearchIndexer();

    switch (command) {
      case 'init':
        await indexer.initializeIndex();
        break;
      
      case 'index-all':
        await indexer.indexAllListings();
        break;
      
      case 'reindex':
        await indexer.reindexAllListings();
        break;
      
      case 'health':
        await indexer.healthCheck();
        break;
      
      case 'stats':
        await indexer.getIndexStats();
        break;
      
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    console.log('Operation completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  runIndexingScript();
}

export default SearchIndexer;
import { BaseRepository } from './BaseRepository';
import { 
  TicketListing, 
  TicketListingEntity, 
  CreateListingInput, 
  TicketListingRepository as ITicketListingRepository,
  DatabaseConnection,
  SearchFilters
} from '../types';

export class TicketListingRepository extends BaseRepository<TicketListing, TicketListingEntity, CreateListingInput> implements ITicketListingRepository {
  constructor(connection: DatabaseConnection) {
    super(connection, 'ticket_listings');
  }

  protected getSelectFields(): string {
    return `
      id, seller_id, title, description, category, event_name, event_date, 
      event_time, venue, seat_section, seat_row, seat_number, quantity, 
      original_price, asking_price, images, status, verification_status,
      location_city, location_state, location_country, location_coordinates,
      created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: TicketListingEntity): TicketListing {
    const listing: TicketListing = {
      id: entity.id,
      sellerId: entity.seller_id,
      title: entity.title,
      description: entity.description,
      category: entity.category,
      eventName: entity.event_name,
      eventDate: this.formatDate(entity.event_date),
      eventTime: entity.event_time,
      venue: entity.venue,
      quantity: entity.quantity,
      originalPrice: parseFloat(entity.original_price.toString()),
      askingPrice: parseFloat(entity.asking_price.toString()),
      images: entity.images,
      status: entity.status,
      verificationStatus: entity.verification_status,
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
      location: {
        city: entity.location_city,
        state: entity.location_state,
        country: entity.location_country,
      },
    };
    
    if (entity.seat_section) {
      listing.seatSection = entity.seat_section;
    }
    
    if (entity.seat_row) {
      listing.seatRow = entity.seat_row;
    }
    
    if (entity.seat_number) {
      listing.seatNumber = entity.seat_number;
    }
    
    if (entity.location_coordinates) {
      listing.location.coordinates = this.parseCoordinates(entity.location_coordinates);
    }
    
    return listing;
  }

  protected mapCreateInputToEntity(input: CreateListingInput): Partial<TicketListingEntity> {
    const entity: Partial<TicketListingEntity> = {
      seller_id: input.sellerId,
      title: input.title,
      description: input.description,
      category: input.category,
      event_name: input.eventName,
      event_date: this.formatDateForDb(input.eventDate),
      event_time: input.eventTime,
      venue: input.venue,
      quantity: input.quantity,
      original_price: input.originalPrice,
      asking_price: input.askingPrice,
      images: [],
      status: 'active',
      verification_status: 'pending',
      location_city: input.location.city,
      location_state: input.location.state,
      location_country: input.location.country,
    };
    
    if (input.seatSection) {
      entity.seat_section = input.seatSection;
    }
    
    if (input.seatRow) {
      entity.seat_row = input.seatRow;
    }
    
    if (input.seatNumber) {
      entity.seat_number = input.seatNumber;
    }
    
    if (input.location.coordinates) {
      entity.location_coordinates = this.formatCoordinates(input.location.coordinates);
    }
    
    return entity;
  }

  async findBySellerId(sellerId: string): Promise<TicketListing[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE seller_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TicketListingEntity>(query, [sellerId]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByCategory(category: TicketListing['category']): Promise<TicketListing[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE category = $1 AND status = 'active'
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TicketListingEntity>(query, [category]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByStatus(status: TicketListing['status']): Promise<TicketListing[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TicketListingEntity>(query, [status]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async search(filters: SearchFilters): Promise<TicketListing[]> {
    let query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    // Add filters
    if (filters.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.eventName) {
      query += ` AND event_name ILIKE $${paramIndex}`;
      params.push(`%${filters.eventName}%`);
      paramIndex++;
    }

    if (filters.venue) {
      query += ` AND venue ILIKE $${paramIndex}`;
      params.push(`%${filters.venue}%`);
      paramIndex++;
    }

    if (filters.city) {
      query += ` AND location_city ILIKE $${paramIndex}`;
      params.push(`%${filters.city}%`);
      paramIndex++;
    }

    if (filters.state) {
      query += ` AND location_state ILIKE $${paramIndex}`;
      params.push(`%${filters.state}%`);
      paramIndex++;
    }

    if (filters.country) {
      query += ` AND location_country ILIKE $${paramIndex}`;
      params.push(`%${filters.country}%`);
      paramIndex++;
    }

    if (filters.minPrice !== undefined) {
      query += ` AND asking_price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }

    if (filters.maxPrice !== undefined) {
      query += ` AND asking_price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }

    if (filters.eventDateFrom) {
      query += ` AND event_date >= $${paramIndex}`;
      params.push(this.formatDateForDb(filters.eventDateFrom));
      paramIndex++;
    }

    if (filters.eventDateTo) {
      query += ` AND event_date <= $${paramIndex}`;
      params.push(this.formatDateForDb(filters.eventDateTo));
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    } else {
      // Default to active listings only
      query += ` AND status = 'active'`;
    }

    if (filters.verificationStatus) {
      query += ` AND verification_status = $${paramIndex}`;
      params.push(filters.verificationStatus);
      paramIndex++;
    }

    // Order by relevance (price, date, creation time)
    query += ` ORDER BY event_date ASC, asking_price ASC, created_at DESC`;

    const result = await this.connection.query<TicketListingEntity>(query, params);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findExpiredListings(): Promise<TicketListing[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE event_date < NOW() AND status = 'active'
      ORDER BY event_date DESC
    `;
    
    const result = await this.connection.query<TicketListingEntity>(query);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async markAsExpired(id: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'expired'
      WHERE id = $1 AND event_date < NOW()
    `;
    
    const result = await this.connection.query(query, [id]);
    
    return (result as any).rowCount > 0;
  }

  async updateImages(id: string, images: string[]): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET images = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id, images]);
    
    return (result as any).rowCount > 0;
  }

  async updateVerificationStatus(id: string, status: TicketListing['verificationStatus']): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET verification_status = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id, status]);
    
    return (result as any).rowCount > 0;
  }

  async findNearby(latitude: number, longitude: number, radiusKm: number = 50): Promise<TicketListing[]> {
    const query = `
      SELECT ${this.getSelectFields()},
             ST_Distance(
               ST_GeogFromText('POINT(' || $2 || ' ' || $1 || ')'),
               ST_GeogFromText('POINT(' || ST_X(location_coordinates) || ' ' || ST_Y(location_coordinates) || ')')
             ) / 1000 as distance_km
      FROM ${this.tableName}
      WHERE location_coordinates IS NOT NULL
        AND status = 'active'
        AND ST_DWithin(
          ST_GeogFromText('POINT(' || $2 || ' ' || $1 || ')'),
          ST_GeogFromText('POINT(' || ST_X(location_coordinates) || ' ' || ST_Y(location_coordinates) || ')'),
          $3 * 1000
        )
      ORDER BY distance_km ASC
    `;
    
    const result = await this.connection.query<TicketListingEntity>(query, [latitude, longitude, radiusKm]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  // Helper methods for coordinate handling
  private parseCoordinates(coordinateString: string): [number, number] {
    // PostgreSQL POINT format: (longitude,latitude)
    const match = coordinateString.match(/\(([^,]+),([^)]+)\)/);
    if (match) {
      return [parseFloat(match[2]!), parseFloat(match[1]!)]; // [latitude, longitude]
    }
    throw new Error('Invalid coordinate format');
  }

  private formatCoordinates(coordinates: [number, number]): string {
    // Convert [latitude, longitude] to PostgreSQL POINT format (longitude,latitude)
    return `(${coordinates[1]},${coordinates[0]})`;
  }
}
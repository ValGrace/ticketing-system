import { BaseRepository } from './BaseRepository';
import { 
  Transaction, 
  TransactionEntity, 
  CreateTransactionInput, 
  TransactionRepository as ITransactionRepository,
  DatabaseConnection 
} from '../types';

export class TransactionRepository extends BaseRepository<Transaction, TransactionEntity, CreateTransactionInput> implements ITransactionRepository {
  constructor(connection: DatabaseConnection) {
    super(connection, 'transactions');
  }

  protected getSelectFields(): string {
    return `
      id, listing_id, buyer_id, seller_id, quantity, total_amount, 
      platform_fee, payment_intent_id, status, escrow_release_date,
      dispute_reason, resolution_notes, created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: TransactionEntity): Transaction {
    const transaction: Transaction = {
      id: entity.id,
      listingId: entity.listing_id,
      buyerId: entity.buyer_id,
      sellerId: entity.seller_id,
      quantity: entity.quantity,
      totalAmount: parseFloat(entity.total_amount.toString()),
      platformFee: parseFloat(entity.platform_fee.toString()),
      paymentIntentId: entity.payment_intent_id,
      status: entity.status,
      escrowReleaseDate: this.formatDate(entity.escrow_release_date),
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
    };
    
    if (entity.dispute_reason) {
      transaction.disputeReason = entity.dispute_reason;
    }
    
    if (entity.resolution_notes) {
      transaction.resolutionNotes = entity.resolution_notes;
    }
    
    return transaction;
  }

  protected mapCreateInputToEntity(input: CreateTransactionInput): Partial<TransactionEntity> {
    // Calculate escrow release date (e.g., 7 days from now)
    const escrowReleaseDate = new Date();
    escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 7);

    return {
      listing_id: input.listingId,
      buyer_id: input.buyerId,
      seller_id: input.sellerId,
      quantity: input.quantity,
      total_amount: input.totalAmount,
      platform_fee: input.platformFee,
      payment_intent_id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Temporary placeholder
      status: 'pending',
      escrow_release_date: this.formatDateForDb(escrowReleaseDate),
    };
  }

  override async create(input: CreateTransactionInput): Promise<Transaction> {
    return this.connection.transaction(async (client) => {
      // Create the transaction
      const transaction = await super.create(input);

      // Update listing quantity or mark as sold
      const updateListingQuery = `
        UPDATE ticket_listings 
        SET quantity = quantity - $2,
            status = CASE 
              WHEN quantity - $2 <= 0 THEN 'sold'::listing_status 
              ELSE status 
            END
        WHERE id = $1 AND quantity >= $2
      `;
      
      const updateResult = await client.query(updateListingQuery, [input.listingId, input.quantity]);
      
      if ((updateResult as any).rowCount === 0) {
        throw new Error('Insufficient ticket quantity or listing not found');
      }

      return transaction;
    });
  }

  async findByBuyerId(buyerId: string): Promise<Transaction[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE buyer_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TransactionEntity>(query, [buyerId]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findBySellerId(sellerId: string): Promise<Transaction[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE seller_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TransactionEntity>(query, [sellerId]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByListingId(listingId: string): Promise<Transaction[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE listing_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TransactionEntity>(query, [listingId]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByStatus(status: Transaction['status']): Promise<Transaction[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TransactionEntity>(query, [status]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<Transaction | null> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE payment_intent_id = $1
    `;
    
    const result = await this.connection.query<TransactionEntity>(query, [paymentIntentId]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async updateStatus(id: string, status: Transaction['status']): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id, status]);
    
    return (result as any).rowCount > 0;
  }

  async updatePaymentIntentId(id: string, paymentIntentId: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET payment_intent_id = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id, paymentIntentId]);
    
    return (result as any).rowCount > 0;
  }

  async addDispute(id: string, disputeReason: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'disputed', dispute_reason = $2
      WHERE id = $1 AND status IN ('paid', 'confirmed')
    `;
    
    const result = await this.connection.query(query, [id, disputeReason]);
    
    return (result as any).rowCount > 0;
  }

  async resolveDispute(id: string, resolutionNotes: string, newStatus: 'completed' | 'cancelled'): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = $2, resolution_notes = $3
      WHERE id = $1 AND status = 'disputed'
    `;
    
    const result = await this.connection.query(query, [id, newStatus, resolutionNotes]);
    
    return (result as any).rowCount > 0;
  }

  async findEscrowReleaseDue(): Promise<Transaction[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = 'confirmed' 
        AND escrow_release_date <= NOW()
      ORDER BY escrow_release_date ASC
    `;
    
    const result = await this.connection.query<TransactionEntity>(query);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async getTransactionStats(userId: string): Promise<{
    totalTransactions: number;
    totalSpent: number;
    totalEarned: number;
    averageTransactionValue: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN buyer_id = $1 THEN total_amount ELSE 0 END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN seller_id = $1 THEN total_amount - platform_fee ELSE 0 END), 0) as total_earned,
        COALESCE(AVG(total_amount), 0) as average_transaction_value
      FROM ${this.tableName}
      WHERE (buyer_id = $1 OR seller_id = $1) 
        AND status = 'completed'
    `;
    
    const result = await this.connection.query<{
      total_transactions: string;
      total_spent: string;
      total_earned: string;
      average_transaction_value: string;
    }>(query, [userId]);
    
    const stats = result[0];
    
    return {
      totalTransactions: parseInt(stats?.total_transactions || '0'),
      totalSpent: parseFloat(stats?.total_spent || '0'),
      totalEarned: parseFloat(stats?.total_earned || '0'),
      averageTransactionValue: parseFloat(stats?.average_transaction_value || '0'),
    };
  }

  async findUserTransactionHistory(
    userId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<Transaction[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE buyer_id = $1 OR seller_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.connection.query<TransactionEntity>(query, [userId, limit, offset]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }
}
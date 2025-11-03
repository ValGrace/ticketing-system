import { BaseRepository } from './BaseRepository';
import { 
  TicketVerification, 
  TicketVerificationEntity, 
  CreateTicketVerificationInput,
  VerificationFinding,
  DatabaseConnection
} from '../types';

export class TicketVerificationRepository extends BaseRepository<TicketVerification, TicketVerificationEntity, CreateTicketVerificationInput> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'ticket_verifications');
  }

  protected getSelectFields(): string {
    return `
      id, listing_id, verification_method, status, confidence, 
      findings, reviewed_by, review_notes, created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: TicketVerificationEntity): TicketVerification {
    return {
      id: entity.id,
      listingId: entity.listing_id,
      verificationMethod: entity.verification_method,
      status: entity.status,
      confidence: entity.confidence,
      findings: JSON.parse(entity.findings),
      reviewedBy: entity.reviewed_by || undefined,
      reviewNotes: entity.review_notes || undefined,
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
    };
  }

  protected mapCreateInputToEntity(input: CreateTicketVerificationInput): Partial<TicketVerificationEntity> {
    return {
      listing_id: input.listingId,
      verification_method: input.verificationMethod,
      status: 'pending',
      confidence: input.confidence,
      findings: JSON.stringify(input.findings),
    };
  }

  async findByListingId(listingId: string): Promise<TicketVerification[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE listing_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TicketVerificationEntity>(query, [listingId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByStatus(status: TicketVerification['status']): Promise<TicketVerification[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TicketVerificationEntity>(query, [status]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByMethod(method: TicketVerification['verificationMethod']): Promise<TicketVerification[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE verification_method = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<TicketVerificationEntity>(query, [method]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findPendingManualReviews(): Promise<TicketVerification[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = 'requires_manual_review'
      ORDER BY created_at ASC
    `;
    
    const result = await this.connection.query<TicketVerificationEntity>(query);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findLowConfidenceVerifications(threshold: number = 70): Promise<TicketVerification[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE confidence < $1 AND status = 'pending'
      ORDER BY confidence ASC, created_at ASC
    `;
    
    const result = await this.connection.query<TicketVerificationEntity>(query, [threshold]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async updateVerificationStatus(
    verificationId: string, 
    status: TicketVerification['status'], 
    reviewedBy?: string, 
    reviewNotes?: string
  ): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = $2, reviewed_by = $3, review_notes = $4
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [verificationId, status, reviewedBy, reviewNotes]);
    return (result as any).rowCount > 0;
  }

  async addFinding(verificationId: string, finding: VerificationFinding): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET findings = findings || $2::jsonb
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [verificationId, JSON.stringify([finding])]);
    return (result as any).rowCount > 0;
  }

  async updateConfidence(verificationId: string, confidence: number): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET confidence = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [verificationId, confidence]);
    return (result as any).rowCount > 0;
  }

  async getVerificationStatistics(): Promise<{
    total: number;
    pending: number;
    verified: number;
    rejected: number;
    requiresManualReview: number;
    averageConfidence: number;
    byMethod: Record<string, number>;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status = 'requires_manual_review' THEN 1 END) as requires_manual_review,
        AVG(confidence) as average_confidence,
        verification_method,
        COUNT(*) as method_count
      FROM ${this.tableName}
      GROUP BY ROLLUP(verification_method)
      ORDER BY verification_method NULLS FIRST
    `;
    
    const result = await this.connection.query(query);
    
    const stats = {
      total: 0,
      pending: 0,
      verified: 0,
      rejected: 0,
      requiresManualReview: 0,
      averageConfidence: 0,
      byMethod: {} as Record<string, number>
    };

    for (const row of result) {
      if (row.verification_method === null) {
        // This is the rollup row with totals
        stats.total = parseInt(row.total);
        stats.pending = parseInt(row.pending);
        stats.verified = parseInt(row.verified);
        stats.rejected = parseInt(row.rejected);
        stats.requiresManualReview = parseInt(row.requires_manual_review);
        stats.averageConfidence = parseFloat(row.average_confidence) || 0;
      } else {
        stats.byMethod[row.verification_method] = parseInt(row.method_count);
      }
    }

    return stats;
  }

  async getListingVerificationHistory(listingId: string): Promise<TicketVerification[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE listing_id = $1
      ORDER BY created_at ASC
    `;
    
    const result = await this.connection.query<TicketVerificationEntity>(query, [listingId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }
}
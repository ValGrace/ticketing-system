import { BaseRepository } from './BaseRepository';
import { 
  FraudReport, 
  FraudReportEntity, 
  CreateFraudReportInput,
  DatabaseConnection
} from '../types';

export class FraudReportRepository extends BaseRepository<FraudReport, FraudReportEntity, CreateFraudReportInput> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'fraud_reports');
  }

  protected getSelectFields(): string {
    return `
      id, reporter_id, reported_user_id, listing_id, transaction_id, 
      type, reason, description, evidence, status, assigned_to, 
      resolution, created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: FraudReportEntity): FraudReport {
    return {
      id: entity.id,
      reporterId: entity.reporter_id,
      reportedUserId: entity.reported_user_id || undefined,
      listingId: entity.listing_id || undefined,
      transactionId: entity.transaction_id || undefined,
      type: entity.type,
      reason: entity.reason,
      description: entity.description,
      evidence: entity.evidence || [],
      status: entity.status,
      assignedTo: entity.assigned_to || undefined,
      resolution: entity.resolution || undefined,
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
    };
  }

  protected mapCreateInputToEntity(input: CreateFraudReportInput): Partial<FraudReportEntity> {
    return {
      reporter_id: input.reporterId,
      reported_user_id: input.reportedUserId || undefined,
      listing_id: input.listingId || undefined,
      transaction_id: input.transactionId || undefined,
      type: input.type,
      reason: input.reason,
      description: input.description,
      evidence: input.evidence || [],
      status: 'pending',
    };
  }

  async findByReporterId(reporterId: string): Promise<FraudReport[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE reporter_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<FraudReportEntity>(query, [reporterId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByReportedUserId(reportedUserId: string): Promise<FraudReport[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE reported_user_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<FraudReportEntity>(query, [reportedUserId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByListingId(listingId: string): Promise<FraudReport[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE listing_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<FraudReportEntity>(query, [listingId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByStatus(status: FraudReport['status']): Promise<FraudReport[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<FraudReportEntity>(query, [status]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByAssignedTo(assignedTo: string): Promise<FraudReport[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE assigned_to = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<FraudReportEntity>(query, [assignedTo]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async assignToModerator(reportId: string, moderatorId: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET assigned_to = $2, status = 'investigating'
      WHERE id = $1 AND status = 'pending'
    `;
    
    const result = await this.connection.query(query, [reportId, moderatorId]);
    return (result as any).rowCount > 0;
  }

  async resolveReport(reportId: string, resolution: string, resolvedBy: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'resolved', resolution = $2, assigned_to = $3
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [reportId, resolution, resolvedBy]);
    return (result as any).rowCount > 0;
  }

  async dismissReport(reportId: string, dismissedBy: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'dismissed', assigned_to = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [reportId, dismissedBy]);
    return (result as any).rowCount > 0;
  }

  async getReportStatistics(): Promise<{
    total: number;
    pending: number;
    investigating: number;
    resolved: number;
    dismissed: number;
    byType: Record<string, number>;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'investigating' THEN 1 END) as investigating,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
        type,
        COUNT(*) as type_count
      FROM ${this.tableName}
      GROUP BY ROLLUP(type)
      ORDER BY type NULLS FIRST
    `;
    
    const result = await this.connection.query(query);
    
    const stats = {
      total: 0,
      pending: 0,
      investigating: 0,
      resolved: 0,
      dismissed: 0,
      byType: {} as Record<string, number>
    };

    for (const row of result) {
      if (row.type === null) {
        // This is the rollup row with totals
        stats.total = parseInt(row.total);
        stats.pending = parseInt(row.pending);
        stats.investigating = parseInt(row.investigating);
        stats.resolved = parseInt(row.resolved);
        stats.dismissed = parseInt(row.dismissed);
      } else {
        stats.byType[row.type] = parseInt(row.type_count);
      }
    }

    return stats;
  }
}
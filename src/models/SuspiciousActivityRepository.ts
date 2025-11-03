import { BaseRepository } from './BaseRepository';
import { 
  SuspiciousActivity, 
  SuspiciousActivityEntity, 
  CreateSuspiciousActivityInput,
  DatabaseConnection
} from '../types';

export class SuspiciousActivityRepository extends BaseRepository<SuspiciousActivity, SuspiciousActivityEntity, CreateSuspiciousActivityInput> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'suspicious_activities');
  }

  protected getSelectFields(): string {
    return `
      id, user_id, activity_type, description, severity, metadata, 
      status, reviewed_by, review_notes, created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: SuspiciousActivityEntity): SuspiciousActivity {
    return {
      id: entity.id,
      userId: entity.user_id,
      activityType: entity.activity_type,
      description: entity.description,
      severity: entity.severity,
      metadata: JSON.parse(entity.metadata),
      status: entity.status,
      reviewedBy: entity.reviewed_by || undefined,
      reviewNotes: entity.review_notes || undefined,
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
    };
  }

  protected mapCreateInputToEntity(input: CreateSuspiciousActivityInput): Partial<SuspiciousActivityEntity> {
    return {
      user_id: input.userId,
      activity_type: input.activityType,
      description: input.description,
      severity: input.severity,
      metadata: JSON.stringify(input.metadata),
      status: 'flagged',
    };
  }

  async findByUserId(userId: string): Promise<SuspiciousActivity[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<SuspiciousActivityEntity>(query, [userId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByActivityType(activityType: SuspiciousActivity['activityType']): Promise<SuspiciousActivity[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE activity_type = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<SuspiciousActivityEntity>(query, [activityType]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findBySeverity(severity: SuspiciousActivity['severity']): Promise<SuspiciousActivity[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE severity = $1 AND status = 'flagged'
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<SuspiciousActivityEntity>(query, [severity]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByStatus(status: SuspiciousActivity['status']): Promise<SuspiciousActivity[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<SuspiciousActivityEntity>(query, [status]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findHighPriorityActivities(): Promise<SuspiciousActivity[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE severity IN ('high', 'critical') AND status = 'flagged'
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
        END,
        created_at DESC
    `;
    
    const result = await this.connection.query<SuspiciousActivityEntity>(query);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async reviewActivity(activityId: string, reviewedBy: string, status: 'reviewed' | 'dismissed', notes?: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = $2, reviewed_by = $3, review_notes = $4
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [activityId, status, reviewedBy, notes]);
    return (result as any).rowCount > 0;
  }

  async getUserRiskScore(userId: string): Promise<{
    riskScore: number;
    totalActivities: number;
    criticalCount: number;
    highCount: number;
    recentActivities: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_activities,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as recent_activities
      FROM ${this.tableName}
      WHERE user_id = $1 AND status = 'flagged'
    `;
    
    const result = await this.connection.query(query, [userId]);
    const row = result[0];
    
    if (!row) {
      return {
        riskScore: 0,
        totalActivities: 0,
        criticalCount: 0,
        highCount: 0,
        recentActivities: 0,
      };
    }

    const criticalCount = parseInt(row.critical_count) || 0;
    const highCount = parseInt(row.high_count) || 0;
    const recentActivities = parseInt(row.recent_activities) || 0;
    
    // Calculate risk score (0-100)
    let riskScore = 0;
    riskScore += criticalCount * 30; // Critical activities worth 30 points each
    riskScore += highCount * 15; // High activities worth 15 points each
    riskScore += recentActivities * 5; // Recent activities add 5 points each
    
    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    return {
      riskScore,
      totalActivities: parseInt(row.total_activities) || 0,
      criticalCount,
      highCount,
      recentActivities,
    };
  }

  async getActivityStatistics(): Promise<{
    total: number;
    flagged: number;
    reviewed: number;
    dismissed: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'flagged' THEN 1 END) as flagged,
        COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
        severity,
        activity_type,
        COUNT(*) as count
      FROM ${this.tableName}
      GROUP BY ROLLUP(severity, activity_type)
      ORDER BY severity NULLS FIRST, activity_type NULLS FIRST
    `;
    
    const result = await this.connection.query(query);
    
    const stats = {
      total: 0,
      flagged: 0,
      reviewed: 0,
      dismissed: 0,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>
    };

    for (const row of result) {
      if (row.severity === null && row.activity_type === null) {
        // This is the grand total row
        stats.total = parseInt(row.total);
        stats.flagged = parseInt(row.flagged);
        stats.reviewed = parseInt(row.reviewed);
        stats.dismissed = parseInt(row.dismissed);
      } else if (row.activity_type === null) {
        // This is a severity subtotal
        stats.bySeverity[row.severity] = parseInt(row.count);
      } else if (row.severity !== null) {
        // This is a type count
        stats.byType[row.activity_type] = parseInt(row.count);
      }
    }

    return stats;
  }
}
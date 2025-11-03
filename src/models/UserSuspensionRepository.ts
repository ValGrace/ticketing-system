import { BaseRepository } from './BaseRepository';
import { 
  UserSuspension, 
  UserSuspensionEntity, 
  CreateUserSuspensionInput,
  DatabaseConnection
} from '../types';

export class UserSuspensionRepository extends BaseRepository<UserSuspension, UserSuspensionEntity, CreateUserSuspensionInput> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'user_suspensions');
  }

  protected getSelectFields(): string {
    return `
      id, user_id, reason, suspended_by, suspension_type, start_date, 
      end_date, is_active, appeal_status, appeal_reason, created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: UserSuspensionEntity): UserSuspension {
    return {
      id: entity.id,
      userId: entity.user_id,
      reason: entity.reason,
      suspendedBy: entity.suspended_by,
      suspensionType: entity.suspension_type,
      startDate: this.formatDate(entity.start_date),
      endDate: entity.end_date ? this.formatDate(entity.end_date) : undefined,
      isActive: entity.is_active,
      appealStatus: entity.appeal_status || undefined,
      appealReason: entity.appeal_reason || undefined,
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
    };
  }

  protected mapCreateInputToEntity(input: CreateUserSuspensionInput): Partial<UserSuspensionEntity> {
    const entity: Partial<UserSuspensionEntity> = {
      user_id: input.userId,
      reason: input.reason,
      suspended_by: input.suspendedBy,
      suspension_type: input.suspensionType,
      start_date: this.formatDateForDb(new Date()),
      is_active: true,
      appeal_status: 'none',
    };

    if (input.endDate) {
      entity.end_date = this.formatDateForDb(input.endDate);
    }

    return entity;
  }

  async findByUserId(userId: string): Promise<UserSuspension[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<UserSuspensionEntity>(query, [userId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findActiveSuspensions(): Promise<UserSuspension[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<UserSuspensionEntity>(query);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findBySuspendedBy(suspendedBy: string): Promise<UserSuspension[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE suspended_by = $1
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<UserSuspensionEntity>(query, [suspendedBy]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findExpiredSuspensions(): Promise<UserSuspension[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE suspension_type = 'temporary' 
      AND end_date < CURRENT_TIMESTAMP 
      AND is_active = TRUE
      ORDER BY end_date ASC
    `;
    
    const result = await this.connection.query<UserSuspensionEntity>(query);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findPendingAppeals(): Promise<UserSuspension[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE appeal_status = 'pending' AND is_active = TRUE
      ORDER BY created_at ASC
    `;
    
    const result = await this.connection.query<UserSuspensionEntity>(query);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async getActiveSuspensionForUser(userId: string): Promise<UserSuspension | null> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE user_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await this.connection.query<UserSuspensionEntity>(query, [userId]);
    
    if (result.length === 0) {
      return null;
    }
    
    const entity = result[0];
    if (!entity) {
      return null;
    }
    
    return this.mapEntityToModel(entity);
  }

  async isUserSuspended(userId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM ${this.tableName}
      WHERE user_id = $1 AND is_active = TRUE
      LIMIT 1
    `;
    
    const result = await this.connection.query(query, [userId]);
    return result.length > 0;
  }

  async deactivateSuspension(suspensionId: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET is_active = FALSE
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [suspensionId]);
    return (result as any).rowCount > 0;
  }

  async submitAppeal(suspensionId: string, appealReason: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET appeal_status = 'pending', appeal_reason = $2
      WHERE id = $1 AND is_active = TRUE
    `;
    
    const result = await this.connection.query(query, [suspensionId, appealReason]);
    return (result as any).rowCount > 0;
  }

  async processAppeal(suspensionId: string, approved: boolean): Promise<boolean> {
    const status = approved ? 'approved' : 'rejected';
    
    const query = `
      UPDATE ${this.tableName}
      SET appeal_status = $2, is_active = $3
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [suspensionId, status, !approved]);
    return (result as any).rowCount > 0;
  }

  async extendSuspension(suspensionId: string, newEndDate: Date): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET end_date = $2
      WHERE id = $1 AND suspension_type = 'temporary' AND is_active = TRUE
    `;
    
    const result = await this.connection.query(query, [suspensionId, this.formatDateForDb(newEndDate)]);
    return (result as any).rowCount > 0;
  }

  async makePermanent(suspensionId: string): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET suspension_type = 'permanent', end_date = NULL
      WHERE id = $1 AND is_active = TRUE
    `;
    
    const result = await this.connection.query(query, [suspensionId]);
    return (result as any).rowCount > 0;
  }

  async getSuspensionStatistics(): Promise<{
    total: number;
    active: number;
    temporary: number;
    permanent: number;
    pendingAppeals: number;
    approvedAppeals: number;
    rejectedAppeals: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active,
        COUNT(CASE WHEN suspension_type = 'temporary' THEN 1 END) as temporary,
        COUNT(CASE WHEN suspension_type = 'permanent' THEN 1 END) as permanent,
        COUNT(CASE WHEN appeal_status = 'pending' THEN 1 END) as pending_appeals,
        COUNT(CASE WHEN appeal_status = 'approved' THEN 1 END) as approved_appeals,
        COUNT(CASE WHEN appeal_status = 'rejected' THEN 1 END) as rejected_appeals
      FROM ${this.tableName}
    `;
    
    const result = await this.connection.query(query);
    const row = result[0];
    
    return {
      total: parseInt(row.total) || 0,
      active: parseInt(row.active) || 0,
      temporary: parseInt(row.temporary) || 0,
      permanent: parseInt(row.permanent) || 0,
      pendingAppeals: parseInt(row.pending_appeals) || 0,
      approvedAppeals: parseInt(row.approved_appeals) || 0,
      rejectedAppeals: parseInt(row.rejected_appeals) || 0,
    };
  }
}
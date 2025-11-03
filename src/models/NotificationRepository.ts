import { BaseRepository } from './BaseRepository';
import { 
  Notification, 
  NotificationEntity, 
  CreateNotificationInput,
  NotificationType,
  DatabaseConnection 
} from '../types';
import { randomUUID } from 'crypto';

export class NotificationRepository extends BaseRepository<Notification, NotificationEntity, CreateNotificationInput> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'notifications');
  }

  protected mapEntityToModel(entity: NotificationEntity): Notification {
    return {
      id: entity.id,
      userId: entity.user_id,
      type: entity.type,
      title: entity.title,
      message: entity.message,
      data: entity.data ? JSON.parse(entity.data) : undefined,
      channels: JSON.parse(entity.channels),
      status: entity.status,
      sentAt: entity.sent_at ? new Date(entity.sent_at) : undefined,
      readAt: entity.read_at ? new Date(entity.read_at) : undefined,
      createdAt: new Date(entity.created_at),
      updatedAt: new Date(entity.updated_at)
    } as Notification;
  }

  protected mapCreateInputToEntity(input: CreateNotificationInput): Partial<NotificationEntity> {
    const now = new Date().toISOString();
    const entity: Partial<NotificationEntity> = {
      id: randomUUID(),
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      channels: JSON.stringify(input.channels),
      status: 'pending',
      created_at: now,
      updated_at: now
    };
    
    if (input.data) {
      entity.data = JSON.stringify(input.data);
    }
    
    return entity;
  }

  protected getSelectFields(): string {
    return 'id, user_id, type, title, message, data, channels, status, sent_at, read_at, created_at, updated_at';
  }

  override async create(input: CreateNotificationInput): Promise<Notification> {
    const entityData = this.mapCreateInputToEntity(input);
    
    const query = `
      INSERT INTO notifications (
        id, user_id, type, title, message, data, channels, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${this.getSelectFields()}
    `;
    
    const values = [
      entityData.id,
      entityData.user_id,
      entityData.type,
      entityData.title,
      entityData.message,
      entityData.data,
      entityData.channels,
      entityData.status,
      entityData.created_at,
      entityData.updated_at
    ];
    
    const result = await this.connection.query<NotificationEntity>(query, values);
    if (result.length === 0) {
      throw new Error('Failed to create notification');
    }
    return this.mapEntityToModel(result[0]!);
  }

  async findByUserId(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.connection.query<NotificationEntity>(query, [userId, limit, offset]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByType(type: NotificationType, limit = 100, offset = 0): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications 
      WHERE type = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.connection.query<NotificationEntity>(query, [type, limit, offset]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByStatus(status: Notification['status'], limit = 100, offset = 0): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications 
      WHERE status = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.connection.query<NotificationEntity>(query, [status, limit, offset]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findUnreadByUserId(userId: string): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 AND read_at IS NULL 
      ORDER BY created_at DESC
    `;
    
    const result = await this.connection.query<NotificationEntity>(query, [userId]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async markAsSent(id: string): Promise<boolean> {
    const query = `
      UPDATE notifications 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id]);
    return result.length > 0;
  }

  async markAsFailed(id: string): Promise<boolean> {
    const query = `
      UPDATE notifications 
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id]);
    return result.length > 0;
  }

  async markAsRead(id: string): Promise<boolean> {
    const query = `
      UPDATE notifications 
      SET status = 'read', read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id]);
    return result.length > 0;
  }

  async markAllAsReadForUser(userId: string): Promise<number> {
    const query = `
      UPDATE notifications 
      SET status = 'read', read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND read_at IS NULL
    `;
    
    const result = await this.connection.query(query, [userId]);
    return result.length;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count 
      FROM notifications 
      WHERE user_id = $1 AND read_at IS NULL
    `;
    
    const result = await this.connection.query<{ count: string }>(query, [userId]);
    return parseInt(result[0]?.count || '0');
  }

  async findPendingNotifications(limit = 100): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications 
      WHERE status = 'pending' 
      ORDER BY created_at ASC 
      LIMIT $1
    `;
    
    const result = await this.connection.query<NotificationEntity>(query, [limit]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async deleteOldNotifications(daysOld = 90): Promise<number> {
    const query = `
      DELETE FROM notifications 
      WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
    `;
    
    const result = await this.connection.query(query);
    return result.length;
  }
}
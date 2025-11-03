import { BaseRepository } from './BaseRepository';
import { 
  NotificationPreferences, 
  NotificationPreferencesEntity, 
  UpdateNotificationPreferencesInput,
  DatabaseConnection,
  NotificationType 
} from '../types';
import { randomUUID } from 'crypto';

export class NotificationPreferencesRepository extends BaseRepository<NotificationPreferences, NotificationPreferencesEntity, never> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'notification_preferences');
  }

  protected mapEntityToModel(entity: NotificationPreferencesEntity): NotificationPreferences {
    return {
      id: entity.id,
      userId: entity.user_id,
      emailEnabled: entity.email_enabled,
      smsEnabled: entity.sms_enabled,
      pushEnabled: entity.push_enabled,
      inAppEnabled: entity.in_app_enabled,
      preferences: JSON.parse(entity.preferences),
      createdAt: new Date(entity.created_at),
      updatedAt: new Date(entity.updated_at)
    };
  }

  protected mapCreateInputToEntity(_input: never): Partial<NotificationPreferencesEntity> {
    throw new Error('Use createDefaultPreferences instead');
  }

  protected getSelectFields(): string {
    return 'id, user_id, email_enabled, sms_enabled, push_enabled, in_app_enabled, preferences, created_at, updated_at';
  }

  override async create(): Promise<NotificationPreferences> {
    throw new Error('Use createDefaultPreferences instead');
  }

  async createDefaultPreferences(userId: string): Promise<NotificationPreferences> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    // Default preferences - all channels enabled for all notification types
    const defaultPreferences = this.getDefaultPreferences();
    
    const query = `
      INSERT INTO notification_preferences (
        id, user_id, email_enabled, sms_enabled, push_enabled, in_app_enabled, preferences, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      id,
      userId,
      true, // email_enabled
      true, // sms_enabled
      true, // push_enabled
      true, // in_app_enabled
      JSON.stringify(defaultPreferences),
      now,
      now
    ];
    
    const result = await this.connection.query<NotificationPreferencesEntity>(query, values);
    return this.mapEntityToModel(result[0]!);
  }

  async findByUserId(userId: string): Promise<NotificationPreferences | null> {
    const query = `
      SELECT * FROM notification_preferences 
      WHERE user_id = $1
    `;
    
    const result = await this.connection.query<NotificationPreferencesEntity>(query, [userId]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async updatePreferences(userId: string, updates: UpdateNotificationPreferencesInput): Promise<NotificationPreferences | null> {
    // First get current preferences
    const current = await this.findByUserId(userId);
    if (!current) {
      return null;
    }

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.emailEnabled !== undefined) {
      updateFields.push(`email_enabled = $${paramIndex++}`);
      values.push(updates.emailEnabled);
    }

    if (updates.smsEnabled !== undefined) {
      updateFields.push(`sms_enabled = $${paramIndex++}`);
      values.push(updates.smsEnabled);
    }

    if (updates.pushEnabled !== undefined) {
      updateFields.push(`push_enabled = $${paramIndex++}`);
      values.push(updates.pushEnabled);
    }

    if (updates.inAppEnabled !== undefined) {
      updateFields.push(`in_app_enabled = $${paramIndex++}`);
      values.push(updates.inAppEnabled);
    }

    if (updates.preferences) {
      const mergedPreferences = { ...current.preferences, ...updates.preferences };
      updateFields.push(`preferences = $${paramIndex++}`);
      values.push(JSON.stringify(mergedPreferences));
    }

    if (updateFields.length === 0) {
      return current;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `
      UPDATE notification_preferences 
      SET ${updateFields.join(', ')} 
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.connection.query<NotificationPreferencesEntity>(query, values);
    return result.length > 0 ? this.mapEntityToModel(result[0]!) : null;
  }

  async getOrCreatePreferences(userId: string): Promise<NotificationPreferences> {
    let preferences = await this.findByUserId(userId);
    
    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId);
    }
    
    return preferences;
  }

  async isChannelEnabledForUser(userId: string, notificationType: NotificationType, channel: 'email' | 'sms' | 'push' | 'inApp'): Promise<boolean> {
    const preferences = await this.findByUserId(userId);
    
    if (!preferences) {
      return true; // Default to enabled if no preferences found
    }

    // Check global channel setting
    const globalEnabled = {
      email: preferences.emailEnabled,
      sms: preferences.smsEnabled,
      push: preferences.pushEnabled,
      inApp: preferences.inAppEnabled
    }[channel];

    if (!globalEnabled) {
      return false;
    }

    // Check specific notification type preference
    const typePreference = preferences.preferences[notificationType];
    if (!typePreference) {
      return true; // Default to enabled if no specific preference
    }

    return typePreference[channel] ?? true;
  }

  private getDefaultPreferences(): NotificationPreferences['preferences'] {
    const notificationTypes: NotificationType[] = [
      'listing_created',
      'listing_sold',
      'listing_expired',
      'purchase_confirmation',
      'payment_received',
      'payment_failed',
      'transaction_completed',
      'review_received',
      'price_drop',
      'fraud_alert',
      'account_suspended',
      'verification_required',
      'dispute_opened',
      'dispute_resolved',
      'system_maintenance',
      'welcome',
      'password_reset'
    ];

    const preferences: NotificationPreferences['preferences'] = {} as any;

    notificationTypes.forEach(type => {
      preferences[type] = {
        email: true,
        sms: type === 'purchase_confirmation' || type === 'payment_received' || type === 'fraud_alert',
        push: true,
        inApp: true
      };
    });

    return preferences;
  }
}
import { BaseRepository } from './BaseRepository';
import { 
  NotificationTemplate, 
  NotificationTemplateEntity, 
  CreateNotificationTemplateInput,
  NotificationType,
  NotificationChannel,
  DatabaseConnection 
} from '../types';
import { randomUUID } from 'crypto';

export class NotificationTemplateRepository extends BaseRepository<NotificationTemplate, NotificationTemplateEntity, CreateNotificationTemplateInput> {
  constructor(connection: DatabaseConnection) {
    super(connection, 'notification_templates');
  }

  protected mapEntityToModel(entity: NotificationTemplateEntity): NotificationTemplate {
    return {
      id: entity.id,
      type: entity.type,
      channel: entity.channel,
      subject: entity.subject || undefined,
      title: entity.title,
      body: entity.body,
      variables: JSON.parse(entity.variables),
      isActive: entity.is_active,
      createdAt: new Date(entity.created_at),
      updatedAt: new Date(entity.updated_at)
    };
  }

  protected mapCreateInputToEntity(input: CreateNotificationTemplateInput): Partial<NotificationTemplateEntity> {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      type: input.type,
      channel: input.channel,
      subject: input.subject,
      title: input.title,
      body: input.body,
      variables: JSON.stringify(input.variables),
      is_active: true,
      created_at: now,
      updated_at: now
    };
  }

  protected getSelectFields(): string {
    return 'id, type, channel, subject, title, body, variables, is_active, created_at, updated_at';
  }

  override async create(input: CreateNotificationTemplateInput): Promise<NotificationTemplate> {
    const entityData = this.mapCreateInputToEntity(input);
    
    const query = `
      INSERT INTO notification_templates (
        id, type, channel, subject, title, body, variables, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${this.getSelectFields()}
    `;
    
    const values = [
      entityData.id,
      entityData.type,
      entityData.channel,
      entityData.subject || null,
      entityData.title,
      entityData.body,
      entityData.variables,
      entityData.is_active,
      entityData.created_at,
      entityData.updated_at
    ];
    
    const result = await this.connection.query<NotificationTemplateEntity>(query, values);
    if (result.length === 0) {
      throw new Error('Failed to create notification template');
    }
    return this.mapEntityToModel(result[0]!);
  }

  async findByTypeAndChannel(type: NotificationType, channel: NotificationChannel): Promise<NotificationTemplate | null> {
    const query = `
      SELECT * FROM notification_templates 
      WHERE type = $1 AND channel = $2 AND is_active = true
    `;
    
    const result = await this.connection.query<NotificationTemplateEntity>(query, [type, channel]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async findByType(type: NotificationType): Promise<NotificationTemplate[]> {
    const query = `
      SELECT * FROM notification_templates 
      WHERE type = $1 AND is_active = true
      ORDER BY channel
    `;
    
    const result = await this.connection.query<NotificationTemplateEntity>(query, [type]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findByChannel(channel: NotificationChannel): Promise<NotificationTemplate[]> {
    const query = `
      SELECT * FROM notification_templates 
      WHERE channel = $1 AND is_active = true
      ORDER BY type
    `;
    
    const result = await this.connection.query<NotificationTemplateEntity>(query, [channel]);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async findActiveTemplates(): Promise<NotificationTemplate[]> {
    const query = `
      SELECT * FROM notification_templates 
      WHERE is_active = true
      ORDER BY type, channel
    `;
    
    const result = await this.connection.query<NotificationTemplateEntity>(query);
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async deactivateTemplate(id: string): Promise<boolean> {
    const query = `
      UPDATE notification_templates 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id]);
    return result.length > 0;
  }

  async activateTemplate(id: string): Promise<boolean> {
    const query = `
      UPDATE notification_templates 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [id]);
    return result.length > 0;
  }

  async updateTemplate(id: string, updates: Partial<CreateNotificationTemplateInput>): Promise<NotificationTemplate | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.subject !== undefined) {
      updateFields.push(`subject = $${paramIndex++}`);
      values.push(updates.subject);
    }

    if (updates.title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.body !== undefined) {
      updateFields.push(`body = $${paramIndex++}`);
      values.push(updates.body);
    }

    if (updates.variables !== undefined) {
      updateFields.push(`variables = $${paramIndex++}`);
      values.push(JSON.stringify(updates.variables));
    }

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE notification_templates 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.connection.query<NotificationTemplateEntity>(query, values);
    return result.length > 0 ? this.mapEntityToModel(result[0]!) : null;
  }

  async renderTemplate(template: NotificationTemplate, variables: Record<string, any>): Promise<{ subject?: string; title: string; body: string }> {
    let renderedSubject = template.subject;
    let renderedTitle = template.title;
    let renderedBody = template.body;

    // Replace template variables with actual values
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const stringValue = String(value);

      if (renderedSubject) {
        renderedSubject = renderedSubject.replace(new RegExp(placeholder, 'g'), stringValue);
      }
      renderedTitle = renderedTitle.replace(new RegExp(placeholder, 'g'), stringValue);
      renderedBody = renderedBody.replace(new RegExp(placeholder, 'g'), stringValue);
    });

    return {
      subject: renderedSubject,
      title: renderedTitle,
      body: renderedBody
    };
  }
}
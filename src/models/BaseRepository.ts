import { DatabaseConnection } from '../types';

export abstract class BaseRepository<T, TEntity, TCreateInput> {
  protected connection: DatabaseConnection;
  protected tableName: string;

  constructor(connection: DatabaseConnection, tableName: string) {
    this.connection = connection;
    this.tableName = tableName;
  }

  // Abstract methods that must be implemented by concrete repositories
  protected abstract mapEntityToModel(entity: TEntity): T;
  protected abstract mapCreateInputToEntity(input: TCreateInput): Partial<TEntity>;
  protected abstract getSelectFields(): string;

  async findById(id: string): Promise<T | null> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE id = $1
    `;
    
    const result = await this.connection.query<TEntity>(query, [id]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<T[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await this.connection.query<TEntity>(query, [limit, offset]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async create(input: TCreateInput): Promise<T> {
    const entityData = this.mapCreateInputToEntity(input);
    const fields = Object.keys(entityData);
    const values = Object.values(entityData);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING ${this.getSelectFields()}
    `;
    
    const result = await this.connection.query<TEntity>(query, values);
    
    if (result.length === 0) {
      throw new Error(`Failed to create record in ${this.tableName}`);
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    // Filter out undefined values and system fields
    const filteredUpdates = Object.entries(updates)
      .filter(([_, value]) => value !== undefined)
      .filter(([key]) => !['id', 'createdAt'].includes(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    if (Object.keys(filteredUpdates).length === 0) {
      return this.findById(id);
    }

    const entityUpdates = this.mapUpdateToEntity(filteredUpdates);
    const fields = Object.keys(entityUpdates);
    const values = Object.values(entityUpdates);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $1
      RETURNING ${this.getSelectFields()}
    `;
    
    const result = await this.connection.query<TEntity>(query, [id, ...values]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const result = await this.connection.query(query, [id]);
    
    return (result as any).rowCount > 0;
  }

  async count(): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const result = await this.connection.query<{ count: string }>(query);
    
    return parseInt(result[0]?.count || '0');
  }

  async exists(id: string): Promise<boolean> {
    const query = `SELECT 1 FROM ${this.tableName} WHERE id = $1 LIMIT 1`;
    const result = await this.connection.query(query, [id]);
    
    return result.length > 0;
  }

  // Helper method for mapping updates to entity format
  protected mapUpdateToEntity(updates: Partial<T>): Record<string, any> {
    // Convert camelCase to snake_case for database fields
    const entityUpdates: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = this.camelToSnake(key);
      entityUpdates[snakeKey] = value;
    }
    
    return entityUpdates;
  }

  // Helper method to convert camelCase to snake_case
  protected camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  // Helper method to convert snake_case to camelCase
  protected snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // Helper method to convert database entity field names to model field names
  protected convertEntityFields(entity: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(entity)) {
      const camelKey = this.snakeToCamel(key);
      converted[camelKey] = value;
    }
    
    return converted;
  }

  // Helper method to format dates
  protected formatDate(dateString: string): Date {
    return new Date(dateString);
  }

  // Helper method to format date for database
  protected formatDateForDb(date: Date): string {
    return date.toISOString();
  }
}
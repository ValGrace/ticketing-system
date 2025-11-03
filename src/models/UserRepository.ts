import { BaseRepository } from './BaseRepository';
import { 
  User, 
  UserEntity, 
  CreateUserInput, 
  UserRepository as IUserRepository,
  DatabaseConnection 
} from '../types';
import bcrypt from 'bcryptjs';

export class UserRepository extends BaseRepository<User, UserEntity, CreateUserInput> implements IUserRepository {
  constructor(connection: DatabaseConnection) {
    super(connection, 'users');
  }

  protected getSelectFields(): string {
    return `
      id, email, username, first_name, last_name, phone_number, 
      profile_image, is_verified, rating, total_transactions, 
      role, status, created_at, updated_at
    `;
  }

  protected mapEntityToModel(entity: UserEntity): User {
    const user: User = {
      id: entity.id,
      email: entity.email,
      username: entity.username,
      firstName: entity.first_name,
      lastName: entity.last_name,
      isVerified: entity.is_verified,
      rating: parseFloat(entity.rating.toString()),
      totalTransactions: entity.total_transactions,
      role: entity.role,
      status: entity.status,
      createdAt: this.formatDate(entity.created_at),
      updatedAt: this.formatDate(entity.updated_at),
    };
    
    if (entity.phone_number) {
      user.phoneNumber = entity.phone_number;
    }
    
    if (entity.profile_image) {
      user.profileImage = entity.profile_image;
    }
    
    return user;
  }

  protected mapCreateInputToEntity(input: CreateUserInput): Partial<UserEntity> {
    const entity: Partial<UserEntity> = {
      email: input.email,
      username: input.username,
      first_name: input.firstName,
      last_name: input.lastName,
      password_hash: '', // Will be set in create method
      is_verified: false,
      rating: 0,
      total_transactions: 0,
      role: 'user',
      status: 'active',
    };
    
    if (input.phoneNumber) {
      entity.phone_number = input.phoneNumber;
    }
    
    return entity;
  }

  override async create(input: CreateUserInput): Promise<User> {
    // Hash password before creating user
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);
    
    const entityData = {
      ...this.mapCreateInputToEntity(input),
      password_hash: passwordHash,
    };

    const fields = Object.keys(entityData);
    const values = Object.values(entityData);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING ${this.getSelectFields()}
    `;
    
    const result = await this.connection.query<UserEntity>(query, values);
    
    if (result.length === 0) {
      throw new Error('Failed to create user');
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE email = $1
    `;
    
    const result = await this.connection.query<UserEntity>(query, [email]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async findByUsername(username: string): Promise<User | null> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE username = $1
    `;
    
    const result = await this.connection.query<UserEntity>(query, [username]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async findByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE email = $1 OR username = $1
    `;
    
    const result = await this.connection.query<UserEntity>(query, [emailOrUsername]);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.mapEntityToModel(result[0]!);
  }

  async validatePassword(userId: string, password: string): Promise<boolean> {
    const query = `
      SELECT password_hash
      FROM ${this.tableName}
      WHERE id = $1
    `;
    
    const result = await this.connection.query<{ password_hash: string }>(query, [userId]);
    
    if (result.length === 0) {
      return false;
    }
    
    return bcrypt.compare(password, result[0]!.password_hash);
  }

  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    
    const query = `
      UPDATE ${this.tableName}
      SET password_hash = $2
      WHERE id = $1
    `;
    
    const result = await this.connection.query(query, [userId, passwordHash]);
    
    return (result as any).rowCount > 0;
  }

  async updateRating(id: string, newRating: number): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET rating = $2
      WHERE id = $1
    `;
    
    await this.connection.query(query, [id, newRating]);
  }

  async incrementTransactionCount(id: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET total_transactions = total_transactions + 1
      WHERE id = $1
    `;
    
    await this.connection.query(query, [id]);
  }

  async findByStatus(status: User['status'], limit: number = 50, offset: number = 0): Promise<User[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.connection.query<UserEntity>(query, [status, limit, offset]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }

  async searchUsers(searchTerm: string, limit: number = 50, offset: number = 0): Promise<User[]> {
    const query = `
      SELECT ${this.getSelectFields()}
      FROM ${this.tableName}
      WHERE (
        username ILIKE $1 OR 
        first_name ILIKE $1 OR 
        last_name ILIKE $1 OR
        email ILIKE $1
      )
      AND status = 'active'
      ORDER BY rating DESC, total_transactions DESC
      LIMIT $2 OFFSET $3
    `;
    
    const searchPattern = `%${searchTerm}%`;
    const result = await this.connection.query<UserEntity>(query, [searchPattern, limit, offset]);
    
    return result.map(entity => this.mapEntityToModel(entity));
  }
}
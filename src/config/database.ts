import { Pool, PoolConfig } from 'pg';
import { DatabaseConfig, DatabaseConnection } from '../types';
require('dotenv').config();

// Database configuration
export const getDatabaseConfig = (): DatabaseConfig => {
  // Support both DATABASE_URL and individual environment variables
  const databaseUrl = process.env['DATABASE_TEST_URL'];
  console.log('DB_PASS',databaseUrl);
  if (databaseUrl) {
    // Parse DATABASE_URL format: postgresql://user:password@host:port/database
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // Remove leading slash
      username: url.username,
      password: url.password,
      ssl: url.searchParams.get('ssl') === 'true' || process.env['NODE_ENV'] === 'production',
      maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20'),
      idleTimeoutMillis: parseInt(process.env['DB_IDLE_TIMEOUT'] || '30000'),
      connectionTimeoutMillis: parseInt(process.env['DB_CONNECTION_TIMEOUT'] || '2000'),
    };
  }
  
  // Fallback to individual environment variables
  return {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432'),
    database: process.env['DB_NAME'] || 'ticket_platform',
    username: process.env['DB_USER'] || 'postgres',
    password: process.env['DB_PASSWORD'] || 'postgres',
    ssl: process.env['DB_SSL'] === 'true',
    maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20'),
    idleTimeoutMillis: parseInt(process.env['DB_IDLE_TIMEOUT'] || '30000'),
    connectionTimeoutMillis: parseInt(process.env['DB_CONNECTION_TIMEOUT'] || '2000'),
  };
};

// PostgreSQL connection pool
class DatabasePool {
  private pool: Pool;
  private static instance: DatabasePool;

  private constructor() {
    const config = getDatabaseConfig();
    
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  public static getInstance(): DatabasePool {
    if (!DatabasePool.instance) {
      DatabasePool.instance = new DatabasePool();
    }
    return DatabasePool.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
}

// Database connection wrapper
export class PostgreSQLConnection implements DatabaseConnection {
  private pool: Pool;

  constructor() {
    this.pool = DatabasePool.getInstance().getPool();
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: DatabaseConnection) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const transactionClient: DatabaseConnection = {
        query: async <U = any>(text: string, params?: any[]): Promise<U[]> => {
          const result = await client.query(text, params);
          return result.rows as U[];
        },
        transaction: async <U>(_cb: (c: DatabaseConnection) => Promise<U>): Promise<U> => {
          throw new Error('Nested transactions are not supported');
        },
        close: async (): Promise<void> => {
          // No-op for transaction client
        }
      };

      const result = await callback(transactionClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await DatabasePool.getInstance().close();
  }
}

// Database initialization and migration utilities
export class DatabaseMigrator {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await this.connection.query(query);
  }

  async isMigrationExecuted(filename: string): Promise<boolean> {
    const result = await this.connection.query(
      'SELECT 1 FROM migrations WHERE filename = $1',
      [filename]
    );
    return result.length > 0;
  }

  async recordMigration(filename: string): Promise<void> {
    await this.connection.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      [filename]
    );
  }

  async executeMigration(filename: string, sql: string): Promise<void> {
    await this.connection.transaction(async (client) => {
      // Execute the migration SQL
      await client.query(sql);
      
      // Record the migration
      await client.query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [filename]
      );
    });
  }
}

// Export singleton instance
export const database = new PostgreSQLConnection();

// Utility functions
export const connectDatabase = async (): Promise<boolean> => {
  try {
    const dbPool = DatabasePool.getInstance();
    const isConnected = await dbPool.testConnection();
    
    if (isConnected) {
      console.log('Database connected successfully');
      
      // Create migrations table if it doesn't exist
      const migrator = new DatabaseMigrator(database);
      await migrator.createMigrationsTable();
      
      return true;
    } else {
      console.error('Failed to connect to database');
      return false;
    }
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await database.close();
  console.log('Database disconnected');
};

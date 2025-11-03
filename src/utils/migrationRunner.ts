import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from '../types';
import { DatabaseMigrator } from '../config/database';

export class MigrationRunner {
  private migrator: DatabaseMigrator;
  private migrationsPath: string;

  constructor(connection: DatabaseConnection, migrationsPath?: string) {
    this.migrator = new DatabaseMigrator(connection);
    this.migrationsPath = migrationsPath || join(__dirname, '../migrations');
  }

  async runMigrations(): Promise<void> {
    console.log('Starting database migrations...');
    
    // Ensure migrations table exists
    await this.migrator.createMigrationsTable();
    
    // List of migration files in order
    const migrations = [
      '001_initial_schema.sql',
    ];

    for (const migrationFile of migrations) {
      const isExecuted = await this.migrator.isMigrationExecuted(migrationFile);
      
      if (isExecuted) {
        console.log(`Migration ${migrationFile} already executed, skipping...`);
        continue;
      }

      console.log(`Executing migration: ${migrationFile}`);
      
      try {
        const migrationPath = join(this.migrationsPath, migrationFile);
        const migrationSQL = readFileSync(migrationPath, 'utf-8');
        
        await this.migrator.executeMigration(migrationFile, migrationSQL);
        
        console.log(`Migration ${migrationFile} executed successfully`);
      } catch (error) {
        console.error(`Failed to execute migration ${migrationFile}:`, error);
        throw error;
      }
    }
    
    console.log('All migrations completed successfully');
  }

  async rollbackLastMigration(): Promise<void> {
    // This is a simplified rollback - in production you'd want more sophisticated rollback logic
    console.log('Rollback functionality not implemented yet');
    throw new Error('Rollback functionality not implemented');
  }
}
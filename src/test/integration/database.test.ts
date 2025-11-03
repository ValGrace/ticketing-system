import { PostgreSQLConnection, connectDatabase, disconnectDatabase } from '../../config/database';
import { MigrationRunner } from '../../utils/migrationRunner';
import { UserRepository } from '../../models/UserRepository';
import { DatabaseConnection } from '../../types';

export async function createTestDatabase(): Promise<DatabaseConnection> {
  // Use test database
  process.env['DB_NAME'] = 'ticket_platform_test';
  
  const connection = new PostgreSQLConnection();
  const isConnected = await connectDatabase();
  
  if (!isConnected) {
    throw new Error('Failed to connect to test database');
  }
  
  // Run migrations
  const migrationRunner = new MigrationRunner(connection);
  await migrationRunner.runMigrations();
  
  return connection;
}

export async function cleanupTestDatabase(connection: DatabaseConnection): Promise<void> {
  await connection.close();
  await disconnectDatabase();
}

describe('Database Integration', () => {
  let connection: PostgreSQLConnection;

  beforeAll(async () => {
    // Use test database
    process.env['DB_NAME'] = 'ticket_platform_test';

    connection = new PostgreSQLConnection();

    // Connect to database
    const isConnected = await connectDatabase();
    expect(isConnected).toBe(true);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Migration', () => {
    it('should run migrations successfully', async () => {
      const migrationRunner = new MigrationRunner(connection);

      // This should not throw
      await expect(migrationRunner.runMigrations()).resolves.not.toThrow();
    });
  });

  describe('Repository Operations', () => {
    let userRepository: UserRepository;

    beforeEach(() => {
      userRepository = new UserRepository(connection);
    });

    it('should create and retrieve a user', async () => {
      const userData = {
        email: 'integration-test@example.com',
        username: 'integrationtest',
        firstName: 'Integration',
        lastName: 'Test',
        password: 'testpassword123',
      };

      // Create user
      const createdUser = await userRepository.create(userData);

      expect(createdUser).toBeDefined();
      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.username).toBe(userData.username);
      expect(createdUser.id).toBeDefined();

      // Retrieve user by ID
      const retrievedUser = await userRepository.findById(createdUser.id);

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.id).toBe(createdUser.id);
      expect(retrievedUser?.email).toBe(userData.email);

      // Retrieve user by email
      const userByEmail = await userRepository.findByEmail(userData.email);

      expect(userByEmail).toBeDefined();
      expect(userByEmail?.id).toBe(createdUser.id);

      // Clean up
      await userRepository.delete(createdUser.id);
    });

    it('should handle user not found scenarios', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const user = await userRepository.findById(nonExistentId);
      expect(user).toBeNull();

      const userByEmail = await userRepository.findByEmail('nonexistent@example.com');
      expect(userByEmail).toBeNull();
    });
  });
});
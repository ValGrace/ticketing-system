import { UserRepository } from '../UserRepository';
import { DatabaseConnection, CreateUserInput } from '../../types';

// Mock database connection
const mockConnection: DatabaseConnection = {
  query: jest.fn(),
  transaction: jest.fn(),
  close: jest.fn(),
};

describe('UserRepository', () => {
  let userRepository: UserRepository;

  beforeEach(() => {
    userRepository = new UserRepository(mockConnection);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a user with hashed password', async () => {
      const mockUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        phone_number: null,
        profile_image: null,
        is_verified: false,
        rating: 0,
        total_transactions: 0,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockConnection.query as jest.Mock).mockResolvedValue([mockUser]);

      const input: CreateUserInput = {
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
      };

      const result = await userRepository.create(input);

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        phoneNumber: undefined,
        profileImage: undefined,
        isVerified: false,
        rating: 0,
        totalTransactions: 0,
        status: 'active',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([
          'test@example.com',
          'testuser',
          'Test',
          'User',
          expect.any(String), // hashed password
          false,
          0,
          0,
          'active',
        ])
      );
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        phone_number: null,
        profile_image: null,
        is_verified: false,
        rating: 0,
        total_transactions: 0,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (mockConnection.query as jest.Mock).mockResolvedValue([mockUser]);

      const result = await userRepository.findByEmail('test@example.com');

      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE email = $1'),
        ['test@example.com']
      );
    });

    it('should return null when user not found', async () => {
      (mockConnection.query as jest.Mock).mockResolvedValue([]);

      const result = await userRepository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should validate correct password', async () => {
      const hashedPassword = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RBSh6.1u.'; // hash of 'password123'
      
      (mockConnection.query as jest.Mock).mockResolvedValue([
        { password_hash: hashedPassword }
      ]);

      // Mock bcrypt.compare to return true for this test
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await userRepository.validatePassword('user-id', 'password123');

      expect(result).toBe(true);
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT password_hash'),
        ['user-id']
      );
    });
  });
});
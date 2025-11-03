import { AuthService } from '../AuthService';
import { UserRepository, User, CreateUserInput } from '../../types';
import { JwtUtils } from '../../utils/jwt';
import { PasswordUtils } from '../../utils/password';

// Mock dependencies
jest.mock('../../utils/jwt');
jest.mock('../../utils/password');

const mockJwtUtils = JwtUtils as jest.Mocked<typeof JwtUtils>;
const mockPasswordUtils = PasswordUtils as jest.Mocked<typeof PasswordUtils>;

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    rating: 4.5,
    totalTransactions: 10,
    role: 'user',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token'
  };

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
      updateRating: jest.fn(),
      incrementTransactionCount: jest.fn(),
      validatePassword: jest.fn(),
      updatePassword: jest.fn()
    } as any;

    authService = new AuthService(mockUserRepository);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerInput: CreateUserInput = {
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      password: 'TestPassword123!'
    };

    it('should register a new user successfully', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockPasswordUtils.validatePasswordStrength.mockReturnValue({
        isValid: true,
        errors: []
      });
      mockPasswordUtils.hashPassword.mockResolvedValue('hashed-password');
      mockUserRepository.create.mockResolvedValue(mockUser);
      mockJwtUtils.generateTokenPair.mockReturnValue(mockTokens);

      const result = await authService.register(registerInput);

      expect(result.user).toEqual(mockUser);
      expect(result.tokens).toEqual(mockTokens);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(registerInput.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(registerInput.username);
      expect(mockPasswordUtils.validatePasswordStrength).toHaveBeenCalledWith(registerInput.password);
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockJwtUtils.generateTokenPair).toHaveBeenCalledWith(mockUser);
    });

    it('should throw error if email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(authService.register(registerInput)).rejects.toThrow(
        'User with this email already exists'
      );
    });

    it('should throw error if username already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(mockUser);

      await expect(authService.register(registerInput)).rejects.toThrow(
        'Username is already taken'
      );
    });

    it('should throw error for weak password', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockPasswordUtils.validatePasswordStrength.mockReturnValue({
        isValid: false,
        errors: ['Password is too weak']
      });

      await expect(authService.register(registerInput)).rejects.toThrow(
        'Password validation failed: Password is too weak'
      );
    });
  });

  describe('login', () => {
    const loginCredentials = {
      email: 'test@example.com',
      password: 'TestPassword123!'
    };

    it('should login user successfully', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.validatePassword.mockResolvedValue(true);
      mockJwtUtils.generateTokenPair.mockReturnValue(mockTokens);

      const result = await authService.login(loginCredentials);

      expect(result.user).toEqual(mockUser);
      expect(result.tokens).toEqual(mockTokens);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(loginCredentials.email);
      expect(mockUserRepository.validatePassword).toHaveBeenCalledWith(mockUser.id, loginCredentials.password);
      expect(mockJwtUtils.generateTokenPair).toHaveBeenCalledWith(mockUser);
    });

    it('should throw error for non-existent user', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.login(loginCredentials)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should throw error for suspended account', async () => {
      const suspendedUser = { ...mockUser, status: 'suspended' as const };
      mockUserRepository.findByEmail.mockResolvedValue(suspendedUser);

      await expect(authService.login(loginCredentials)).rejects.toThrow(
        'Account is suspended or banned'
      );
    });

    it('should throw error for invalid password', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.validatePassword.mockResolvedValue(false);

      await expect(authService.login(loginCredentials)).rejects.toThrow(
        'Invalid email or password'
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const newAccessToken = 'new-access-token';
      mockJwtUtils.refreshAccessToken.mockResolvedValue(newAccessToken);

      const result = await authService.refreshToken('valid-refresh-token');

      expect(result.accessToken).toBe(newAccessToken);
      expect(mockJwtUtils.refreshAccessToken).toHaveBeenCalledWith(
        'valid-refresh-token',
        expect.any(Function)
      );
    });

    it('should throw error for invalid refresh token', async () => {
      mockJwtUtils.refreshAccessToken.mockRejectedValue(new Error('Invalid token'));

      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await authService.getUserProfile('user-123');

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
    });

    it('should return null for non-existent user', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await authService.getUserProfile('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockUserRepository.validatePassword.mockResolvedValue(true);
      mockPasswordUtils.validatePasswordStrength.mockReturnValue({
        isValid: true,
        errors: []
      });
      mockUserRepository.updatePassword.mockResolvedValue(true);

      await authService.changePassword('user-123', 'oldPassword', 'NewPassword123!');

      expect(mockUserRepository.validatePassword).toHaveBeenCalledWith('user-123', 'oldPassword');
      expect(mockPasswordUtils.validatePasswordStrength).toHaveBeenCalledWith('NewPassword123!');
      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith('user-123', 'NewPassword123!');
    });

    it('should throw error for incorrect current password', async () => {
      mockUserRepository.validatePassword.mockResolvedValue(false);

      await expect(
        authService.changePassword('user-123', 'wrongPassword', 'NewPassword123!')
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error for weak new password', async () => {
      mockUserRepository.validatePassword.mockResolvedValue(true);
      mockPasswordUtils.validatePasswordStrength.mockReturnValue({
        isValid: false,
        errors: ['Password is too weak']
      });

      await expect(
        authService.changePassword('user-123', 'oldPassword', 'weak')
      ).rejects.toThrow('Password validation failed: Password is too weak');
    });

    it('should throw error if password update fails', async () => {
      mockUserRepository.validatePassword.mockResolvedValue(true);
      mockPasswordUtils.validatePasswordStrength.mockReturnValue({
        isValid: true,
        errors: []
      });
      mockUserRepository.updatePassword.mockResolvedValue(false);

      await expect(
        authService.changePassword('user-123', 'oldPassword', 'NewPassword123!')
      ).rejects.toThrow('Failed to update password');
    });
  });

  describe('logout', () => {
    it('should logout successfully with valid refresh token', async () => {
      mockJwtUtils.verifyRefreshToken.mockReturnValue({ userId: 'user-123' });

      await expect(authService.logout('valid-refresh-token')).resolves.not.toThrow();
      expect(mockJwtUtils.verifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should throw error for invalid refresh token', async () => {
      mockJwtUtils.verifyRefreshToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.logout('invalid-token')).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });
});
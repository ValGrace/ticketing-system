import { UserRepository, User, CreateUserInput } from '../types';
import { JwtUtils, TokenPair } from '../utils/jwt';
import { PasswordUtils } from '../utils/password';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  user: User;
  tokens: TokenPair;
}

export interface RefreshTokenResult {
  accessToken: string;
}

export class AuthService {
  constructor(private userRepository: UserRepository) {}

  /**
   * Register a new user
   */
  async register(input: CreateUserInput): Promise<AuthResult> {
    // Check if user already exists
    const existingUserByEmail = await this.userRepository.findByEmail(input.email);
    if (existingUserByEmail) {
      throw new Error('User with this email already exists');
    }

    const existingUserByUsername = await this.userRepository.findByUsername(input.username);
    if (existingUserByUsername) {
      throw new Error('Username is already taken');
    }

    // Validate password strength
    const passwordValidation = PasswordUtils.validatePasswordStrength(input.password);
    if (!passwordValidation.isValid) {
      throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Create user (repository handles password hashing)
    const user = await this.userRepository.create(input);

    // Generate tokens
    const tokens = JwtUtils.generateTokenPair(user);

    return { user, tokens };
  }

  /**
   * Login user with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    const { email, password } = credentials;

    // Find user by email
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if account is active
    if (user.status !== 'active') {
      throw new Error('Account is suspended or banned');
    }

    // Verify password using repository method
    const isValidPassword = await this.userRepository.validatePassword(user.id, password);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const tokens = JwtUtils.generateTokenPair(user);

    return { user, tokens };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResult> {
    try {
      const accessToken = await JwtUtils.refreshAccessToken(
        refreshToken,
        (id: string) => this.userRepository.findById(id)
      );

      return { accessToken };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Verify user password (helper method)
   */
  private async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    return this.userRepository.validatePassword(userId, password);
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Verify current password
    const isValidCurrentPassword = await this.verifyUserPassword(userId, currentPassword);
    if (!isValidCurrentPassword) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password strength
    const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Update password in database (repository handles hashing)
    const success = await this.userRepository.updatePassword(userId, newPassword);
    if (!success) {
      throw new Error('Failed to update password');
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  /**
   * Logout user (invalidate tokens)
   * In a production system, you might want to maintain a blacklist of invalidated tokens
   */
  async logout(refreshToken: string): Promise<void> {
    // Verify the refresh token is valid
    try {
      JwtUtils.verifyRefreshToken(refreshToken);
      // In a production system, you would add this token to a blacklist
      // or store it in Redis with an expiration time
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}
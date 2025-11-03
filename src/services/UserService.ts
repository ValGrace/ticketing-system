import { User } from '../types';
import { UserRepository as UserRepo } from '../models/UserRepository';
import { TransactionRepository as TransactionRepo } from '../models/TransactionRepository';
import { ReviewRepository as ReviewRepo } from '../models/ReviewRepository';

export interface UpdateUserProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profileImage?: string;
}

export interface UserTransactionHistory {
  transactions: any[];
  stats: {
    totalTransactions: number;
    totalSpent: number;
    totalEarned: number;
    averageTransactionValue: number;
  };
  reviews: {
    totalReviews: number;
    averageRating: number;
    ratingDistribution: { [rating: number]: number };
    recentReviews: any[];
  };
  pendingReviews: any[];
}

export class UserService {
  constructor(
    private userRepository: UserRepo,
    private transactionRepository: TransactionRepo,
    private reviewRepository: ReviewRepo
  ) {}

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: UpdateUserProfileInput): Promise<User | null> {
    // Validate input
    this.validateProfileUpdates(updates);

    // Check if user exists
    const existingUser = await this.userRepository.findById(userId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Check if user is active
    if (existingUser.status !== 'active') {
      throw new Error('Cannot update profile for inactive user');
    }

    // Prepare updates object
    const userUpdates: Partial<User> = {};
    
    if (updates.firstName !== undefined) {
      userUpdates.firstName = updates.firstName;
    }
    
    if (updates.lastName !== undefined) {
      userUpdates.lastName = updates.lastName;
    }
    
    if (updates.phoneNumber !== undefined) {
      userUpdates.phoneNumber = updates.phoneNumber;
    }
    
    if (updates.profileImage !== undefined) {
      userUpdates.profileImage = updates.profileImage;
    }

    // Update user
    return this.userRepository.update(userId, userUpdates);
  }

  /**
   * Get comprehensive transaction history for a user
   */
  async getUserTransactionHistory(
    userId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<UserTransactionHistory> {
    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get transaction history
    const transactions = await this.transactionRepository.findUserTransactionHistory(userId, limit, offset);

    // Get transaction statistics
    const stats = await this.transactionRepository.getTransactionStats(userId);

    // Get review statistics
    const reviews = await this.reviewRepository.getReviewStats(userId);

    // Get pending reviews
    const pendingReviews = await this.reviewRepository.findPendingReviews(userId);

    return {
      transactions,
      stats,
      reviews,
      pendingReviews
    };
  }

  /**
   * Delete user account with data cleanup
   */
  async deleteUserAccount(userId: string): Promise<boolean> {
    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check for active transactions
    const activeTransactions = await this.transactionRepository.findByBuyerId(userId);
    const activeSellerTransactions = await this.transactionRepository.findBySellerId(userId);
    
    const hasActiveTransactions = [...activeTransactions, ...activeSellerTransactions]
      .some(transaction => ['pending', 'paid', 'confirmed', 'disputed'].includes(transaction.status));

    if (hasActiveTransactions) {
      throw new Error('Cannot delete account with active transactions. Please complete or cancel all active transactions first.');
    }

    // Perform account deletion with data cleanup
    // Note: In a real implementation, you might want to anonymize data instead of hard delete
    // to maintain transaction integrity and comply with regulations
    
    try {
      // Mark user as deleted/banned instead of hard delete to maintain referential integrity
      const updateData: Partial<User> = {
        status: 'banned',
        email: `deleted_${userId}@deleted.com`,
        username: `deleted_${userId}`,
        firstName: 'Deleted',
        lastName: 'User'
      };
      
      // Remove optional fields by setting them to undefined
      delete (updateData as any).phoneNumber;
      delete (updateData as any).profileImage;
      
      const deletedUser = await this.userRepository.update(userId, updateData);

      return deletedUser !== null;
    } catch (error) {
      throw new Error('Failed to delete user account');
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    profile: User;
    transactionStats: any;
    reviewStats: any;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const transactionStats = await this.transactionRepository.getTransactionStats(userId);
    const reviewStats = await this.reviewRepository.getReviewStats(userId);

    return {
      profile: user,
      transactionStats,
      reviewStats
    };
  }

  /**
   * Search users (for admin purposes)
   */
  async searchUsers(
    searchTerm: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<User[]> {
    return this.userRepository.searchUsers(searchTerm, limit, offset);
  }

  /**
   * Get users by status (for admin purposes)
   */
  async getUsersByStatus(
    status: User['status'], 
    limit: number = 50, 
    offset: number = 0
  ): Promise<User[]> {
    return this.userRepository.findByStatus(status, limit, offset);
  }

  /**
   * Validate profile update input
   */
  private validateProfileUpdates(updates: UpdateUserProfileInput): void {
    if (updates.firstName !== undefined) {
      if (typeof updates.firstName !== 'string' || updates.firstName.trim().length === 0) {
        throw new Error('First name must be a non-empty string');
      }
      if (updates.firstName.length > 50) {
        throw new Error('First name must be 50 characters or less');
      }
    }

    if (updates.lastName !== undefined) {
      if (typeof updates.lastName !== 'string' || updates.lastName.trim().length === 0) {
        throw new Error('Last name must be a non-empty string');
      }
      if (updates.lastName.length > 50) {
        throw new Error('Last name must be 50 characters or less');
      }
    }

    if (updates.phoneNumber !== undefined) {
      if (updates.phoneNumber !== null && typeof updates.phoneNumber !== 'string') {
        throw new Error('Phone number must be a string or null');
      }
      if (updates.phoneNumber && !/^\+?[\d\s\-\(\)]{10,20}$/.test(updates.phoneNumber)) {
        throw new Error('Invalid phone number format');
      }
    }

    if (updates.profileImage !== undefined) {
      if (updates.profileImage !== null && typeof updates.profileImage !== 'string') {
        throw new Error('Profile image must be a string URL or null');
      }
      if (updates.profileImage && updates.profileImage.length > 500) {
        throw new Error('Profile image URL must be 500 characters or less');
      }
    }
  }
}
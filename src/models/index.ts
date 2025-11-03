// Export all repository classes and base repository
export { BaseRepository } from './BaseRepository';
export { UserRepository } from './UserRepository';
export { TicketListingRepository } from './TicketListingRepository';
export { TransactionRepository } from './TransactionRepository';
export { ReviewRepository } from './ReviewRepository';
export { FraudReportRepository } from './FraudReportRepository';
export { SuspiciousActivityRepository } from './SuspiciousActivityRepository';
export { TicketVerificationRepository } from './TicketVerificationRepository';
export { UserSuspensionRepository } from './UserSuspensionRepository';
export { NotificationRepository } from './NotificationRepository';
export { NotificationPreferencesRepository } from './NotificationPreferencesRepository';
export { NotificationTemplateRepository } from './NotificationTemplateRepository';

// Export repository factory for dependency injection
import { DatabaseConnection } from '../types';
import { UserRepository } from './UserRepository';
import { TicketListingRepository } from './TicketListingRepository';
import { TransactionRepository } from './TransactionRepository';
import { ReviewRepository } from './ReviewRepository';

export class RepositoryFactory {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  createUserRepository(): UserRepository {
    return new UserRepository(this.connection);
  }

  createTicketListingRepository(): TicketListingRepository {
    return new TicketListingRepository(this.connection);
  }

  createTransactionRepository(): TransactionRepository {
    return new TransactionRepository(this.connection);
  }

  createReviewRepository(): ReviewRepository {
    return new ReviewRepository(this.connection);
  }
}

// Singleton repository instances (for convenience)
let repositoryFactory: RepositoryFactory | null = null;

export const initializeRepositories = (connection: DatabaseConnection): RepositoryFactory => {
  repositoryFactory = new RepositoryFactory(connection);
  return repositoryFactory;
};

export const getRepositoryFactory = (): RepositoryFactory => {
  if (!repositoryFactory) {
    throw new Error('Repositories not initialized. Call initializeRepositories first.');
  }
  return repositoryFactory;
};
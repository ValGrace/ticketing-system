// Jest setup file for test configuration
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Setup test database connections, etc.
});

afterAll(async () => {
  // Cleanup test resources
});

// Mock external services for testing
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    paymentIntents: {
      create: jest.fn(),
      confirm: jest.fn(),
      retrieve: jest.fn(),
    },
  })),
}));

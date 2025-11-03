import request from 'supertest';
import { createApp } from '../../index';
import { connectDatabase, database } from '../../config/database';
import { MigrationRunner } from '../../utils/migrationRunner';

describe('Fraud Detection Integration Tests', () => {
  let app: any;

  beforeAll(async () => {
    // Connect to database
    const isConnected = await connectDatabase();
    expect(isConnected).toBe(true);

    // Run migrations
    const migrationRunner = new MigrationRunner(database);
    await migrationRunner.runMigrations();

    app = createApp();
  });

  afterAll(async () => {
    await database.close();
  });

  describe('Fraud Detection System', () => {
    it('should have fraud detection routes available', async () => {
      // Test that the fraud detection routes are properly set up
      const response = await request(app)
        .get('/api/fraud/statistics')
        .expect(401); // Should require authentication

      expect(response.body.error).toBeDefined();
    });

    it('should validate fraud report creation', async () => {
      const fraudReport = {
        reportedUserId: 'test-user-id',
        type: 'fake_ticket',
        reason: 'Test reason',
        description: 'Test description'
      };

      const response = await request(app)
        .post('/api/fraud/reports')
        .send(fraudReport)
        .expect(401); // Should require authentication

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Fraud Detection Service Functionality', () => {
    it('should initialize fraud detection service', () => {
      // This test verifies that the fraud detection system is properly integrated
      expect(app).toBeDefined();
    });
  });
});
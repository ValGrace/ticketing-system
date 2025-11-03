import request from 'supertest';
import { createApp } from '../../index';
import { connectDatabase, database } from '../../config/database';
import { MigrationRunner } from '../../utils/migrationRunner';
import { UserRepository } from '../../models/UserRepository';
import { NotificationService } from '../../services/NotificationService';
import { AuthService } from '../../services/AuthService';

describe('Notification Integration Tests', () => {
  let app: any;
  let userRepository: UserRepository;
  let notificationService: NotificationService;
  let authService: AuthService;
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    // Connect to database
    const isConnected = await connectDatabase();
    expect(isConnected).toBe(true);

    // Run migrations
    const migrationRunner = new MigrationRunner(database);
    await migrationRunner.runMigrations();

    // Initialize app
    app = createApp(database);
    
    // Initialize services
    userRepository = new UserRepository(database);
    notificationService = new NotificationService(database);
    authService = new AuthService(userRepository);

    // Create test user
    const testUser = await userRepository.create({
      email: 'notification-test@example.com',
      username: 'notificationtest',
      firstName: 'Notification',
      lastName: 'Test',
      password: 'password123',
      phoneNumber: '+1234567890'
    });
    testUserId = testUser.id;

    // Generate auth token by logging in
    const authResult = await authService.login({
      email: 'notification-test@example.com',
      password: 'password123'
    });
    authToken = authResult.tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await database.query('DELETE FROM notifications WHERE user_id = $1', [testUserId]);
      await database.query('DELETE FROM notification_preferences WHERE user_id = $1', [testUserId]);
      await database.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    
    await database.close();
  });

  describe('POST /api/notifications/test', () => {
    it('should send a test notification successfully', async () => {
      const testNotificationData = {
        type: 'welcome',
        variables: {
          userName: 'Notification Test'
        },
        channels: ['email', 'push']
      };

      const response = await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testNotificationData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Test notification sent successfully'
        }
      });
    });

    it('should reject test notification without authentication', async () => {
      const testNotificationData = {
        type: 'welcome',
        variables: {
          userName: 'Test'
        }
      };

      const response = await request(app)
        .post('/api/notifications/test')
        .send(testNotificationData)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject test notification with invalid type', async () => {
      const testNotificationData = {
        type: 'invalid_type',
        variables: {}
      };

      const response = await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testNotificationData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/notifications', () => {
    beforeEach(async () => {
      // Create some test notifications
      await notificationService.sendNotification(testUserId, 'welcome', { userName: 'Test' });
      await notificationService.sendNotification(testUserId, 'listing_created', { eventName: 'Test Event' });
    });

    it('should get user notifications with pagination', async () => {
      const response = await request(app)
        .get('/api/notifications?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          notifications: expect.any(Array),
          unreadCount: expect.any(Number),
          pagination: {
            limit: 10,
            offset: 0,
            hasMore: expect.any(Boolean)
          }
        }
      });

      expect(response.body.data.notifications.length).toBeGreaterThan(0);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/notifications/unread', () => {
    it('should get unread notifications', async () => {
      const response = await request(app)
        .get('/api/notifications/unread')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          notifications: expect.any(Array),
          unreadCount: expect.any(Number)
        }
      });
    });
  });

  describe('GET /api/notifications/unread/count', () => {
    it('should get unread count', async () => {
      const response = await request(app)
        .get('/api/notifications/unread/count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          unreadCount: expect.any(Number)
        }
      });
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const response = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'All notifications marked as read',
          markedCount: expect.any(Number)
        }
      });
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('should get user notification preferences', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          preferences: {
            id: expect.any(String),
            userId: testUserId,
            emailEnabled: expect.any(Boolean),
            smsEnabled: expect.any(Boolean),
            pushEnabled: expect.any(Boolean),
            inAppEnabled: expect.any(Boolean),
            preferences: expect.any(Object)
          }
        }
      });
    });
  });

  describe('PATCH /api/notifications/preferences', () => {
    it('should update user notification preferences', async () => {
      const updates = {
        emailEnabled: false,
        smsEnabled: true,
        preferences: {
          welcome: {
            email: false,
            sms: true,
            push: true,
            inApp: true
          }
        }
      };

      const response = await request(app)
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          preferences: {
            emailEnabled: false,
            smsEnabled: true
          }
        }
      });
    });

    it('should reject invalid preference updates', async () => {
      const invalidUpdates = {
        emailEnabled: 'invalid'
      };

      const response = await request(app)
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdates)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Notification Service Methods', () => {
    it('should send welcome notification', async () => {
      const result = await notificationService.sendWelcomeNotification(testUserId);
      expect(result).toBe(true);
    });

    it('should send listing created notification', async () => {
      const listingData = {
        eventName: 'Test Concert',
        eventDate: '2024-12-25',
        price: 100
      };

      const result = await notificationService.sendListingCreatedNotification(testUserId, listingData);
      expect(result).toBe(true);
    });

    it('should send purchase confirmation notification', async () => {
      const transactionData = {
        eventName: 'Test Concert',
        eventDate: '2024-12-25',
        quantity: 2,
        totalAmount: 200
      };

      const result = await notificationService.sendPurchaseConfirmationNotification(testUserId, transactionData);
      expect(result).toBe(true);
    });

    it('should send fraud alert notification', async () => {
      const alertData = {
        reason: 'Suspicious activity detected',
        details: 'Multiple failed login attempts'
      };

      const result = await notificationService.sendFraudAlertNotification(testUserId, alertData);
      expect(result).toBe(true);
    });

    it('should get user notifications', async () => {
      const notifications = await notificationService.getUserNotifications(testUserId, 10, 0);
      expect(Array.isArray(notifications)).toBe(true);
    });

    it('should get unread count', async () => {
      const count = await notificationService.getUnreadCount(testUserId);
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get user preferences', async () => {
      const preferences = await notificationService.getUserPreferences(testUserId);
      expect(preferences).toHaveProperty('id');
      expect(preferences).toHaveProperty('userId', testUserId);
      expect(preferences).toHaveProperty('emailEnabled');
      expect(preferences).toHaveProperty('smsEnabled');
      expect(preferences).toHaveProperty('pushEnabled');
      expect(preferences).toHaveProperty('inAppEnabled');
    });

    it('should update user preferences', async () => {
      const updates = {
        emailEnabled: false,
        pushEnabled: true
      };

      const result = await notificationService.updateUserPreferences(testUserId, updates);
      expect(result).not.toBeNull();
      expect(result?.emailEnabled).toBe(false);
      expect(result?.pushEnabled).toBe(true);
    });
  });
});
import { NotificationService } from '../NotificationService';
import { 
  NotificationRepository,
  NotificationPreferencesRepository,
  NotificationTemplateRepository
} from '../../models';
import { UserRepository } from '../../models/UserRepository';
import { emailService } from '../../config/email';
import { smsService } from '../../config/sms';
import { pushNotificationService } from '../../config/push';
import {
  DatabaseConnection,
  User,
  NotificationTemplate,
  NotificationPreferences,
  NotificationType,
  Notification,
  CreateNotificationInput
} from '../../types';

// Mock the external services
jest.mock('../../config/email');
jest.mock('../../config/sms');
jest.mock('../../config/push');

// Mock the repositories
jest.mock('../../models');
jest.mock('../../models/UserRepository');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockConnection: jest.Mocked<DatabaseConnection>;
  let mockNotificationRepo: jest.Mocked<NotificationRepository>;
  let mockPreferencesRepo: jest.Mocked<NotificationPreferencesRepository>;
  let mockTemplateRepo: jest.Mocked<NotificationTemplateRepository>;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<typeof emailService>;
  let mockSmsService: jest.Mocked<typeof smsService>;
  let mockPushService: jest.Mocked<typeof pushNotificationService>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    phoneNumber: '+1234567890',
    profileImage: undefined,
    isVerified: true,
    rating: 4.5,
    totalTransactions: 10,
    role: 'user',
    status: 'active',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')  };


  const mockPreferences: NotificationPreferences = {
    id: 'pref-1',
    userId: 'user-1',
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    preferences: {
      welcome: { email: true, sms: false, push: true, inApp: true },
      listing_created: { email: true, sms: false, push: true, inApp: true },
      purchase_confirmation: { email: true, sms: true, push: true, inApp: true },
      payment_received: { email: true, sms: true, push: true, inApp: true },
      payment_failed: { email: true, sms: true, push: true, inApp: true },
      transaction_completed: { email: true, sms: false, push: true, inApp: true },
      review_received: { email: true, sms: false, push: true, inApp: true },
      price_drop: { email: false, sms: false, push: true, inApp: true },
      fraud_alert: { email: true, sms: true, push: true, inApp: true },
      account_suspended: { email: true, sms: true, push: true, inApp: true },
      verification_required: { email: true, sms: false, push: true, inApp: true },
      dispute_opened: { email: true, sms: true, push: true, inApp: true },
      dispute_resolved: { email: true, sms: false, push: true, inApp: true },
      system_maintenance: { email: true, sms: false, push: false, inApp: true },
      password_reset: { email: true, sms: true, push: false, inApp: false },
      listing_sold: { email: true, sms: false, push: true, inApp: true },
      listing_expired: { email: true, sms: false, push: false, inApp: true }
    },
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  const mockEmailTemplate: NotificationTemplate = {
    id: 'template-1',
    type: 'welcome',
    channel: 'email',
    subject: 'Welcome to Ticket Resell Platform',
    title: 'Welcome {{userName}}!',
    body: '<h1>Welcome {{userName}}!</h1><p>Thank you for joining our platform.</p>',
    variables: ['userName'],
    isActive: true,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  const mockNotification: Notification = {
    id: 'notification-1',
    userId: 'user-1',
    type: 'welcome',
    title: 'Welcome Test!',
    message: 'Thank you for joining our platform.',
    data: { userName: 'Test' },
    channels: ['email', 'push'],
    status: 'pending',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock database connection
    mockConnection = {
      query: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn()
    } as jest.Mocked<DatabaseConnection>;

    // Mock repositories
    mockNotificationRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findUnreadByUserId: jest.fn(),
      getUnreadCount: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsReadForUser: jest.fn(),
      markAsSent: jest.fn(),
      markAsFailed: jest.fn(),
      findPendingNotifications: jest.fn(),
      deleteOldNotifications: jest.fn()
    } as any;

    mockPreferencesRepo = {
      getOrCreatePreferences: jest.fn(),
      updatePreferences: jest.fn(),
      isChannelEnabledForUser: jest.fn()
    } as any;

    mockTemplateRepo = {
      findByTypeAndChannel: jest.fn(),
      findByType: jest.fn(),
      renderTemplate: jest.fn()
    } as any;

    mockUserRepo = {
      findById: jest.fn()
    } as any;

    // Mock external services
    mockEmailService = emailService as jest.Mocked<typeof emailService>;
    mockSmsService = smsService as jest.Mocked<typeof smsService>;
    mockPushService = pushNotificationService as jest.Mocked<typeof pushNotificationService>;

    // Mock repository constructors
    (NotificationRepository as jest.Mock).mockImplementation(() => mockNotificationRepo);
    (NotificationPreferencesRepository as jest.Mock).mockImplementation(() => mockPreferencesRepo);
    (NotificationTemplateRepository as jest.Mock).mockImplementation(() => mockTemplateRepo);
    (UserRepository as jest.Mock).mockImplementation(() => mockUserRepo);

    // Create service instance
    notificationService = new NotificationService(mockConnection);
  });

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const input: CreateNotificationInput = {
        userId: 'user-1',
        type: 'welcome',
        title: 'Welcome!',
        message: 'Thank you for joining',
        channels: ['email', 'push']
      };

      mockNotificationRepo.create.mockResolvedValue(mockNotification);

      const result = await notificationService.createNotification(input);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(input);
      expect(result).toEqual(mockNotification);
    });
  });

  describe('sendNotification', () => {
    it('should send notification through enabled channels successfully', async () => {
      const type: NotificationType = 'welcome';
      const variables = { userName: 'Test' };

      // Setup mocks
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockPreferencesRepo.getOrCreatePreferences.mockResolvedValue(mockPreferences);
      mockPreferencesRepo.isChannelEnabledForUser
        .mockResolvedValueOnce(true) // email
        .mockResolvedValueOnce(false) // sms
        .mockResolvedValueOnce(true) // push
        .mockResolvedValueOnce(true); // inApp

      mockTemplateRepo.findByTypeAndChannel
        .mockResolvedValueOnce(mockEmailTemplate) // email template
        .mockResolvedValueOnce({ ...mockEmailTemplate, channel: 'push' } as NotificationTemplate); // push template

      mockTemplateRepo.renderTemplate.mockResolvedValue({
        subject: 'Welcome to Ticket Resell Platform',
        title: 'Welcome Test!',
        body: '<h1>Welcome Test!</h1><p>Thank you for joining our platform.</p>'
      });

      mockNotificationRepo.create.mockResolvedValue(mockNotification);
      mockNotificationRepo.markAsSent.mockResolvedValue(true);

      mockEmailService.sendEmail.mockResolvedValue(true);
      mockPushService.sendPushNotification.mockResolvedValue(true);

      const result = await notificationService.sendNotification('user-1', type, variables);

      expect(result).toBe(true);
      expect(mockUserRepo.findById).toHaveBeenCalledWith('user-1');
      expect(mockPreferencesRepo.getOrCreatePreferences).toHaveBeenCalledWith('user-1');
      expect(mockNotificationRepo.create).toHaveBeenCalled();
      expect(mockNotificationRepo.markAsSent).toHaveBeenCalledWith(mockNotification.id);
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
      expect(mockPushService.sendPushNotification).toHaveBeenCalled();
    });

    it('should return false when user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      const result = await notificationService.sendNotification('user-1', 'welcome');

      expect(result).toBe(false);
      expect(mockUserRepo.findById).toHaveBeenCalledWith('user-1');
    });

    it('should return true when no channels are enabled', async () => {
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockPreferencesRepo.getOrCreatePreferences.mockResolvedValue(mockPreferences);
      mockPreferencesRepo.isChannelEnabledForUser.mockResolvedValue(false);

      const result = await notificationService.sendNotification('user-1', 'welcome');

      expect(result).toBe(true); // Not an error, user has disabled all channels
    });

    it('should mark notification as failed when no templates found', async () => {
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockPreferencesRepo.getOrCreatePreferences.mockResolvedValue(mockPreferences);
      mockPreferencesRepo.isChannelEnabledForUser.mockResolvedValue(true);
      mockTemplateRepo.findByTypeAndChannel.mockResolvedValue(null);

      const result = await notificationService.sendNotification('user-1', 'welcome');

      expect(result).toBe(false);
    });
  });

  describe('sendBulkNotifications', () => {
    it('should send notifications to multiple users', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];
      const type: NotificationType = 'welcome';

      // Mock successful sends for first two users, failure for third
      jest.spyOn(notificationService, 'sendNotification')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await notificationService.sendBulkNotifications(userIds, type);

      expect(result).toEqual({ sent: 2, failed: 1 });
      expect(notificationService.sendNotification).toHaveBeenCalledTimes(3);
    });
  });

  describe('getUserNotifications', () => {
    it('should return user notifications with pagination', async () => {
      const notifications = [mockNotification];
      mockNotificationRepo.findByUserId.mockResolvedValue(notifications);

      const result = await notificationService.getUserNotifications('user-1', 10, 0);

      expect(result).toEqual(notifications);
      expect(mockNotificationRepo.findByUserId).toHaveBeenCalledWith('user-1', 10, 0);
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return unread notifications for user', async () => {
      const notifications = [mockNotification];
      mockNotificationRepo.findUnreadByUserId.mockResolvedValue(notifications);

      const result = await notificationService.getUnreadNotifications('user-1');

      expect(result).toEqual(notifications);
      expect(mockNotificationRepo.findUnreadByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      mockNotificationRepo.getUnreadCount.mockResolvedValue(5);

      const result = await notificationService.getUnreadCount('user-1');

      expect(result).toBe(5);
      expect(mockNotificationRepo.getUnreadCount).toHaveBeenCalledWith('user-1');
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      mockNotificationRepo.markAsRead.mockResolvedValue(true);

      const result = await notificationService.markNotificationAsRead('notification-1');

      expect(result).toBe(true);
      expect(mockNotificationRepo.markAsRead).toHaveBeenCalledWith('notification-1');
    });
  });

  describe('markAllAsReadForUser', () => {
    it('should mark all notifications as read for user', async () => {
      mockNotificationRepo.markAllAsReadForUser.mockResolvedValue(3);

      const result = await notificationService.markAllAsReadForUser('user-1');

      expect(result).toBe(3);
      expect(mockNotificationRepo.markAllAsReadForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getUserPreferences', () => {
    it('should return user notification preferences', async () => {
      mockPreferencesRepo.getOrCreatePreferences.mockResolvedValue(mockPreferences);

      const result = await notificationService.getUserPreferences('user-1');

      expect(result).toEqual(mockPreferences);
      expect(mockPreferencesRepo.getOrCreatePreferences).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user notification preferences', async () => {
      const updates = { emailEnabled: false };
      const updatedPreferences = { ...mockPreferences, emailEnabled: false };
      
      mockPreferencesRepo.updatePreferences.mockResolvedValue(updatedPreferences);

      const result = await notificationService.updateUserPreferences('user-1', updates);

      expect(result).toEqual(updatedPreferences);
      expect(mockPreferencesRepo.updatePreferences).toHaveBeenCalledWith('user-1', updates);
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue(true);
    });

    it('should send welcome notification', async () => {
      const result = await notificationService.sendWelcomeNotification('user-1');

      expect(result).toBe(true);
      expect(notificationService.sendNotification).toHaveBeenCalledWith('user-1', 'welcome');
    });

    it('should send listing created notification', async () => {
      const listingData = { eventName: 'Concert', price: 100 };
      const result = await notificationService.sendListingCreatedNotification('user-1', listingData);

      expect(result).toBe(true);
      expect(notificationService.sendNotification).toHaveBeenCalledWith('user-1', 'listing_created', listingData);
    });

    it('should send purchase confirmation notification', async () => {
      const transactionData = { eventName: 'Concert', totalAmount: 100 };
      const result = await notificationService.sendPurchaseConfirmationNotification('user-1', transactionData);

      expect(result).toBe(true);
      expect(notificationService.sendNotification).toHaveBeenCalledWith('user-1', 'purchase_confirmation', transactionData);
    });

    it('should send fraud alert notification with all channels', async () => {
      const alertData = { reason: 'Suspicious activity detected' };
      const result = await notificationService.sendFraudAlertNotification('user-1', alertData);

      expect(result).toBe(true);
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        'user-1', 
        'fraud_alert', 
        alertData, 
        ['email', 'sms', 'push']
      );
    });
  });

  describe('processPendingNotifications', () => {
    it('should process pending notifications successfully', async () => {
      const pendingNotifications = [
        { ...mockNotification, status: 'pending' as const },
        { ...mockNotification, id: 'notification-2', status: 'pending' as const }
      ];

      mockNotificationRepo.findPendingNotifications.mockResolvedValue(pendingNotifications);
      mockUserRepo.findById.mockResolvedValue(mockUser);
      jest.spyOn(notificationService, 'sendNotification')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await notificationService.processPendingNotifications(10);

      expect(result).toEqual({ processed: 1, failed: 1 });
      expect(mockNotificationRepo.findPendingNotifications).toHaveBeenCalledWith(10);
    });
  });

  describe('cleanupOldNotifications', () => {
    it('should cleanup old notifications', async () => {
      mockNotificationRepo.deleteOldNotifications.mockResolvedValue(5);

      const result = await notificationService.cleanupOldNotifications(90);

      expect(result).toBe(5);
      expect(mockNotificationRepo.deleteOldNotifications).toHaveBeenCalledWith(90);
    });
  });
});
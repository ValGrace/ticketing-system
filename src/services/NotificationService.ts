import { 
  NotificationRepository,
  NotificationPreferencesRepository,
  NotificationTemplateRepository
} from '../models';
import { UserRepository } from '../models/UserRepository';
import { emailService } from '../config/email';
import { smsService } from '../config/sms';
import { pushNotificationService } from '../config/push';
import {
  Notification,
  NotificationPreferences,
  NotificationTemplate,
  CreateNotificationInput,
  UpdateNotificationPreferencesInput,
  NotificationType,
  NotificationChannel,
  EmailNotification,
  SMSNotification,
  PushNotification,
  User,
  DatabaseConnection
} from '../types';

export class NotificationService {
  private notificationRepo: NotificationRepository;
  private preferencesRepo: NotificationPreferencesRepository;
  private templateRepo: NotificationTemplateRepository;
  private userRepo: UserRepository;

  constructor(connection: DatabaseConnection) {
    this.notificationRepo = new NotificationRepository(connection);
    this.preferencesRepo = new NotificationPreferencesRepository(connection);
    this.templateRepo = new NotificationTemplateRepository(connection);
    this.userRepo = new UserRepository(connection);
  }

  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    return await this.notificationRepo.create(input);
  }

  async sendNotification(
    userId: string,
    type: NotificationType,
    templateVariables: Record<string, any> = {},
    customChannels?: NotificationChannel[]
  ): Promise<boolean> {
    try {
      // Get user information
      const user = await this.userRepo.findById(userId);
      if (!user) {
        console.error(`User not found: ${userId}`);
        return false;
      }

      // Get user preferences
      await this.preferencesRepo.getOrCreatePreferences(userId);

      // Determine which channels to use
      const channels = customChannels || await this.getEnabledChannels(userId, type);
      
      if (channels.length === 0) {
        console.log(`No enabled channels for user ${userId} and notification type ${type}`);
        return true; // Not an error, user has disabled all channels
      }

      // Get templates for enabled channels
      const templates = await Promise.all(
        channels.map(channel => this.templateRepo.findByTypeAndChannel(type, channel))
      );

      const validTemplates = templates.filter(t => t !== null) as NotificationTemplate[];
      
      if (validTemplates.length === 0) {
        console.error(`No templates found for notification type: ${type}`);
        return false;
      }

      // Create notification record
      const firstTemplate = validTemplates[0]!;
      const renderedContent = await this.templateRepo.renderTemplate(firstTemplate, {
        userName: user.firstName || user.username,
        userEmail: user.email,
        ...templateVariables
      });

      const notification = await this.createNotification({
        userId,
        type,
        title: renderedContent.title,
        message: renderedContent.body,
        data: templateVariables,
        channels
      });

      // Send through each channel
      const sendPromises = validTemplates.map(template => 
        this.sendThroughChannel(template, user, templateVariables)
      );

      const results = await Promise.allSettled(sendPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;

      // Update notification status
      if (successful > 0) {
        await this.notificationRepo.markAsSent(notification.id);
        return true;
      } else {
        await this.notificationRepo.markAsFailed(notification.id);
        return false;
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  async sendBulkNotifications(
    userIds: string[],
    type: NotificationType,
    templateVariables: Record<string, any> = {}
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const promises = batch.map(async (userId) => {
        const success = await this.sendNotification(userId, type, templateVariables);
        return success ? 'sent' : 'failed';
      });

      const results = await Promise.all(promises);
      sent += results.filter(r => r === 'sent').length;
      failed += results.filter(r => r === 'failed').length;

      // Add delay between batches
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { sent, failed };
  }

  private async sendThroughChannel(
    template: NotificationTemplate,
    user: User,
    variables: Record<string, any>
  ): Promise<boolean> {
    try {
      const renderedContent = await this.templateRepo.renderTemplate(template, {
        userName: user.firstName || user.username,
        userEmail: user.email,
        ...variables
      });

      switch (template.channel) {
        case 'email':
          return await this.sendEmailNotification(user, renderedContent);
        
        case 'sms':
          return await this.sendSMSNotification(user, renderedContent);
        
        case 'push':
          return await this.sendPushNotification(user, renderedContent, variables);
        
        case 'in_app':
          // In-app notifications are already stored in the database
          return true;
        
        default:
          console.error(`Unknown notification channel: ${template.channel}`);
          return false;
      }
    } catch (error) {
      console.error(`Failed to send notification through ${template.channel}:`, error);
      return false;
    }
  }

  private async sendEmailNotification(
    user: User,
    content: { subject?: string; title: string; body: string }
  ): Promise<boolean> {
    const emailNotification: EmailNotification = {
      to: user.email,
      subject: content.subject || content.title,
      html: content.body,
      text: content.body.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    return await emailService.sendEmail(emailNotification);
  }

  private async sendSMSNotification(
    user: User,
    content: { title: string; body: string }
  ): Promise<boolean> {
    if (!user.phoneNumber) {
      console.log(`User ${user.id} has no phone number for SMS`);
      return false;
    }

    const smsNotification: SMSNotification = {
      to: smsService.formatPhoneNumber(user.phoneNumber),
      message: content.body
    };

    return await smsService.sendSMS(smsNotification);
  }

  private async sendPushNotification(
    user: User,
    content: { title: string; body: string },
    data: Record<string, any>
  ): Promise<boolean> {
    const pushNotification: PushNotification = {
      userId: user.id,
      title: content.title,
      body: content.body,
      data
    };

    return await pushNotificationService.sendPushNotification(pushNotification);
  }

  private async getEnabledChannels(
    userId: string,
    type: NotificationType
  ): Promise<NotificationChannel[]> {
    const channels: NotificationChannel[] = [];

    if (await this.preferencesRepo.isChannelEnabledForUser(userId, type, 'email')) {
      channels.push('email');
    }

    if (await this.preferencesRepo.isChannelEnabledForUser(userId, type, 'sms')) {
      channels.push('sms');
    }

    if (await this.preferencesRepo.isChannelEnabledForUser(userId, type, 'push')) {
      channels.push('push');
    }

    if (await this.preferencesRepo.isChannelEnabledForUser(userId, type, 'inApp')) {
      channels.push('in_app');
    }

    return channels;
  }

  // Notification management methods
  async getUserNotifications(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
    return await this.notificationRepo.findByUserId(userId, limit, offset);
  }

  async getUnreadNotifications(userId: string): Promise<Notification[]> {
    return await this.notificationRepo.findUnreadByUserId(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await this.notificationRepo.getUnreadCount(userId);
  }

  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    return await this.notificationRepo.markAsRead(notificationId);
  }

  async markAllAsReadForUser(userId: string): Promise<number> {
    return await this.notificationRepo.markAllAsReadForUser(userId);
  }

  // Preference management methods
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    return await this.preferencesRepo.getOrCreatePreferences(userId);
  }

  async updateUserPreferences(
    userId: string,
    updates: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferences | null> {
    return await this.preferencesRepo.updatePreferences(userId, updates);
  }

  // Template management methods
  async getTemplate(type: NotificationType, channel: NotificationChannel): Promise<NotificationTemplate | null> {
    return await this.templateRepo.findByTypeAndChannel(type, channel);
  }

  async getTemplatesByType(type: NotificationType): Promise<NotificationTemplate[]> {
    return await this.templateRepo.findByType(type);
  }

  // System maintenance methods
  async processPendingNotifications(limit = 100): Promise<{ processed: number; failed: number }> {
    const pendingNotifications = await this.notificationRepo.findPendingNotifications(limit);
    
    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications) {
      try {
        const user = await this.userRepo.findById(notification.userId);
        if (!user) {
          await this.notificationRepo.markAsFailed(notification.id);
          failed++;
          continue;
        }

        // Re-send the notification
        const success = await this.sendNotification(
          notification.userId,
          notification.type,
          notification.data || {}
        );

        if (success) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to process pending notification ${notification.id}:`, error);
        await this.notificationRepo.markAsFailed(notification.id);
        failed++;
      }
    }

    return { processed, failed };
  }

  async cleanupOldNotifications(daysOld = 90): Promise<number> {
    return await this.notificationRepo.deleteOldNotifications(daysOld);
  }

  // Convenience methods for common notification types
  async sendWelcomeNotification(userId: string): Promise<boolean> {
    return await this.sendNotification(userId, 'welcome');
  }

  async sendListingCreatedNotification(userId: string, listingData: any): Promise<boolean> {
    return await this.sendNotification(userId, 'listing_created', listingData);
  }

  async sendPurchaseConfirmationNotification(userId: string, transactionData: any): Promise<boolean> {
    return await this.sendNotification(userId, 'purchase_confirmation', transactionData);
  }

  async sendPaymentReceivedNotification(userId: string, paymentData: any): Promise<boolean> {
    return await this.sendNotification(userId, 'payment_received', paymentData);
  }

  async sendTransactionCompletedNotification(userId: string, transactionData: any): Promise<boolean> {
    return await this.sendNotification(userId, 'transaction_completed', transactionData);
  }

  async sendReviewReceivedNotification(userId: string, reviewData: any): Promise<boolean> {
    return await this.sendNotification(userId, 'review_received', reviewData);
  }

  async sendFraudAlertNotification(userId: string, alertData: any): Promise<boolean> {
    return await this.sendNotification(userId, 'fraud_alert', alertData, ['email', 'sms', 'push']);
  }
}
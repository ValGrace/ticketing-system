/**
 * Resilient Notification Service with Graceful Degradation
 * 
 * Wraps NotificationService with fallback mechanisms for when
 * external notification services (email, SMS, push) are unavailable
 */

import { NotificationService } from './NotificationService';
import { withFallback, withPartialSuccess, serviceHealthTracker } from '../utils/gracefulDegradation';
import logger from '../config/logger';
import {
  NotificationType,
  NotificationChannel,
  CreateNotificationInput,
  DatabaseConnection
} from '../types';

export class ResilientNotificationService {
  private notificationService: NotificationService;

  constructor(connection: DatabaseConnection) {
    this.notificationService = new NotificationService(connection);
  }

  /**
   * Send notification with graceful degradation
   * Falls back to in-app notification if external channels fail
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    templateVariables: Record<string, any> = {},
    customChannels?: NotificationChannel[],
    correlationId?: string
  ): Promise<boolean> {
    return withFallback(
      async () => {
        const result = await this.notificationService.sendNotification(
          userId,
          type,
          templateVariables,
          customChannels
        );

        if (result) {
          serviceHealthTracker.recordSuccess('notification-service');
        } else {
          serviceHealthTracker.recordFailure('notification-service');
        }

        return result;
      },
      {
        fallbackFn: async () => {
          logger.warn('Notification service degraded, storing in-app only', {
            correlationId,
            userId,
            type
          });

          // Fallback: Store as in-app notification only
          try {
            await this.notificationService.createNotification({
              userId,
              type,
              title: `Notification: ${type}`,
              message: JSON.stringify(templateVariables),
              data: templateVariables,
              channels: ['in_app']
            });
            return true;
          } catch (error) {
            logger.error('Failed to create fallback in-app notification', {
              correlationId,
              error: error instanceof Error ? error.message : String(error)
            });
            return false;
          }
        },
        logError: true,
        errorMessage: 'Notification service failed, using fallback'
      }
    );
  }

  /**
   * Send bulk notifications with partial success tolerance
   */
  async sendBulkNotifications(
    userIds: string[],
    type: NotificationType,
    templateVariables: Record<string, any> = {},
    correlationId?: string
  ): Promise<{ sent: number; failed: number }> {
    try {
      // Split into smaller batches for better resilience
      const batchSize = 20;
      const batches: string[][] = [];

      for (let i = 0; i < userIds.length; i += batchSize) {
        batches.push(userIds.slice(i, i + batchSize));
      }

      logger.info('Sending bulk notifications', {
        correlationId,
        totalUsers: userIds.length,
        batches: batches.length,
        type
      });

      // Process batches with partial success tolerance
      const batchOperations = batches.map(batch => async () => {
        const results = await Promise.allSettled(
          batch.map(userId => 
            this.sendNotification(userId, type, templateVariables, undefined, correlationId)
          )
        );

        const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failed = results.length - sent;

        return { sent, failed };
      });

      const { results, errors } = await withPartialSuccess(
        batchOperations,
        Math.ceil(batches.length * 0.5) // Require at least 50% of batches to succeed
      );

      const totals = results.reduce(
        (acc, result) => ({
          sent: acc.sent + result.sent,
          failed: acc.failed + result.failed
        }),
        { sent: 0, failed: 0 }
      );

      if (errors.length > 0) {
        logger.warn('Some notification batches failed', {
          correlationId,
          successfulBatches: results.length,
          failedBatches: errors.length,
          totalSent: totals.sent,
          totalFailed: totals.failed
        });
      }

      return totals;
    } catch (error) {
      logger.error('Bulk notification sending failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return zero counts on complete failure
      return { sent: 0, failed: userIds.length };
    }
  }

  /**
   * Delegate methods to underlying service
   */
  async createNotification(input: CreateNotificationInput) {
    return this.notificationService.createNotification(input);
  }

  async getUserNotifications(userId: string, limit?: number, offset?: number) {
    return this.notificationService.getUserNotifications(userId, limit, offset);
  }

  async getUnreadNotifications(userId: string) {
    return this.notificationService.getUnreadNotifications(userId);
  }

  async getUnreadCount(userId: string) {
    return this.notificationService.getUnreadCount(userId);
  }

  async markNotificationAsRead(notificationId: string) {
    return this.notificationService.markNotificationAsRead(notificationId);
  }

  async markAllAsReadForUser(userId: string) {
    return this.notificationService.markAllAsReadForUser(userId);
  }

  async getUserPreferences(userId: string) {
    return this.notificationService.getUserPreferences(userId);
  }

  async updateUserPreferences(userId: string, updates: any) {
    return this.notificationService.updateUserPreferences(userId, updates);
  }

  async processPendingNotifications(limit?: number) {
    return this.notificationService.processPendingNotifications(limit);
  }

  async cleanupOldNotifications(daysOld?: number) {
    return this.notificationService.cleanupOldNotifications(daysOld);
  }

  // Convenience methods with resilience
  async sendWelcomeNotification(userId: string, correlationId?: string) {
    return this.sendNotification(userId, 'welcome', {}, undefined, correlationId);
  }

  async sendListingCreatedNotification(userId: string, listingData: any, correlationId?: string) {
    return this.sendNotification(userId, 'listing_created', listingData, undefined, correlationId);
  }

  async sendPurchaseConfirmationNotification(userId: string, transactionData: any, correlationId?: string) {
    return this.sendNotification(userId, 'purchase_confirmation', transactionData, undefined, correlationId);
  }

  async sendPaymentReceivedNotification(userId: string, paymentData: any, correlationId?: string) {
    return this.sendNotification(userId, 'payment_received', paymentData, undefined, correlationId);
  }

  async sendTransactionCompletedNotification(userId: string, transactionData: any, correlationId?: string) {
    return this.sendNotification(userId, 'transaction_completed', transactionData, undefined, correlationId);
  }

  async sendReviewReceivedNotification(userId: string, reviewData: any, correlationId?: string) {
    return this.sendNotification(userId, 'review_received', reviewData, undefined, correlationId);
  }

  async sendFraudAlertNotification(userId: string, alertData: any, correlationId?: string) {
    // Critical notifications should try all channels
    return this.sendNotification(
      userId,
      'fraud_alert',
      alertData,
      ['email', 'sms', 'push', 'in_app'],
      correlationId
    );
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    healthScore: number;
    isHealthy: boolean;
    shouldDegrade: boolean;
  } {
    const healthScore = serviceHealthTracker.getHealthScore('notification-service');
    return {
      healthScore,
      isHealthy: serviceHealthTracker.isHealthy('notification-service'),
      shouldDegrade: serviceHealthTracker.shouldDegrade('notification-service')
    };
  }
}

import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';
import { database } from '../config/database';
import { 
  UpdateNotificationPreferencesInput,
  NotificationType,
  NotificationChannel 
} from '../types';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService(database);
  }

  // Get user's notifications
  getUserNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const notifications = await this.notificationService.getUserNotifications(userId, limit, offset);
      const unreadCount = await this.notificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount,
          pagination: {
            limit,
            offset,
            hasMore: notifications.length === limit
          }
        }
      });
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch notifications'
        }
      });
    }
  };

  // Get unread notifications
  getUnreadNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const notifications = await this.notificationService.getUnreadNotifications(userId);
      const unreadCount = notifications.length;

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount
        }
      });
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch unread notifications'
        }
      });
    }
  };

  // Get unread count
  getUnreadCount = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const unreadCount = await this.notificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { unreadCount }
      });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch unread count'
        }
      });
    }
  };

  // Mark notification as read
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { notificationId } = req.params;

      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      if (!notificationId) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Notification ID is required' } });
        return;
      }

      const success = await this.notificationService.markNotificationAsRead(notificationId);

      if (!success) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Notification marked as read' }
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to mark notification as read'
        }
      });
    }
  };

  // Mark all notifications as read
  markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const markedCount = await this.notificationService.markAllAsReadForUser(userId);

      res.json({
        success: true,
        data: { 
          message: 'All notifications marked as read',
          markedCount 
        }
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to mark all notifications as read'
        }
      });
    }
  };

  // Get user notification preferences
  getPreferences = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const preferences = await this.notificationService.getUserPreferences(userId);

      res.json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch notification preferences'
        }
      });
    }
  };

  // Update user notification preferences
  updatePreferences = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const updates: UpdateNotificationPreferencesInput = req.body;

      const updatedPreferences = await this.notificationService.updateUserPreferences(userId, updates);

      if (!updatedPreferences) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User preferences not found' } });
        return;
      }

      res.json({
        success: true,
        data: { preferences: updatedPreferences }
      });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update notification preferences'
        }
      });
    }
  };

  // Send test notification (for testing purposes)
  sendTestNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }

      const { type, variables, channels } = req.body;

      if (!type) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Notification type is required' } });
        return;
      }

      const success = await this.notificationService.sendNotification(
        userId,
        type as NotificationType,
        variables || {},
        channels as NotificationChannel[]
      );

      if (!success) {
        res.status(500).json({ error: { code: 'SEND_FAILED', message: 'Failed to send test notification' } });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Test notification sent successfully' }
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to send test notification'
        }
      });
    }
  };

  // Admin: Get notification templates
  getTemplates = async (req: Request, res: Response): Promise<void> => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'moderator') {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
        return;
      }

      const { type, channel } = req.query;

      let templates;
      if (type && channel) {
        const template = await this.notificationService.getTemplate(
          type as NotificationType,
          channel as NotificationChannel
        );
        templates = template ? [template] : [];
      } else if (type) {
        templates = await this.notificationService.getTemplatesByType(type as NotificationType);
      } else {
        // This would require adding a method to get all templates
        templates = [];
      }

      res.json({
        success: true,
        data: { templates }
      });
    } catch (error) {
      console.error('Error fetching notification templates:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch notification templates'
        }
      });
    }
  };

  // Admin: Send bulk notifications
  sendBulkNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
        return;
      }

      const { userIds, type, variables } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'User IDs array is required' } });
        return;
      }

      if (!type) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Notification type is required' } });
        return;
      }

      const result = await this.notificationService.sendBulkNotifications(
        userIds,
        type as NotificationType,
        variables || {}
      );

      res.json({
        success: true,
        data: {
          message: 'Bulk notifications processed',
          sent: result.sent,
          failed: result.failed,
          total: userIds.length
        }
      });
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to send bulk notifications'
        }
      });
    }
  };

  // Admin: Process pending notifications
  processPendingNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const result = await this.notificationService.processPendingNotifications(limit);

      res.json({
        success: true,
        data: {
          message: 'Pending notifications processed',
          processed: result.processed,
          failed: result.failed
        }
      });
    } catch (error) {
      console.error('Error processing pending notifications:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process pending notifications'
        }
      });
    }
  };
}
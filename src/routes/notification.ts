import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/auth';
import {
  updatePreferencesSchema,
  sendTestNotificationSchema,
  sendBulkNotificationSchema,
  paginationSchema,
  notificationIdSchema,
  templateQuerySchema,
  processPendingSchema
} from '../validation/notification';

const router = Router();
const notificationController = new NotificationController();

// Apply authentication to all routes
router.use(authenticateToken);

// User notification routes
router.get(
  '/',
  validateRequest(paginationSchema, 'query'),
  notificationController.getUserNotifications
);

router.get(
  '/unread',
  notificationController.getUnreadNotifications
);

router.get(
  '/unread/count',
  notificationController.getUnreadCount
);

router.patch(
  '/:notificationId/read',
  validateRequest(notificationIdSchema, 'params'),
  notificationController.markAsRead
);

router.patch(
  '/read-all',
  notificationController.markAllAsRead
);

// User preference routes
router.get(
  '/preferences',
  notificationController.getPreferences
);

router.patch(
  '/preferences',
  validateRequest(updatePreferencesSchema, 'body'),
  notificationController.updatePreferences
);

// Test notification route (for development/testing)
router.post(
  '/test',
  validateRequest(sendTestNotificationSchema, 'body'),
  notificationController.sendTestNotification
);

// Admin routes
router.get(
  '/templates',
  requireRole(['admin', 'moderator']),
  validateRequest(templateQuerySchema, 'query'),
  notificationController.getTemplates
);

router.post(
  '/bulk',
  requireRole(['admin']),
  validateRequest(sendBulkNotificationSchema, 'body'),
  notificationController.sendBulkNotification
);

router.post(
  '/process-pending',
  requireRole(['admin']),
  validateRequest(processPendingSchema, 'query'),
  notificationController.processPendingNotifications
);

export default router;
import { NotificationService } from '../services/NotificationService';
import { database } from '../config/database';

describe('Simple Notification Test', () => {
  it('should create notification service', () => {
    const notificationService = new NotificationService(database);
    expect(notificationService).toBeDefined();
  });
});
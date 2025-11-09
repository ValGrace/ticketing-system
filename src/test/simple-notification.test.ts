import { NotificationService } from '../services/NotificationService';
import { database } from '../config/database';
import { expect } from '@jest/globals'
describe('Simple Notification Test', () => {
  it('should create notification service', () => {
    const notificationService = new NotificationService(database);
    expect(notificationService).toBeDefined();
  });
});
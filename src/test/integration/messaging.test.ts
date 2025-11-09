import { MessagingService, CreateMessageInput } from '../../services/MessagingService';
import { DatabaseConnection } from '../../types';
import { database } from '../../config/database';
import { expect } from '@jest/globals'

describe('MessagingService Integration Tests', () => {
  let messagingService: MessagingService;
  let connection: DatabaseConnection;
  const testUserId1 = 'test-user-1';
  const testUserId2 = 'test-user-2';

  beforeAll(async () => {
    connection = database;
    messagingService = new MessagingService(connection);

    // Create test users if they don't exist
    try {
      await connection.query(
        `INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, status, rating, total_transactions, is_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [testUserId1, 'test1@example.com', 'testuser1', 'Test', 'User1', 'hash', 'user', 'active', 0, 0, true]
      );

      await connection.query(
        `INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, status, rating, total_transactions, is_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [testUserId2, 'test2@example.com', 'testuser2', 'Test', 'User2', 'hash', 'user', 'active', 0, 0, true]
      );
    } catch (error) {
      console.error('Error creating test users:', error);
    }
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await connection.query('DELETE FROM messages WHERE sender_id IN ($1, $2) OR receiver_id IN ($1, $2)', [
        testUserId1,
        testUserId2,
      ]);
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const input: CreateMessageInput = {
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Hello, this is a test message!',
      };

      const message = await messagingService.sendMessage(input);

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.senderId).toBe(testUserId1);
      expect(message.receiverId).toBe(testUserId2);
      expect(message.content).toBe('Hello, this is a test message!');
      expect(message.isRead).toBe(false);
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('should send a message with transaction context', async () => {
      const input: CreateMessageInput = {
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Question about the transaction',
        transactionId: 'txn-123',
      };

      const message = await messagingService.sendMessage(input);

      expect(message.transactionId).toBe('txn-123');
    });

    it('should send a message with listing context', async () => {
      const input: CreateMessageInput = {
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Is this listing still available?',
        listingId: 'listing-456',
      };

      const message = await messagingService.sendMessage(input);

      expect(message.listingId).toBe('listing-456');
    });
  });

  describe('getConversation', () => {
    beforeEach(async () => {
      // Send some test messages
      await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Message 1',
      });

      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'Message 2',
      });

      await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Message 3',
      });
    });

    it('should retrieve conversation between two users', async () => {
      const messages = await messagingService.getConversation(testUserId1, testUserId2);

      expect(messages.length).toBeGreaterThanOrEqual(3);
      
      // Messages should be ordered by creation date (newest first)
      for (let i = 0; i < messages.length - 1; i++) {
        expect(messages[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          messages[i + 1]!.createdAt.getTime()
        );
      }
    });

    it('should respect limit parameter', async () => {
      const messages = await messagingService.getConversation(testUserId1, testUserId2, 2);

      expect(messages.length).toBeLessThanOrEqual(2);
    });

    it('should respect offset parameter', async () => {
      const allMessages = await messagingService.getConversation(testUserId1, testUserId2);
      const offsetMessages = await messagingService.getConversation(testUserId1, testUserId2, 10, 1);

      expect(offsetMessages[0]?.id).toBe(allMessages[1]?.id);
    });
  });

  describe('getUserConversations', () => {
    it('should retrieve all conversations for a user', async () => {
      const conversations = await messagingService.getUserConversations(testUserId1);

      expect(conversations).toBeDefined();
      expect(Array.isArray(conversations)).toBe(true);
      
      const conversationWithUser2 = conversations.find(c => c.userId === testUserId2);
      expect(conversationWithUser2).toBeDefined();
      expect(conversationWithUser2?.lastMessage).toBeDefined();
    });

    it('should include unread count in conversations', async () => {
      // Send an unread message
      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'Unread message',
      });

      const conversations = await messagingService.getUserConversations(testUserId1);
      const conversationWithUser2 = conversations.find(c => c.userId === testUserId2);

      expect(conversationWithUser2?.unreadCount).toBeGreaterThan(0);
    });
  });

  describe('markAsRead', () => {
    it('should mark a message as read', async () => {
      const message = await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Test read status',
      });

      expect(message.isRead).toBe(false);

      const success = await messagingService.markAsRead(message.id, testUserId2);
      expect(success).toBe(true);

      const messages = await messagingService.getConversation(testUserId1, testUserId2);
      const updatedMessage = messages.find(m => m.id === message.id);
      expect(updatedMessage?.isRead).toBe(true);
    });

    it('should not mark message as read by non-receiver', async () => {
      const message = await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Test unauthorized read',
      });

      const success = await messagingService.markAsRead(message.id, testUserId1);
      expect(success).toBe(false);
    });
  });

  describe('markConversationAsRead', () => {
    it('should mark all messages in conversation as read', async () => {
      // Send multiple unread messages
      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'Unread 1',
      });

      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'Unread 2',
      });

      const count = await messagingService.markConversationAsRead(testUserId1, testUserId2);
      expect(count).toBeGreaterThanOrEqual(2);

      const messages = await messagingService.getConversation(testUserId1, testUserId2);
      const unreadFromUser2 = messages.filter(
        m => m.senderId === testUserId2 && m.receiverId === testUserId1 && !m.isRead
      );
      
      expect(unreadFromUser2.length).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should return correct unread message count', async () => {
      // Mark all existing messages as read first
      await messagingService.markConversationAsRead(testUserId1, testUserId2);

      // Send new unread messages
      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'New unread 1',
      });

      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'New unread 2',
      });

      const count = await messagingService.getUnreadCount(testUserId1);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('deleteMessage', () => {
    it('should allow sender to delete their message', async () => {
      const message = await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Message to delete',
      });

      const success = await messagingService.deleteMessage(message.id, testUserId1);
      expect(success).toBe(true);

      const messages = await messagingService.getConversation(testUserId1, testUserId2);
      const deletedMessage = messages.find(m => m.id === message.id);
      expect(deletedMessage).toBeUndefined();
    });

    it('should not allow receiver to delete message', async () => {
      const message = await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Cannot delete this',
      });

      const success = await messagingService.deleteMessage(message.id, testUserId2);
      expect(success).toBe(false);
    });
  });

  describe('getMessagesByTransaction', () => {
    it('should retrieve messages related to a transaction', async () => {
      const transactionId = 'txn-test-123';

      await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Transaction message 1',
        transactionId,
      });

      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'Transaction message 2',
        transactionId,
      });

      const messages = await messagingService.getMessagesByTransaction(transactionId, testUserId1);

      expect(messages.length).toBe(2);
      expect(messages.every(m => m.transactionId === transactionId)).toBe(true);
    });
  });

  describe('getMessagesByListing', () => {
    it('should retrieve messages related to a listing', async () => {
      const listingId = 'listing-test-789';

      await messagingService.sendMessage({
        senderId: testUserId1,
        receiverId: testUserId2,
        content: 'Listing inquiry 1',
        listingId,
      });

      await messagingService.sendMessage({
        senderId: testUserId2,
        receiverId: testUserId1,
        content: 'Listing response 1',
        listingId,
      });

      const messages = await messagingService.getMessagesByListing(listingId, testUserId1);

      expect(messages.length).toBe(2);
      expect(messages.every(m => m.listingId === listingId)).toBe(true);
    });
  });
});

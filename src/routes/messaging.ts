import { Router, Request, Response } from 'express';
import { MessagingService } from '../services/MessagingService';
import { DatabaseConnection } from '../types';
import { authenticateToken } from '../middleware/auth';
import { body, param, query, validationResult } from 'express-validator';

export function createMessagingRouter(connection: DatabaseConnection): Router {
  const router = Router();
  const messagingService = new MessagingService(connection);

  // Apply authentication to all routes
  router.use(authenticateToken);

  /**
   * @route POST /api/messages
   * @desc Send a message to another user
   * @access Private
   */
  router.post(
    '/',
    [
      body('receiverId').isString().notEmpty().withMessage('Receiver ID is required'),
      body('content').isString().trim().notEmpty().withMessage('Message content is required'),
      body('content').isLength({ max: 5000 }).withMessage('Message content too long (max 5000 characters)'),
      body('transactionId').optional().isString(),
      body('listingId').optional().isString(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const userId = (req as any).user.userId;
        const { receiverId, content, transactionId, listingId } = req.body;

        // Prevent sending messages to self
        if (userId === receiverId) {
          return res.status(400).json({ error: 'Cannot send messages to yourself' });
        }

        const message = await messagingService.sendMessage({
          senderId: userId,
          receiverId,
          content,
          transactionId,
          listingId,
        });

        res.status(201).json(message);
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
      }
    }
  );

  /**
   * @route GET /api/messages/conversations
   * @desc Get all conversations for the authenticated user
   * @access Private
   */
  router.get('/conversations', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const conversations = await messagingService.getUserConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  /**
   * @route GET /api/messages/conversation/:userId
   * @desc Get conversation with a specific user
   * @access Private
   */
  router.get(
    '/conversation/:userId',
    [
      param('userId').isString().notEmpty(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
      query('offset').optional().isInt({ min: 0 }).toInt(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const currentUserId = (req as any).user.userId;
        const { userId } = req.params;
        const limit = parseInt(req.query['limit'] as string) || 50;
        const offset = parseInt(req.query['offset'] as string) || 0;

        const messages = await messagingService.getConversation(currentUserId, userId!, limit, offset);
        res.json(messages);
      } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
      }
    }
  );

  /**
   * @route GET /api/messages/unread-count
   * @desc Get unread message count for authenticated user
   * @access Private
   */
  router.get('/unread-count', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const count = await messagingService.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  /**
   * @route PUT /api/messages/:messageId/read
   * @desc Mark a message as read
   * @access Private
   */
  router.put(
    '/:messageId/read',
    [param('messageId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const userId = (req as any).user.userId;
        const { messageId } = req.params;

        const success = await messagingService.markAsRead(messageId!, userId);
        
        if (!success) {
          return res.status(404).json({ error: 'Message not found or not authorized' });
        }

        res.json({ success: true });
      } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({ error: 'Failed to mark message as read' });
      }
    }
  );

  /**
   * @route PUT /api/messages/conversation/:userId/read
   * @desc Mark all messages in a conversation as read
   * @access Private
   */
  router.put(
    '/conversation/:userId/read',
    [param('userId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const currentUserId = (req as any).user.userId;
        const { userId } = req.params;

        const count = await messagingService.markConversationAsRead(currentUserId, userId!);
        res.json({ markedAsRead: count });
      } catch (error) {
        console.error('Error marking conversation as read:', error);
        res.status(500).json({ error: 'Failed to mark conversation as read' });
      }
    }
  );

  /**
   * @route GET /api/messages/transaction/:transactionId
   * @desc Get messages related to a transaction
   * @access Private
   */
  router.get(
    '/transaction/:transactionId',
    [param('transactionId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const userId = (req as any).user.userId;
        const { transactionId } = req.params;

        const messages = await messagingService.getMessagesByTransaction(transactionId!, userId);
        res.json(messages);
      } catch (error) {
        console.error('Error fetching transaction messages:', error);
        res.status(500).json({ error: 'Failed to fetch transaction messages' });
      }
    }
  );

  /**
   * @route GET /api/messages/listing/:listingId
   * @desc Get messages related to a listing
   * @access Private
   */
  router.get(
    '/listing/:listingId',
    [param('listingId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const userId = (req as any).user.userId;
        const { listingId } = req.params;

        const messages = await messagingService.getMessagesByListing(listingId!, userId);
        res.json(messages);
      } catch (error) {
        console.error('Error fetching listing messages:', error);
        res.status(500).json({ error: 'Failed to fetch listing messages' });
      }
    }
  );

  /**
   * @route DELETE /api/messages/:messageId
   * @desc Delete a message (sender only)
   * @access Private
   */
  router.delete(
    '/:messageId',
    [param('messageId').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const userId = (req as any).user.userId;
        const { messageId } = req.params;

        const success = await messagingService.deleteMessage(messageId!, userId);
        
        if (!success) {
          return res.status(404).json({ error: 'Message not found or not authorized' });
        }

        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
      }
    }
  );

  return router;
}

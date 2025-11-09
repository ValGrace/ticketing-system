import { DatabaseConnection } from '../types';
import { webSocketService } from './WebSocketService';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  transactionId?: string;
  listingId?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageEntity {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  transaction_id?: string;
  listing_id?: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMessageInput {
  senderId: string;
  receiverId: string;
  content: string;
  transactionId?: string;
  listingId?: string;
}

export interface Conversation {
  userId: string;
  lastMessage: Message;
  unreadCount: number;
}

export class MessagingService {
  constructor(private connection: DatabaseConnection) {}

  async sendMessage(input: CreateMessageInput): Promise<Message> {
    const messageId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO messages (id, sender_id, receiver_id, content, transaction_id, listing_id, is_read, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await this.connection.query<MessageEntity>(query, [
      messageId,
      input.senderId,
      input.receiverId,
      input.content,
      input.transactionId || null,
      input.listingId || null,
      false,
      now.toISOString(),
      now.toISOString(),
    ]);

    const message = this.mapEntityToMessage(result[0]!);

    // Emit real-time message to receiver
    webSocketService.emitToUser(input.receiverId, 'message:received', {
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      message: message.content,
      timestamp: message.createdAt,
      transactionId: message.transactionId,
      listingId: message.listingId,
    });

    return message;
  }

  async getConversation(userId1: string, userId2: string, limit = 50, offset = 0): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const results = await this.connection.query<MessageEntity>(query, [userId1, userId2, limit, offset]);
    return results.map(entity => this.mapEntityToMessage(entity));
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const query = `
      WITH latest_messages AS (
        SELECT DISTINCT ON (
          CASE 
            WHEN sender_id = $1 THEN receiver_id 
            ELSE sender_id 
          END
        )
        *,
        CASE 
          WHEN sender_id = $1 THEN receiver_id 
          ELSE sender_id 
        END as other_user_id
        FROM messages
        WHERE sender_id = $1 OR receiver_id = $1
        ORDER BY 
          CASE 
            WHEN sender_id = $1 THEN receiver_id 
            ELSE sender_id 
          END,
          created_at DESC
      ),
      unread_counts AS (
        SELECT sender_id, COUNT(*) as unread_count
        FROM messages
        WHERE receiver_id = $1 AND is_read = false
        GROUP BY sender_id
      )
      SELECT 
        lm.*,
        COALESCE(uc.unread_count, 0) as unread_count
      FROM latest_messages lm
      LEFT JOIN unread_counts uc ON lm.sender_id = uc.sender_id
      ORDER BY lm.created_at DESC
    `;

    const results = await this.connection.query<MessageEntity & { other_user_id: string; unread_count: string }>(
      query,
      [userId]
    );

    return results.map(row => ({
      userId: row.other_user_id,
      lastMessage: this.mapEntityToMessage(row),
      unreadCount: parseInt(row.unread_count, 10),
    }));
  }

  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    const query = `
      UPDATE messages
      SET is_read = true, updated_at = $3
      WHERE id = $1 AND receiver_id = $2
      RETURNING id
    `;

    const result = await this.connection.query(query, [messageId, userId, new Date().toISOString()]);
    return result.length > 0;
  }

  async markConversationAsRead(userId: string, otherUserId: string): Promise<number> {
    const query = `
      UPDATE messages
      SET is_read = true, updated_at = $3
      WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false
      RETURNING id
    `;

    const result = await this.connection.query(query, [userId, otherUserId, new Date().toISOString()]);
    return result.length;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM messages
      WHERE receiver_id = $1 AND is_read = false
    `;

    const result = await this.connection.query<{ count: string }>(query, [userId]);
    return parseInt(result[0]?.count || '0', 10);
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    // Only allow sender to delete their own messages
    const query = `
      DELETE FROM messages
      WHERE id = $1 AND sender_id = $2
      RETURNING id
    `;

    const result = await this.connection.query(query, [messageId, userId]);
    return result.length > 0;
  }

  async getMessagesByTransaction(transactionId: string, userId: string): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE transaction_id = $1 AND (sender_id = $2 OR receiver_id = $2)
      ORDER BY created_at ASC
    `;

    const results = await this.connection.query<MessageEntity>(query, [transactionId, userId]);
    return results.map(entity => this.mapEntityToMessage(entity));
  }

  async getMessagesByListing(listingId: string, userId: string): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE listing_id = $1 AND (sender_id = $2 OR receiver_id = $2)
      ORDER BY created_at ASC
    `;

    const results = await this.connection.query<MessageEntity>(query, [listingId, userId]);
    return results.map(entity => this.mapEntityToMessage(entity));
  }

  private mapEntityToMessage(entity: MessageEntity): Message {
    return {
      id: entity.id,
      senderId: entity.sender_id,
      receiverId: entity.receiver_id,
      content: entity.content,
      transactionId: entity.transaction_id,
      listingId: entity.listing_id,
      isRead: entity.is_read,
      createdAt: new Date(entity.created_at),
      updatedAt: new Date(entity.updated_at),
    };
  }
}

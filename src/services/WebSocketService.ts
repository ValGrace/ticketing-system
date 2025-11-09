import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verify } from 'jsonwebtoken';
import logger from '../config/logger';

export interface SocketUser {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

export interface RealTimeListingUpdate {
  listingId: string;
  status: 'active' | 'sold' | 'expired' | 'suspended';
  quantity?: number;
  askingPrice?: number;
  updatedAt: Date;
}

export interface RealTimeTransactionUpdate {
  transactionId: string;
  status: 'pending' | 'paid' | 'confirmed' | 'disputed' | 'completed' | 'cancelled';
  buyerId: string;
  sellerId: string;
  updatedAt: Date;
}

export interface RealTimeMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  timestamp: Date;
}

export interface RealTimePriceChange {
  listingId: string;
  oldPrice: number;
  newPrice: number;
  changePercentage: number;
  updatedAt: Date;
}

export class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private socketToUser: Map<string, string> = new Map(); // socketId -> userId

  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env['FRONTEND_URL'] || 'http://localhost:3001',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));

    logger.info('WebSocket service initialized');
  }

  private async authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      const token = socket.handshake.auth["token"] || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const jwtSecret = process.env['JWT_SECRET'];
      if (!jwtSecret) {
        return next(new Error('JWT secret not configured'));
      }

      const decoded = verify(token, jwtSecret) as { userId: string };
      socket.data.userId = decoded.userId;

      next();
    } catch (error) {
      logger.error('Socket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  }

  private handleConnection(socket: Socket): void {
    const userId = socket.data.userId;

    if (!userId) {
      socket.disconnect();
      return;
    }

    // Track user connection
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socket.id);
    this.socketToUser.set(socket.id, userId);

    logger.info(`User ${userId} connected with socket ${socket.id}`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Handle listing subscriptions
    socket.on('subscribe:listing', (listingId: string) => {
      socket.join(`listing:${listingId}`);
      logger.debug(`User ${userId} subscribed to listing ${listingId}`);
    });

    socket.on('unsubscribe:listing', (listingId: string) => {
      socket.leave(`listing:${listingId}`);
      logger.debug(`User ${userId} unsubscribed from listing ${listingId}`);
    });

    // Handle transaction subscriptions
    socket.on('subscribe:transaction', (transactionId: string) => {
      socket.join(`transaction:${transactionId}`);
      logger.debug(`User ${userId} subscribed to transaction ${transactionId}`);
    });

    socket.on('unsubscribe:transaction', (transactionId: string) => {
      socket.leave(`transaction:${transactionId}`);
      logger.debug(`User ${userId} unsubscribed from transaction ${transactionId}`);
    });

    // Handle direct messaging
    socket.on('message:send', (data: { receiverId: string; message: string }) => {
      this.handleDirectMessage(socket, data);
    });

    // Handle typing indicators
    socket.on('typing:start', (receiverId: string) => {
      this.emitToUser(receiverId, 'typing:start', { userId });
    });

    socket.on('typing:stop', (receiverId: string) => {
      this.emitToUser(receiverId, 'typing:stop', { userId });
    });

    // Send connection confirmation
    socket.emit('connected', {
      userId,
      socketId: socket.id,
      timestamp: new Date(),
    });
  }

  private handleDisconnection(socket: Socket): void {
    const userId = this.socketToUser.get(socket.id);

    if (userId) {
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
      this.socketToUser.delete(socket.id);

      logger.info(`User ${userId} disconnected from socket ${socket.id}`);
    }
  }

  private handleDirectMessage(socket: Socket, data: { receiverId: string; message: string }): void {
    const senderId = socket.data.userId;

    if (!senderId) {
      return;
    }

    const message: RealTimeMessage = {
      id: this.generateMessageId(),
      senderId,
      receiverId: data.receiverId,
      message: data.message,
      timestamp: new Date(),
    };

    // Emit to receiver
    this.emitToUser(data.receiverId, 'message:received', message);

    // Confirm to sender
    socket.emit('message:sent', message);

    logger.debug(`Message sent from ${senderId} to ${data.receiverId}`);
  }

  // Public methods for emitting events

  /**
   * Emit listing status update to all subscribers
   */
  emitListingUpdate(update: RealTimeListingUpdate): void {
    if (!this.io) return;

    this.io.to(`listing:${update.listingId}`).emit('listing:updated', update);
    logger.debug(`Listing update emitted for ${update.listingId}`);
  }

  /**
   * Emit transaction status update to buyer and seller
   */
  emitTransactionUpdate(update: RealTimeTransactionUpdate): void {
    if (!this.io) return;

    // Emit to transaction room
    this.io.to(`transaction:${update.transactionId}`).emit('transaction:updated', update);

    // Also emit to buyer and seller directly
    this.emitToUser(update.buyerId, 'transaction:updated', update);
    this.emitToUser(update.sellerId, 'transaction:updated', update);

    logger.debug(`Transaction update emitted for ${update.transactionId}`);
  }

  /**
   * Emit price change notification
   */
  emitPriceChange(change: RealTimePriceChange): void {
    if (!this.io) return;

    this.io.to(`listing:${change.listingId}`).emit('listing:price_changed', change);
    logger.debug(`Price change emitted for listing ${change.listingId}`);
  }

  /**
   * Emit notification to specific user
   */
  emitToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event: string, data: any): void {
    if (!this.io) return;

    this.io.emit(event, data);
    logger.debug(`Broadcast event: ${event}`);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId) && this.connectedUsers.get(userId)!.size > 0;
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get all connected socket IDs for a user
   */
  getUserSockets(userId: string): string[] {
    const sockets = this.connectedUsers.get(userId);
    return sockets ? Array.from(sockets) : [];
  }

  /**
   * Disconnect user from all sockets
   */
  disconnectUser(userId: string): void {
    if (!this.io) return;

    const socketIds = this.getUserSockets(userId);
    socketIds.forEach(socketId => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });

    logger.info(`User ${userId} forcefully disconnected from all sockets`);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown WebSocket service
   */
  shutdown(): void {
    if (this.io) {
      this.io.close();
      this.connectedUsers.clear();
      this.socketToUser.clear();
      logger.info('WebSocket service shut down');
    }
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();

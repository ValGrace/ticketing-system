import { io as ioClient, Socket } from 'socket.io-client';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import { webSocketService } from '../../services/WebSocketService';
import { sign } from 'jsonwebtoken';
import { expect } from '@jest/globals'

describe('WebSocket Integration Tests', () => {
  let httpServer: any;
  let port: number;
  let clientSocket1: Socket;
  let clientSocket2: Socket;
  let token1: string;
  let token2: string;

  beforeAll((done) => {
    const app = express();
    httpServer = createServer(app);
    
    // Initialize WebSocket service
    webSocketService.initialize(httpServer);
    
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      
      // Generate test tokens
      const jwtSecret = process.env['JWT_SECRET'] || 'test-secret';
      token1 = sign({ userId: 'user1' }, jwtSecret);
      token2 = sign({ userId: 'user2' }, jwtSecret);
      
      done();
    });
  });

  afterAll((done) => {
    webSocketService.shutdown();
    httpServer.close(done);
  });

  afterEach(() => {
    if (clientSocket1?.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2?.connected) {
      clientSocket2.disconnect();
    }
  });

  describe('Connection and Authentication', () => {
    it('should connect with valid token', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', (data) => {
        expect(data.userId).toBe('user1');
        expect(data.socketId).toBeDefined();
        done();
      });
    });

    it('should reject connection without token', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
      });

      clientSocket1.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication');
        done();
      });
    });

    it('should track online users', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        expect(webSocketService.isUserOnline('user1')).toBe(true);
        expect(webSocketService.getOnlineUsersCount()).toBeGreaterThan(0);
        done();
      });
    });
  });

  describe('Listing Updates', () => {
    it('should receive listing status updates', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        const listingId = 'listing123';
        
        // Subscribe to listing updates
        clientSocket1.emit('subscribe:listing', listingId);

        // Listen for updates
        clientSocket1.on('listing:updated', (update) => {
          expect(update.listingId).toBe(listingId);
          expect(update.status).toBe('sold');
          done();
        });

        // Simulate listing update
        setTimeout(() => {
          webSocketService.emitListingUpdate({
            listingId,
            status: 'sold',
            updatedAt: new Date(),
          });
        }, 100);
      });
    });

    it('should receive price change notifications', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        const listingId = 'listing456';
        
        clientSocket1.emit('subscribe:listing', listingId);

        clientSocket1.on('listing:price_changed', (change) => {
          expect(change.listingId).toBe(listingId);
          expect(change.oldPrice).toBe(100);
          expect(change.newPrice).toBe(80);
          expect(change.changePercentage).toBe(-20);
          done();
        });

        setTimeout(() => {
          webSocketService.emitPriceChange({
            listingId,
            oldPrice: 100,
            newPrice: 80,
            changePercentage: -20,
            updatedAt: new Date(),
          });
        }, 100);
      });
    });

    it('should unsubscribe from listing updates', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        const listingId = 'listing789';
        
        clientSocket1.emit('subscribe:listing', listingId);
        
        setTimeout(() => {
          clientSocket1.emit('unsubscribe:listing', listingId);
          
          // Should not receive this update
          let updateReceived = false;
          clientSocket1.on('listing:updated', () => {
            updateReceived = true;
          });

          setTimeout(() => {
            webSocketService.emitListingUpdate({
              listingId,
              status: 'expired',
              updatedAt: new Date(),
            });

            setTimeout(() => {
              expect(updateReceived).toBe(false);
              done();
            }, 100);
          }, 100);
        }, 100);
      });
    });
  });

  describe('Transaction Updates', () => {
    it('should receive transaction status updates', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        const transactionId = 'txn123';
        
        clientSocket1.emit('subscribe:transaction', transactionId);

        clientSocket1.on('transaction:updated', (update) => {
          expect(update.transactionId).toBe(transactionId);
          expect(update.status).toBe('paid');
          expect(update.buyerId).toBe('user1');
          done();
        });

        setTimeout(() => {
          webSocketService.emitTransactionUpdate({
            transactionId,
            status: 'paid',
            buyerId: 'user1',
            sellerId: 'user2',
            updatedAt: new Date(),
          });
        }, 100);
      });
    });

    it('should send transaction updates to both buyer and seller', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket2 = ioClient(`http://localhost:${port}`, {
        auth: { token: token2 },
        transports: ['websocket'],
      });

      let receivedCount = 0;
      const transactionId = 'txn456';

      const checkDone = () => {
        receivedCount++;
        if (receivedCount === 2) {
          done();
        }
      };

      clientSocket1.on('connected', () => {
        clientSocket1.on('transaction:updated', (update) => {
          expect(update.transactionId).toBe(transactionId);
          expect(update.buyerId).toBe('user1');
          checkDone();
        });
      });

      clientSocket2.on('connected', () => {
        clientSocket2.on('transaction:updated', (update) => {
          expect(update.transactionId).toBe(transactionId);
          expect(update.sellerId).toBe('user2');
          checkDone();
        });

        setTimeout(() => {
          webSocketService.emitTransactionUpdate({
            transactionId,
            status: 'confirmed',
            buyerId: 'user1',
            sellerId: 'user2',
            updatedAt: new Date(),
          });
        }, 200);
      });
    });
  });

  describe('Direct Messaging', () => {
    it('should send and receive direct messages', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket2 = ioClient(`http://localhost:${port}`, {
        auth: { token: token2 },
        transports: ['websocket'],
      });

      clientSocket2.on('connected', () => {
        clientSocket2.on('message:received', (message) => {
          expect(message.senderId).toBe('user1');
          expect(message.receiverId).toBe('user2');
          expect(message.message).toBe('Hello user2!');
          done();
        });
      });

      clientSocket1.on('connected', () => {
        setTimeout(() => {
          clientSocket1.emit('message:send', {
            receiverId: 'user2',
            message: 'Hello user2!',
          });
        }, 200);
      });
    });

    it('should confirm message sent to sender', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket2 = ioClient(`http://localhost:${port}`, {
        auth: { token: token2 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        clientSocket1.on('message:sent', (message) => {
          expect(message.senderId).toBe('user1');
          expect(message.receiverId).toBe('user2');
          expect(message.id).toBeDefined();
          done();
        });

        clientSocket2.on('connected', () => {
          setTimeout(() => {
            clientSocket1.emit('message:send', {
              receiverId: 'user2',
              message: 'Test message',
            });
          }, 100);
        });
      });
    });

    it('should handle typing indicators', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket2 = ioClient(`http://localhost:${port}`, {
        auth: { token: token2 },
        transports: ['websocket'],
      });

      clientSocket2.on('connected', () => {
        clientSocket2.on('typing:start', (data) => {
          expect(data.userId).toBe('user1');
          done();
        });
      });

      clientSocket1.on('connected', () => {
        setTimeout(() => {
          clientSocket1.emit('typing:start', 'user2');
        }, 200);
      });
    });
  });

  describe('User Management', () => {
    it('should disconnect user forcefully', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket1.on('connected', () => {
        expect(webSocketService.isUserOnline('user1')).toBe(true);

        clientSocket1.on('disconnect', () => {
          setTimeout(() => {
            expect(webSocketService.isUserOnline('user1')).toBe(false);
            done();
          }, 100);
        });

        webSocketService.disconnectUser('user1');
      });
    });

    it('should handle multiple connections from same user', (done) => {
      const socket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      const socket2 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      let connectedCount = 0;

      const checkConnections = () => {
        connectedCount++;
        if (connectedCount === 2) {
          const sockets = webSocketService.getUserSockets('user1');
          expect(sockets.length).toBe(2);
          socket1.disconnect();
          socket2.disconnect();
          done();
        }
      };

      socket1.on('connected', checkConnections);
      socket2.on('connected', checkConnections);
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to all connected users', (done) => {
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        auth: { token: token1 },
        transports: ['websocket'],
      });

      clientSocket2 = ioClient(`http://localhost:${port}`, {
        auth: { token: token2 },
        transports: ['websocket'],
      });

      let receivedCount = 0;

      const checkDone = () => {
        receivedCount++;
        if (receivedCount === 2) {
          done();
        }
      };

      clientSocket1.on('connected', () => {
        clientSocket1.on('system:announcement', (data) => {
          expect(data.message).toBe('System maintenance scheduled');
          checkDone();
        });
      });

      clientSocket2.on('connected', () => {
        clientSocket2.on('system:announcement', (data) => {
          expect(data.message).toBe('System maintenance scheduled');
          checkDone();
        });

        setTimeout(() => {
          webSocketService.broadcast('system:announcement', {
            message: 'System maintenance scheduled',
          });
        }, 200);
      });
    });
  });
});

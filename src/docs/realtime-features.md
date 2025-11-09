# Real-Time Features Documentation

## Overview

The ticket resell platform implements real-time features using WebSocket connections (Socket.IO) to provide live updates for listings, transactions, and user-to-user messaging.

## Features Implemented

### 1. WebSocket Connection Management

- **Authentication**: All WebSocket connections require JWT token authentication
- **Connection Tracking**: Tracks online users and their socket connections
- **Multi-device Support**: Users can connect from multiple devices simultaneously
- **Automatic Reconnection**: Clients can automatically reconnect on connection loss

### 2. Real-Time Listing Updates

Users can subscribe to specific listings and receive instant notifications when:
- Listing status changes (active → sold, expired, suspended)
- Listing quantity changes
- Price changes occur

**Client Events:**
```javascript
// Subscribe to listing updates
socket.emit('subscribe:listing', listingId);

// Listen for updates
socket.on('listing:updated', (update) => {
  console.log('Listing updated:', update);
});

// Listen for price changes
socket.on('listing:price_changed', (change) => {
  console.log('Price changed:', change);
});

// Unsubscribe
socket.emit('unsubscribe:listing', listingId);
```

### 3. Real-Time Transaction Updates

Buyers and sellers receive instant notifications about transaction status changes:
- Payment received
- Payment confirmed
- Transaction completed
- Disputes filed

**Client Events:**
```javascript
// Subscribe to transaction updates
socket.emit('subscribe:transaction', transactionId);

// Listen for updates
socket.on('transaction:updated', (update) => {
  console.log('Transaction updated:', update);
});
```

### 4. Real-Time Messaging

Direct messaging between users with:
- Instant message delivery
- Read receipts
- Typing indicators
- Message history

**Client Events:**
```javascript
// Send a message
socket.emit('message:send', {
  receiverId: 'user-id',
  message: 'Hello!'
});

// Receive messages
socket.on('message:received', (message) => {
  console.log('New message:', message);
});

// Typing indicators
socket.emit('typing:start', receiverId);
socket.emit('typing:stop', receiverId);

socket.on('typing:start', (data) => {
  console.log(`${data.userId} is typing...`);
});
```

## API Endpoints

### Messaging REST API

All messaging endpoints require authentication.

#### Send Message
```
POST /api/messages
Body: {
  receiverId: string,
  content: string,
  transactionId?: string,
  listingId?: string
}
```

#### Get Conversations
```
GET /api/messages/conversations
Returns: Array of conversations with last message and unread count
```

#### Get Conversation with User
```
GET /api/messages/conversation/:userId?limit=50&offset=0
Returns: Array of messages
```

#### Get Unread Count
```
GET /api/messages/unread-count
Returns: { count: number }
```

#### Mark Message as Read
```
PUT /api/messages/:messageId/read
```

#### Mark Conversation as Read
```
PUT /api/messages/conversation/:userId/read
```

#### Get Transaction Messages
```
GET /api/messages/transaction/:transactionId
```

#### Get Listing Messages
```
GET /api/messages/listing/:listingId
```

#### Delete Message
```
DELETE /api/messages/:messageId
```

## Client Integration Example

### Connecting to WebSocket

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### Subscribing to Updates

```javascript
// Subscribe to a listing
socket.emit('subscribe:listing', 'listing-123');

// Subscribe to a transaction
socket.emit('subscribe:transaction', 'txn-456');

// Listen for updates
socket.on('listing:updated', handleListingUpdate);
socket.on('transaction:updated', handleTransactionUpdate);
socket.on('message:received', handleNewMessage);
```

## Database Schema

### Messages Table

```sql
CREATE TABLE messages (
  id VARCHAR(255) PRIMARY KEY,
  sender_id VARCHAR(255) NOT NULL REFERENCES users(id),
  receiver_id VARCHAR(255) NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  transaction_id VARCHAR(255) REFERENCES transactions(id),
  listing_id VARCHAR(255) REFERENCES ticket_listings(id),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages(receiver_id, is_read) WHERE is_read = false;
```

## Performance Considerations

1. **Connection Limits**: Monitor the number of concurrent WebSocket connections
2. **Message Throttling**: Implement rate limiting for message sending
3. **Room Management**: Users are automatically added to personal rooms and can subscribe to specific listing/transaction rooms
4. **Memory Usage**: Track connected users in memory with cleanup on disconnect

## Security

1. **Authentication**: All WebSocket connections require valid JWT tokens
2. **Authorization**: Users can only access their own messages and subscribed resources
3. **Input Validation**: All message content is validated before storage
4. **Rate Limiting**: Prevent spam and abuse through rate limiting

## Testing

Integration tests are provided for:
- WebSocket connection and authentication
- Listing updates
- Transaction updates
- Direct messaging
- Typing indicators
- Broadcasting

Run tests with:
```bash
npm test -- --testPathPattern="websocket|messaging"
```

## Monitoring

The WebSocket service provides methods to monitor:
- Online users count: `webSocketService.getOnlineUsersCount()`
- User online status: `webSocketService.isUserOnline(userId)`
- User socket connections: `webSocketService.getUserSockets(userId)`

## Future Enhancements

1. Message encryption for sensitive communications
2. File attachments in messages
3. Group messaging for multi-party transactions
4. Voice/video call integration
5. Message search functionality
6. Push notifications for offline users

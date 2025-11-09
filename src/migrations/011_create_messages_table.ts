import { DatabaseConnection } from '../types';

export async function up(connection: DatabaseConnection): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(255) PRIMARY KEY,
      sender_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      transaction_id VARCHAR(255) REFERENCES transactions(id) ON DELETE SET NULL,
      listing_id VARCHAR(255) REFERENCES ticket_listings(id) ON DELETE SET NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  await connection.query(createTableQuery);

  // Create indexes for better query performance
  const createIndexesQuery = `
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_transaction_id ON messages(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_messages_listing_id ON messages(listing_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id, is_read) WHERE is_read = false;
  `;

  await connection.query(createIndexesQuery);

  console.log('Messages table created successfully');
}

export async function down(connection: DatabaseConnection): Promise<void> {
  const dropTableQuery = `DROP TABLE IF EXISTS messages CASCADE;`;
  await connection.query(dropTableQuery);
  console.log('Messages table dropped successfully');
}

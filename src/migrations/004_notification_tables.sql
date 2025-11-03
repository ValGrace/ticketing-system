-- Notification system tables

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    sms_enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
    subject VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, channel)
);

-- Indexes for better performance
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_templates_type_channel ON notification_templates(type, channel);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification templates
INSERT INTO notification_templates (type, channel, subject, title, body, variables) VALUES
-- Email templates
('welcome', 'email', 'Welcome to Ticket Resell Platform', 'Welcome {{userName}}!', 
 '<h1>Welcome to Ticket Resell Platform!</h1><p>Hi {{userName}},</p><p>Thank you for joining our platform. You can now start buying and selling tickets safely.</p><p>Best regards,<br>The Ticket Resell Team</p>', 
 '["userName"]'),

('listing_created', 'email', 'Your ticket listing is now live', 'Listing Created Successfully', 
 '<h2>Your listing is now live!</h2><p>Hi {{userName}},</p><p>Your listing for <strong>{{eventName}}</strong> has been created successfully and is now visible to buyers.</p><p>Listing details:</p><ul><li>Event: {{eventName}}</li><li>Date: {{eventDate}}</li><li>Price: ${{price}}</li></ul><p>Good luck with your sale!</p>', 
 '["userName", "eventName", "eventDate", "price"]'),

('purchase_confirmation', 'email', 'Purchase Confirmation - {{eventName}}', 'Purchase Confirmed', 
 '<h2>Purchase Confirmed!</h2><p>Hi {{userName}},</p><p>Your purchase of tickets for <strong>{{eventName}}</strong> has been confirmed.</p><p>Transaction details:</p><ul><li>Event: {{eventName}}</li><li>Date: {{eventDate}}</li><li>Quantity: {{quantity}}</li><li>Total: ${{totalAmount}}</li></ul><p>The seller will be notified and tickets will be transferred once payment is processed.</p>', 
 '["userName", "eventName", "eventDate", "quantity", "totalAmount"]'),

('payment_received', 'email', 'Payment Received - {{eventName}}', 'Payment Received', 
 '<h2>Payment Received!</h2><p>Hi {{userName}},</p><p>We have received payment for your ticket sale of <strong>{{eventName}}</strong>.</p><p>The funds will be released to your account once the buyer confirms receipt of the tickets.</p><p>Amount: ${{amount}}</p>', 
 '["userName", "eventName", "amount"]'),

('transaction_completed', 'email', 'Transaction Completed - {{eventName}}', 'Transaction Completed', 
 '<h2>Transaction Completed!</h2><p>Hi {{userName}},</p><p>Your transaction for <strong>{{eventName}}</strong> has been completed successfully.</p><p>{{completionMessage}}</p><p>Thank you for using our platform!</p>', 
 '["userName", "eventName", "completionMessage"]'),

-- SMS templates
('purchase_confirmation', 'sms', NULL, 'Purchase Confirmed', 
 'Hi {{userName}}, your purchase of {{quantity}} ticket(s) for {{eventName}} on {{eventDate}} has been confirmed. Total: ${{totalAmount}}. Check your email for details.', 
 '["userName", "quantity", "eventName", "eventDate", "totalAmount"]'),

('payment_received', 'sms', NULL, 'Payment Received', 
 'Hi {{userName}}, payment of ${{amount}} received for your {{eventName}} ticket sale. Funds will be released once buyer confirms receipt.', 
 '["userName", "amount", "eventName"]'),

-- Push notification templates
('listing_created', 'push', NULL, 'Listing Created', 
 'Your listing for {{eventName}} is now live and visible to buyers!', 
 '["eventName"]'),

('purchase_confirmation', 'push', NULL, 'Purchase Confirmed', 
 'Your purchase of {{eventName}} tickets has been confirmed!', 
 '["eventName"]'),

('payment_received', 'push', NULL, 'Payment Received', 
 'Payment of ${{amount}} received for your ticket sale!', 
 '["amount"]'),

-- In-app notification templates
('review_received', 'in_app', NULL, 'New Review', 
 'You received a {{rating}}-star review from {{reviewerName}}: "{{comment}}"', 
 '["rating", "reviewerName", "comment"]'),

('price_drop', 'in_app', NULL, 'Price Drop Alert', 
 'The price for {{eventName}} tickets has dropped to ${{newPrice}}!', 
 '["eventName", "newPrice"]'),

('fraud_alert', 'in_app', NULL, 'Security Alert', 
 'Suspicious activity detected on your account. Please review your recent transactions.', 
 '[]');
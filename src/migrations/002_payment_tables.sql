-- Migration 002: Payment processing tables
-- Created: 2024-01-02
-- Description: Creates tables for escrow accounts, dispute cases, and refund requests

-- Create enum types for payment processing
CREATE TYPE escrow_status AS ENUM ('held', 'released', 'refunded');
CREATE TYPE dispute_status AS ENUM ('open', 'investigating', 'resolved', 'closed');
CREATE TYPE refund_status AS ENUM ('pending', 'approved', 'rejected', 'processed');

-- Escrow accounts table
CREATE TABLE escrow_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    status escrow_status DEFAULT 'held',
    release_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one escrow account per transaction
    UNIQUE(transaction_id)
);

-- Dispute cases table
CREATE TABLE dispute_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    status dispute_status DEFAULT 'open',
    resolution TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Refund requests table
CREATE TABLE refund_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    reason VARCHAR(100) NOT NULL,
    status refund_status DEFAULT 'pending',
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add role column to users table for admin access
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));

-- Update existing admin user to have admin role
UPDATE users SET role = 'admin' WHERE email = 'admin@ticketplatform.com';

-- Create indexes for performance
CREATE INDEX idx_escrow_accounts_transaction_id ON escrow_accounts(transaction_id);
CREATE INDEX idx_escrow_accounts_status ON escrow_accounts(status);
CREATE INDEX idx_escrow_accounts_release_date ON escrow_accounts(release_date);

CREATE INDEX idx_dispute_cases_transaction_id ON dispute_cases(transaction_id);
CREATE INDEX idx_dispute_cases_reporter_id ON dispute_cases(reporter_id);
CREATE INDEX idx_dispute_cases_reported_id ON dispute_cases(reported_id);
CREATE INDEX idx_dispute_cases_status ON dispute_cases(status);
CREATE INDEX idx_dispute_cases_created_at ON dispute_cases(created_at);

CREATE INDEX idx_refund_requests_transaction_id ON refund_requests(transaction_id);
CREATE INDEX idx_refund_requests_requester_id ON refund_requests(requester_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);
CREATE INDEX idx_refund_requests_created_at ON refund_requests(created_at);

CREATE INDEX idx_users_role ON users(role);

-- Create triggers for updated_at columns
CREATE TRIGGER update_escrow_accounts_updated_at 
    BEFORE UPDATE ON escrow_accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dispute_cases_updated_at 
    BEFORE UPDATE ON dispute_cases 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refund_requests_updated_at 
    BEFORE UPDATE ON refund_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create escrow account when transaction is paid
CREATE OR REPLACE FUNCTION create_escrow_on_payment()
RETURNS TRIGGER AS $
BEGIN
    -- Only create escrow when status changes to 'paid'
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        INSERT INTO escrow_accounts (transaction_id, amount, release_date)
        VALUES (NEW.id, NEW.total_amount, NEW.escrow_release_date);
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER create_escrow_trigger
    AFTER INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION create_escrow_on_payment();

-- Create function to handle escrow release
CREATE OR REPLACE FUNCTION release_escrow_funds(transaction_uuid UUID)
RETURNS BOOLEAN AS $
DECLARE
    escrow_record RECORD;
BEGIN
    -- Get escrow account
    SELECT * INTO escrow_record 
    FROM escrow_accounts 
    WHERE transaction_id = transaction_uuid AND status = 'held';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update escrow status to released
    UPDATE escrow_accounts 
    SET status = 'released', updated_at = CURRENT_TIMESTAMP
    WHERE id = escrow_record.id;
    
    -- In a real implementation, this would transfer funds to seller's account
    -- For now, we just mark it as released
    
    RETURN TRUE;
END;
$ LANGUAGE plpgsql;

-- Create function to process refunds
CREATE OR REPLACE FUNCTION process_refund(refund_uuid UUID, processor_id UUID)
RETURNS BOOLEAN AS $
DECLARE
    refund_record RECORD;
    transaction_record RECORD;
BEGIN
    -- Get refund request
    SELECT * INTO refund_record 
    FROM refund_requests 
    WHERE id = refund_uuid AND status = 'approved';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Get transaction details
    SELECT * INTO transaction_record 
    FROM transactions 
    WHERE id = refund_record.transaction_id;
    
    -- Update refund status
    UPDATE refund_requests 
    SET status = 'processed', 
        processed_by = processor_id,
        processed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = refund_uuid;
    
    -- Update escrow account if exists
    UPDATE escrow_accounts 
    SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
    WHERE transaction_id = refund_record.transaction_id;
    
    -- In a real implementation, this would process the actual refund
    -- For now, we just mark it as processed
    
    RETURN TRUE;
END;
$ LANGUAGE plpgsql;
-- Migration 003: Fraud detection and verification tables
-- Created: 2024-01-03
-- Description: Creates tables for fraud detection, ticket verification, and user suspensions

-- Create enum types for fraud detection
CREATE TYPE fraud_report_type AS ENUM ('fake_ticket', 'duplicate_listing', 'suspicious_behavior', 'payment_fraud', 'other');
CREATE TYPE fraud_report_status AS ENUM ('pending', 'investigating', 'resolved', 'dismissed');
CREATE TYPE suspicious_activity_type AS ENUM ('rapid_listing', 'price_manipulation', 'duplicate_images', 'suspicious_login', 'multiple_accounts');
CREATE TYPE activity_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE activity_status AS ENUM ('flagged', 'reviewed', 'dismissed');
CREATE TYPE verification_method AS ENUM ('automated', 'manual', 'image_analysis');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected', 'requires_manual_review');
CREATE TYPE suspension_type AS ENUM ('temporary', 'permanent');
CREATE TYPE appeal_status AS ENUM ('none', 'pending', 'approved', 'rejected');

-- Fraud reports table
CREATE TABLE fraud_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES ticket_listings(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    type fraud_report_type NOT NULL,
    reason VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    evidence TEXT[] DEFAULT '{}',
    status fraud_report_status DEFAULT 'pending',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure at least one target is specified
    CONSTRAINT fraud_report_target_check CHECK (
        reported_user_id IS NOT NULL OR 
        listing_id IS NOT NULL OR 
        transaction_id IS NOT NULL
    )
);

-- Suspicious activities table
CREATE TABLE suspicious_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type suspicious_activity_type NOT NULL,
    description TEXT NOT NULL,
    severity activity_severity NOT NULL,
    metadata JSONB DEFAULT '{}',
    status activity_status DEFAULT 'flagged',
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket verifications table
CREATE TABLE ticket_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES ticket_listings(id) ON DELETE CASCADE,
    verification_method verification_method NOT NULL,
    status verification_status DEFAULT 'pending',
    confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    findings JSONB NOT NULL DEFAULT '[]',
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- One verification per listing per method
    UNIQUE(listing_id, verification_method)
);

-- User suspensions table
CREATE TABLE user_suspensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    suspended_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suspension_type suspension_type NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    appeal_status appeal_status DEFAULT 'none',
    appeal_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Permanent suspensions should not have end dates
    CONSTRAINT suspension_end_date_check CHECK (
        (suspension_type = 'permanent' AND end_date IS NULL) OR
        (suspension_type = 'temporary' AND end_date IS NOT NULL)
    )
);

-- Create indexes for performance
CREATE INDEX idx_fraud_reports_reporter_id ON fraud_reports(reporter_id);
CREATE INDEX idx_fraud_reports_reported_user_id ON fraud_reports(reported_user_id);
CREATE INDEX idx_fraud_reports_listing_id ON fraud_reports(listing_id);
CREATE INDEX idx_fraud_reports_transaction_id ON fraud_reports(transaction_id);
CREATE INDEX idx_fraud_reports_status ON fraud_reports(status);
CREATE INDEX idx_fraud_reports_type ON fraud_reports(type);
CREATE INDEX idx_fraud_reports_assigned_to ON fraud_reports(assigned_to);
CREATE INDEX idx_fraud_reports_created_at ON fraud_reports(created_at);

CREATE INDEX idx_suspicious_activities_user_id ON suspicious_activities(user_id);
CREATE INDEX idx_suspicious_activities_type ON suspicious_activities(activity_type);
CREATE INDEX idx_suspicious_activities_severity ON suspicious_activities(severity);
CREATE INDEX idx_suspicious_activities_status ON suspicious_activities(status);
CREATE INDEX idx_suspicious_activities_created_at ON suspicious_activities(created_at);

CREATE INDEX idx_ticket_verifications_listing_id ON ticket_verifications(listing_id);
CREATE INDEX idx_ticket_verifications_status ON ticket_verifications(status);
CREATE INDEX idx_ticket_verifications_method ON ticket_verifications(verification_method);
CREATE INDEX idx_ticket_verifications_confidence ON ticket_verifications(confidence);
CREATE INDEX idx_ticket_verifications_created_at ON ticket_verifications(created_at);

CREATE INDEX idx_user_suspensions_user_id ON user_suspensions(user_id);
CREATE INDEX idx_user_suspensions_suspended_by ON user_suspensions(suspended_by);
CREATE INDEX idx_user_suspensions_is_active ON user_suspensions(is_active);
CREATE INDEX idx_user_suspensions_type ON user_suspensions(suspension_type);
CREATE INDEX idx_user_suspensions_start_date ON user_suspensions(start_date);
CREATE INDEX idx_user_suspensions_end_date ON user_suspensions(end_date);

-- Add updated_at triggers
CREATE TRIGGER update_fraud_reports_updated_at 
    BEFORE UPDATE ON fraud_reports 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suspicious_activities_updated_at 
    BEFORE UPDATE ON suspicious_activities 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_verifications_updated_at 
    BEFORE UPDATE ON ticket_verifications 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_suspensions_updated_at 
    BEFORE UPDATE ON user_suspensions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically suspend users with multiple fraud reports
CREATE OR REPLACE FUNCTION check_fraud_threshold()
RETURNS TRIGGER AS $
DECLARE
    fraud_count INTEGER;
    high_severity_count INTEGER;
BEGIN
    -- Count total fraud reports for the user
    SELECT COUNT(*) INTO fraud_count
    FROM fraud_reports 
    WHERE reported_user_id = NEW.reported_user_id 
    AND status IN ('investigating', 'resolved');
    
    -- Count high severity suspicious activities
    SELECT COUNT(*) INTO high_severity_count
    FROM suspicious_activities 
    WHERE user_id = NEW.reported_user_id 
    AND severity IN ('high', 'critical')
    AND status = 'flagged';
    
    -- Auto-suspend if thresholds are exceeded
    IF fraud_count >= 3 OR high_severity_count >= 2 THEN
        INSERT INTO user_suspensions (
            user_id, 
            reason, 
            suspended_by, 
            suspension_type,
            end_date
        ) VALUES (
            NEW.reported_user_id,
            'Automatic suspension due to multiple fraud reports or suspicious activities',
            NEW.reporter_id, -- Use reporter as suspender for now
            'temporary',
            CURRENT_TIMESTAMP + INTERVAL '7 days'
        )
        ON CONFLICT DO NOTHING; -- Avoid duplicate suspensions
        
        -- Update user status
        UPDATE users 
        SET status = 'suspended' 
        WHERE id = NEW.reported_user_id;
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Trigger to check fraud threshold when reports are created/updated
CREATE TRIGGER fraud_threshold_check
    AFTER INSERT OR UPDATE ON fraud_reports
    FOR EACH ROW 
    WHEN (NEW.reported_user_id IS NOT NULL)
    EXECUTE FUNCTION check_fraud_threshold();

-- Function to automatically update listing verification status
CREATE OR REPLACE FUNCTION update_listing_verification()
RETURNS TRIGGER AS $
BEGIN
    -- Update listing verification status based on verification result
    IF NEW.status = 'verified' THEN
        UPDATE ticket_listings 
        SET verification_status = 'verified'
        WHERE id = NEW.listing_id;
    ELSIF NEW.status = 'rejected' THEN
        UPDATE ticket_listings 
        SET verification_status = 'rejected',
            status = 'suspended'
        WHERE id = NEW.listing_id;
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Trigger to update listing status when verification changes
CREATE TRIGGER update_listing_on_verification
    AFTER UPDATE ON ticket_verifications
    FOR EACH ROW 
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION update_listing_verification();

-- Function to deactivate expired suspensions
CREATE OR REPLACE FUNCTION deactivate_expired_suspensions()
RETURNS VOID AS $
BEGIN
    UPDATE user_suspensions 
    SET is_active = FALSE
    WHERE suspension_type = 'temporary' 
    AND end_date < CURRENT_TIMESTAMP 
    AND is_active = TRUE;
    
    -- Reactivate users whose suspensions have expired
    UPDATE users 
    SET status = 'active'
    WHERE id IN (
        SELECT DISTINCT user_id 
        FROM user_suspensions 
        WHERE suspension_type = 'temporary' 
        AND end_date < CURRENT_TIMESTAMP 
        AND is_active = FALSE
        AND NOT EXISTS (
            SELECT 1 FROM user_suspensions s2 
            WHERE s2.user_id = user_suspensions.user_id 
            AND s2.is_active = TRUE
        )
    )
    AND status = 'suspended';
END;
$ LANGUAGE plpgsql;

-- Add role column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));
        CREATE INDEX idx_users_role ON users(role);
    END IF;
END $$;
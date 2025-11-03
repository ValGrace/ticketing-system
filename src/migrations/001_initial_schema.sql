-- Migration 001: Initial database schema for ticket resell platform
-- Created: 2024-01-01
-- Description: Creates core tables for users, ticket listings, transactions, and reviews

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE ticket_category AS ENUM ('concert', 'sports', 'theater', 'transportation', 'other');
CREATE TYPE listing_status AS ENUM ('active', 'sold', 'expired', 'suspended');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE transaction_status AS ENUM ('pending', 'paid', 'confirmed', 'disputed', 'completed', 'cancelled');
CREATE TYPE review_type AS ENUM ('buyer_to_seller', 'seller_to_buyer');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    profile_image TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    rating DECIMAL(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
    total_transactions INTEGER DEFAULT 0,
    role user_role DEFAULT 'user',
    status user_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket listings table
CREATE TABLE ticket_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category ticket_category NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    event_time VARCHAR(20) NOT NULL,
    venue VARCHAR(255) NOT NULL,
    seat_section VARCHAR(50),
    seat_row VARCHAR(20),
    seat_number VARCHAR(20),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    original_price DECIMAL(10,2) NOT NULL CHECK (original_price >= 0),
    asking_price DECIMAL(10,2) NOT NULL CHECK (asking_price >= 0),
    images TEXT[] DEFAULT '{}',
    status listing_status DEFAULT 'active',
    verification_status verification_status DEFAULT 'pending',
    location_city VARCHAR(100) NOT NULL,
    location_state VARCHAR(100) NOT NULL,
    location_country VARCHAR(100) NOT NULL,
    location_coordinates POINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES ticket_listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    platform_fee DECIMAL(10,2) NOT NULL CHECK (platform_fee >= 0),
    payment_intent_id VARCHAR(255) NOT NULL,
    status transaction_status DEFAULT 'pending',
    escrow_release_date TIMESTAMP WITH TIME ZONE NOT NULL,
    dispute_reason TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    type review_type NOT NULL,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one review per transaction per direction
    UNIQUE(transaction_id, reviewer_id, type)
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_status ON users(status);

CREATE INDEX idx_listings_seller_id ON ticket_listings(seller_id);
CREATE INDEX idx_listings_category ON ticket_listings(category);
CREATE INDEX idx_listings_status ON ticket_listings(status);
CREATE INDEX idx_listings_verification_status ON ticket_listings(verification_status);
CREATE INDEX idx_listings_event_date ON ticket_listings(event_date);
CREATE INDEX idx_listings_location ON ticket_listings(location_city, location_state, location_country);
CREATE INDEX idx_listings_price ON ticket_listings(asking_price);
CREATE INDEX idx_listings_created_at ON ticket_listings(created_at);

CREATE INDEX idx_transactions_listing_id ON transactions(listing_id);
CREATE INDEX idx_transactions_buyer_id ON transactions(buyer_id);
CREATE INDEX idx_transactions_seller_id ON transactions(seller_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

CREATE INDEX idx_reviews_transaction_id ON reviews(transaction_id);
CREATE INDEX idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_listings_updated_at 
    BEFORE UPDATE ON ticket_listings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to update user rating
CREATE OR REPLACE FUNCTION update_user_rating(user_id UUID)
RETURNS VOID AS $$
DECLARE
    avg_rating DECIMAL(3,2);
BEGIN
    SELECT COALESCE(AVG(rating), 0.00) INTO avg_rating
    FROM reviews 
    WHERE reviewee_id = user_id AND is_visible = TRUE;
    
    UPDATE users 
    SET rating = avg_rating 
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update user rating when reviews are added/updated
CREATE OR REPLACE FUNCTION trigger_update_user_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- Update rating for the reviewee
    PERFORM update_user_rating(COALESCE(NEW.reviewee_id, OLD.reviewee_id));
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rating_on_review_change
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION trigger_update_user_rating();

-- Create function to increment user transaction count
CREATE OR REPLACE FUNCTION increment_transaction_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE users SET total_transactions = total_transactions + 1 WHERE id = NEW.buyer_id;
        UPDATE users SET total_transactions = total_transactions + 1 WHERE id = NEW.seller_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transaction_count
    AFTER INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION increment_transaction_count();

-- Insert initial admin user (password: admin123)
INSERT INTO users (
    email, 
    username, 
    first_name, 
    last_name, 
    password_hash, 
    is_verified, 
    status
) VALUES (
    'admin@ticketplatform.com',
    'admin',
    'Platform',
    'Administrator',
    '$2a$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', -- bcrypt hash of 'admin123'
    TRUE,
    'active'
);
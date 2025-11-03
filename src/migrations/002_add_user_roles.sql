-- Migration 002: Add user roles
-- Created: 2024-01-02
-- Description: Adds role column to users table for role-based access control

-- Create user role enum
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');

-- Add role column to users table
ALTER TABLE users ADD COLUMN role user_role DEFAULT 'user';

-- Create index for role column
CREATE INDEX idx_users_role ON users(role);

-- Update existing admin user to have admin role
UPDATE users SET role = 'admin' WHERE username = 'admin';
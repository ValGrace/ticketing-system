-- Initial database setup
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create test database for development
CREATE DATABASE ticket_platform_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE ticket_platform TO postgres;
GRANT ALL PRIVILEGES ON DATABASE ticket_platform_test TO postgres;
-- Migration: Create developers table for external partner registration
-- Created: 2026-07-16
-- Description: Devs/partners who register to get API access and provision clients via the create-client API

-- UP Migration
CREATE TABLE IF NOT EXISTS developers (
    dev_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(20),
    status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'suspended')) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_developers_email ON developers(email);
CREATE INDEX IF NOT EXISTS idx_developers_status ON developers(status);

-- Add comments
COMMENT ON TABLE developers IS 'External devs/partners registered to get API access and provision clients on their behalf';
COMMENT ON COLUMN developers.status IS 'pending = registered but not yet approved; approved = can request dev-level API keys; suspended = access revoked';
COMMENT ON COLUMN developers.approved_at IS 'When this developer was approved to receive a dev-level API key';

-- DOWN Migration (Rollback)
-- DROP INDEX IF EXISTS idx_developers_status;
-- DROP INDEX IF EXISTS idx_developers_email;
-- DROP TABLE IF EXISTS developers CASCADE;

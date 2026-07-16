-- Migration: Create api_keys table for external partner access
-- Created: 2026-07-16
-- Description: API keys for external access. Two kinds share this table:
--   1. Dev-level keys   (dev_id set, client_id NULL)   - scope 'client_provisioning', used to create clients
--   2. Client-level keys (client_id set, dev_id NULL)  - scope 'stock_management', used to check/reduce stock

-- UP Migration
CREATE TABLE IF NOT EXISTS api_keys (
    api_key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES client_entry(client_id) ON DELETE CASCADE,
    dev_id UUID REFERENCES developers(dev_id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    label VARCHAR(255),
    scope VARCHAR(50) NOT NULL DEFAULT 'stock_management',
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,
    CONSTRAINT api_keys_owner_check CHECK (
        (client_id IS NOT NULL AND dev_id IS NULL) OR
        (client_id IS NULL AND dev_id IS NOT NULL)
    )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys(client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_dev_id ON api_keys(dev_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Add comments
COMMENT ON TABLE api_keys IS 'API keys for external access - either dev-level (client_provisioning) or client-level (stock_management), never both on one row';
COMMENT ON COLUMN api_keys.client_id IS 'Set for client-level stock keys. NULL for dev-level keys';
COMMENT ON COLUMN api_keys.dev_id IS 'Set for dev-level provisioning keys. NULL for client-level keys';
COMMENT ON COLUMN api_keys.key_hash IS 'Hashed key value - never store the raw ryx_live_ key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First few chars of the raw key (e.g. ryx_live_8f3a) for identification in logs without exposing the full key';
COMMENT ON COLUMN api_keys.scope IS 'What this key is allowed to access - e.g. stock_management or client_provisioning';

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create RLS policy (client-level keys isolated per client; dev-level keys have client_id NULL and are managed via service role)
CREATE POLICY api_keys_client_isolation ON api_keys
    FOR ALL
    USING (client_id = current_setting('app.current_client_id')::UUID);

-- DOWN Migration (Rollback)
-- DROP POLICY IF EXISTS api_keys_client_isolation ON api_keys;
-- DROP INDEX IF EXISTS idx_api_keys_key_hash;
-- DROP INDEX IF EXISTS idx_api_keys_dev_id;
-- DROP INDEX IF EXISTS idx_api_keys_client_id;
-- DROP TABLE IF EXISTS api_keys CASCADE;

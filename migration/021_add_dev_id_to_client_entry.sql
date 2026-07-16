-- Migration: Add dev_id field to client_entry
-- Description: Links a client to the developer/partner who created it via the API (nullable - existing clients weren't created by a dev)
-- Date: 2026-07-16

-- Add dev_id column to client_entry table
ALTER TABLE client_entry
ADD COLUMN IF NOT EXISTS dev_id UUID REFERENCES developers(dev_id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_client_entry_dev_id ON client_entry(dev_id);

-- Add comment for documentation
COMMENT ON COLUMN client_entry.dev_id IS 'Developer/partner who created this client via the create-client API - NULL for clients not created through a dev integration';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 021 completed successfully: dev_id field added to client_entry';
    RAISE NOTICE 'dev_id field:';
    RAISE NOTICE '  - Type: UUID, references developers(dev_id)';
    RAISE NOTICE '  - Nullable: Yes (NULL for existing/non-dev-created clients)';
    RAISE NOTICE '  - On developer deletion: dev_id set to NULL, client is kept';
END $$;

-- Migration: Add trial/subscription fields to client_entry table
-- Date: 2026-02-18
-- Description: Adds subscription_status, trial_start_date, trial_end_date columns
--              to support self-signup free trial functionality.

-- For Supabase (PostgreSQL)
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20);
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMP;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP;

-- Existing clients remain unaffected (subscription_status = NULL means no trial enforcement)
-- Only clients with subscription_status = 'trial' will have expiration checked

-- Optional: If you want to mark all existing clients as 'active' (paid/permanent):
-- UPDATE client_entry SET subscription_status = 'active' WHERE subscription_status IS NULL;

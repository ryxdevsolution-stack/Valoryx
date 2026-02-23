-- Migration: Add trial/subscription fields to client_entry table (SQLite)
-- Date: 2026-02-18
-- Description: Adds subscription_status, trial_start_date, trial_end_date columns
--              to support self-signup free trial functionality.

ALTER TABLE client_entry ADD COLUMN subscription_status VARCHAR(20) NULL;
ALTER TABLE client_entry ADD COLUMN trial_start_date TIMESTAMP NULL;
ALTER TABLE client_entry ADD COLUMN trial_end_date TIMESTAMP NULL;

-- Existing clients remain unaffected (subscription_status = NULL means no trial enforcement)

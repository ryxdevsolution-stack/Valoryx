-- Migration: add_global_billing
-- Purpose: Add Lemon Squeezy + USD pricing columns for worldwide billing support
-- Run once in Supabase SQL editor
-- Safe to re-run — uses IF NOT EXISTS

-- client_entry
ALTER TABLE client_entry
    ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id VARCHAR(100);

-- payment_transaction
ALTER TABLE payment_transaction
    ADD COLUMN IF NOT EXISTS gateway VARCHAR(20) NOT NULL DEFAULT 'razorpay',
    ADD COLUMN IF NOT EXISTS ls_subscription_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS ls_order_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_payment_transaction_ls_subscription_id
    ON payment_transaction (ls_subscription_id);

-- subscription_plan
ALTER TABLE subscription_plan
    ADD COLUMN IF NOT EXISTS usd_monthly_price INTEGER,
    ADD COLUMN IF NOT EXISTS usd_yearly_price INTEGER,
    ADD COLUMN IF NOT EXISTS ls_monthly_variant_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS ls_yearly_variant_id VARCHAR(100);

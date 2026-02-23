-- Migration: Add subscription plans and payment transaction tables
-- Date: 2026-02-18
-- Description: Creates subscription_plan and payment_transaction tables,
--              adds plan_id and subscription_end_date to client_entry.

-- ============================================
-- SQLite Version
-- ============================================

-- 1. Subscription Plans table
CREATE TABLE IF NOT EXISTS subscription_plan (
    plan_id TEXT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    monthly_price INTEGER NOT NULL,
    yearly_price INTEGER NOT NULL,
    features TEXT,
    limits TEXT,
    is_popular BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Payment Transactions table
CREATE TABLE IF NOT EXISTS payment_transaction (
    transaction_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    billing_cycle VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'created',
    notes VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES client_entry(client_id),
    FOREIGN KEY (plan_id) REFERENCES subscription_plan(plan_id)
);

CREATE INDEX IF NOT EXISTS idx_pt_client ON payment_transaction(client_id);
CREATE INDEX IF NOT EXISTS idx_pt_order ON payment_transaction(razorpay_order_id);

-- 3. Add new columns to client_entry
ALTER TABLE client_entry ADD COLUMN plan_id TEXT NULL;
ALTER TABLE client_entry ADD COLUMN subscription_end_date TIMESTAMP NULL;


-- ============================================
-- PostgreSQL (Supabase) Version
-- ============================================
-- Uncomment and run these on Supabase instead of the above

-- CREATE TABLE IF NOT EXISTS subscription_plan (
--     plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     name VARCHAR(50) NOT NULL,
--     description VARCHAR(255),
--     monthly_price INTEGER NOT NULL,
--     yearly_price INTEGER NOT NULL,
--     features JSONB,
--     limits JSONB,
--     is_popular BOOLEAN DEFAULT FALSE,
--     is_active BOOLEAN DEFAULT TRUE,
--     display_order INTEGER DEFAULT 0,
--     created_at TIMESTAMP DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS payment_transaction (
--     transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     client_id UUID NOT NULL REFERENCES client_entry(client_id),
--     plan_id UUID NOT NULL REFERENCES subscription_plan(plan_id),
--     razorpay_order_id VARCHAR(100),
--     razorpay_payment_id VARCHAR(100),
--     razorpay_signature VARCHAR(255),
--     amount INTEGER NOT NULL,
--     currency VARCHAR(3) DEFAULT 'INR',
--     billing_cycle VARCHAR(10) NOT NULL,
--     status VARCHAR(20) DEFAULT 'created',
--     notes VARCHAR(255),
--     created_at TIMESTAMP DEFAULT NOW(),
--     paid_at TIMESTAMP
-- );

-- CREATE INDEX IF NOT EXISTS idx_pt_client ON payment_transaction(client_id);
-- CREATE INDEX IF NOT EXISTS idx_pt_order ON payment_transaction(razorpay_order_id);

-- ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS plan_id UUID;
-- ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP;

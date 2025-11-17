-- Migration: Add customer_code column to customer table
-- Purpose: Auto-generate customer codes starting from 100 for better customer management
-- Date: 2025-11-16

-- Step 1: Add customer_code column (nullable initially to handle existing records)
ALTER TABLE customer ADD COLUMN IF NOT EXISTS customer_code INTEGER;

-- Step 2: Create a sequence starting from 100
CREATE SEQUENCE IF NOT EXISTS customer_code_seq START WITH 100 INCREMENT BY 1;

-- Step 3: Update existing customers with auto-generated codes
UPDATE customer
SET customer_code = nextval('customer_code_seq')
WHERE customer_code IS NULL;

-- Step 4: Set customer_code sequence to max value + 1 to avoid conflicts
SELECT setval('customer_code_seq', COALESCE((SELECT MAX(customer_code) FROM customer), 99) + 1, false);

-- Step 5: Add unique constraint
ALTER TABLE customer ADD CONSTRAINT customer_code_unique UNIQUE (customer_code);

-- Step 6: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_code ON customer(customer_code);

-- Verification query
-- SELECT customer_code, customer_name, customer_phone FROM customer ORDER BY customer_code LIMIT 10;

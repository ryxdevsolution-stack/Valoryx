-- Migration: Add synced_at column to customer table
-- Purpose: Track sync status from SQLite to Supabase for customers
-- Date: 2026-01-18
-- Run this in Supabase SQL Editor

-- Add synced_at column to customer table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customer'
        AND column_name = 'synced_at'
    ) THEN
        ALTER TABLE customer ADD COLUMN synced_at TIMESTAMPTZ;
        RAISE NOTICE 'Added synced_at column to customer table';
    ELSE
        RAISE NOTICE 'synced_at column already exists in customer table';
    END IF;
END $$;

-- Create index for faster queries on synced_at
CREATE INDEX IF NOT EXISTS idx_customer_synced_at ON customer(synced_at);

-- Comment
COMMENT ON COLUMN customer.synced_at IS 'Timestamp when this record was last synced from local SQLite to Supabase';

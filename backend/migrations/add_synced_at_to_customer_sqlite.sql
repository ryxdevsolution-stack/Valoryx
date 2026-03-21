-- SQLite Migration: Add synced_at column to customer table
-- Purpose: Track sync status from SQLite to Supabase for customers
-- Date: 2026-01-18
-- Run this with: sqlite3 ~/.valoryx/local.db < add_synced_at_to_customer_sqlite.sql

-- Add synced_at column to customer table (if it doesn't exist)
-- SQLite doesn't have IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we'll handle errors gracefully
ALTER TABLE customer ADD COLUMN synced_at DATETIME;

-- No index creation needed for SQLite for this column (optional)

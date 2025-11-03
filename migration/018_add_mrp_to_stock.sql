-- Migration: Add MRP field to stock_entry
-- Description: Adds MRP (Maximum Retail Price) field for display on bill prints
-- Date: 2025-11-04

-- Add MRP column to stock_entry table
ALTER TABLE stock_entry
ADD COLUMN IF NOT EXISTS mrp NUMERIC(10, 2);

-- Add comment for documentation
COMMENT ON COLUMN stock_entry.mrp IS 'Maximum Retail Price - shown on printed bills, not used in billing calculations';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 018 completed successfully: MRP field added to stock_entry';
    RAISE NOTICE 'MRP field:';
    RAISE NOTICE '  - Type: NUMERIC(10, 2)';
    RAISE NOTICE '  - Nullable: Yes (optional)';
    RAISE NOTICE '  - Purpose: Display on printed bills';
    RAISE NOTICE '  - Note: MRP is for display only, billing uses rate field';
END $$;

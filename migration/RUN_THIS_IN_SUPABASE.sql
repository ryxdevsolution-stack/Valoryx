-- ============================================================================
-- UNIFIED BILLING ENHANCEMENT - Run in Supabase SQL Editor
-- ============================================================================
-- This adds barcode, item_code, GST%, and HSN code support
-- Run this entire file in one go
-- ============================================================================

-- PART 1: Enhance stock_entry table
ALTER TABLE public.stock_entry
ADD COLUMN IF NOT EXISTS item_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
ADD COLUMN IF NOT EXISTS gst_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20);

-- Add constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stock_entry_gst_check'
        AND conrelid = 'public.stock_entry'::regclass
    ) THEN
        ALTER TABLE public.stock_entry
        ADD CONSTRAINT stock_entry_gst_check
        CHECK (gst_percentage >= 0 AND gst_percentage <= 100);
    END IF;
END $$;

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_barcode
ON public.stock_entry(barcode)
WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_item_code_client
ON public.stock_entry(client_id, item_code)
WHERE item_code IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.stock_entry.item_code IS 'Unique product SKU/Item code per client';
COMMENT ON COLUMN public.stock_entry.barcode IS 'Product barcode for scanner input';
COMMENT ON COLUMN public.stock_entry.gst_percentage IS 'GST rate (0, 5, 12, 18, 28)';
COMMENT ON COLUMN public.stock_entry.hsn_code IS 'HSN/SAC code for GST';

-- Update existing rows
UPDATE public.stock_entry
SET gst_percentage = 0
WHERE gst_percentage IS NULL;

-- PART 2: Enhance gst_billing table (not gst_billing_items)
-- Note: gst_billing stores items as JSONB, so we don't need separate items table

-- PART 3: Enhance non_gst_billing table
-- Note: non_gst_billing stores items as JSONB, so we don't need separate items table

-- Success message
SELECT
    'SUCCESS: Migration completed!' as status,
    'Added columns: item_code, barcode, gst_percentage, hsn_code to stock_entry' as changes;

-- Verification
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'stock_entry'
AND column_name IN ('item_code', 'barcode', 'gst_percentage', 'hsn_code')
ORDER BY column_name;

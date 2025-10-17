-- ============================================================================
-- FIX STOCK REDUCTION TRIGGER TO SKIP NEW PRODUCTS
-- ============================================================================
-- This updates the stock reduction trigger to skip temp product IDs
-- New products will be handled by Python backend code
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Drop the existing trigger function
DROP FUNCTION IF EXISTS reduce_stock_on_billing() CASCADE;

-- Recreate the function with new product handling
CREATE OR REPLACE FUNCTION reduce_stock_on_billing()
RETURNS TRIGGER AS $$
DECLARE
    item JSONB;
BEGIN
    -- Loop through each item in the items JSONB array
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
        -- Skip if product_id starts with 'temp-' (new products handled in Python)
        IF (item->>'product_id') NOT LIKE 'temp-%' THEN
            -- Reduce stock for existing products only
            UPDATE stock_entry
            SET quantity = quantity - (item->>'quantity')::INTEGER,
                updated_at = NOW()
            WHERE product_id = (item->>'product_id')::UUID
              AND client_id = NEW.client_id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger for GST billing
DROP TRIGGER IF EXISTS trigger_reduce_stock_gst ON gst_billing;
CREATE TRIGGER trigger_reduce_stock_gst
    AFTER INSERT ON gst_billing
    FOR EACH ROW
    EXECUTE FUNCTION reduce_stock_on_billing();

-- Recreate trigger for Non-GST billing
DROP TRIGGER IF EXISTS trigger_reduce_stock_non_gst ON non_gst_billing;
CREATE TRIGGER trigger_reduce_stock_non_gst
    AFTER INSERT ON non_gst_billing
    FOR EACH ROW
    EXECUTE FUNCTION reduce_stock_on_billing();

-- Success message
SELECT 'SUCCESS: Stock reduction trigger updated to handle new products!' as status;

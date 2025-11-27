-- ============================================================
-- ADD NO EXCHANGE PERMISSION
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add permission to show "No Exchange Available" on printed bills
-- This goes under the "Manage Bills" section

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'show_no_exchange', 'Show "No Exchange Available" on printed bills', section_id, 10
FROM permission_sections WHERE section_name = 'Manage Bills'
ON CONFLICT (permission_name) DO NOTHING;

-- Verify the new permission
SELECT
    ps.section_name,
    p.permission_name,
    p.description,
    p.display_order
FROM permissions p
JOIN permission_sections ps ON p.section_id = ps.section_id
WHERE p.permission_name = 'show_no_exchange';

-- ============================================================
-- ADD BULK ORDER AND NOTES PERMISSIONS
-- Run this in Supabase SQL Editor
-- ============================================================

-- Section: Add new permission sections for Bulk Orders and Notes
INSERT INTO permission_sections (section_name, description, display_order, icon) VALUES
('Bulk Orders', 'Permissions for managing bulk stock orders', 11, 'ShoppingCart'),
('Notes', 'Permissions for managing user notes', 12, 'StickyNote')
ON CONFLICT (section_name) DO UPDATE SET description = EXCLUDED.description, icon = EXCLUDED.icon;

-- Bulk Order Permissions
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_bulk_orders', 'View bulk stock orders', section_id, 1
FROM permission_sections WHERE section_name = 'Bulk Orders'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'create_bulk_order', 'Create new bulk stock orders', section_id, 2
FROM permission_sections WHERE section_name = 'Bulk Orders'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_bulk_order', 'Edit bulk stock orders', section_id, 3
FROM permission_sections WHERE section_name = 'Bulk Orders'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'delete_bulk_order', 'Delete bulk stock orders', section_id, 4
FROM permission_sections WHERE section_name = 'Bulk Orders'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'approve_bulk_order', 'Approve bulk stock orders', section_id, 5
FROM permission_sections WHERE section_name = 'Bulk Orders'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'receive_bulk_order', 'Mark bulk orders as received', section_id, 6
FROM permission_sections WHERE section_name = 'Bulk Orders'
ON CONFLICT (permission_name) DO NOTHING;

-- Notes Permissions
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_notes', 'View notes', section_id, 1
FROM permission_sections WHERE section_name = 'Notes'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_all_notes', 'View all users notes (admin)', section_id, 2
FROM permission_sections WHERE section_name = 'Notes'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'create_notes', 'Create new notes', section_id, 3
FROM permission_sections WHERE section_name = 'Notes'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_notes', 'Edit existing notes', section_id, 4
FROM permission_sections WHERE section_name = 'Notes'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'delete_notes', 'Delete notes', section_id, 5
FROM permission_sections WHERE section_name = 'Notes'
ON CONFLICT (permission_name) DO NOTHING;

-- Verify the new permissions
SELECT
    ps.section_name,
    p.permission_name,
    p.description,
    p.display_order
FROM permissions p
JOIN permission_sections ps ON p.section_id = ps.section_id
WHERE ps.section_name IN ('Bulk Orders', 'Notes')
ORDER BY ps.section_name, p.display_order;

-- Show total count
SELECT 'Total permissions after adding Bulk Orders and Notes:' as info, COUNT(*) as total FROM permissions;

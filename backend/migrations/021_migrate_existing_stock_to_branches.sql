-- Migration 021: Auto-create "Main Branch" for existing clients and migrate stock to branch_inventory
-- SQLite-compatible (TEXT for UUIDs, hex() + randomblob() for UUID generation)
-- Idempotent: Only processes clients that have stock_entry rows but NO branches yet.
--             Safe to run multiple times — clients that already have branches are skipped.
--
-- Purpose:
--   Existing clients have stock quantities in stock_entry.quantity but no branches
--   or branch_inventory rows. This migration creates a default "Main Branch" for each
--   such client and populates branch_inventory with matching quantities so the new
--   multi-branch feature works seamlessly with legacy data.
--
-- Prerequisites:
--   Migration 020 must have run first (creates branches and branch_inventory tables).

-- ============================================================
-- Step 1: Create a "Main Branch" for every client that has stock
--         entries but does NOT yet have any branch.
-- ============================================================
INSERT INTO branches (branch_id, client_id, name, location, is_active, created_at, updated_at)
SELECT
    -- Generate a UUID-like TEXT id using SQLite's randomblob
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6)))                       AS branch_id,
    ce.client_id                                    AS client_id,
    'Main Branch'                                   AS name,
    NULL                                            AS location,
    1                                               AS is_active,
    CURRENT_TIMESTAMP                               AS created_at,
    CURRENT_TIMESTAMP                               AS updated_at
FROM client_entry ce
WHERE
    -- Client has at least one stock entry
    EXISTS (
        SELECT 1 FROM stock_entry se WHERE se.client_id = ce.client_id
    )
    -- Client does NOT already have a branch (idempotent guard)
    AND NOT EXISTS (
        SELECT 1 FROM branches b WHERE b.client_id = ce.client_id
    );


-- ============================================================
-- Step 2: For each stock entry belonging to a newly-created
--         Main Branch client, insert a branch_inventory row
--         that mirrors the stock_entry quantity.
-- ============================================================
INSERT INTO branch_inventory (id, branch_id, product_id, client_id, quantity, low_stock_alert, created_at, updated_at)
SELECT
    -- Generate a UUID-like TEXT id
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6)))                       AS id,
    b.branch_id                                     AS branch_id,
    se.product_id                                   AS product_id,
    se.client_id                                    AS client_id,
    se.quantity                                     AS quantity,
    se.low_stock_alert                              AS low_stock_alert,
    CURRENT_TIMESTAMP                               AS created_at,
    CURRENT_TIMESTAMP                               AS updated_at
FROM stock_entry se
INNER JOIN branches b
    ON b.client_id = se.client_id
    AND b.name = 'Main Branch'
WHERE
    -- Only insert if a branch_inventory row does not already exist for this branch+product (idempotent guard)
    NOT EXISTS (
        SELECT 1
        FROM branch_inventory bi
        WHERE bi.branch_id = b.branch_id
          AND bi.product_id = se.product_id
    );

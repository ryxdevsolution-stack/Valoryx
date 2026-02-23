-- Migration 020: Create branch management and stock transfer tables
-- SQLite-compatible (TEXT for UUIDs, no gen_random_uuid)
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS

-- ============================================================
-- 1. branches — physical branch/location for a client
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
    branch_id       TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    name            VARCHAR(255) NOT NULL,
    location        VARCHAR(500),
    is_active       BOOLEAN DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES client_entry(client_id)
);

CREATE INDEX IF NOT EXISTS idx_branches_client ON branches(client_id);


-- ============================================================
-- 2. branch_inventory — per-branch stock quantities
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_inventory (
    id              TEXT PRIMARY KEY,
    branch_id       TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    client_id       TEXT NOT NULL,
    quantity        INTEGER DEFAULT 0,
    low_stock_alert INTEGER DEFAULT 10,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (branch_id, product_id),
    FOREIGN KEY (branch_id)  REFERENCES branches(branch_id),
    FOREIGN KEY (product_id) REFERENCES stock_entry(product_id),
    FOREIGN KEY (client_id)  REFERENCES client_entry(client_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inv_client_branch ON branch_inventory(client_id, branch_id);


-- ============================================================
-- 3. stock_transfers — transfer requests between branches
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_transfers (
    transfer_id     TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    from_branch_id  TEXT NOT NULL,
    to_branch_id    TEXT NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending',
    notes           TEXT,
    requested_by    TEXT NOT NULL,
    approved_by     TEXT,
    approved_at     TIMESTAMP,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id)      REFERENCES client_entry(client_id),
    FOREIGN KEY (from_branch_id) REFERENCES branches(branch_id),
    FOREIGN KEY (to_branch_id)   REFERENCES branches(branch_id),
    FOREIGN KEY (requested_by)   REFERENCES users(user_id),
    FOREIGN KEY (approved_by)    REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_client_status ON stock_transfers(client_id, status);


-- ============================================================
-- 4. stock_transfer_items — line items within a transfer
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id              TEXT PRIMARY KEY,
    transfer_id     TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(transfer_id),
    FOREIGN KEY (product_id)  REFERENCES stock_entry(product_id)
);

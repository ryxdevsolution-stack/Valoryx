-- v43 + v44: supplier-delivery column heal, and payroll invoicing.
-- Run in the Supabase SQL editor. Safe to re-run: every statement is
-- IF NOT EXISTS / idempotent.
--
-- NOTE: the app also applies all of this automatically on startup
-- (_ensure_remote_sync_columns in services/sync_service.py), so this file is
-- for preparing the cloud ahead of a deploy and as the documented schema of
-- record — the same arrangement as ADD_PARTIAL_PAYMENT_V42.sql.

-- ── v43: columns that only ever existed inside migration v8's CREATE TABLE ──
-- Any database whose supplier_deliveries predates them is permanently short a
-- column, and every delivery query dies on it.
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS branch_id              VARCHAR(36) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS invoice_number         VARCHAR(100) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS delivery_date          DATE NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS transport_fee          NUMERIC DEFAULT 0;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS notes                  TEXT NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS products_confirmed     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS confirmed_by           VARCHAR(36) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS confirmed_at           TIMESTAMP NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS delivery_note_filename VARCHAR(255) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS delivery_note_path     VARCHAR(500) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS delivery_note_type     VARCHAR(10) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS completed_by           VARCHAR(36) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMP NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS added_by_label         VARCHAR(120) NULL;
ALTER TABLE supplier_deliveries ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMP NULL;

-- ── v44: business identity / GST invoice footer fields ──────────────────────
-- state_code is what decides CGST+SGST vs IGST; without it the invoice always
-- falls back to intra-state.
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS state_code             VARCHAR(10) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS website                VARCHAR(255) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS bank_name              VARCHAR(120) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS bank_account_no        VARCHAR(40) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS bank_ifsc              VARCHAR(20) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS bank_account_holder    VARCHAR(120) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS signature_url          VARCHAR(500) NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS invoice_terms          TEXT NULL;
ALTER TABLE client_entry ADD COLUMN IF NOT EXISTS service_charge_percent NUMERIC(5,2) NULL;

-- Employees carry their work-group assignment. (email is v40 — it was added to
-- the table but never to the sync column list, so it had never reached cloud.)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_group_id VARCHAR(36) NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email         VARCHAR(255) NULL;

-- ── v44: work groups — one invoice line each ────────────────────────────────
CREATE TABLE IF NOT EXISTS work_groups (
    group_id               VARCHAR(36) PRIMARY KEY,
    client_id              VARCHAR(36)  NOT NULL,
    name                   VARCHAR(150) NOT NULL,
    description            VARCHAR(255) NULL,
    hsn_code               VARCHAR(20)  NULL,
    service_charge_percent NUMERIC(5,2) NULL,
    display_order          INTEGER      DEFAULT 0,
    is_active              BOOLEAN      DEFAULT TRUE,
    created_by             VARCHAR(36)  NULL,
    created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    synced_at              TIMESTAMP    NULL
);
CREATE INDEX IF NOT EXISTS idx_workgroup_client ON work_groups (client_id, is_active);

-- ── v44: invoice header ─────────────────────────────────────────────────────
-- Totals are frozen at save time, never recomputed at render: a sent invoice is
-- a legal document and must keep showing the numbers it was sent with.
-- balance is COMPUTED (grand_total − received_amount), never stored.
CREATE TABLE IF NOT EXISTS payroll_invoices (
    invoice_id       VARCHAR(36) PRIMARY KEY,
    client_id        VARCHAR(36)  NOT NULL,
    invoice_number   VARCHAR(50)  NOT NULL,
    invoice_date     DATE         NOT NULL,
    period_start     DATE         NOT NULL,
    period_end       DATE         NOT NULL,
    customer_id      VARCHAR(36)  NULL,
    customer_name    VARCHAR(200) NOT NULL,
    customer_address TEXT         NULL,
    customer_gstin   VARCHAR(20)  NULL,
    customer_state   VARCHAR(100) NULL,
    customer_phone   VARCHAR(30)  NULL,
    ship_to          TEXT         NULL,
    place_of_supply  VARCHAR(100) NULL,
    tax_mode         VARCHAR(10)  NULL,
    gst_rate         NUMERIC(5,2) NULL,
    salary_total     NUMERIC(12,2) DEFAULT 0,
    service_total    NUMERIC(12,2) DEFAULT 0,
    taxable_total    NUMERIC(12,2) DEFAULT 0,
    cgst_total       NUMERIC(12,2) DEFAULT 0,
    sgst_total       NUMERIC(12,2) DEFAULT 0,
    igst_total       NUMERIC(12,2) DEFAULT 0,
    tax_total        NUMERIC(12,2) DEFAULT 0,
    grand_total      NUMERIC(12,2) DEFAULT 0,
    received_amount  NUMERIC(12,2) DEFAULT 0,
    status           VARCHAR(20)  DEFAULT 'draft',
    notes            TEXT         NULL,
    terms            TEXT         NULL,
    created_by       VARCHAR(36)  NULL,
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    synced_at        TIMESTAMP    NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payinv_client_number ON payroll_invoices (client_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_payinv_client_period ON payroll_invoices (client_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payinv_client_status ON payroll_invoices (client_id, status);

-- ── v44: invoice lines (one per work group) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_invoice_lines (
    line_id                VARCHAR(36) PRIMARY KEY,
    client_id              VARCHAR(36)  NOT NULL,
    invoice_id             VARCHAR(36)  NOT NULL,
    group_id               VARCHAR(36)  NULL,
    description            VARCHAR(255) NOT NULL,
    hsn_code               VARCHAR(20)  NULL,
    headcount              INTEGER      DEFAULT 0,
    salary_amount          NUMERIC(12,2) DEFAULT 0,
    service_charge_percent NUMERIC(5,2)  DEFAULT 0,
    service_charge_amount  NUMERIC(12,2) DEFAULT 0,
    taxable_amount         NUMERIC(12,2) DEFAULT 0,
    gst_rate               NUMERIC(5,2)  DEFAULT 0,
    cgst_amount            NUMERIC(12,2) DEFAULT 0,
    sgst_amount            NUMERIC(12,2) DEFAULT 0,
    igst_amount            NUMERIC(12,2) DEFAULT 0,
    line_total             NUMERIC(12,2) DEFAULT 0,
    sort_order             INTEGER      DEFAULT 0,
    created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    synced_at              TIMESTAMP    NULL
);
CREATE INDEX IF NOT EXISTS idx_payinvline_invoice ON payroll_invoice_lines (client_id, invoice_id);

-- ── v44: which employees made up each line ──────────────────────────────────
-- Kept so an invoice re-opened months later still shows whose salary made up a
-- line, after those employees leave or change group.
CREATE TABLE IF NOT EXISTS payroll_invoice_employees (
    id            VARCHAR(36) PRIMARY KEY,
    client_id     VARCHAR(36)  NOT NULL,
    invoice_id    VARCHAR(36)  NOT NULL,
    line_id       VARCHAR(36)  NULL,
    employee_id   VARCHAR(36)  NOT NULL,
    employee_name VARCHAR(150) NULL,
    cycle_id      VARCHAR(36)  NULL,
    gross_salary  NUMERIC(12,2) DEFAULT 0,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    synced_at     TIMESTAMP    NULL
);
CREATE INDEX IF NOT EXISTS idx_payinvemp_invoice ON payroll_invoice_employees (client_id, invoice_id);

-- ── v44: payments received against an invoice ───────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_invoice_payments (
    payment_id     VARCHAR(36) PRIMARY KEY,
    client_id      VARCHAR(36)  NOT NULL,
    invoice_id     VARCHAR(36)  NOT NULL,
    amount         NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50)  NULL,
    reference_no   VARCHAR(100) NULL,
    payment_date   TIMESTAMP    NULL,
    notes          TEXT         NULL,
    recorded_by    VARCHAR(36)  NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    synced_at      TIMESTAMP    NULL
);
CREATE INDEX IF NOT EXISTS idx_payinvpay_invoice ON payroll_invoice_payments (client_id, invoice_id);

-- v42: Partial payment on customer bills (run in Supabase SQL editor).
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- NOTE: the desktop app also applies all of this automatically at sync time
-- (_ensure_remote_columns in sync_service.py) — this file exists so the cloud
-- can be prepared ahead of a deploy, and as the documented schema of record.

-- payment_status never existed on the CLOUD billing tables (pending state
-- silently never synced before v42); paid_amount is new.
ALTER TABLE gst_billing     ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NULL;
ALTER TABLE gst_billing     ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(10,2) NULL;
ALTER TABLE non_gst_billing ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NULL;
ALTER TABLE non_gst_billing ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(10,2) NULL;

-- Backfill mirrors the local v42 rule: pending owes everything, else fully paid.
UPDATE gst_billing     SET paid_amount = CASE WHEN payment_status = 'pending' THEN 0 ELSE final_amount END WHERE paid_amount IS NULL;
UPDATE non_gst_billing SET paid_amount = CASE WHEN payment_status = 'pending' THEN 0 ELSE total_amount END WHERE paid_amount IS NULL;

-- One row per payment received toward a bill ("₹3000 cash Monday, ₹2000 UPI
-- Friday"). bill_kind says which billing table bill_id lives in.
CREATE TABLE IF NOT EXISTS bill_payments (
    payment_id     VARCHAR(36) PRIMARY KEY,
    client_id      VARCHAR(36) NOT NULL,
    bill_id        VARCHAR(36) NOT NULL,
    bill_kind      VARCHAR(10) NOT NULL,
    amount         NUMERIC(10,2) NOT NULL,
    payment_method VARCHAR(50)  NULL,
    payment_date   TIMESTAMP    NULL,
    notes          TEXT         NULL,
    recorded_by    VARCHAR(36)  NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    synced_at      TIMESTAMP    NULL
);

CREATE INDEX IF NOT EXISTS idx_billpay_client_bill ON bill_payments (client_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_billpay_client_date ON bill_payments (client_id, payment_date);

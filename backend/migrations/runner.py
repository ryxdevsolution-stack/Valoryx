"""
Versioned migration runner.
Schema version is stored in _schema_version table.
Migrations only run when CURRENT_SCHEMA_VERSION > stored version.
On first install: runs all migrations (version 0 → N).
On daily open: reads version, matches, exits in <1ms.
"""
import logging
import re
from sqlalchemy import text, inspect as sa_inspect

# Bump this number ONLY when you add new migrations to the list below.
CURRENT_SCHEMA_VERSION = 31

def _get_stored_version(db) -> int:
    """Return the stored schema version, or 0 if table doesn't exist yet."""
    try:
        row = db.session.execute(
            text("SELECT version FROM _schema_version ORDER BY applied_at DESC LIMIT 1")
        ).fetchone()
        return int(row[0]) if row else 0
    except Exception as e:
        # Expected on first install (table doesn't exist). Log at debug level.
        logging.debug(f"[Migration] Could not read schema version (first install?): {e}")
        return 0

def _ensure_version_table(db):
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS _schema_version (
            version    INTEGER NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.session.commit()

def _set_stored_version(db, version: int):
    db.session.execute(
        text("INSERT INTO _schema_version (version) VALUES (:v)"),
        {"v": version}
    )
    db.session.commit()

# ── Dialect helpers ───────────────────────────────────────────────────────────

def _normalize_col_def(definition: str, dialect: str) -> str:
    """
    Translate SQLite column definition syntax to the current dialect.
    Called by every _add_col() so migrations stay dialect-agnostic.
    """
    if dialect == 'postgresql':
        import re
        d = definition
        # DATETIME → TIMESTAMP  (PostgreSQL has no DATETIME type)
        d = re.sub(r'\bDATETIME\b', 'TIMESTAMP', d, flags=re.IGNORECASE)
        # BOOLEAN DEFAULT 0 → BOOLEAN DEFAULT FALSE
        d = re.sub(r'(BOOLEAN\b.*?DEFAULT\s+)0\b', r'\1FALSE', d, flags=re.IGNORECASE)
        # BOOLEAN DEFAULT 1 → BOOLEAN DEFAULT TRUE
        d = re.sub(r'(BOOLEAN\b.*?DEFAULT\s+)1\b', r'\1TRUE', d, flags=re.IGNORECASE)
        return d
    return definition  # SQLite: pass through unchanged


# ── Migration functions (add new ones at the bottom, never reorder) ──────────

def _m001_core_columns(db):
    """
    All ALTER TABLE additions previously inline in app.py,
    plus add_subscription_razorpay_columns.py logic.
    """
    # Use a single inspector instance for all introspection
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        """Add column only if it doesn't exist yet."""
        # Guard against identifier injection — only allow safe SQLite identifiers
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return  # table doesn't exist yet — skip
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    # ── users ─────────────────────────────────────────────────────────────────
    _add_col('users', 'telegram_chat_id', 'VARCHAR(50) NULL')
    _add_col('users', 'branch_id',        'VARCHAR(36) NULL')
    _add_col('users', 'last_login_ip',    'VARCHAR(45) NULL')

    # ── client_entry — email verification ─────────────────────────────────────
    _add_col('client_entry', 'email_verified',             'BOOLEAN NOT NULL DEFAULT 0')
    _add_col('client_entry', 'email_verification_token',   'VARCHAR(64) NULL')
    _add_col('client_entry', 'email_verification_expires', 'DATETIME NULL')

    # ── client_entry — account deletion / GDPR ────────────────────────────────
    _add_col('client_entry', 'deletion_requested_at',       'DATETIME NULL')
    _add_col('client_entry', 'deletion_scheduled_at',       'DATETIME NULL')
    _add_col('client_entry', 'deletion_requested_by',       'VARCHAR(36) NULL')
    _add_col('client_entry', 'deletion_reactivation_token', 'VARCHAR(64) NULL')

    # ── client_entry — Razorpay / subscriptions ───────────────────────────────
    _add_col('client_entry', 'razorpay_subscription_id', 'VARCHAR(100) NULL')
    _add_col('client_entry', 'telegram_chat_id',         'VARCHAR(50) NULL')

    # ── subscription_plan — Razorpay plan IDs (from add_subscription_razorpay_columns.py) ──
    _add_col('subscription_plan', 'razorpay_monthly_plan_id', 'VARCHAR(100) NULL')
    _add_col('subscription_plan', 'razorpay_yearly_plan_id',  'VARCHAR(100) NULL')

    # ── billing — customer fields ──────────────────────────────────────────────
    for tbl in ('gst_billing', 'non_gst_billing'):
        _add_col(tbl, 'customer_id',      'VARCHAR(36) NULL')
        _add_col(tbl, 'customer_email',   'VARCHAR(255) NULL')
        _add_col(tbl, 'customer_address', 'TEXT NULL')

    # ── indexes (safe: CREATE INDEX IF NOT EXISTS) ─────────────────────────────
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_client_entry_verify_token "
        "ON client_entry (email_verification_token)"
    ))
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_client_entry_reactivation_token "
        "ON client_entry (deletion_reactivation_token)"
    ))

    # ── webhook tables ─────────────────────────────────────────────────────────
    tables = inspector.get_table_names()

    if 'webhook_endpoints' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS webhook_endpoints (
                endpoint_id VARCHAR(36) PRIMARY KEY,
                client_id   VARCHAR(36) NOT NULL
                            REFERENCES client_entry(client_id) ON DELETE CASCADE,
                url         VARCHAR(2048) NOT NULL,
                secret      VARCHAR(64) NOT NULL,
                description VARCHAR(255) NULL,
                events      TEXT NOT NULL DEFAULT '*',
                is_active   BOOLEAN NOT NULL DEFAULT 1,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_ep_client "
            "ON webhook_endpoints (client_id)"
        ))
        logging.info("[Migration] webhook_endpoints table created")

    if 'webhook_deliveries' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS webhook_deliveries (
                delivery_id     VARCHAR(36) PRIMARY KEY,
                endpoint_id     VARCHAR(36) NOT NULL
                                REFERENCES webhook_endpoints(endpoint_id) ON DELETE CASCADE,
                client_id       VARCHAR(36) NOT NULL,
                event_type      VARCHAR(100) NOT NULL,
                payload         TEXT NOT NULL,
                attempt         INTEGER NOT NULL DEFAULT 1,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                response_status INTEGER NULL,
                response_body   TEXT NULL,
                error           TEXT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                delivered_at    TIMESTAMP NULL,
                next_retry_at   TIMESTAMP NULL
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_del_endpoint "
            "ON webhook_deliveries (endpoint_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_del_client "
            "ON webhook_deliveries (client_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_del_retry "
            "ON webhook_deliveries (next_retry_at) WHERE next_retry_at IS NOT NULL"
        ))
        logging.info("[Migration] webhook_deliveries table created")

    # ── sync metadata tables ───────────────────────────────────────────────────
    if 'sync_metadata' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key        VARCHAR(100) PRIMARY KEY,
                value      TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logging.info("[Migration] sync_metadata table created")

    if 'sync_log' not in tables:
        dialect = db.engine.dialect.name
        pk_col = 'id SERIAL PRIMARY KEY' if dialect == 'postgresql' else 'id INTEGER PRIMARY KEY AUTOINCREMENT'
        db.session.execute(text(f"""
            CREATE TABLE IF NOT EXISTS sync_log (
                {pk_col},
                table_name  VARCHAR(100),
                rows_synced INTEGER DEFAULT 0,
                synced_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logging.info("[Migration] sync_log table created")

    db.session.commit()

def _m002_barcode_per_client_unique(db):
    """
    Change barcode uniqueness from global to per-client.
    Old: UNIQUE constraint on barcode column alone (idx_stock_barcode)
    New: UNIQUE constraint on (client_id, barcode)
    This allows different clients to reuse the same barcode value.
    """
    inspector = sa_inspect(db.engine)
    tables = inspector.get_table_names()

    if 'stock_entry' not in tables:
        return  # nothing to do

    dialect = db.engine.dialect.name

    if dialect == 'postgresql':
        # Drop the old global unique index/constraint on barcode
        db.session.execute(text(
            "ALTER TABLE stock_entry DROP CONSTRAINT IF EXISTS idx_stock_barcode"
        ))
        db.session.execute(text(
            "DROP INDEX IF EXISTS idx_stock_barcode"
        ))
        # Create new per-client unique constraint
        db.session.execute(text(
            "ALTER TABLE stock_entry DROP CONSTRAINT IF EXISTS uq_stock_client_barcode"
        ))
        db.session.execute(text(
            "ALTER TABLE stock_entry ADD CONSTRAINT uq_stock_client_barcode "
            "UNIQUE (client_id, barcode)"
        ))
    else:
        # SQLite doesn't support DROP CONSTRAINT — recreate is complex; just log
        # The model-level UniqueConstraint will apply on fresh SQLite DBs
        logging.info("[Migration] SQLite: barcode constraint update skipped (handled by model on new DBs)")

    db.session.commit()
    logging.info("[Migration] v2: barcode uniqueness changed to per-client")


def _m003_shop_receipt_settings(db):
    """
    Add shop receipt / UPI settings columns to client_entry:
    - address2: secondary address line
    - upi_id: UPI virtual payment address for QR code
    - receipt_footer: custom footer text printed on receipts
    """
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    _add_col('client_entry', 'address2',        'TEXT NULL')
    _add_col('client_entry', 'upi_id',          'VARCHAR(100) NULL')
    _add_col('client_entry', 'receipt_footer',   'TEXT NULL')

    db.session.commit()
    logging.info("[Migration] v3: shop receipt settings columns added")


def _m004_users_and_client_missing_cols(db):
    """
    Add columns that exist in the model but were missing from older SQLite DBs:
    - users: reset_token, reset_token_expires, invite_token, invite_token_expires,
             invite_accepted, must_change_password, totp_secret, totp_enabled,
             totp_backup_codes, google_id, avatar_url
    - client_entry: points_per_100
    """
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    _add_col('users', 'reset_token',          'VARCHAR(100) NULL')
    _add_col('users', 'reset_token_expires',   'DATETIME NULL')
    _add_col('users', 'invite_token',          'VARCHAR(100) NULL')
    _add_col('users', 'invite_token_expires',  'DATETIME NULL')
    _add_col('users', 'invite_accepted',       'BOOLEAN NOT NULL DEFAULT 0')
    _add_col('users', 'must_change_password',  'BOOLEAN NOT NULL DEFAULT 0')
    _add_col('users', 'totp_secret',           'VARCHAR(64) NULL')
    _add_col('users', 'totp_enabled',          'BOOLEAN NOT NULL DEFAULT 0')
    _add_col('users', 'totp_backup_codes',     'TEXT NULL')
    _add_col('users', 'google_id',             'VARCHAR(128) NULL')
    _add_col('users', 'avatar_url',            'VARCHAR(512) NULL')

    _add_col('client_entry', 'points_per_100', 'INTEGER NULL DEFAULT 0')

    db.session.commit()
    logging.info("[Migration] v4: missing users and client_entry columns added")


def _m005_stock_transfer_workflow_v2(db):
    """
    Upgrade stock_transfers for the two-step workflow:
      - transfer_type: 'send' (owner dispatches) | 'request' (branch requests)
      - dispatched_at: when stock was deducted from source
      - received_by / received_at: who confirmed receipt and when
    Also adds manager_id to branches for branch→manager assignment tracking.
    """
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return  # table doesn't exist yet — skip
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    tables = inspector.get_table_names()

    # stock_transfers — new workflow columns
    if 'stock_transfers' in tables:
        _add_col('stock_transfers', 'transfer_type',  "VARCHAR(10) NOT NULL DEFAULT 'send'")
        _add_col('stock_transfers', 'dispatched_at',  'TIMESTAMP NULL')
        _add_col('stock_transfers', 'received_by',    'VARCHAR(36) NULL')
        _add_col('stock_transfers', 'received_at',    'TIMESTAMP NULL')

        # Backfill: old 'completed' transfers were single-step sends — mark as received
        db.session.execute(text("""
            UPDATE stock_transfers
            SET dispatched_at = approved_at,
                received_at   = completed_at,
                received_by   = approved_by
            WHERE status = 'completed'
              AND dispatched_at IS NULL
        """))
        logging.info("[Migration] v5: stock_transfers backfilled for completed rows")

    # branches — optional manager pointer (nullable, for fast UI lookups)
    if 'branches' in tables:
        _add_col('branches', 'manager_id', 'VARCHAR(36) NULL')

    db.session.commit()
    logging.info("[Migration] v5: stock transfer workflow v2 columns added")


def _m006_customer_loyalty_points(db):
    """
    Add loyalty_points column to the customer table.
    Was added to SQLite schema locally but never migrated.
    Supabase fix: run separately — ALTER TABLE customer ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;
    """
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    _add_col('customer', 'loyalty_points', 'INTEGER NOT NULL DEFAULT 0')

    db.session.commit()
    logging.info("[Migration] v6: customer.loyalty_points column added")


def _m007_fix_permission_sections(db):
    """
    Fix permission_sections and remove dead permissions that are never enforced.
    Dead permissions: delete_product, manage_customers, manage_stock,
                      manage_payment_types, manage_settings, manage_users, manage_permissions
    """
    dead_perms = [
        'delete_product', 'manage_customers', 'manage_stock',
        'manage_payment_types', 'manage_settings', 'manage_users', 'manage_permissions',
    ]

    with db.engine.connect() as conn:
        import uuid as _uuid

        def _get_or_create_section(name, order):
            row = conn.execute(
                text("SELECT section_id FROM permission_sections WHERE section_name = :name"),
                {'name': name}
            ).fetchone()
            if row:
                return str(row[0])
            sid = str(_uuid.uuid4())
            conn.execute(
                text("INSERT INTO permission_sections (section_id, section_name, display_order) "
                     "VALUES (:id, :name, :order)"),
                {'id': sid, 'name': name, 'order': order}
            )
            return sid

        def _link_permission(perm_name, section_id):
            conn.execute(
                text("UPDATE permissions SET section_id = :sid WHERE permission_name = :pname"),
                {'sid': section_id, 'pname': perm_name}
            )

        # Remove dead permissions (cascades to user_permissions via FK)
        for perm in dead_perms:
            conn.execute(
                text("DELETE FROM permissions WHERE permission_name = :pname"),
                {'pname': perm}
            )

        # Remove orphaned sections (Settings, Admin) left after dead perm removal
        for section in ('Settings', 'Admin'):
            conn.execute(
                text("DELETE FROM permission_sections WHERE section_name = :name"),
                {'name': section}
            )

        # Correct section structure
        dashboard_sid = _get_or_create_section('Dashboard', 0)
        _link_permission('view_dashboard', dashboard_sid)

        billing_sid = _get_or_create_section('Billing', 1)
        for p in ['gst_billing', 'non_gst_billing', 'view_all_bills', 'view_own_bills', 'edit_bill_details', 'print_bills']:
            _link_permission(p, billing_sid)

        stock_sid = _get_or_create_section('Stock', 2)
        for p in ['view_stock', 'add_product', 'edit_product_details']:
            _link_permission(p, stock_sid)

        customers_sid = _get_or_create_section('Customers', 3)
        _link_permission('view_customers', customers_sid)

        reports_sid = _get_or_create_section('Reports', 4)
        _link_permission('view_sales_reports', reports_sid)
        _link_permission('export_reports', reports_sid)

        audit_sid = _get_or_create_section('Audit', 5)
        _link_permission('view_audit_logs', audit_sid)

        conn.commit()
    logging.info("[Migration] v7: dead permissions removed, sections corrected")


def _m008_supplier_tables(db):
    """
    Create supplier management tables:
      - suppliers        (vendor master)
      - supplier_deliveries  (delivery records)
      - supplier_delivery_items  (line items per delivery)
    """
    inspector = sa_inspect(db.engine)
    tables = inspector.get_table_names()

    if 'suppliers' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS suppliers (
                supplier_id    VARCHAR(36) PRIMARY KEY,
                client_id      VARCHAR(36) NOT NULL
                               REFERENCES client_entry(client_id) ON DELETE CASCADE,
                name           VARCHAR(255) NOT NULL,
                contact_person VARCHAR(255) NULL,
                phone          VARCHAR(20)  NULL,
                email          VARCHAR(255) NULL,
                address        TEXT         NULL,
                gst_number     VARCHAR(15)  NULL,
                transport_fee  NUMERIC      DEFAULT 0,
                payment_terms  VARCHAR(100) NULL,
                notes          TEXT         NULL,
                is_active      BOOLEAN      NOT NULL DEFAULT 1,
                created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_suppliers_client ON suppliers (client_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_suppliers_client_active ON suppliers (client_id, is_active)"))
        logging.info("[Migration] v8: suppliers table created")

    if 'supplier_deliveries' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS supplier_deliveries (
                delivery_id             VARCHAR(36) PRIMARY KEY,
                client_id               VARCHAR(36) NOT NULL
                                        REFERENCES client_entry(client_id) ON DELETE CASCADE,
                supplier_id             VARCHAR(36) NOT NULL
                                        REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
                branch_id               VARCHAR(36) NULL,
                invoice_number          VARCHAR(100) NULL,
                delivery_date           DATE         NULL,
                transport_fee           NUMERIC      DEFAULT 0,
                notes                   TEXT         NULL,
                status                  VARCHAR(20)  NOT NULL DEFAULT 'draft',
                products_confirmed      BOOLEAN      NOT NULL DEFAULT 0,
                confirmed_by            VARCHAR(36)  NULL,
                confirmed_at            TIMESTAMP    NULL,
                delivery_note_filename  VARCHAR(255) NULL,
                delivery_note_path      VARCHAR(500) NULL,
                delivery_note_type      VARCHAR(10)  NULL,
                completed_by            VARCHAR(36)  NULL,
                completed_at            TIMESTAMP    NULL,
                created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_sdel_client ON supplier_deliveries (client_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_sdel_supplier ON supplier_deliveries (supplier_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_sdel_client_status ON supplier_deliveries (client_id, status)"))
        logging.info("[Migration] v8: supplier_deliveries table created")

    if 'supplier_delivery_items' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS supplier_delivery_items (
                id              VARCHAR(36) PRIMARY KEY,
                delivery_id     VARCHAR(36) NOT NULL
                                REFERENCES supplier_deliveries(delivery_id) ON DELETE CASCADE,
                product_id      VARCHAR(36) NULL
                                REFERENCES stock_entry(product_id) ON DELETE SET NULL,
                product_name    VARCHAR(255) NOT NULL,
                category        VARCHAR(100) NULL,
                quantity        INTEGER      NOT NULL DEFAULT 1,
                cost_price      NUMERIC      NULL,
                selling_price   NUMERIC      NULL,
                mrp             NUMERIC      NULL,
                unit            VARCHAR(20)  DEFAULT 'pcs',
                barcode         VARCHAR(100) NULL,
                item_code       VARCHAR(50)  NULL,
                gst_percentage  NUMERIC      DEFAULT 0,
                hsn_code        VARCHAR(20)  NULL,
                created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_sdel_item_delivery ON supplier_delivery_items (delivery_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_sdel_item_product ON supplier_delivery_items (product_id)"))
        logging.info("[Migration] v8: supplier_delivery_items table created")

    db.session.commit()
    logging.info("[Migration] v8: supplier tables done")


def _m009_role_quotas(db):
    """
    Add role_quotas JSON column to client_entry.
    Stores per-client per-role user limits set by superadmin.
    e.g. {"admin": 1, "manager": 2, "staff": 3, "cashier": 3}
    null = unlimited for that role.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    try:
        cols = [c['name'] for c in inspector.get_columns('client_entry')]
    except Exception:
        return  # table doesn't exist yet

    if 'role_quotas' not in cols:
        col_type = 'JSONB' if dialect == 'postgresql' else 'TEXT'
        db.session.execute(text(
            f"ALTER TABLE client_entry ADD COLUMN role_quotas {col_type} NULL"
        ))
        logging.info("[Migration] v9: client_entry.role_quotas column added")

    db.session.commit()
    logging.info("[Migration] v9: role_quotas migration done")


def _m010_billing_payment_status(db):
    """
    Add payment_status column to gst_billing and non_gst_billing.
    Values: 'paid' (default) | 'pending'
    Existing rows are backfilled to 'paid'.
    """
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            db.session.execute(text(f"UPDATE {table} SET {col} = 'paid' WHERE {col} IS NULL"))
            logging.info(f"[Migration] {table}.{col} added and backfilled")

    for tbl in ('gst_billing', 'non_gst_billing'):
        _add_col(tbl, 'payment_status', "VARCHAR(20) NOT NULL DEFAULT 'paid'")

    db.session.commit()
    logging.info("[Migration] v10: billing payment_status column added")


def _m011_sync_bill_number_counters(db):
    """
    Sync bill_number_counters to the actual MAX(bill_number) in gst_billing
    Skip gracefully if the table doesn't exist yet (db.create_all() will create it).
    and non_gst_billing tables.

    Fixes: UniqueViolation on idx_gst_billing_number when the counter drifts
    behind real data (bills inserted before counter system was introduced).

    Two-step: UPDATE existing rows, then INSERT for any clients missing a row.
    Avoids EXCLUDED.client_id type mismatch (UUID vs TEXT) in ON CONFLICT.
    """
    inspector = sa_inspect(db.engine)
    if 'bill_number_counters' not in inspector.get_table_names():
        logging.info("[Migration] v11: creating bill_number_counters table")
        db.session.execute(text("""
            CREATE TABLE bill_number_counters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id VARCHAR(50) NOT NULL UNIQUE,
                current_gst_bill_number INTEGER NOT NULL DEFAULT 0,
                current_non_gst_bill_number INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.commit()

    dialect = db.engine.dialect.name

    if dialect == 'postgresql':
        # Step 1: Update rows that already exist in bill_number_counters
        db.session.execute(text("""
            UPDATE bill_number_counters bc
            SET
                current_gst_bill_number = GREATEST(
                    bc.current_gst_bill_number,
                    COALESCE((
                        SELECT MAX(bill_number) FROM gst_billing
                        WHERE client_id = bc.client_id::UUID
                    ), 0)
                ),
                current_non_gst_bill_number = GREATEST(
                    bc.current_non_gst_bill_number,
                    COALESCE((
                        SELECT MAX(bill_number) FROM non_gst_billing
                        WHERE client_id = bc.client_id::UUID
                    ), 0)
                ),
                updated_at = CURRENT_TIMESTAMP
        """))

        # Step 2: Insert rows for clients that have no counter row yet
        db.session.execute(text("""
            INSERT INTO bill_number_counters (client_id, current_gst_bill_number, current_non_gst_bill_number)
            SELECT
                c.client_id::TEXT,
                COALESCE((SELECT MAX(bill_number) FROM gst_billing     WHERE client_id = c.client_id), 0),
                COALESCE((SELECT MAX(bill_number) FROM non_gst_billing WHERE client_id = c.client_id), 0)
            FROM client_entry c
            WHERE NOT EXISTS (
                SELECT 1 FROM bill_number_counters WHERE client_id = c.client_id::TEXT
            )
        """))
    else:
        # SQLite: same two-step, no UUID casts needed
        db.session.execute(text("""
            UPDATE bill_number_counters
            SET
                current_gst_bill_number = MAX(
                    current_gst_bill_number,
                    COALESCE((SELECT MAX(bill_number) FROM gst_billing     WHERE client_id = bill_number_counters.client_id), 0)
                ),
                current_non_gst_bill_number = MAX(
                    current_non_gst_bill_number,
                    COALESCE((SELECT MAX(bill_number) FROM non_gst_billing WHERE client_id = bill_number_counters.client_id), 0)
                ),
                updated_at = CURRENT_TIMESTAMP
        """))

        db.session.execute(text("""
            INSERT INTO bill_number_counters (client_id, current_gst_bill_number, current_non_gst_bill_number)
            SELECT
                c.client_id,
                COALESCE((SELECT MAX(bill_number) FROM gst_billing     WHERE client_id = c.client_id), 0),
                COALESCE((SELECT MAX(bill_number) FROM non_gst_billing WHERE client_id = c.client_id), 0)
            FROM client_entry c
            WHERE NOT EXISTS (
                SELECT 1 FROM bill_number_counters WHERE client_id = c.client_id
            )
        """))

    db.session.commit()
    logging.info("[Migration] v11: bill_number_counters synced to actual max bill numbers")


def _m012_create_customer_table(db):
    """Create the customer table for offline SQLite mode."""
    inspector = sa_inspect(db.engine)
    if 'customer' in inspector.get_table_names():
        logging.info("[Migration] v12: customer table already exists, skipping")
        return

    db.session.execute(text("""
        CREATE TABLE customer (
            customer_id   TEXT PRIMARY KEY,
            client_id     TEXT NOT NULL,
            customer_code INTEGER UNIQUE,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            customer_email TEXT,
            customer_address TEXT,
            customer_gstin TEXT,
            customer_city TEXT,
            customer_state TEXT,
            customer_pincode TEXT,
            total_bills   INTEGER DEFAULT 0,
            total_spent   NUMERIC DEFAULT 0.00,
            loyalty_points INTEGER DEFAULT 0,
            last_purchase_date DATETIME,
            first_purchase_date DATETIME,
            status        TEXT DEFAULT 'active',
            notes         TEXT,
            created_at    DATETIME,
            updated_at    DATETIME,
            synced_at     DATETIME
        )
    """))
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_customer_client_phone ON customer (client_id, customer_phone)"
    ))
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_customer_client_status ON customer (client_id, status)"
    ))
    db.session.commit()
    logging.info("[Migration] v12: customer table created")


def _m013_apparel_label_fields(db):
    """
    Add fields for retail apparel hang-tag labels.
    - stock_entry: brand_name, size_variant, colour, country_of_origin,
                   manufacture_date (YYYY-MM text), importer_name, importer_address,
                   consumer_care_phone, consumer_care_email
    - client_entry: label_importer_name, label_importer_address,
                    label_origin_country, label_care_phone, label_care_email
                    (client-wide defaults so users don't retype per-SKU)
    All columns are nullable — zero-risk to existing rows.
    """
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, db.engine.dialect.name)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    # stock_entry — per-SKU legal metrology fields
    _add_col('stock_entry', 'brand_name',           'VARCHAR(120) NULL')
    _add_col('stock_entry', 'size_variant',         'VARCHAR(20) NULL')
    _add_col('stock_entry', 'colour',               'VARCHAR(40) NULL')
    _add_col('stock_entry', 'country_of_origin',    'VARCHAR(60) NULL')
    _add_col('stock_entry', 'manufacture_date',     'VARCHAR(7) NULL')  # YYYY-MM
    _add_col('stock_entry', 'importer_name',        'VARCHAR(160) NULL')
    _add_col('stock_entry', 'importer_address',     'TEXT NULL')
    _add_col('stock_entry', 'consumer_care_phone',  'VARCHAR(20) NULL')
    _add_col('stock_entry', 'consumer_care_email',  'VARCHAR(120) NULL')

    # client_entry — client-wide label defaults
    _add_col('client_entry', 'label_importer_name',    'VARCHAR(160) NULL')
    _add_col('client_entry', 'label_importer_address', 'TEXT NULL')
    # No SQL DEFAULT: Postgres would backfill every existing row with 'India'
    # which may be wrong for importers. The Python layer supplies 'India' as
    # runtime fallback via _client_label_defaults() when the column is NULL.
    _add_col('client_entry', 'label_origin_country',   'VARCHAR(60) NULL')
    _add_col('client_entry', 'label_care_phone',       'VARCHAR(20) NULL')
    _add_col('client_entry', 'label_care_email',       'VARCHAR(120) NULL')

    db.session.commit()
    logging.info("[Migration] v13: apparel label fields added")


def _m014_employee_salary_tables(db):
    """
    Create Employee Salary & Attendance Management tables:
      - employees            (employee master)
      - employee_attendance  (daily punch records)
      - salary_cycles        (pay period with gross/net calculation)
      - salary_advances      (advance payments within a cycle)
    """
    inspector = sa_inspect(db.engine)
    tables = inspector.get_table_names()

    if 'employees' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS employees (
                employee_id  TEXT PRIMARY KEY,
                client_id    TEXT NOT NULL,
                branch_id    TEXT,
                name         VARCHAR(255) NOT NULL,
                phone        VARCHAR(20),
                pay_type     VARCHAR(10) NOT NULL CHECK (pay_type IN ('hourly', 'daily')),
                rate         DECIMAL(10, 2) NOT NULL,
                is_active    BOOLEAN DEFAULT 1,
                created_by   TEXT NOT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_emp_client "
            "ON employees (client_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_emp_active "
            "ON employees (client_id, is_active)"
        ))
        logging.info("[Migration] v14: employees table created")

    if 'employee_attendance' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS employee_attendance (
                attendance_id  TEXT PRIMARY KEY,
                employee_id    TEXT NOT NULL,
                client_id      TEXT NOT NULL,
                work_date      DATE NOT NULL,
                check_in       TIMESTAMP NOT NULL,
                check_out      TIMESTAMP,
                total_minutes  INTEGER,
                marked_by      TEXT NOT NULL,
                notes          TEXT,
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_att_emp_date "
            "ON employee_attendance (client_id, employee_id, work_date)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_att_client_date "
            "ON employee_attendance (client_id, work_date)"
        ))
        logging.info("[Migration] v14: employee_attendance table created")

    if 'salary_cycles' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS salary_cycles (
                cycle_id        TEXT PRIMARY KEY,
                employee_id     TEXT NOT NULL,
                client_id       TEXT NOT NULL,
                start_date      DATE NOT NULL,
                end_date        DATE NOT NULL,
                status          VARCHAR(20) DEFAULT 'open'
                                CHECK (status IN ('open', 'paid')),
                gross_salary    DECIMAL(10, 2),
                total_advances  DECIMAL(10, 2) DEFAULT 0,
                net_salary      DECIMAL(10, 2),
                paid_at         TIMESTAMP,
                paid_by         TEXT,
                payment_note    TEXT,
                rate_snapshot   DECIMAL(10, 2),
                pay_type_snap   VARCHAR(10),
                full_day_mins   INTEGER DEFAULT 480,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (employee_id, start_date)
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_cycle_emp_status "
            "ON salary_cycles (client_id, employee_id, status)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_cycle_client_status "
            "ON salary_cycles (client_id, status)"
        ))
        logging.info("[Migration] v14: salary_cycles table created")

    if 'salary_advances' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS salary_advances (
                advance_id   TEXT PRIMARY KEY,
                employee_id  TEXT NOT NULL,
                client_id    TEXT NOT NULL,
                cycle_id     TEXT NOT NULL,
                amount       DECIMAL(10, 2) NOT NULL,
                advance_date DATE NOT NULL,
                notes        TEXT,
                recorded_by  TEXT NOT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_adv_cycle "
            "ON salary_advances (cycle_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_adv_emp_date "
            "ON salary_advances (client_id, employee_id, advance_date)"
        ))
        logging.info("[Migration] v14: salary_advances table created")

    db.session.commit()
    logging.info("[Migration] v14: employee salary tables done")


def _m015_attendance_status_column(db):
    """
    Add day-off / leave / holiday support to employee_attendance.

    - Adds `status` column (default 'present')
    - Relaxes `check_in` to allow NULL (day-off rows have no punch)

    Status values carry pay semantics — see routes/employees.py::_calculate_cycle_amounts:
      present       → computed from minutes worked (existing behavior)
      paid_leave    → counts as 1 full day of pay
      holiday       → counts as 1 full day of pay
      weekly_off    → counts as 1 full day of pay
      absent        → counts as 0 (no pay)
      unpaid_leave  → counts as 0 (no pay)
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    # 1. Status column — drives pay semantics
    _add_col('employee_attendance', 'status',
             "VARCHAR(20) NOT NULL DEFAULT 'present'")

    # 2. Reason column — short categorized label shown in UI (e.g. "Sick leave", "Festival")
    _add_col('employee_attendance', 'reason', "VARCHAR(255)")

    # 3. Relax check_in NOT NULL. Day-off rows legitimately have no punch time.
    #    Use dialect-specific syntax — SQLite cannot ALTER COLUMN, so we check the
    #    column's current nullability and only DDL on PostgreSQL.
    if dialect == 'postgresql':
        try:
            db.session.execute(text(
                "ALTER TABLE employee_attendance ALTER COLUMN check_in DROP NOT NULL"
            ))
            logging.info("[Migration] employee_attendance.check_in is now NULLABLE")
        except Exception as e:
            # Already nullable or dialect quirk — safe to ignore
            logging.debug(f"[Migration] check_in relax skipped: {e}")
    else:
        # SQLite can't relax NOT NULL via ALTER. Day-off rows on SQLite stores use a
        # sentinel (check_in = work_date midnight) and rely on status='...' to disambiguate.
        logging.info("[Migration] SQLite: check_in stays NOT NULL (day-off rows use sentinel)")

    db.session.commit()
    logging.info("[Migration] v15: attendance status/reason columns added")


def _m017_audit_overrides_column(db):
    """v17: Add audit_overrides JSON column to both bill tables.

    Stores per-bill audit annotations (corrected line items) without
    altering the original `items` column. NULL when no audit correction exists.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return  # table doesn't exist yet — skip
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    # JSONB on Postgres / TEXT on SQLite (FlexibleJSON-compatible)
    if dialect == 'postgresql':
        col_def = 'JSONB NULL'
    else:
        col_def = 'TEXT NULL'

    _add_col('gst_billing', 'audit_overrides', col_def)
    _add_col('non_gst_billing', 'audit_overrides', col_def)

    db.session.commit()
    logging.info("[Migration] v17: audit_overrides column added to bill tables")


def _m018_stock_entry_created_by(db):
    """v18: Add created_by FK on stock_entry to track who added each stock item.

    Nullable — existing rows stay NULL ("Unknown" in UI).
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    if dialect == 'postgresql':
        col_def = 'UUID NULL'
    else:
        col_def = 'VARCHAR(36) NULL'

    _add_col('stock_entry', 'created_by', col_def)

    db.session.commit()
    logging.info("[Migration] v18: stock_entry.created_by added")


def _m019_added_by_label(db):
    """v19: Add added_by_label text column to stock_entry, supplier_deliveries, bulk_stock_order.

    User-typed name for shared-login attribution (alongside the server-set created_by user_id).
    Nullable — legacy rows stay NULL.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    col_def = 'VARCHAR(120) NULL'
    _add_col('stock_entry', 'added_by_label', col_def)
    _add_col('supplier_deliveries', 'added_by_label', col_def)
    _add_col('bulk_stock_order', 'added_by_label', col_def)

    db.session.commit()
    logging.info("[Migration] v19: added_by_label added to stock_entry, supplier_deliveries, bulk_stock_order")


def _m020_clarify_permission_descriptions(db):
    """v20: Rewrite 12 ambiguous permission descriptions.

    Idempotent: each UPDATE is guarded by WHERE description = '<old>',
    so re-running on already-updated rows is a no-op and admin-edited
    rows are not overwritten.
    """
    rewrites = [
        ('set_tax_rate',           'Set custom tax/GST rates',
                                   'Override the tax/GST rate on individual bills at checkout'),
        ('view_all_bills',         'View all bills in the system',
                                   'View bills created by every user'),
        ('view_own_bills',         'View only own created bills',
                                   'View only bills this user personally created'),
        ('edit_bill_price_audit',  'Edit bill prices from the audit log',
                                   'Correct historical bill prices from the audit-log view (power feature)'),
        ('custom_report_filters',  'Use custom filters in reports',
                                   'Build saved custom date/branch/category filters in reports'),
        ('assign_permissions',     'Assign permissions to users',
                                   'Grant or revoke permissions on any user (on this screen)'),
        ('edit_tax_settings',      'Edit tax and GST settings',
                                   'Edit company-wide default GST rates and tax configuration'),
        ('view_audit_logs',        'View audit trail logs',
                                   'View the audit-trail page showing who changed what and when'),
        ('manage_clients',         'Manage client organizations',
                                   'Manage other tenant organizations (super-admin only)'),
        ('approve_bulk_order',     'Approve bulk stock orders',
                                   'Approve a bulk-order draft so it can be sent to the supplier'),
        ('receive_bulk_order',     'Mark bulk orders as received',
                                   'Confirm physical receipt of stock and add it to inventory'),
        ('manage_permissions',     'Manage user permissions',
                                   'Legacy alias for permission management — kept for backward compatibility'),
    ]
    total_updated = 0
    for perm_name, old_desc, new_desc in rewrites:
        result = db.session.execute(
            text("UPDATE permissions SET description = :new "
                 "WHERE permission_name = :name AND description = :old"),
            {'new': new_desc, 'name': perm_name, 'old': old_desc}
        )
        total_updated += result.rowcount
    db.session.commit()
    logging.info(f"[Migration] v20: {total_updated} permission description(s) clarified")


def _m021_revoke_super_admin_perms_from_regular_users(db):
    """v21: Revoke super-admin-only perms from any non-super-admin user who has them.

    Cleans up the leak where the owner-role default + the full_access template
    used to grant manage_clients/system_backup/system_restore/maintenance_mode
    to regular owners. The routes that consume these are role-gated, so this
    is housekeeping rather than a security patch — but it stops false-positive
    UI on the EditUser screen and removes a latent risk if a future route
    forgets its @require_super_admin decorator.

    Idempotent: if no matching rows exist, this is a no-op.
    """
    sa_perms = ('manage_clients', 'system_backup', 'system_restore', 'maintenance_mode')

    # Build the IN-clause placeholders for both perm_names and the WHERE NOT super_admin condition.
    # Cross-dialect: works on both SQLite and PostgreSQL.
    placeholders = ', '.join(f':p{i}' for i in range(len(sa_perms)))
    params = {f'p{i}': name for i, name in enumerate(sa_perms)}

    # Cross-dialect WHERE clause: works on both SQLite (BOOLEAN stored as INTEGER 0/1)
    # and PostgreSQL (real BOOLEAN type — rejects integer comparison).
    # `IS NOT TRUE` evaluates correctly on Postgres for both FALSE and NULL,
    # and SQLite treats it the same.
    result = db.session.execute(
        text(f"""
            DELETE FROM user_permissions
            WHERE permission_id IN (
                SELECT permission_id FROM permissions
                WHERE permission_name IN ({placeholders})
            )
            AND user_id IN (
                SELECT user_id FROM users
                WHERE is_super_admin IS NOT TRUE
            )
        """),
        params,
    )
    revoked = result.rowcount or 0
    db.session.commit()
    logging.info(f"[Migration] v21: revoked {revoked} super-admin-only perm row(s) from regular users")


def _m022_create_permission_templates(db):
    """v22: Create permission_templates table for custom (user-defined) templates.

    Stored as JSON-encoded permission_names list.
    Soft delete via deleted_at column.
    Partial UNIQUE(LOWER(name)) WHERE deleted_at IS NULL enforces case-insensitive
    name uniqueness across active templates only — soft-deleted rows don't block
    re-using the name.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    if 'permission_templates' not in inspector.get_table_names():
        if dialect == 'postgresql':
            db.session.execute(text("""
                CREATE TABLE permission_templates (
                    template_id  UUID PRIMARY KEY,
                    name         VARCHAR(40) NOT NULL,
                    description  VARCHAR(200),
                    permissions  TEXT NOT NULL,
                    created_by   UUID NOT NULL,
                    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at   TIMESTAMP
                )
            """))
        else:  # sqlite
            db.session.execute(text("""
                CREATE TABLE permission_templates (
                    template_id  VARCHAR(36) PRIMARY KEY,
                    name         VARCHAR(40) NOT NULL,
                    description  VARCHAR(200),
                    permissions  TEXT NOT NULL,
                    created_by   VARCHAR(36) NOT NULL,
                    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at   TIMESTAMP
                )
            """))

        # Partial unique index on LOWER(name) — works in both SQLite and PostgreSQL.
        db.session.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_templates_name_unique
            ON permission_templates (LOWER(name))
            WHERE deleted_at IS NULL
        """))

        # Soft-delete filter helper.
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_permission_templates_deleted_at
            ON permission_templates (deleted_at)
        """))

        db.session.commit()
        logging.info("[Migration] v22: permission_templates table created")
    else:
        logging.info("[Migration] v22: permission_templates table already exists, skipping")


def _m023_role_hierarchy_redesign(db):
    """v23: Collapse 5 roles to 3 (owner/manager/staff), add reports_to_id, invalidate sessions.

    Atomic steps:
      1. ALTER TABLE users ADD COLUMN reports_to_id (FK users.user_id, nullable, indexed).
      2. UPDATE users SET role='manager' WHERE role='admin'.
      3. UPDATE users SET role='staff'   WHERE role='cashier'.
      4. For each client: backfill non-owner users.reports_to_id to that client's owner.user_id.
         Owner's own reports_to_id stays NULL.
      5. Normalize client_entry.role_quotas JSON: fold admin into manager, cashier into staff.
      6. DELETE FROM user_sessions — force everyone to re-log in (one-time UX friction in
         exchange for not keeping a backward-compat role-name shim forever).

    Idempotent — re-running on already-migrated data is a no-op.
    """
    import json as _json
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    # 1. Add reports_to_id column (idempotent via guard).
    cols = {c['name'] for c in inspector.get_columns('users')}
    if 'reports_to_id' not in cols:
        col_def = 'UUID NULL' if dialect == 'postgresql' else 'VARCHAR(36) NULL'
        db.session.execute(text(f"ALTER TABLE users ADD COLUMN reports_to_id {col_def}"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_users_reports_to_id ON users (reports_to_id)"
        ))

    # 2 + 3: Role renames.
    db.session.execute(text("UPDATE users SET role = 'manager' WHERE role = 'admin'"))
    db.session.execute(text("UPDATE users SET role = 'staff'   WHERE role = 'cashier'"))

    # 4: Backfill reports_to_id. For each client, find the owner, then set
    # every non-owner user in that client to point at the owner.
    owners = db.session.execute(text(
        "SELECT user_id, client_id FROM users WHERE role = 'owner'"
    )).fetchall()
    for owner_uid, client_id in owners:
        # NOTE: cannot use "OR reports_to_id = ''" on PostgreSQL — UUID columns
        # reject empty-string comparison. NULL is the only "unset" state on PG.
        db.session.execute(text(
            "UPDATE users SET reports_to_id = :owner "
            "WHERE client_id = :cid AND role != 'owner' "
            "AND reports_to_id IS NULL"
        ), {'owner': str(owner_uid), 'cid': str(client_id)})

    # 5: Normalize role_quotas JSON.
    # NOTE: cannot use "AND role_quotas != ''" — PostgreSQL JSONB rejects empty-string
    # comparison. NULL is the only "absent" state on PG.
    rows = db.session.execute(text(
        "SELECT client_id, role_quotas FROM client_entry "
        "WHERE role_quotas IS NOT NULL"
    )).fetchall()
    for client_id, quotas_raw in rows:
        try:
            quotas = quotas_raw if isinstance(quotas_raw, dict) else _json.loads(quotas_raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(quotas, dict):
            continue
        if 'admin' not in quotas and 'cashier' not in quotas:
            continue  # nothing to normalize
        new_quotas = {
            'manager': (quotas.get('manager', 0) or 0) + (quotas.pop('admin', 0) or 0),
            'staff':   (quotas.get('staff', 0) or 0)   + (quotas.pop('cashier', 0) or 0),
        }
        # Keep only manager and staff in the final dict.
        new_quotas = {k: v for k, v in new_quotas.items() if v > 0}
        if dialect == 'postgresql':
            db.session.execute(text(
                "UPDATE client_entry SET role_quotas = CAST(:q AS JSONB) WHERE client_id = :cid"
            ), {'q': _json.dumps(new_quotas), 'cid': str(client_id)})
        else:
            db.session.execute(text(
                "UPDATE client_entry SET role_quotas = :q WHERE client_id = :cid"
            ), {'q': _json.dumps(new_quotas), 'cid': str(client_id)})

    # 6: Invalidate all sessions — one-time, forces re-login.
    db.session.execute(text("DELETE FROM user_sessions"))

    db.session.commit()
    logging.info(f"[Migration] v23: role hierarchy redesign applied (admin→manager, cashier→staff, reports_to_id backfilled, quotas normalized, sessions cleared)")


def _m024_ot_columns(db):
    """v24: Add OT tracking columns.

    - employees.ot_multiplier DECIMAL(4,2) — payout rate for OT (default 1.5)
    - employee_attendance.auto_ot_minutes INTEGER — auto-computed at check-out
                                                    (max(0, total_minutes - cycle.full_day_mins))
    - employee_attendance.approved_ot_minutes INTEGER NULL — manager-approved OT
                                                              (NULL = pending, 0 = rejected,
                                                               N = approved)
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    _add_col('employees', 'ot_multiplier', 'DECIMAL(4,2) NULL')
    _add_col('employee_attendance', 'auto_ot_minutes', 'INTEGER NOT NULL DEFAULT 0')
    _add_col('employee_attendance', 'approved_ot_minutes', 'INTEGER NULL')

    db.session.commit()
    logging.info("[Migration] v24: OT columns added to employees + employee_attendance")


def _m025_discount_columns(db):
    """v25: Add optional percentage discount columns to stock + transactional tables.

    Two nullable columns (default 0) on three tables:
      - stock_entry              (product master — read at billing time)
      - supplier_delivery_items  (per-delivery history)
      - bulk_stock_order_item    (per-order history)

    Columns:
      - purchase_discount_percentage — supplier discount; profit calc only (cost_price stays gross)
      - selling_discount_percentage  — customer discount; auto-fills the bill line

    All nullable with default 0 — zero-risk to existing rows.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    for table in ('stock_entry', 'supplier_delivery_items', 'bulk_stock_order_item'):
        _add_col(table, 'purchase_discount_percentage', 'DECIMAL(5,2) NULL DEFAULT 0')
        _add_col(table, 'selling_discount_percentage',  'DECIMAL(5,2) NULL DEFAULT 0')

    db.session.commit()
    logging.info("[Migration] v25: discount columns added to stock + supplier/bulk-order items")


def _m026_add_missing_permissions(db):
    """
    Add permission sections and permission rows for feature areas that were
    previously unprotected: Employees, Payroll, Expenses, Suppliers, Branches,
    Stock Transfers, Shop Settings.

    Data-only — does NOT auto-grant to existing users. Super admin will use
    the existing permissions UI to grant new keys to owners; owners then
    cascade to staff via /api/team/<user_id>/permissions.

    Idempotent: re-running is a no-op (uses check-before-insert pattern, the
    same approach as _m007 to stay dialect-agnostic between SQLite/Postgres).
    """
    import uuid as _uuid

    inspector = sa_inspect(db.engine)
    tables = inspector.get_table_names()
    if 'permission_sections' not in tables or 'permissions' not in tables:
        logging.info("[Migration] v26: permission tables missing — skipping (fresh install will use db.create_all)")
        return

    # (section_name, display_order, [(permission_name, description, display_order), ...])
    new_data = [
        ('Employees', 6, [
            ('view_employees',   'View employee list',           1),
            ('add_employee',     'Add new employees',             2),
            ('edit_employee',    'Edit employee details',         3),
            ('delete_employee',  'Delete / deactivate employees', 4),
            ('view_attendance',  'View attendance records',       5),
            ('mark_attendance',  'Mark / edit attendance',        6),
        ]),
        ('Payroll', 7, [
            ('view_salary',           'View salary cycles',                1),
            ('manage_salary_cycles',  'Open / close / edit salary cycles', 2),
            ('record_advance',        'Record salary advances',            3),
            ('mark_salary_paid',      'Mark cycle as paid',                4),
        ]),
        ('Expenses', 8, [
            ('view_expenses',              'View expense entries',           1),
            ('add_expense',                'Add new expense',                2),
            ('edit_expense',               'Edit expense entries',           3),
            ('delete_expense',             'Delete expense entries',         4),
            ('manage_expense_categories',  'Manage expense categories',      5),
        ]),
        ('Suppliers', 9, [
            ('view_suppliers',     'View supplier list',                1),
            ('add_supplier',       'Add new suppliers',                 2),
            ('edit_supplier',      'Edit supplier details',             3),
            ('delete_supplier',    'Delete / deactivate suppliers',     4),
            ('manage_deliveries',  'Manage supplier deliveries',        5),
        ]),
        ('Branches', 10, [
            ('view_branches',   'View branches',          1),
            ('add_branch',      'Add new branches',        2),
            ('edit_branch',     'Edit branch details',     3),
            ('delete_branch',   'Delete branches',         4),
        ]),
        ('Stock Transfers', 11, [
            ('view_stock_transfers',     'View stock transfer list',      1),
            ('create_stock_transfer',    'Create / request transfers',    2),
            ('approve_stock_transfer',   'Approve transfer requests',     3),
            ('receive_stock_transfer',   'Confirm receipt of transfers',  4),
        ]),
        ('Shop Settings', 12, [
            ('view_shop_settings',  'View shop settings',  1),
            ('edit_shop_settings',  'Edit shop settings',  2),
        ]),
    ]

    sections_added = 0
    perms_added = 0

    with db.engine.connect() as conn:
        for section_name, section_order, perms in new_data:
            # Get-or-create section
            row = conn.execute(
                text("SELECT section_id FROM permission_sections WHERE section_name = :name"),
                {'name': section_name}
            ).fetchone()

            if row:
                section_id = str(row[0])
            else:
                section_id = str(_uuid.uuid4())
                conn.execute(
                    text("INSERT INTO permission_sections "
                         "(section_id, section_name, display_order) "
                         "VALUES (:id, :name, :order)"),
                    {'id': section_id, 'name': section_name, 'order': section_order}
                )
                sections_added += 1

            # Insert permissions only if missing
            for perm_name, description, display_order in perms:
                exists = conn.execute(
                    text("SELECT 1 FROM permissions WHERE permission_name = :pname"),
                    {'pname': perm_name}
                ).fetchone()
                if exists:
                    continue
                conn.execute(
                    text("INSERT INTO permissions "
                         "(permission_id, permission_name, description, section_id, display_order) "
                         "VALUES (:id, :name, :desc, :sid, :order)"),
                    {
                        'id': str(_uuid.uuid4()),
                        'name': perm_name,
                        'desc': description,
                        'sid': section_id,
                        'order': display_order,
                    }
                )
                perms_added += 1

        conn.commit()

    logging.info(
        f"[Migration] v26: {sections_added} new section(s), {perms_added} new permission(s) added"
    )


def _m027_membership_tables(db):
    """
    v27: Customer membership / loyalty card program tables:
      - membership_tier   (owner-defined card types; NULL benefit = not offered)
      - membership_card   (1:1 with customer; two point counters)
      - membership_ledger (append-only event log; source of truth for stats)
    """
    inspector = sa_inspect(db.engine)
    tables = inspector.get_table_names()
    dialect = db.engine.dialect.name
    bool_true = 'TRUE' if dialect == 'postgresql' else '1'

    if 'membership_tier' not in tables:
        db.session.execute(text(f"""
            CREATE TABLE IF NOT EXISTS membership_tier (
                tier_id                   VARCHAR(36) PRIMARY KEY,
                client_id                 VARCHAR(36) NOT NULL
                                          REFERENCES client_entry(client_id) ON DELETE CASCADE,
                name                      VARCHAR(100) NOT NULL,
                description               TEXT         NULL,
                color                     VARCHAR(20)  NULL,
                discount_percentage       NUMERIC      NULL,
                points_per_100            NUMERIC      NULL,
                redemption_rate           NUMERIC      NULL,
                monthly_negotiable_budget NUMERIC      NULL,
                negotiable_budget_period  VARCHAR(10)  DEFAULT 'monthly',
                upgrade_threshold_points  INTEGER      NULL,
                upgrade_to_tier_id        VARCHAR(36)  NULL,
                enrollment_fee            NUMERIC      NULL,
                validity_days             INTEGER      NULL,
                is_active                 BOOLEAN      NOT NULL DEFAULT {bool_true},
                sort_order                INTEGER      DEFAULT 0,
                created_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                updated_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                synced_at                 TIMESTAMP    NULL
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mtier_client ON membership_tier (client_id)"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mtier_client_active ON membership_tier (client_id, is_active)"))
        logging.info("[Migration] v27: membership_tier table created")

    if 'membership_card' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS membership_card (
                card_id           VARCHAR(36) PRIMARY KEY,
                client_id         VARCHAR(36) NOT NULL
                                  REFERENCES client_entry(client_id) ON DELETE CASCADE,
                customer_id       VARCHAR(36) NOT NULL UNIQUE
                                  REFERENCES customer(customer_id) ON DELETE CASCADE,
                membership_number VARCHAR(50) NOT NULL UNIQUE,
                tier_id           VARCHAR(36) NOT NULL
                                  REFERENCES membership_tier(tier_id),
                redeemable_points INTEGER     NOT NULL DEFAULT 0,
                lifetime_points   INTEGER     NOT NULL DEFAULT 0,
                enrolled_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                expires_at        TIMESTAMP   NULL,
                status            VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                updated_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                synced_at         TIMESTAMP   NULL
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mcard_client ON membership_card (client_id)"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mcard_client_number ON membership_card (client_id, membership_number)"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mcard_client_customer ON membership_card (client_id, customer_id)"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mcard_client_status ON membership_card (client_id, status)"))
        logging.info("[Migration] v27: membership_card table created")

    if 'membership_ledger' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS membership_ledger (
                ledger_id    VARCHAR(36) PRIMARY KEY,
                client_id    VARCHAR(36) NOT NULL
                             REFERENCES client_entry(client_id) ON DELETE CASCADE,
                card_id      VARCHAR(36) NOT NULL
                             REFERENCES membership_card(card_id) ON DELETE CASCADE,
                bill_id      VARCHAR(36) NULL,
                event_type   VARCHAR(20) NOT NULL,
                points_delta INTEGER     NOT NULL DEFAULT 0,
                amount_delta NUMERIC     NOT NULL DEFAULT 0,
                note         TEXT        NULL,
                created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                synced_at    TIMESTAMP   NULL
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mledger_card_created ON membership_ledger (card_id, created_at)"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mledger_bill_event ON membership_ledger (bill_id, event_type)"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_mledger_client ON membership_ledger (client_id)"))
        logging.info("[Migration] v27: membership_ledger table created")

    db.session.commit()
    logging.info("[Migration] v27: membership tables ready")


def _m028_negotiable_budget_period(db):
    """v28: membership_tier.negotiable_budget_period — 'monthly' (default) or
    'yearly' window for the negotiable budget cap."""
    inspector = sa_inspect(db.engine)
    try:
        cols = [c['name'] for c in inspector.get_columns('membership_tier')]
    except Exception:
        return
    if 'negotiable_budget_period' not in cols:
        db.session.execute(text(
            "ALTER TABLE membership_tier ADD COLUMN negotiable_budget_period VARCHAR(10) DEFAULT 'monthly'"
        ))
        db.session.commit()
        logging.info("[Migration] v28: membership_tier.negotiable_budget_period added")


def _m029_regional_customization(db):
    """v29: Regional customization columns on client_entry (country / currency / tax).

    Collected in the first-login setup wizard, editable later in settings.
      - country         ISO-3166 alpha-2 (e.g. 'IN', 'AE', 'US')
      - currency_code   ISO-4217 (e.g. 'INR', 'AED', 'USD')
      - currency_symbol display symbol (e.g. '₹', '$')
      - locale          number/date formatting (e.g. 'en-IN', 'en-US')
      - tax_config      JSON: {name, mode, default_rate, inclusive, components:[{name, ratio}]}
      - setup_completed_at  set when the wizard finishes; NULL => show wizard

    Column DEFAULTs backfill existing rows to the India profile (INR / ₹ / en-IN).
    The backfill marks every EXISTING client as already set up + gives them the GST
    default so current users are NOT forced through the wizard. New clients created
    after this migration have setup_completed_at = NULL and therefore see the wizard.
    """
    import json as _json
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    json_type = 'JSONB' if dialect == 'postgresql' else 'TEXT'

    _add_col('client_entry', 'country',            "VARCHAR(2) NULL DEFAULT 'IN'")
    _add_col('client_entry', 'currency_code',      "VARCHAR(3) NULL DEFAULT 'INR'")
    _add_col('client_entry', 'currency_symbol',    "VARCHAR(8) NULL DEFAULT '₹'")
    _add_col('client_entry', 'locale',             "VARCHAR(10) NULL DEFAULT 'en-IN'")
    _add_col('client_entry', 'tax_config',         f"{json_type} NULL")
    _add_col('client_entry', 'setup_completed_at', "DATETIME NULL")

    # Per-bill regional snapshot (frozen at creation; nullable — legacy rows stay NULL
    # and fall back to the client's current currency/India GST split at render time).
    _add_col('gst_billing',     'currency_code', "VARCHAR(3) NULL")
    _add_col('gst_billing',     'tax_breakdown', f"{json_type} NULL")
    _add_col('non_gst_billing', 'currency_code', "VARCHAR(3) NULL")

    # Backfill existing clients: India GST default + mark setup complete (skip wizard).
    default_gst = _json.dumps({
        "name": "GST", "mode": "split", "default_rate": 18, "inclusive": False,
        "components": [{"name": "CGST", "ratio": 0.5}, {"name": "SGST", "ratio": 0.5}],
    })
    if dialect == 'postgresql':
        db.session.execute(
            text("UPDATE client_entry SET tax_config = CAST(:cfg AS JSONB) WHERE tax_config IS NULL"),
            {"cfg": default_gst},
        )
    else:
        db.session.execute(
            text("UPDATE client_entry SET tax_config = :cfg WHERE tax_config IS NULL"),
            {"cfg": default_gst},
        )
    db.session.execute(text(
        "UPDATE client_entry SET setup_completed_at = CURRENT_TIMESTAMP WHERE setup_completed_at IS NULL"
    ))

    db.session.commit()
    logging.info("[Migration] v29: regional customization columns added + existing clients backfilled")


def _m030_salary_sync_columns(db):
    """v30: Add sync-tracking columns to the salary/attendance tables so they
    participate in the offline↔online SyncService.

    The salary module (employees, employee_attendance, salary_cycles,
    salary_advances) was created in _m014 WITHOUT a `synced_at` column, so it
    was excluded from sync — data created on desktop (SQLite) never reached
    Supabase and vice versa. The upload path filters on `synced_at IS NULL` and
    the download path resolves conflicts via `updated_at` (Last-Write-Wins), so:

      - All four tables get `synced_at` (nullable; existing rows = NULL = "needs upload").
      - `salary_advances` additionally gets `updated_at` — it was the only table
        without one, and _upsert_to_sqlite needs it for conflict resolution.

    Idempotent: every add is guarded by _add_col. Runs against whichever engine
    the app uses (Supabase on web, SQLite on desktop), so both sides gain the
    columns when their app boots this version.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return  # table doesn't exist yet — skip
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    for table in ('employees', 'employee_attendance', 'salary_cycles', 'salary_advances'):
        _add_col(table, 'synced_at', 'TIMESTAMP NULL')

    # salary_advances is the only salary table without updated_at; LWW needs it.
    _add_col('salary_advances', 'updated_at', 'TIMESTAMP NULL')

    db.session.commit()
    logging.info("[Migration] v30: salary/attendance sync columns added")


def _m031_attendance_soft_delete(db):
    """v31: Soft-delete for employee_attendance so deletions sync.

    The sync engine is upsert-only (no tombstones), so a hard DELETE never
    reaches the other side and the row resurrects on the next download. Mirror
    the `employees` soft-delete pattern instead: flip `is_active` to FALSE and
    stamp `deleted_at`, leaving the row to upload normally.

      - `is_active`  BOOLEAN NOT NULL DEFAULT 1 — existing rows backfilled active
        (DEFAULT 1 is rewritten to DEFAULT TRUE on Postgres by _normalize_col_def).
      - `deleted_at` TIMESTAMP NULL — when the soft delete happened.

    Idempotent and engine-agnostic, exactly like _m030.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    def _add_col(table, col, definition):
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table) or \
           not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
            raise ValueError(f"Invalid identifier: table={table!r}, col={col!r}")
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return  # table doesn't exist yet — skip
        if col not in cols:
            norm_def = _normalize_col_def(definition, dialect)
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {norm_def}"))
            logging.info(f"[Migration] {table}.{col} added")

    _add_col('employee_attendance', 'is_active', 'BOOLEAN NOT NULL DEFAULT 1')
    _add_col('employee_attendance', 'deleted_at', 'TIMESTAMP NULL')

    db.session.commit()
    logging.info("[Migration] v31: employee_attendance soft-delete columns added")


# ── Migration registry: (version_number, function) ───────────────────────────
# Add new entries at the BOTTOM only. Never reorder.
MIGRATIONS = [
    (1, _m001_core_columns),
    (2, _m002_barcode_per_client_unique),
    (3, _m003_shop_receipt_settings),
    (4, _m004_users_and_client_missing_cols),
    (5, _m005_stock_transfer_workflow_v2),
    (6, _m006_customer_loyalty_points),
    (7, _m007_fix_permission_sections),
    (8, _m008_supplier_tables),
    (9, _m009_role_quotas),
    (10, _m010_billing_payment_status),
    (11, _m011_sync_bill_number_counters),
    (12, _m012_create_customer_table),
    (13, _m013_apparel_label_fields),
    (14, _m014_employee_salary_tables),
    (15, _m015_attendance_status_column),
    (17, _m017_audit_overrides_column),
    (18, _m018_stock_entry_created_by),
    (19, _m019_added_by_label),
    (20, _m020_clarify_permission_descriptions),
    (21, _m021_revoke_super_admin_perms_from_regular_users),
    (22, _m022_create_permission_templates),
    (23, _m023_role_hierarchy_redesign),
    (24, _m024_ot_columns),
    (25, _m025_discount_columns),
    (26, _m026_add_missing_permissions),
    (27, _m027_membership_tables),
    (28, _m028_negotiable_budget_period),
    (29, _m029_regional_customization),
    (30, _m030_salary_sync_columns),
    (31, _m031_attendance_soft_delete),
]

# ── Public API ────────────────────────────────────────────────────────────────

def run_migrations_if_needed(app, db):
    """
    Called once during app startup.
    - First install: runs all migrations (takes a few seconds — acceptable)
    - Daily open with no schema change: returns in <1ms (version matches)
    Writes version after EACH successful migration, so a failure at v5
    won't force v1-v4 to re-run on the next startup.
    """
    with app.app_context():
        _ensure_version_table(db)
        stored = _get_stored_version(db)

        if stored >= CURRENT_SCHEMA_VERSION:
            logging.info(
                f"[Migration] Schema up to date (v{stored}). Skipping all migration checks."
            )
            return

        # Fresh installs run every migration too. The previous shortcut
        # (stamp current version + return, trusting db.create_all) silently
        # omitted tables that exist ONLY as raw SQL in migrations with no
        # SQLAlchemy model — e.g. employees, employee_attendance, salary_cycles,
        # salary_advances from _m014. db.create_all only knows about registered
        # models, so those tables never got created on fresh installs and the
        # first request that touched them crashed.
        # Every migration uses IF NOT EXISTS / _add_col guards, so running them
        # on a fresh DB is safe and idempotent — costs a few seconds at first launch.
        logging.info(
            f"[Migration] Schema v{stored} → v{CURRENT_SCHEMA_VERSION}. Running migrations…"
        )

        for version, fn in MIGRATIONS:
            if version <= stored:
                continue
            try:
                fn(db)
                _set_stored_version(db, version)
                logging.info(f"[Migration] v{version} applied and saved: {fn.__name__}")
            except Exception as e:
                try:
                    db.session.rollback()
                except Exception:
                    pass
                logging.warning(
                    f"[Migration] v{version} failed ({fn.__name__}): {e}. "
                    f"Will retry on next startup."
                )
                # Stop here — don't attempt later migrations that may depend on this one
                return

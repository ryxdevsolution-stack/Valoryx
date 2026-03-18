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
CURRENT_SCHEMA_VERSION = 1

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
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
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
                delivered_at    DATETIME NULL,
                next_retry_at   DATETIME NULL
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
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
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


# ── Migration registry: (version_number, function) ───────────────────────────
# Add new entries at the BOTTOM only. Never reorder.
MIGRATIONS = [
    (1, _m001_core_columns),
    (2, _m002_barcode_per_client_unique),
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

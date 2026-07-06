"""
Background Sync Service - Bidirectional SQLite ↔ Supabase (PostgreSQL)
Syncs local data to cloud and vice versa every 1 hour automatically
"""
import os
import re
import json
import logging
from datetime import datetime, timedelta
import pytz
from sqlalchemy import create_engine, text
from sqlalchemy.pool import QueuePool
from sqlalchemy.orm import sessionmaker
from database.type_converters import (
    TypeConverter,
    BILLING_COLUMN_TYPES,
    STOCK_COLUMN_TYPES,
    CUSTOMER_COLUMN_TYPES,
EXPENSE_COLUMN_TYPES,
    EXPENSE_SUMMARY_COLUMN_TYPES,
    BULK_ORDER_COLUMN_TYPES,
    BULK_ORDER_ITEM_COLUMN_TYPES,
    USER_COLUMN_TYPES,
    USER_PERMISSION_COLUMN_TYPES,
    REPORT_COLUMN_TYPES,
    NOTES_COLUMN_TYPES,
    EMPLOYEE_COLUMN_TYPES,
    EMPLOYEE_ATTENDANCE_COLUMN_TYPES,
    SALARY_CYCLE_COLUMN_TYPES,
    SALARY_ADVANCE_COLUMN_TYPES
)

logger = logging.getLogger(__name__)

# Helper function to get current time in Asia/Kolkata timezone
def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)


# The download watermark is stored in UTC minus this buffer. updated_at is
# written inconsistently across tables (UTC via _now_iso, IST via
# get_current_time); a UTC watermark is <= every value, so the incremental
# "updated_at > watermark" filter never MISSES a cloud row. The buffer absorbs
# minor clock skew between tills. Re-fetched rows are harmless (Last-Write-Wins).
WATERMARK_SAFETY_SECONDS = 300

# Downloads are paged so a table with more than one page of changed rows is
# fully pulled instead of silently truncated at the old fixed LIMIT.
DOWNLOAD_PAGE_SIZE = 5000


# Group-A owner tables synced GENERICALLY (schema-introspected) from v32 on.
# Each: table name, primary key (str, or list for composite), and how to scope
# to one owner. 'scope' is 'client_id', 'via_user', or ('via', parent, fk) for
# child tables that inherit their owner through a parent row. Order matters for
# Postgres FKs: parents before their children.
_OWNER_SYNC_TABLES = [
    {'table': 'membership_tier',         'pk': 'tier_id',         'scope': 'client_id'},
    {'table': 'membership_card',         'pk': 'card_id',         'scope': 'client_id'},
    {'table': 'membership_ledger',       'pk': 'ledger_id',       'scope': 'client_id'},
    {'table': 'payment_type',            'pk': 'payment_type_id', 'scope': 'client_id'},
    {'table': 'payment_transaction',     'pk': 'transaction_id',  'scope': 'client_id'},
    {'table': 'suppliers',               'pk': 'supplier_id',     'scope': 'client_id'},
    {'table': 'supplier_deliveries',     'pk': 'delivery_id',     'scope': 'client_id'},
    {'table': 'supplier_delivery_items', 'pk': 'id',              'scope': ('via', 'supplier_deliveries', 'delivery_id')},
    {'table': 'branches',                'pk': 'branch_id',       'scope': 'client_id'},
    {'table': 'branch_inventory',        'pk': 'id',              'scope': 'client_id'},
    {'table': 'stock_transfers',         'pk': 'transfer_id',     'scope': 'client_id'},
    {'table': 'stock_transfer_items',    'pk': 'id',              'scope': ('via', 'stock_transfers', 'transfer_id')},
    {'table': 'bill_templates',          'pk': 'template_id',     'scope': 'client_id'},
    {'table': 'bill_template_active',    'pk': ['client_id', 'output_type', 'bill_type'], 'scope': 'client_id'},
    {'table': 'bill_template_assets',    'pk': 'asset_id',        'scope': 'client_id'},
    {'table': 'bill_template_versions',  'pk': 'version_id',      'scope': ('via', 'bill_templates', 'template_id')},
    {'table': 'bill_number_counters',    'pk': 'client_id',       'scope': 'client_id'},
    {'table': 'permission_presets',      'pk': 'preset_id',       'scope': 'client_id'},
]


class SyncService:
    """
    Handles bidirectional synchronization between SQLite (local) and PostgreSQL (Supabase).

    Upload Strategy (SQLite → Supabase):
    1. Read unsynced records from SQLite (WHERE synced_at IS NULL)
    2. Convert data types (SQLite → PostgreSQL)
    3. Upsert to Supabase
    4. Mark records as synced in SQLite

    Download Strategy (Supabase → SQLite):
    1. Read records from Supabase updated since last download
    2. Convert data types (PostgreSQL → SQLite)
    3. Upsert to SQLite using Last-Write-Wins conflict resolution
    4. Update sync metadata
    """

    def __init__(self):
        self.sqlite_engine = None
        self.postgres_engine = None
        self.last_sync_time = None
        self.last_download_time = None
        self._meta_cache = {}  # per-table introspection cache (generic owner sync)

    def initialize(self):
        """Initialize database connections for sync"""
        try:
            # SQLite connection (local database)
            sqlite_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.valoryx/local.db'))
            self.sqlite_engine = create_engine(f'sqlite:///{sqlite_path}')

            # PostgreSQL connection (Supabase)
            db_url = os.getenv('DB_URL')
            if not db_url:
                logger.warning("[SyncService] No DB_URL found - sync disabled")
                return False

            # Small, REUSED pool. A full sync makes ~40 per-table connect() calls;
            # reusing warm connections avoids a fresh TLS+auth handshake each time
            # (~250ms/op against the ap-south-1 pooler — the cause of slow syncs).
            # Bounded to 5 (3+2) so one client can't hog Supabase's pool.
            # IMPORTANT: pair with the TRANSACTION-mode pooler (DB_URL port 6543);
            # on the session-mode pooler (5432, 15-client cap) even these few
            # reused connections compete for scarce slots across multiple tills.
            self.postgres_engine = create_engine(
                db_url,
                poolclass=QueuePool,
                pool_size=3,
                max_overflow=2,
                pool_pre_ping=True,
                pool_recycle=1800,
                pool_timeout=10,
                connect_args={'connect_timeout': 10}
            )

            # Test connections
            with self.sqlite_engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            with self.postgres_engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            # Guarantee the remote (Postgres/Supabase) schema has the salary
            # sync columns BEFORE any upload. The desktop migrates only its own
            # SQLite; the server migrates Postgres on its own boot. If a desktop
            # on a newer version syncs before the server is redeployed, the
            # upserts below would reference columns that don't exist yet and
            # every salary sync would fail. These idempotent ADD COLUMN IF NOT
            # EXISTS statements make the desktop independent of server deploy
            # order. (Postgres-only syntax; harmless no-op once columns exist.)
            self._ensure_remote_sync_columns()

            logger.info("[SyncService] Initialized successfully")
            return True

        except Exception as e:
            logger.error(f"[SyncService] Initialization failed: {e}")
            return False

    def _ensure_remote_sync_columns(self):
        """Idempotently add salary/attendance sync columns to Postgres.

        Mirrors migrations v30 (synced_at on all four tables + updated_at on
        salary_advances) and v31 (is_active/deleted_at on employee_attendance)
        so a desktop client can always upload even if the server schema is a
        deploy behind. Each statement is guarded individually so one failure
        (e.g. a table that doesn't exist on this server yet) never blocks the
        rest of sync.
        """
        statements = [
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP NULL",
            "ALTER TABLE salary_cycles ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP NULL",
            "ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP NULL",
            "ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP NULL",
            "ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL",
            "ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL",
        ]
        # v32: synced_at on the Group-A owner tables that lacked it (deploy-order
        # safety — same idempotent guard as above).
        for t in ('payment_transaction', 'suppliers', 'supplier_deliveries', 'supplier_delivery_items',
                  'branches', 'branch_inventory', 'stock_transfers', 'stock_transfer_items',
                  'bill_templates', 'bill_template_active', 'bill_template_assets',
                  'bill_template_versions', 'bill_number_counters', 'permission_presets'):
            statements.append(f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP NULL")
        # v33: per-device bill prefix on the billing tables
        statements.append("ALTER TABLE gst_billing ADD COLUMN IF NOT EXISTS bill_prefix VARCHAR(8) NULL")
        statements.append("ALTER TABLE non_gst_billing ADD COLUMN IF NOT EXISTS bill_prefix VARCHAR(8) NULL")
        for stmt in statements:
            try:
                with self.postgres_engine.connect() as conn:
                    conn.execute(text(stmt))
                    conn.commit()
            except Exception as e:
                logger.warning(f"[SyncService] ensure-remote-column skipped ({stmt.split('ADD COLUMN')[0].strip()}): {e}")

    def sync_all(self, client_id=None):
        """
        Sync all unsynced data to Supabase (Upload).

        Returns:
            dict: Sync results with counts
        """
        if not self.postgres_engine:
            logger.warning("[SyncService] Not initialized - skipping sync")
            return {"status": "skipped", "reason": "not_initialized"}

        try:
            logger.info("[SyncService] Starting background sync (Upload)...")

            results = {
                "status": "success",
                "timestamp": get_current_time().isoformat(),
                "direction": "upload",
                "synced": {
                    "client_entry": 0,
                    "gst_bills": 0,
                    "non_gst_bills": 0,
                    "stock": 0,
                    "customers": 0,
                    "expenses": 0,
                    "expense_summaries": 0,
                    "bulk_orders": 0,
                    "bulk_order_items": 0,
                    "users": 0,
                    "user_permissions": 0,
                    "reports": 0,
                    "notes": 0,
                    "employees": 0,
                    "salary_cycles": 0,
                    "employee_attendance": 0,
                    "salary_advances": 0
                },
                "errors": []
            }

            # Sync the client_entry (ACCOUNT/tenant row) FIRST. Every child table
            # below carries a client_id FK to it — if the account was created
            # locally (offline) and its client_entry never reached Supabase, every
            # child insert fails its FK and the whole sync uploads 0 rows.
            try:
                count = self._sync_client_entry(client_id)
                results["synced"]["client_entry"] = count
                logger.info(f"[SyncService] Uploaded {count} client_entry (account)")
            except Exception as e:
                logger.error(f"[SyncService] client_entry sync failed: {e}")
                results["errors"].append(f"client_entry: {str(e)}")

            # Sync GST bills
            try:
                count = self._sync_gst_bills(client_id)
                results["synced"]["gst_bills"] = count
                logger.info(f"[SyncService] Uploaded {count} GST bills")
            except Exception as e:
                logger.error(f"[SyncService] GST bill sync failed: {e}")
                results["errors"].append(f"GST bills: {str(e)}")

            # Sync non-GST bills
            try:
                count = self._sync_non_gst_bills(client_id)
                results["synced"]["non_gst_bills"] = count
                logger.info(f"[SyncService] Uploaded {count} non-GST bills")
            except Exception as e:
                logger.error(f"[SyncService] Non-GST bill sync failed: {e}")
                results["errors"].append(f"Non-GST bills: {str(e)}")

            # Sync stock
            try:
                count = self._sync_stock(client_id)
                results["synced"]["stock"] = count
                logger.info(f"[SyncService] Uploaded {count} stock entries")
            except Exception as e:
                logger.error(f"[SyncService] Stock sync failed: {e}")
                results["errors"].append(f"Stock: {str(e)}")

            # Sync customers
            try:
                count = self._sync_customers(client_id)
                results["synced"]["customers"] = count
                logger.info(f"[SyncService] Uploaded {count} customers")
            except Exception as e:
                logger.error(f"[SyncService] Customer sync failed: {e}")
                results["errors"].append(f"Customers: {str(e)}")

# Sync expenses
            try:
                count = self._sync_expenses(client_id)
                results["synced"]["expenses"] = count
                logger.info(f"[SyncService] Uploaded {count} expenses")
            except Exception as e:
                logger.error(f"[SyncService] Expense sync failed: {e}")
                results["errors"].append(f"Expenses: {str(e)}")

            # Sync expense summaries
            try:
                count = self._sync_expense_summaries(client_id)
                results["synced"]["expense_summaries"] = count
                logger.info(f"[SyncService] Uploaded {count} expense summaries")
            except Exception as e:
                logger.error(f"[SyncService] Expense summary sync failed: {e}")
                results["errors"].append(f"Expense summaries: {str(e)}")

            # Sync bulk stock orders
            try:
                count = self._sync_bulk_orders(client_id)
                results["synced"]["bulk_orders"] = count
                logger.info(f"[SyncService] Uploaded {count} bulk orders")
            except Exception as e:
                logger.error(f"[SyncService] Bulk order sync failed: {e}")
                results["errors"].append(f"Bulk orders: {str(e)}")

            # Sync bulk stock order items
            try:
                count = self._sync_bulk_order_items(client_id)
                results["synced"]["bulk_order_items"] = count
                logger.info(f"[SyncService] Uploaded {count} bulk order items")
            except Exception as e:
                logger.error(f"[SyncService] Bulk order item sync failed: {e}")
                results["errors"].append(f"Bulk order items: {str(e)}")

            # Sync users (password_hash included on both INSERT and the
            # ON CONFLICT UPDATE, so a local password change actually reaches the
            # cloud — without the UPDATE clause the old hash stayed valid on the
            # live server / other devices).
            try:
                count = self._sync_users(client_id)
                results["synced"]["users"] = count
                logger.info(f"[SyncService] Uploaded {count} users")
            except Exception as e:
                logger.error(f"[SyncService] User sync failed: {e}")
                results["errors"].append(f"Users: {str(e)}")

            # Sync user permissions
            try:
                count = self._sync_user_permissions(client_id)
                results["synced"]["user_permissions"] = count
                logger.info(f"[SyncService] Uploaded {count} user permissions")
            except Exception as e:
                logger.error(f"[SyncService] User permission sync failed: {e}")
                results["errors"].append(f"User permissions: {str(e)}")

            # Sync reports
            try:
                count = self._sync_reports(client_id)
                results["synced"]["reports"] = count
                logger.info(f"[SyncService] Uploaded {count} reports")
            except Exception as e:
                logger.error(f"[SyncService] Report sync failed: {e}")
                results["errors"].append(f"Reports: {str(e)}")

            # Sync notes
            try:
                count = self._sync_notes(client_id)
                results["synced"]["notes"] = count
                logger.info(f"[SyncService] Uploaded {count} notes")
            except Exception as e:
                logger.error(f"[SyncService] Notes sync failed: {e}")
                results["errors"].append(f"Notes: {str(e)}")

            # Sync salary/attendance tables. Order matters for PostgreSQL FKs:
            # employees first, then cycles (FK→employees), then attendance
            # (FK→employees) and advances (FK→cycles). Users are already synced
            # above, so created_by/marked_by/paid_by/recorded_by resolve.
            try:
                count = self._sync_employees(client_id)
                results["synced"]["employees"] = count
                logger.info(f"[SyncService] Uploaded {count} employees")
            except Exception as e:
                logger.error(f"[SyncService] Employee sync failed: {e}")
                results["errors"].append(f"Employees: {str(e)}")

            try:
                count = self._sync_salary_cycles(client_id)
                results["synced"]["salary_cycles"] = count
                logger.info(f"[SyncService] Uploaded {count} salary cycles")
            except Exception as e:
                logger.error(f"[SyncService] Salary cycle sync failed: {e}")
                results["errors"].append(f"Salary cycles: {str(e)}")

            try:
                count = self._sync_employee_attendance(client_id)
                results["synced"]["employee_attendance"] = count
                logger.info(f"[SyncService] Uploaded {count} attendance records")
            except Exception as e:
                logger.error(f"[SyncService] Attendance sync failed: {e}")
                results["errors"].append(f"Attendance: {str(e)}")

            try:
                count = self._sync_salary_advances(client_id)
                results["synced"]["salary_advances"] = count
                logger.info(f"[SyncService] Uploaded {count} salary advances")
            except Exception as e:
                logger.error(f"[SyncService] Salary advance sync failed: {e}")
                results["errors"].append(f"Salary advances: {str(e)}")

            # Generic Group-A owner tables (registry-driven). FK-safe order is
            # baked into _OWNER_SYNC_TABLES (parents before children).
            for entry in _OWNER_SYNC_TABLES:
                t = entry['table']
                try:
                    count = self._sync_owner_table(entry, client_id)
                    results["synced"][t] = count
                    if count:
                        logger.info(f"[SyncService] Uploaded {count} {t}")
                except Exception as e:
                    logger.error(f"[SyncService] {t} sync failed: {e}")
                    results["errors"].append(f"{t}: {str(e)}")

            self.last_sync_time = get_current_time()

            # Calculate totals
            total_synced = sum(results["synced"].values())
            logger.info(f"[SyncService] Upload sync complete. Total: {total_synced} records")

            # Honest status: a per-table failure means the upload is incomplete,
            # not a full success — surface it so the UI doesn't claim "Synced".
            if results["errors"]:
                results["status"] = "partial"

            return results

        except Exception as e:
            logger.error(f"[SyncService] Sync failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": get_current_time().isoformat()
            }

    # ==========================================
    # UPLOAD SYNC METHODS (SQLite → Supabase)
    # ==========================================

    def _mark_as_synced(self, table_name, id_column, ids):
        """Helper to mark records as synced in SQLite"""
        if not ids:
            return

        placeholders = ','.join([f":id_{i}" for i in range(len(ids))])
        params = {"synced_at": get_current_time().isoformat()}
        params.update({f"id_{i}": id_val for i, id_val in enumerate(ids)})

        with self.sqlite_engine.connect() as sqlite_conn:
            sqlite_conn.execute(text(f"""
                UPDATE {table_name}
                SET synced_at = :synced_at
                WHERE {id_column} IN ({placeholders})
            """), params)
            sqlite_conn.commit()

    def _push_batch(self, label, insert_sql, payload, ids):
        """Push pending rows to Postgres in ONE transaction (single commit).

        Replaces the old per-row commit pattern — which cost one network
        round-trip + server fsync PER ROW and was the dominant cause of slow
        syncs. All rows go in a single executemany + one commit. If the batch
        fails (e.g. a single bad/orphan row, like a FK to a parent missing on
        the cloud), it splits the batch in half and retries each half, so a few
        bad rows are isolated in O(log n) round-trips instead of O(n) row-by-row.

        Returns the list of ids that were successfully synced.
        """
        if not payload:
            return []
        with self.postgres_engine.connect() as pg_conn:
            return self._push_batch_split(pg_conn, label, insert_sql, list(payload), list(ids), is_top=True)

    def _push_batch_split(self, pg_conn, label, insert_sql, payload, ids, is_top=False):
        """Insert payload as one batch; on failure, divide-and-conquer so a few
        bad rows don't force a full row-by-row pass over the whole set. Clean
        batches commit in a single round-trip; only the sub-batches that contain
        a bad row recurse down to it. Returns the ids that synced successfully."""
        if not payload:
            return []
        try:
            pg_conn.execute(text(insert_sql), payload)  # executemany
            pg_conn.commit()
            return list(ids)
        except Exception as e:
            pg_conn.rollback()
            if len(payload) == 1:
                # Isolated to the offending row — skip it (orphan/bad data) and
                # let the rest of the sync proceed. Logged, not retried forever.
                logger.error(f"[SyncService] {label}: row {ids[0]} skipped: {str(e)[:150]}")
                return []
            if is_top:
                logger.warning(
                    f"[SyncService] {label}: batch of {len(payload)} failed "
                    f"({str(e)[:120]}); splitting to isolate bad rows"
                )
            mid = len(payload) // 2
            left = self._push_batch_split(pg_conn, label, insert_sql, payload[:mid], ids[:mid])
            right = self._push_batch_split(pg_conn, label, insert_sql, payload[mid:], ids[mid:])
            return left + right

    def _client_scope(self, client_filter, client_id, params):
        """Return a WHERE fragment that restricts a pending-upload query to a
        single owner's data, so a device never pushes another owner's rows.

        client_filter:
          'client_id' — table has a client_id column (direct match)
          'via_user'  — no client_id; scope through user_id -> users.client_id
          'via_order' — no client_id; scope through order_id -> bulk_stock_order
          None        — no scoping
        No-op (returns '') when client_id is falsy, preserving the old
        sync-everything behaviour for callers that don't pass one.
        """
        if not client_id or not client_filter:
            return ""
        params["client_id"] = client_id
        if client_filter == 'via_user':
            return " AND user_id IN (SELECT user_id FROM users WHERE client_id = :client_id)"
        if client_filter == 'via_order':
            return " AND order_id IN (SELECT order_id FROM bulk_stock_order WHERE client_id = :client_id)"
        return " AND client_id = :client_id"

    def _upload_pending(self, table, id_column, column_types, insert_sql,
                        client_id=None, client_filter='client_id',
                        order_by='created_at', preprocess=None):
        """Owner-scoped, batched upload of rows pending sync (synced_at IS NULL)
        from SQLite -> Postgres.

        - Scopes to one owner via _client_scope when client_id is given.
        - Batches the whole set into ONE commit via _push_batch (was per-row).
        Returns the number of rows synced.
        """
        params = {}
        where = "WHERE synced_at IS NULL" + self._client_scope(client_filter, client_id, params)
        with self.sqlite_engine.connect() as sqlite_conn:
            rows = [dict(r._mapping) for r in sqlite_conn.execute(
                text(f"SELECT * FROM {table} {where} ORDER BY {order_by} LIMIT 1000"), params)]
        if not rows:
            return 0
        # executemany needs every param dict to carry exactly the SQL's bind
        # keys — SELECT * brings extra columns, so filter to the named binds.
        bind_keys = set(re.findall(r':(\w+)', insert_sql))
        payload, ids = [], []
        for i, rec in enumerate(rows):
            converted = TypeConverter.convert_dict_from_sqlite(rec, column_types)
            if preprocess:
                preprocess(converted)
            # Surface schema/SQL drift loudly: a bind key absent from the source
            # row would silently become NULL (and fail a NOT NULL column). Check
            # once per table rather than swallowing it row-by-row.
            if i == 0:
                missing = bind_keys - set(converted.keys())
                if missing:
                    logger.warning(
                        f"[SyncService] {table}: INSERT binds {sorted(missing)} are missing "
                        f"from source rows — will upload NULL. Check migration/schema drift."
                    )
            payload.append({k: converted.get(k) for k in bind_keys})
            ids.append(rec[id_column])
        synced_ids = self._push_batch(table, insert_sql, payload, ids)
        self._mark_as_synced(table, id_column, synced_ids)
        return len(synced_ids)

    def _pg_client_entry_types(self):
        """Cache {column_name: data_type} for the CLOUD client_entry table, so we
        only upload columns the cloud actually has (its schema may lag local
        drift: custom_monthly_amount, lemon_squeezy_*, etc.)."""
        if getattr(self, '_client_entry_pg_types', None) is not None:
            return self._client_entry_pg_types
        types = {}
        try:
            with self.postgres_engine.connect() as pg_conn:
                for r in pg_conn.execute(text(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_name = 'client_entry'"
                )):
                    types[r[0]] = r[1]
        except Exception as e:
            logger.error(f"[SyncService] Could not read cloud client_entry schema: {e}")
        self._client_entry_pg_types = types
        return types

    def _sync_client_entry(self, client_id=None):
        """Upload the client_entry (the ACCOUNT/tenant row) to Postgres.

        Runs FIRST in sync_all, before any child table. users/billing/stock/
        payment_transaction/branches all carry a client_id FK to client_entry —
        an account created locally (offline) whose client_entry never reached
        the cloud makes every child insert fail its FK, so the whole sync lands
        0 rows. This upserts the parent so the children can follow.

        client_entry has no `synced_at` column (it's a single master row per
        tenant, not an append-only stream), so this can't use _upload_pending.
        It always upserts — idempotent via ON CONFLICT — which is trivially cheap
        for one row and guarantees the parent exists.
        """
        params = {}
        where = "WHERE 1=1"
        if client_id:
            where += " AND client_id = :client_id"
            params["client_id"] = client_id
        with self.sqlite_engine.connect() as sqlite_conn:
            rows = [dict(r._mapping) for r in sqlite_conn.execute(
                text(f"SELECT * FROM client_entry {where}"), params)]
        if not rows:
            return 0

        pg_types = self._pg_client_entry_types()
        if not pg_types:
            return 0

        # Only upload columns present on BOTH sides.
        insert_cols = [c for c in rows[0].keys() if c in pg_types]
        if 'client_id' not in insert_cols:
            return 0
        cols_sql = ', '.join(insert_cols)
        binds_sql = ', '.join(f':{c}' for c in insert_cols)
        updates = ', '.join(f'{c} = EXCLUDED.{c}' for c in insert_cols if c != 'client_id')
        insert_sql = (
            f"INSERT INTO client_entry ({cols_sql}) VALUES ({binds_sql}) "
            f"ON CONFLICT (client_id) DO UPDATE SET {updates}"
        )

        # client_entry has no cloud FK, but plan_id points at the subscription_plan
        # catalog whose UUIDs differ. Remap local->cloud by name so the WEB can
        # resolve which plan the owner selected (a local-only test plan stays as-is).
        plan_up = self._plan_id_maps()[0] if 'plan_id' in insert_cols else None
        payload, ids = [], []
        for rec in rows:
            row = {}
            for c in insert_cols:
                v = rec.get(c)
                # SQLite has no bool type (stores 0/1); Postgres won't cast int->bool.
                if pg_types[c] == 'boolean' and isinstance(v, int):
                    v = bool(v)
                elif isinstance(v, (dict, list)):
                    v = json.dumps(v)
                row[c] = v
            if plan_up is not None and row.get('plan_id') is not None:
                row['plan_id'] = plan_up.get(str(row['plan_id']), row['plan_id'])
            payload.append(row)
            ids.append(rec['client_id'])
        return len(self._push_batch('client_entry', insert_sql, payload, ids))

    def _sync_gst_bills(self, client_id=None):
        """Owner-scoped, batched GST-bill upload."""
        insert_sql = """
            INSERT INTO gst_billing (
                bill_id, client_id, bill_number, bill_prefix, customer_name, customer_phone,
                customer_address, items, subtotal, gst_percentage, gst_amount, final_amount,
                payment_type, amount_received, discount_percentage, discount_amount,
                negotiable_amount, status, created_by, created_at, updated_at
            ) VALUES (
                :bill_id, :client_id, :bill_number, :bill_prefix, :customer_name, :customer_phone,
                :customer_address, :items, :subtotal, :gst_percentage, :gst_amount, :final_amount,
                :payment_type, :amount_received, :discount_percentage, :discount_amount,
                :negotiable_amount, :status, :created_by, :created_at, :updated_at
            )
            ON CONFLICT (bill_id) DO UPDATE SET
                items = EXCLUDED.items,
                subtotal = EXCLUDED.subtotal,
                gst_percentage = EXCLUDED.gst_percentage,
                gst_amount = EXCLUDED.gst_amount,
                final_amount = EXCLUDED.final_amount,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        def _prep(c):
            if c.get('customer_address') is None:
                c['customer_address'] = ''
            if c.get('gst_percentage') is None:
                c['gst_percentage'] = 0
            if 'items' in c and not isinstance(c['items'], str):
                c['items'] = json.dumps(c['items'])
        return self._upload_pending('gst_billing', 'bill_id', BILLING_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, preprocess=_prep)

    def _sync_non_gst_bills(self, client_id=None):
        """Owner-scoped, batched non-GST-bill upload."""
        insert_sql = """
            INSERT INTO non_gst_billing (
                bill_id, client_id, bill_number, bill_prefix, customer_name, customer_phone,
                customer_gstin, items, total_amount, payment_type, amount_received,
                discount_percentage, discount_amount, negotiable_amount, status,
                created_by, created_at, updated_at
            ) VALUES (
                :bill_id, :client_id, :bill_number, :bill_prefix, :customer_name, :customer_phone,
                :customer_gstin, :items, :total_amount, :payment_type, :amount_received,
                :discount_percentage, :discount_amount, :negotiable_amount, :status,
                :created_by, :created_at, :updated_at
            )
            ON CONFLICT (bill_id) DO UPDATE SET
                items = EXCLUDED.items,
                total_amount = EXCLUDED.total_amount,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        def _prep(c):
            if 'items' in c and not isinstance(c['items'], str):
                c['items'] = json.dumps(c['items'])
        return self._upload_pending('non_gst_billing', 'bill_id', BILLING_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, preprocess=_prep)

    def _sync_stock(self, client_id=None):
        """Owner-scoped, batched stock upload."""
        insert_sql = """
            INSERT INTO stock_entry (
                product_id, client_id, product_name, category, quantity, rate,
                cost_price, mrp, pricing, unit, low_stock_alert, item_code,
                barcode, gst_percentage, hsn_code, created_at, updated_at
            ) VALUES (
                :product_id, :client_id, :product_name, :category, :quantity, :rate,
                :cost_price, :mrp, :pricing, :unit, :low_stock_alert, :item_code,
                :barcode, :gst_percentage, :hsn_code, :created_at, :updated_at
            )
            ON CONFLICT (product_id) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                category = EXCLUDED.category,
                quantity = EXCLUDED.quantity,
                rate = EXCLUDED.rate,
                cost_price = EXCLUDED.cost_price,
                mrp = EXCLUDED.mrp,
                pricing = EXCLUDED.pricing,
                unit = EXCLUDED.unit,
                low_stock_alert = EXCLUDED.low_stock_alert,
                item_code = EXCLUDED.item_code,
                barcode = EXCLUDED.barcode,
                gst_percentage = EXCLUDED.gst_percentage,
                hsn_code = EXCLUDED.hsn_code,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('stock_entry', 'product_id', STOCK_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, order_by='updated_at')

    def _sync_customers(self, client_id=None):
        """Owner-scoped, batched customer upload."""
        insert_sql = """
            INSERT INTO customer (
                customer_id, client_id, customer_code, customer_name, customer_phone,
                customer_email, customer_address, customer_gstin, customer_city,
                customer_state, customer_pincode, total_bills, total_spent,
                last_purchase_date, first_purchase_date, status, notes,
                created_at, updated_at
            ) VALUES (
                :customer_id, :client_id, :customer_code, :customer_name, :customer_phone,
                :customer_email, :customer_address, :customer_gstin, :customer_city,
                :customer_state, :customer_pincode, :total_bills, :total_spent,
                :last_purchase_date, :first_purchase_date, :status, :notes,
                :created_at, :updated_at
            )
            ON CONFLICT (customer_id) DO UPDATE SET
                customer_code = EXCLUDED.customer_code,
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                customer_email = EXCLUDED.customer_email,
                customer_address = EXCLUDED.customer_address,
                customer_gstin = EXCLUDED.customer_gstin,
                customer_city = EXCLUDED.customer_city,
                customer_state = EXCLUDED.customer_state,
                customer_pincode = EXCLUDED.customer_pincode,
                total_bills = EXCLUDED.total_bills,
                total_spent = EXCLUDED.total_spent,
                last_purchase_date = EXCLUDED.last_purchase_date,
                first_purchase_date = EXCLUDED.first_purchase_date,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('customer', 'customer_id', CUSTOMER_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, order_by='updated_at')

    def _sync_expenses(self, client_id=None):
        """Owner-scoped, batched expense upload."""
        insert_sql = """
            INSERT INTO expense (
                expense_id, client_id, category, description, amount, expense_date,
                payment_method, receipt_url, notes, extra_data, created_by, created_at, updated_at
            ) VALUES (
                :expense_id, :client_id, :category, :description, :amount, :expense_date,
                :payment_method, :receipt_url, :notes, :extra_data, :created_by, :created_at, :updated_at
            )
            ON CONFLICT (expense_id) DO UPDATE SET
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                amount = EXCLUDED.amount,
                expense_date = EXCLUDED.expense_date,
                payment_method = EXCLUDED.payment_method,
                receipt_url = EXCLUDED.receipt_url,
                notes = EXCLUDED.notes,
                extra_data = EXCLUDED.extra_data,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        def _prep(c):
            if 'extra_data' in c and not isinstance(c['extra_data'], str):
                c['extra_data'] = json.dumps(c['extra_data']) if c['extra_data'] else None
        return self._upload_pending('expense', 'expense_id', EXPENSE_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, preprocess=_prep)

    def _sync_expense_summaries(self, client_id=None):
        """Owner-scoped, batched expense-summary upload."""
        insert_sql = """
            INSERT INTO expense_summary (
                summary_id, client_id, period_type, period_start, period_end,
                total_expenses, category_breakdown, expense_count, created_at, updated_at
            ) VALUES (
                :summary_id, :client_id, :period_type, :period_start, :period_end,
                :total_expenses, :category_breakdown, :expense_count, :created_at, :updated_at
            )
            ON CONFLICT (summary_id) DO UPDATE SET
                total_expenses = EXCLUDED.total_expenses,
                category_breakdown = EXCLUDED.category_breakdown,
                expense_count = EXCLUDED.expense_count,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        def _prep(c):
            if 'category_breakdown' in c and not isinstance(c['category_breakdown'], str):
                c['category_breakdown'] = json.dumps(c['category_breakdown']) if c['category_breakdown'] else None
        return self._upload_pending('expense_summary', 'summary_id', EXPENSE_SUMMARY_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, preprocess=_prep)

    def _sync_bulk_orders(self, client_id=None):
        """Owner-scoped, batched bulk-stock-order upload."""
        insert_sql = """
            INSERT INTO bulk_stock_order (
                order_id, client_id, order_number, supplier_name, supplier_contact,
                order_date, expected_delivery_date, status, notes, created_by,
                created_at, updated_at, received_at
            ) VALUES (
                :order_id, :client_id, :order_number, :supplier_name, :supplier_contact,
                :order_date, :expected_delivery_date, :status, :notes, :created_by,
                :created_at, :updated_at, :received_at
            )
            ON CONFLICT (order_id) DO UPDATE SET
                supplier_name = EXCLUDED.supplier_name,
                supplier_contact = EXCLUDED.supplier_contact,
                expected_delivery_date = EXCLUDED.expected_delivery_date,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at,
                received_at = EXCLUDED.received_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('bulk_stock_order', 'order_id', BULK_ORDER_COLUMN_TYPES, insert_sql,
                                    client_id=client_id)

    def _sync_bulk_order_items(self, client_id=None):
        """Owner-scoped, batched bulk-order-item upload.

        Items carry no client_id; they are scoped through their parent order
        (order_id -> bulk_stock_order.client_id) so only this owner's items sync.
        """
        insert_sql = """
            INSERT INTO bulk_stock_order_item (
                item_id, order_id, product_id, product_name, category,
                quantity_ordered, quantity_received, unit, cost_price, selling_price,
                mrp, barcode, item_code, gst_percentage, hsn_code, notes,
                created_at, updated_at
            ) VALUES (
                :item_id, :order_id, :product_id, :product_name, :category,
                :quantity_ordered, :quantity_received, :unit, :cost_price, :selling_price,
                :mrp, :barcode, :item_code, :gst_percentage, :hsn_code, :notes,
                :created_at, :updated_at
            )
            ON CONFLICT (item_id) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                category = EXCLUDED.category,
                quantity_ordered = EXCLUDED.quantity_ordered,
                quantity_received = EXCLUDED.quantity_received,
                cost_price = EXCLUDED.cost_price,
                selling_price = EXCLUDED.selling_price,
                mrp = EXCLUDED.mrp,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('bulk_stock_order_item', 'item_id', BULK_ORDER_ITEM_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, client_filter='via_order')

    def _sync_users(self, client_id=None):
        """Owner-scoped, batched user upload."""
        insert_sql = """
            INSERT INTO users (
                user_id, email, password_hash, client_id, role, is_super_admin,
                created_at, last_login, is_active, full_name, phone, department,
                created_by, updated_at, updated_by, deleted_at
            ) VALUES (
                :user_id, :email, :password_hash, :client_id, :role, :is_super_admin,
                :created_at, :last_login, :is_active, :full_name, :phone, :department,
                :created_by, :updated_at, :updated_by, :deleted_at
            )
            ON CONFLICT (user_id) DO UPDATE SET
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                is_super_admin = EXCLUDED.is_super_admin,
                last_login = EXCLUDED.last_login,
                is_active = EXCLUDED.is_active,
                full_name = EXCLUDED.full_name,
                phone = EXCLUDED.phone,
                department = EXCLUDED.department,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by,
                deleted_at = EXCLUDED.deleted_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('users', 'user_id', USER_COLUMN_TYPES, insert_sql,
                                    client_id=client_id)

    def _perm_id_maps(self):
        """Local<->cloud permission_id maps, matched by the stable permission_name.

        `permissions` is a GLOBAL reference catalog seeded INDEPENDENTLY in SQLite
        and Postgres, so the SAME permission has DIFFERENT UUIDs on each side.
        user_permissions.permission_id is an FK to it — uploading the raw local
        UUID fails (the cloud has never seen it). We remap by permission_name
        rather than pushing duplicate catalog rows into the shared table.
        Cached per process. Returns (local_to_cloud, cloud_to_local).
        """
        if getattr(self, '_perm_maps', None) is not None:
            return self._perm_maps
        local_to_cloud, cloud_to_local = {}, {}
        try:
            with self.sqlite_engine.connect() as s:
                local = {r[0]: r[1] for r in s.execute(
                    text("SELECT permission_id, permission_name FROM permissions"))}
            with self.postgres_engine.connect() as p:
                cloud = {r[1]: str(r[0]) for r in p.execute(
                    text("SELECT permission_id, permission_name FROM permissions"))}
            for lid, name in local.items():
                cid = cloud.get(name)
                if cid:
                    local_to_cloud[str(lid)] = cid
                    cloud_to_local[cid] = str(lid)
        except Exception as e:
            logger.error(f"[SyncService] Could not build permission id map: {e}")
        self._perm_maps = (local_to_cloud, cloud_to_local)
        return self._perm_maps

    def _plan_id_maps(self):
        """Local<->cloud subscription_plan.plan_id maps, matched by plan `name`.

        Same problem as permissions: subscription_plan is a catalog seeded with
        DIFFERENT UUIDs locally vs. cloud, and payment_transaction.plan_id is a
        NOT-NULL FK to it. Remap by the stable plan name. A local-only plan (e.g.
        the throwaway 1-rupee test plan whose name has no cloud twin) simply
        stays unmapped — its payment row is skipped rather than syncing a dangling
        plan into the shared catalog. Cached per process.
        Returns (local_to_cloud, cloud_to_local).
        """
        if getattr(self, '_plan_maps', None) is not None:
            return self._plan_maps
        local_to_cloud, cloud_to_local = {}, {}
        try:
            with self.sqlite_engine.connect() as s:
                local = {r[0]: r[1] for r in s.execute(
                    text("SELECT plan_id, name FROM subscription_plan"))}
            with self.postgres_engine.connect() as p:
                cloud = {r[1]: str(r[0]) for r in p.execute(
                    text("SELECT plan_id, name FROM subscription_plan"))}
            for lid, name in local.items():
                cid = cloud.get(name)
                if cid:
                    local_to_cloud[str(lid)] = cid
                    cloud_to_local[cid] = str(lid)
        except Exception as e:
            logger.error(f"[SyncService] Could not build plan id map: {e}")
        self._plan_maps = (local_to_cloud, cloud_to_local)
        return self._plan_maps

    def _sync_user_permissions(self, client_id=None):
        """Owner-scoped, batched user-permission upload.

        user_permissions has no client_id; scope through user_id -> users.
        permission_id is remapped local->cloud by name (see _perm_id_maps); rows
        for a permission the cloud catalog lacks stay unmapped and are isolated
        out by the FK-split logic.
        """
        insert_sql = """
            INSERT INTO user_permissions (
                id, user_id, permission_id, granted_at, granted_by, updated_at
            ) VALUES (
                :id, :user_id, :permission_id, :granted_at, :granted_by, :updated_at
            )
            ON CONFLICT (id) DO UPDATE SET
                permission_id = EXCLUDED.permission_id,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        local_to_cloud, _ = self._perm_id_maps()

        def _prep(c):
            pid = c.get('permission_id')
            if pid is not None:
                c['permission_id'] = local_to_cloud.get(str(pid), pid)

        return self._upload_pending('user_permissions', 'id', USER_PERMISSION_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, client_filter='via_user', order_by='granted_at',
                                    preprocess=_prep)

    def _sync_reports(self, client_id=None):
        """Owner-scoped, batched report upload."""
        insert_sql = """
            INSERT INTO report (
                report_id, client_id, report_type, date_from, date_to,
                total_gst_bills, total_non_gst_bills, total_gst_amount, total_non_gst_amount,
                total_revenue, payment_breakdown, file_url, generated_by, created_at, updated_at
            ) VALUES (
                :report_id, :client_id, :report_type, :date_from, :date_to,
                :total_gst_bills, :total_non_gst_bills, :total_gst_amount, :total_non_gst_amount,
                :total_revenue, :payment_breakdown, :file_url, :generated_by, :created_at, :updated_at
            )
            ON CONFLICT (report_id) DO UPDATE SET
                total_gst_bills = EXCLUDED.total_gst_bills,
                total_non_gst_bills = EXCLUDED.total_non_gst_bills,
                total_gst_amount = EXCLUDED.total_gst_amount,
                total_non_gst_amount = EXCLUDED.total_non_gst_amount,
                total_revenue = EXCLUDED.total_revenue,
                payment_breakdown = EXCLUDED.payment_breakdown,
                file_url = EXCLUDED.file_url,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        def _prep(c):
            if 'payment_breakdown' in c and not isinstance(c['payment_breakdown'], str):
                c['payment_breakdown'] = json.dumps(c['payment_breakdown']) if c['payment_breakdown'] else None
        return self._upload_pending('report', 'report_id', REPORT_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, preprocess=_prep)

    def _sync_notes(self, client_id=None):
        """Owner-scoped, batched note upload.

        notes has no client_id; scope through user_id -> users.
        """
        insert_sql = """
            INSERT INTO notes (
                note_id, user_id, title, content, created_at, updated_at, expires_at
            ) VALUES (
                :note_id, :user_id, :title, :content, :created_at, :updated_at, :expires_at
            )
            ON CONFLICT (note_id) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                updated_at = EXCLUDED.updated_at,
                expires_at = EXCLUDED.expires_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('notes', 'note_id', NOTES_COLUMN_TYPES, insert_sql,
                                    client_id=client_id, client_filter='via_user')

    def _sync_employees(self, client_id=None):
        """Owner-scoped, batched employee upload."""
        insert_sql = """
            INSERT INTO employees (
                employee_id, client_id, branch_id, name, phone, pay_type, rate,
                is_active, ot_multiplier, created_by, created_at, updated_at
            ) VALUES (
                :employee_id, :client_id, :branch_id, :name, :phone, :pay_type, :rate,
                :is_active, :ot_multiplier, :created_by, :created_at, :updated_at
            )
            ON CONFLICT (employee_id) DO UPDATE SET
                branch_id = EXCLUDED.branch_id,
                name = EXCLUDED.name,
                phone = EXCLUDED.phone,
                pay_type = EXCLUDED.pay_type,
                rate = EXCLUDED.rate,
                is_active = EXCLUDED.is_active,
                ot_multiplier = EXCLUDED.ot_multiplier,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('employees', 'employee_id', EMPLOYEE_COLUMN_TYPES, insert_sql,
                                    client_id=client_id)

    def _sync_salary_cycles(self, client_id=None):
        """Owner-scoped, batched salary-cycle upload."""
        insert_sql = """
            INSERT INTO salary_cycles (
                cycle_id, employee_id, client_id, start_date, end_date, status,
                gross_salary, total_advances, net_salary, paid_at, paid_by,
                payment_note, rate_snapshot, pay_type_snap, full_day_mins,
                created_at, updated_at
            ) VALUES (
                :cycle_id, :employee_id, :client_id, :start_date, :end_date, :status,
                :gross_salary, :total_advances, :net_salary, :paid_at, :paid_by,
                :payment_note, :rate_snapshot, :pay_type_snap, :full_day_mins,
                :created_at, :updated_at
            )
            ON CONFLICT (cycle_id) DO UPDATE SET
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                status = EXCLUDED.status,
                gross_salary = EXCLUDED.gross_salary,
                total_advances = EXCLUDED.total_advances,
                net_salary = EXCLUDED.net_salary,
                paid_at = EXCLUDED.paid_at,
                paid_by = EXCLUDED.paid_by,
                payment_note = EXCLUDED.payment_note,
                rate_snapshot = EXCLUDED.rate_snapshot,
                pay_type_snap = EXCLUDED.pay_type_snap,
                full_day_mins = EXCLUDED.full_day_mins,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('salary_cycles', 'cycle_id', SALARY_CYCLE_COLUMN_TYPES, insert_sql,
                                    client_id=client_id)

    def _sync_employee_attendance(self, client_id=None):
        """Owner-scoped, batched attendance upload (includes soft-deleted rows)."""
        insert_sql = """
            INSERT INTO employee_attendance (
                attendance_id, employee_id, client_id, work_date, check_in, check_out,
                total_minutes, status, reason, auto_ot_minutes, approved_ot_minutes,
                marked_by, notes, is_active, deleted_at, created_at, updated_at
            ) VALUES (
                :attendance_id, :employee_id, :client_id, :work_date, :check_in, :check_out,
                :total_minutes, :status, :reason, :auto_ot_minutes, :approved_ot_minutes,
                :marked_by, :notes, :is_active, :deleted_at, :created_at, :updated_at
            )
            ON CONFLICT (attendance_id) DO UPDATE SET
                work_date = EXCLUDED.work_date,
                check_in = EXCLUDED.check_in,
                check_out = EXCLUDED.check_out,
                total_minutes = EXCLUDED.total_minutes,
                status = EXCLUDED.status,
                reason = EXCLUDED.reason,
                auto_ot_minutes = EXCLUDED.auto_ot_minutes,
                approved_ot_minutes = EXCLUDED.approved_ot_minutes,
                notes = EXCLUDED.notes,
                is_active = EXCLUDED.is_active,
                deleted_at = EXCLUDED.deleted_at,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('employee_attendance', 'attendance_id', EMPLOYEE_ATTENDANCE_COLUMN_TYPES,
                                    insert_sql, client_id=client_id)

    def _sync_salary_advances(self, client_id=None):
        """Owner-scoped, batched salary-advance upload."""
        insert_sql = """
            INSERT INTO salary_advances (
                advance_id, employee_id, client_id, cycle_id, amount, advance_date,
                notes, recorded_by, created_at, updated_at
            ) VALUES (
                :advance_id, :employee_id, :client_id, :cycle_id, :amount, :advance_date,
                :notes, :recorded_by, :created_at, :updated_at
            )
            ON CONFLICT (advance_id) DO UPDATE SET
                amount = EXCLUDED.amount,
                advance_date = EXCLUDED.advance_date,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at,
                synced_at = CURRENT_TIMESTAMP
        """
        return self._upload_pending('salary_advances', 'advance_id', SALARY_ADVANCE_COLUMN_TYPES, insert_sql,
                                    client_id=client_id)

    # ==========================================
    # DOWNLOAD SYNC METHODS (Supabase → SQLite)
    # ==========================================

    def download_all(self, client_id):
        """
        Download all data from Supabase to SQLite for a specific client.
        Uses Last-Write-Wins conflict resolution.

        Args:
            client_id: The client UUID to download data for

        Returns:
            dict: Download results with counts
        """
        if not self.postgres_engine:
            logger.warning("[SyncService] Not initialized - skipping download")
            return {"status": "skipped", "reason": "not_initialized"}

        try:
            logger.info(f"[SyncService] Starting download sync for client {client_id}...")

            results = {
                "status": "success",
                "timestamp": get_current_time().isoformat(),
                "direction": "download",
                "client_id": client_id,
                "downloaded": {
                    "users": 0,
                    "user_permissions": 0,
                    "notes": 0,
                    "gst_bills": 0,
                    "non_gst_bills": 0,
                    "stock": 0,
                    "customers": 0,
                    "expenses": 0,
                    "expense_summaries": 0,
                    "bulk_orders": 0,
                    "bulk_order_items": 0,
                    "reports": 0,
                    "employees": 0,
                    "salary_cycles": 0,
                    "employee_attendance": 0,
                    "salary_advances": 0
                },
                "errors": []
            }

            # Get last download time for incremental sync
            last_download = self._get_last_download_time(client_id)

            # Download each table. users FIRST so user_permissions/notes (which
            # reference user_id) and any created_by FKs resolve.
            tables = [
                ("users", self._download_users),
                ("user_permissions", self._download_user_permissions),
                ("notes", self._download_notes),
                ("gst_bills", self._download_gst_bills),
                ("non_gst_bills", self._download_non_gst_bills),
                ("stock", self._download_stock),
                ("customers", self._download_customers),
                ("expenses", self._download_expenses),
                ("expense_summaries", self._download_expense_summaries),
                ("bulk_orders", self._download_bulk_orders),
                ("bulk_order_items", self._download_bulk_order_items),
                ("reports", self._download_reports),
                ("employees", self._download_employees),
                ("salary_cycles", self._download_salary_cycles),
                ("employee_attendance", self._download_employee_attendance),
                ("salary_advances", self._download_salary_advances),
            ]

            for table_name, download_func in tables:
                try:
                    count = download_func(client_id, last_download)
                    results["downloaded"][table_name] = count
                    logger.info(f"[SyncService] Downloaded {count} {table_name}")
                except Exception as e:
                    logger.error(f"[SyncService] {table_name} download failed: {e}")
                    results["errors"].append(f"{table_name}: {str(e)}")

            # Generic Group-A owner tables (registry-driven).
            for entry in _OWNER_SYNC_TABLES:
                t = entry['table']
                try:
                    count = self._download_owner_table(entry, client_id, last_download)
                    results["downloaded"][t] = count
                    if count:
                        logger.info(f"[SyncService] Downloaded {count} {t}")
                except Exception as e:
                    logger.error(f"[SyncService] {t} download failed: {e}")
                    results["errors"].append(f"{t}: {str(e)}")

            # Update last download time
            self._update_last_download_time(client_id)
            self.last_download_time = get_current_time()

            total_downloaded = sum(results["downloaded"].values())
            logger.info(f"[SyncService] Download sync complete. Total: {total_downloaded} records")

            if results["errors"]:
                results["status"] = "partial"

            return results

        except Exception as e:
            logger.error(f"[SyncService] Download failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": get_current_time().isoformat()
            }

    def initial_load(self, client_id):
        """
        Perform initial data load from Supabase to SQLite for a new device.
        Downloads ALL data for the client, ignoring timestamps.

        Args:
            client_id: The client UUID to load data for

        Returns:
            dict: Initial load results
        """
        if not self.postgres_engine:
            logger.warning("[SyncService] Not initialized - skipping initial load")
            return {"status": "skipped", "reason": "not_initialized"}

        try:
            logger.info(f"[SyncService] Starting initial load for client {client_id}...")

            # Pass None for last_download to get ALL records
            results = {
                "status": "success",
                "timestamp": get_current_time().isoformat(),
                "type": "initial_load",
                "client_id": client_id,
                "loaded": {
                    "users": 0,
                    "user_permissions": 0,
                    "notes": 0,
                    "gst_bills": 0,
                    "non_gst_bills": 0,
                    "stock": 0,
                    "customers": 0,
                    "expenses": 0,
                    "expense_summaries": 0,
                    "bulk_orders": 0,
                    "bulk_order_items": 0,
                    "reports": 0,
                    "employees": 0,
                    "salary_cycles": 0,
                    "employee_attendance": 0,
                    "salary_advances": 0
                },
                "errors": []
            }

            # Download each table (None = get all records). users FIRST for FKs.
            tables = [
                ("users", self._download_users),
                ("user_permissions", self._download_user_permissions),
                ("notes", self._download_notes),
                ("gst_bills", self._download_gst_bills),
                ("non_gst_bills", self._download_non_gst_bills),
                ("stock", self._download_stock),
                ("customers", self._download_customers),
                ("expenses", self._download_expenses),
                ("expense_summaries", self._download_expense_summaries),
                ("bulk_orders", self._download_bulk_orders),
                ("bulk_order_items", self._download_bulk_order_items),
                ("reports", self._download_reports),
                ("employees", self._download_employees),
                ("salary_cycles", self._download_salary_cycles),
                ("employee_attendance", self._download_employee_attendance),
                ("salary_advances", self._download_salary_advances),
            ]

            for table_name, download_func in tables:
                try:
                    count = download_func(client_id, None)  # None = all records
                    results["loaded"][table_name] = count
                    logger.info(f"[SyncService] Loaded {count} {table_name}")
                except Exception as e:
                    logger.error(f"[SyncService] {table_name} load failed: {e}")
                    results["errors"].append(f"{table_name}: {str(e)}")

            # Generic Group-A owner tables (registry-driven), full load.
            for entry in _OWNER_SYNC_TABLES:
                t = entry['table']
                try:
                    count = self._download_owner_table(entry, client_id, None)
                    results["loaded"][t] = count
                    if count:
                        logger.info(f"[SyncService] Loaded {count} {t}")
                except Exception as e:
                    logger.error(f"[SyncService] {t} load failed: {e}")
                    results["errors"].append(f"{t}: {str(e)}")

            # Mark initial load complete
            self._update_last_download_time(client_id)
            self._mark_initial_load_complete(client_id)

            total_loaded = sum(results["loaded"].values())
            logger.info(f"[SyncService] Initial load complete. Total: {total_loaded} records")

            if results["errors"]:
                results["status"] = "partial"

            return results

        except Exception as e:
            logger.error(f"[SyncService] Initial load failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": get_current_time().isoformat()
            }

    def _cloud_reachable(self, budget=4.0, per_try=1.5):
        """Fast preflight: can we open a TCP socket to the cloud DB host within a
        hard time budget? Offline-first must FAIL-FAST, not hang.

        Why this exists: the Postgres pooler host can resolve to several
        addresses (e.g. 3 IPv6/NAT64 entries). libpq applies connect_timeout
        PER address, so a dead network stalls ~3x the timeout (~30s) before the
        driver gives up — long enough to blow the client's 30s HTTP timeout and
        surface a scary "Failed to sync". A cheap socket probe with a shared
        wall-clock deadline lets us detect "offline" in a couple of seconds and
        skip the whole sync cleanly.
        """
        import socket
        import time as _time
        from urllib.parse import urlparse
        db_url = os.getenv('DB_URL', '')
        if not db_url:
            return False
        try:
            p = urlparse(db_url)
            host, port = p.hostname, (p.port or 5432)
        except Exception:
            return False
        if not host:
            return False
        deadline = _time.monotonic() + budget
        try:
            infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        except Exception:
            return False  # DNS itself failed — treat as offline
        for family, socktype, proto, _canon, sockaddr in infos:
            remaining = deadline - _time.monotonic()
            if remaining <= 0:
                break
            s = socket.socket(family, socktype, proto)
            try:
                s.settimeout(min(per_try, max(0.5, remaining)))
                s.connect(sockaddr)
                return True
            except Exception:
                continue
            finally:
                s.close()
        return False

    def full_sync(self, client_id):
        """
        Perform full bidirectional sync (upload then download).

        Args:
            client_id: The client UUID

        Returns:
            dict: Combined sync results
        """
        # Offline-first fail-fast: if the cloud DB isn't reachable, don't grind
        # through ~30s of per-address connect timeouts — return a clear "offline"
        # result in a couple of seconds. Local data is untouched and safe.
        if not self._cloud_reachable():
            logger.warning("[SyncService] Cloud unreachable — skipping sync (offline).")
            return {
                "status": "offline",
                "reason": "cloud_unreachable",
                "message": "Can't reach the sync server — you appear to be offline. "
                           "Your changes are saved locally and will sync automatically when you're back online.",
                "timestamp": get_current_time().isoformat(),
            }

        logger.info(f"[SyncService] Starting full bidirectional sync for client {client_id}...")

        upload_results = self.sync_all(client_id)
        download_results = self.download_all(client_id)

        return {
            "status": "success" if upload_results.get("status") == "success" and download_results.get("status") == "success" else "partial",
            "timestamp": get_current_time().isoformat(),
            "upload": upload_results,
            "download": download_results
        }

    def _get_last_download_time(self, client_id):
        """Get the last download time from sync_metadata"""
        try:
            with self.sqlite_engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT last_download_time FROM sync_metadata
                    WHERE client_id = :client_id AND table_name = 'all'
                """), {"client_id": client_id})
                row = result.fetchone()
                if row and row[0]:
                    return row[0]
        except Exception as e:
            logger.warning(f"[SyncService] Could not get last download time: {e}")
        return None

    def _update_last_download_time(self, client_id):
        """Update the last download time in sync_metadata"""
        try:
            import uuid as uuid_module
            with self.sqlite_engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO sync_metadata (id, client_id, table_name, last_download_time, updated_at)
                    VALUES (:id, :client_id, 'all', :time, :time)
                    ON CONFLICT (client_id, table_name) DO UPDATE SET
                        last_download_time = :time,
                        updated_at = :time
                """), {
                    "id": str(uuid_module.uuid4()),
                    "client_id": client_id,
                    # UTC (minus a safety buffer), NOT IST — an IST watermark is
                    # 5.5h ahead of UTC-stored updated_at, so the next download's
                    # "updated_at > watermark" filter silently skipped recent
                    # cloud rows. UTC is <= every value → never misses.
                    "time": (datetime.utcnow() - timedelta(seconds=WATERMARK_SAFETY_SECONDS)).isoformat()
                })
                conn.commit()
        except Exception as e:
            logger.warning(f"[SyncService] Could not update last download time: {e}")

    def _mark_initial_load_complete(self, client_id):
        """Mark initial load as complete in sync_metadata"""
        try:
            import uuid as uuid_module
            with self.sqlite_engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO sync_metadata (id, client_id, table_name, last_full_sync_time, updated_at)
                    VALUES (:id, :client_id, 'initial_load', :time, :time)
                    ON CONFLICT (client_id, table_name) DO UPDATE SET
                        last_full_sync_time = :time,
                        updated_at = :time
                """), {
                    "id": str(uuid_module.uuid4()),
                    "client_id": client_id,
                    "time": get_current_time().isoformat()
                })
                conn.commit()
        except Exception as e:
            logger.warning(f"[SyncService] Could not mark initial load complete: {e}")

    def is_initial_load_needed(self, client_id):
        """Check if initial load is needed for this client"""
        try:
            with self.sqlite_engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT last_full_sync_time FROM sync_metadata
                    WHERE client_id = :client_id AND table_name = 'initial_load'
                """), {"client_id": client_id})
                row = result.fetchone()
                return row is None or row[0] is None
        except Exception as e:
            logger.warning(f"[SyncService] Error checking initial load status: {e}")
            return True

    def _upsert_to_sqlite(self, table_name, data, id_column, columns):
        """
        Helper to upsert data to SQLite with Last-Write-Wins conflict resolution.
        Compares updated_at timestamps to determine which record wins.
        """
        if not data:
            return 0

        count = 0
        with self.sqlite_engine.connect() as conn:
            for record in data:
                try:
                    # Check if record exists and compare timestamps
                    existing = conn.execute(text(f"""
                        SELECT updated_at FROM {table_name} WHERE {id_column} = :id
                    """), {"id": record[id_column]}).fetchone()

                    # Last-Write-Wins: only update if cloud record is newer
                    if existing and existing[0]:
                        existing_time = existing[0]
                        if isinstance(existing_time, str):
                            existing_time = datetime.fromisoformat(existing_time.replace('Z', '+00:00'))
                        record_time = record.get('updated_at')
                        if isinstance(record_time, str):
                            record_time = datetime.fromisoformat(record_time.replace('Z', '+00:00'))

                        if record_time and existing_time and record_time <= existing_time:
                            continue  # Skip - local is newer or same

                    # Build upsert query
                    col_names = ', '.join(columns)
                    placeholders = ', '.join([f":{c}" for c in columns])
                    update_set = ', '.join([f"{c} = :{c}" for c in columns if c != id_column])

                    # Filter record to only columns being inserted (extra keys break SQLAlchemy binding)
                    filtered = {c: record.get(c) for c in columns}
                    conn.execute(text(f"""
                        INSERT INTO {table_name} ({col_names})
                        VALUES ({placeholders})
                        ON CONFLICT ({id_column}) DO UPDATE SET {update_set}
                    """), filtered)
                    count += 1

                except Exception as e:
                    logger.error(f"[SyncService] Failed to upsert {table_name} record: {e}")

            conn.commit()

        return count

    def _stamp_synced(self, records):
        """Mark cloud-downloaded rows as already-synced.

        Rows created on the web arrive with synced_at = NULL; without this the
        next upload pass would bounce them straight back to the server. Setting
        synced_at here breaks that ping-pong. Locally-edited rows are safe:
        _upsert_to_sqlite's Last-Write-Wins skips them (local is newer), so
        their synced_at = NULL is preserved and they still upload.
        """
        now_iso = get_current_time().isoformat()
        for r in records:
            r['synced_at'] = now_iso
        return records

    # ==========================================
    # GENERIC OWNER-TABLE SYNC (registry-driven, schema-introspected)
    # ==========================================
    def _owner_table_meta(self, table):
        """Introspect a table once and cache it. Returns the columns present on
        BOTH engines (so we never bind a column missing on one side), a type map
        for conversion, and the set of JSON columns. Cached per table."""
        if table in self._meta_cache:
            return self._meta_cache[table]
        with self.sqlite_engine.connect() as sc:
            sqlite_cols = {r[1] for r in sc.execute(text(f"PRAGMA table_info({table})"))}
        pg_types = {}
        with self.postgres_engine.connect() as pc:
            for name, dtype in pc.execute(text(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t"), {"t": table}):
                pg_types[name] = dtype
        common = [c for c in pg_types if c in sqlite_cols]
        type_map, json_cols = {}, set()
        for c in common:
            d = pg_types[c]
            if d == 'uuid':
                type_map[c] = 'UUID'
            elif d == 'boolean':
                type_map[c] = 'BOOLEAN'
            elif d == 'date':
                type_map[c] = 'DATE'
            elif d.startswith('timestamp'):
                type_map[c] = 'TIMESTAMP'
            elif d in ('numeric', 'integer', 'bigint', 'smallint', 'double precision', 'real'):
                type_map[c] = 'NUMERIC'
            elif d in ('json', 'jsonb'):
                json_cols.add(c)
        meta = {'common': common, 'types': type_map, 'json': json_cols}
        self._meta_cache[table] = meta
        return meta

    def _owner_where(self, scope, client_id, params):
        """WHERE fragment scoping a generic owner table to one owner. Supports
        'client_id', 'via_user', and ('via', parent_table, fk) where the parent's
        PK column name equals fk. No-op when client_id is falsy."""
        if not client_id or not scope:
            return ""
        params['client_id'] = client_id
        if scope == 'client_id':
            return " AND client_id = :client_id"
        if scope == 'via_user':
            return " AND user_id IN (SELECT user_id FROM users WHERE client_id = :client_id)"
        if isinstance(scope, tuple) and scope[0] == 'via':
            _, parent, fk = scope
            return f" AND {fk} IN (SELECT {fk} FROM {parent} WHERE client_id = :client_id)"
        return ""

    def _mark_synced_by_rowid(self, table, rowids):
        """Mark uploaded rows synced by SQLite rowid (works for any PK shape)."""
        if not rowids:
            return
        ph = ','.join(f":r{i}" for i in range(len(rowids)))
        params = {"synced_at": get_current_time().isoformat()}
        params.update({f"r{i}": rid for i, rid in enumerate(rowids)})
        with self.sqlite_engine.connect() as sc:
            sc.execute(text(f"UPDATE {table} SET synced_at = :synced_at WHERE rowid IN ({ph})"), params)
            sc.commit()

    def _sync_owner_table(self, entry, client_id=None):
        """Generic owner-scoped, batched upload for a registry table (SQLite -> PG)."""
        table, pk, scope = entry['table'], entry['pk'], entry['scope']
        meta = self._owner_table_meta(table)
        common = meta['common']
        if 'synced_at' not in common:
            return 0  # not migrated for upload on this engine yet
        insert_cols = [c for c in common if c != 'synced_at']
        pk_cols = pk if isinstance(pk, list) else [pk]
        set_cols = [c for c in insert_cols if c not in pk_cols]
        set_clause = ', '.join(f"{c} = EXCLUDED.{c}" for c in set_cols)
        set_clause = (set_clause + ', ' if set_clause else '') + 'synced_at = CURRENT_TIMESTAMP'
        insert_sql = (
            f"INSERT INTO {table} ({', '.join(insert_cols)}) "
            f"VALUES ({', '.join(':' + c for c in insert_cols)}) "
            f"ON CONFLICT ({', '.join(pk_cols)}) DO UPDATE SET {set_clause}"
        )
        params = {}
        where = "WHERE synced_at IS NULL" + self._owner_where(scope, client_id, params)
        order = 'created_at' if 'created_at' in common else pk_cols[0]
        with self.sqlite_engine.connect() as sc:
            rows = [dict(r._mapping) for r in sc.execute(
                text(f"SELECT rowid AS _rowid, * FROM {table} {where} ORDER BY {order} LIMIT 1000"), params)]
        if not rows:
            return 0
        # payment_transaction.plan_id is a NOT-NULL FK to the subscription_plan
        # catalog, which has different UUIDs in cloud. Remap local->cloud by plan
        # name; rows whose plan has no cloud twin stay unmapped and are isolated
        # out by the FK-split (a local-only test plan shouldn't reach prod).
        plan_up = self._plan_id_maps()[0] if table == 'payment_transaction' else None
        payload, rowids = [], []
        for rec in rows:
            converted = TypeConverter.convert_dict_from_sqlite(rec, meta['types'])
            if plan_up is not None:
                pid = converted.get('plan_id')
                if pid is not None:
                    converted['plan_id'] = plan_up.get(str(pid), pid)
            payload.append({c: converted.get(c) for c in insert_cols})  # JSON cols pass as stored text
            rowids.append(rec['_rowid'])
        synced_rowids = self._push_batch(table, insert_sql, payload, rowids)
        self._mark_synced_by_rowid(table, synced_rowids)
        return len(synced_rowids)

    def _fetch_all_pg(self, base_query, params, page_size=DOWNLOAD_PAGE_SIZE):
        """Fetch ALL rows for base_query by paging with LIMIT/OFFSET.

        base_query MUST include an ORDER BY (for stable paging) and MUST NOT
        already contain a LIMIT. Returns a list of dict rows. This replaces the
        old fixed `LIMIT 5000`, which silently dropped rows past the first page.
        """
        all_rows = []
        offset = 0
        with self.postgres_engine.connect() as pg_conn:
            while True:
                paged = f"{base_query} LIMIT {int(page_size)} OFFSET {int(offset)}"
                rows = [dict(r._mapping) for r in pg_conn.execute(text(paged), params)]
                all_rows.extend(rows)
                if len(rows) < page_size:
                    break
                offset += page_size
        return all_rows

    def _download_owner_table(self, entry, client_id, last_download):
        """Generic owner-scoped download for a registry table (PG -> SQLite)."""
        table, pk, scope = entry['table'], entry['pk'], entry['scope']
        meta = self._owner_table_meta(table)
        common = meta['common']
        if not common:
            return 0
        params = {}
        where = "WHERE 1=1" + self._owner_where(scope, client_id, params)
        # Incremental filter on the row's most-recent mtime. Include paid_at so
        # tables like payment_transaction (no updated_at) still re-download when
        # a later status/paid_at change happens after the original created_at.
        mtime_cols = [c for c in ('updated_at', 'paid_at', 'created_at') if c in common]
        if last_download and mtime_cols:
            expr = mtime_cols[0] if len(mtime_cols) == 1 else f"COALESCE({', '.join(mtime_cols)})"
            where += f" AND {expr} > :last_download"
            params['last_download'] = last_download
        pk_cols = pk if isinstance(pk, list) else [pk]
        order = 'created_at' if 'created_at' in common else pk_cols[0]
        query = f"SELECT {', '.join(common)} FROM {table} {where} ORDER BY {order}"
        records = self._fetch_all_pg(query, params)
        if not records:
            return 0
        # Reverse the upload plan-id remap: cloud plan UUID -> local catalog UUID.
        plan_down = self._plan_id_maps()[1] if table == 'payment_transaction' else None
        converted = []
        for r in records:
            c = TypeConverter.convert_dict_to_sqlite(r, meta['types'])
            for jc in meta['json']:
                if c.get(jc) is not None and not isinstance(c[jc], str):
                    c[jc] = json.dumps(c[jc])
            if plan_down is not None:
                pid = c.get('plan_id')
                if pid is not None:
                    local_pid = plan_down.get(str(pid))
                    if local_pid is None:
                        continue  # plan not in local catalog — skip (local FK)
                    c['plan_id'] = local_pid
            converted.append(c)
        self._stamp_synced(converted)
        return self._upsert_owner_sqlite(table, converted, pk_cols, common)

    def _upsert_owner_sqlite(self, table, records, pk_cols, columns):
        """Upsert downloaded rows into SQLite (cloud-wins). Handles composite PKs.

        Cloud-wins is safe here because full_sync uploads local dirty rows BEFORE
        downloading, so a locally-edited row has already been pushed and the
        cloud copy equals it by the time we overwrite.
        """
        if not records:
            return 0
        set_cols = [c for c in columns if c not in pk_cols]
        set_clause = ', '.join(f"{c} = EXCLUDED.{c}" for c in set_cols) or f"{pk_cols[0]} = EXCLUDED.{pk_cols[0]}"
        sql = (
            f"INSERT INTO {table} ({', '.join(columns)}) "
            f"VALUES ({', '.join(':' + c for c in columns)}) "
            f"ON CONFLICT ({', '.join(pk_cols)}) DO UPDATE SET {set_clause}"
        )
        # Don't clobber a local row that has unsynced edits (synced_at IS NULL):
        # it must upload first. full_sync uploads before download so this is rare,
        # but a standalone download could otherwise lose local changes.
        exists_sql = f"SELECT synced_at FROM {table} WHERE " + ' AND '.join(f"{c} = :{c}" for c in pk_cols)
        count = 0
        with self.sqlite_engine.connect() as sc:
            for rec in records:
                try:
                    local = sc.execute(text(exists_sql), {c: rec.get(c) for c in pk_cols}).fetchone()
                    if local is not None and local[0] is None:
                        continue  # local has pending edits — keep them
                    sc.execute(text(sql), {c: rec.get(c) for c in columns})
                    count += 1
                except Exception as e:
                    logger.error(f"[SyncService] {table}: sqlite upsert failed: {str(e)[:120]}")
            sc.commit()
        return count

    def _download_gst_bills(self, client_id, last_download):
        """Download GST bills from Supabase to SQLite"""
        query = """
            SELECT * FROM gst_billing
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        # Convert and upsert
        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, BILLING_COLUMN_TYPES)
            if 'items' in converted and not isinstance(converted['items'], str):
                converted['items'] = json.dumps(converted['items'])
            converted_records.append(converted)

        columns = ['bill_id', 'client_id', 'bill_number', 'bill_prefix', 'customer_id', 'customer_name',
                   'customer_phone', 'customer_email', 'customer_address', 'items', 'subtotal',
                   'gst_percentage', 'gst_amount', 'final_amount', 'payment_type', 'amount_received',
                   'discount_percentage', 'discount_amount', 'negotiable_amount', 'status',
                   'created_by', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('gst_billing', converted_records, 'bill_id', columns)

    def _download_non_gst_bills(self, client_id, last_download):
        """Download non-GST bills from Supabase to SQLite"""
        query = """
            SELECT * FROM non_gst_billing
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, BILLING_COLUMN_TYPES)
            if 'items' in converted and not isinstance(converted['items'], str):
                converted['items'] = json.dumps(converted['items'])
            converted_records.append(converted)

        columns = ['bill_id', 'client_id', 'bill_number', 'bill_prefix', 'customer_id', 'customer_name',
                   'customer_phone', 'customer_email', 'customer_address', 'customer_gstin',
                   'items', 'total_amount', 'payment_type', 'amount_received', 'discount_percentage',
                   'discount_amount', 'negotiable_amount', 'status', 'created_by',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('non_gst_billing', converted_records, 'bill_id', columns)

    def _download_stock(self, client_id, last_download):
        """Download stock entries from Supabase to SQLite"""
        query = """
            SELECT * FROM stock_entry
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY updated_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [TypeConverter.convert_dict_to_sqlite(r, STOCK_COLUMN_TYPES) for r in records]

        columns = ['product_id', 'client_id', 'product_name', 'category', 'quantity', 'rate',
                   'cost_price', 'mrp', 'pricing', 'unit', 'low_stock_alert', 'item_code',
                   'barcode', 'gst_percentage', 'hsn_code', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('stock_entry', converted_records, 'product_id', columns)

    def _download_customers(self, client_id, last_download):
        """Download customers from Supabase to SQLite"""
        query = """
            SELECT * FROM customer
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY updated_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [TypeConverter.convert_dict_to_sqlite(r, CUSTOMER_COLUMN_TYPES) for r in records]

        columns = ['customer_id', 'client_id', 'customer_code', 'customer_name', 'customer_phone',
                   'customer_email', 'customer_address', 'customer_gstin', 'customer_city',
                   'customer_state', 'customer_pincode', 'total_bills', 'total_spent',
                   'last_purchase_date', 'first_purchase_date', 'status', 'notes',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('customer', converted_records, 'customer_id', columns)

    def _download_expenses(self, client_id, last_download):
        """Download expenses from Supabase to SQLite"""
        query = """
            SELECT * FROM expense
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, EXPENSE_COLUMN_TYPES)
            if 'extra_data' in converted and not isinstance(converted['extra_data'], str):
                converted['extra_data'] = json.dumps(converted['extra_data']) if converted['extra_data'] else None
            converted_records.append(converted)

        columns = ['expense_id', 'client_id', 'category', 'description', 'amount', 'expense_date',
                   'payment_method', 'receipt_url', 'notes', 'extra_data', 'created_by',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('expense', converted_records, 'expense_id', columns)

    def _download_expense_summaries(self, client_id, last_download):
        """Download expense summaries from Supabase to SQLite"""
        query = """
            SELECT * FROM expense_summary
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, EXPENSE_SUMMARY_COLUMN_TYPES)
            if 'category_breakdown' in converted and not isinstance(converted['category_breakdown'], str):
                converted['category_breakdown'] = json.dumps(converted['category_breakdown']) if converted['category_breakdown'] else None
            converted_records.append(converted)

        columns = ['summary_id', 'client_id', 'period_type', 'period_start', 'period_end',
                   'total_expenses', 'category_breakdown', 'expense_count',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('expense_summary', converted_records, 'summary_id', columns)

    def _download_bulk_orders(self, client_id, last_download):
        """Download bulk stock orders from Supabase to SQLite"""
        query = """
            SELECT * FROM bulk_stock_order
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [TypeConverter.convert_dict_to_sqlite(r, BULK_ORDER_COLUMN_TYPES) for r in records]

        columns = ['order_id', 'client_id', 'order_number', 'supplier_name', 'supplier_contact',
                   'order_date', 'expected_delivery_date', 'status', 'notes', 'created_by',
                   'created_at', 'updated_at', 'received_at', 'synced_at']

        return self._upsert_to_sqlite('bulk_stock_order', converted_records, 'order_id', columns)

    def _download_bulk_order_items(self, client_id, last_download):
        """Download bulk stock order items from Supabase to SQLite"""
        # First get order_ids for this client
        with self.postgres_engine.connect() as pg_conn:
            order_result = pg_conn.execute(text("""
                SELECT order_id FROM bulk_stock_order WHERE client_id = :client_id
            """), {"client_id": client_id})
            order_ids = [row[0] for row in order_result]

        if not order_ids:
            return 0

        # Get items for these orders
        placeholders = ','.join([f":id_{i}" for i in range(len(order_ids))])
        params = {f"id_{i}": oid for i, oid in enumerate(order_ids)}

        query = f"""
            SELECT * FROM bulk_stock_order_item
            WHERE order_id IN ({placeholders})
        """
        if last_download:
            query += " AND updated_at > :last_download"
            params["last_download"] = last_download

        query += " ORDER BY created_at"

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [TypeConverter.convert_dict_to_sqlite(r, BULK_ORDER_ITEM_COLUMN_TYPES) for r in records]

        columns = ['item_id', 'order_id', 'product_id', 'product_name', 'category',
                   'quantity_ordered', 'quantity_received', 'unit', 'cost_price', 'selling_price',
                   'mrp', 'barcode', 'item_code', 'gst_percentage', 'hsn_code', 'notes',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('bulk_stock_order_item', converted_records, 'item_id', columns)

    def _download_reports(self, client_id, last_download):
        """Download reports from Supabase to SQLite"""
        query = """
            SELECT * FROM report
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, REPORT_COLUMN_TYPES)
            if 'payment_breakdown' in converted and not isinstance(converted['payment_breakdown'], str):
                converted['payment_breakdown'] = json.dumps(converted['payment_breakdown']) if converted['payment_breakdown'] else None
            converted_records.append(converted)

        columns = ['report_id', 'client_id', 'report_type', 'date_from', 'date_to',
                   'total_gst_bills', 'total_non_gst_bills', 'total_gst_amount', 'total_non_gst_amount',
                   'total_revenue', 'payment_breakdown', 'file_url', 'generated_by',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('report', converted_records, 'report_id', columns)

    def _download_employees(self, client_id, last_download):
        """Download employees from Supabase to SQLite"""
        query = "SELECT * FROM employees WHERE client_id = :client_id"
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, EMPLOYEE_COLUMN_TYPES) for r in records
        ]
        columns = ['employee_id', 'client_id', 'branch_id', 'name', 'phone', 'pay_type', 'rate',
                   'is_active', 'ot_multiplier', 'created_by', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('employees', self._stamp_synced(converted_records), 'employee_id', columns)

    def _download_salary_cycles(self, client_id, last_download):
        """Download salary cycles from Supabase to SQLite"""
        query = "SELECT * FROM salary_cycles WHERE client_id = :client_id"
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, SALARY_CYCLE_COLUMN_TYPES) for r in records
        ]
        columns = ['cycle_id', 'employee_id', 'client_id', 'start_date', 'end_date', 'status',
                   'gross_salary', 'total_advances', 'net_salary', 'paid_at', 'paid_by',
                   'payment_note', 'rate_snapshot', 'pay_type_snap', 'full_day_mins',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('salary_cycles', self._stamp_synced(converted_records), 'cycle_id', columns)

    def _download_employee_attendance(self, client_id, last_download):
        """Download attendance records from Supabase to SQLite"""
        query = "SELECT * FROM employee_attendance WHERE client_id = :client_id"
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, EMPLOYEE_ATTENDANCE_COLUMN_TYPES) for r in records
        ]
        columns = ['attendance_id', 'employee_id', 'client_id', 'work_date', 'check_in', 'check_out',
                   'total_minutes', 'status', 'reason', 'auto_ot_minutes', 'approved_ot_minutes',
                   'marked_by', 'notes', 'is_active', 'deleted_at', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('employee_attendance', self._stamp_synced(converted_records), 'attendance_id', columns)

    def _download_salary_advances(self, client_id, last_download):
        """Download salary advances from Supabase to SQLite.

        `updated_at` is now stamped on create and maintained on edit, so the
        incremental filter uses COALESCE(updated_at, created_at) — this catches
        edited advances while still including legacy rows whose updated_at was
        never backfilled (NULL).
        """
        query = "SELECT * FROM salary_advances WHERE client_id = :client_id"
        if last_download:
            query += " AND COALESCE(updated_at, created_at) > :last_download"
        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, SALARY_ADVANCE_COLUMN_TYPES) for r in records
        ]
        columns = ['advance_id', 'employee_id', 'client_id', 'cycle_id', 'amount', 'advance_date',
                   'notes', 'recorded_by', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('salary_advances', self._stamp_synced(converted_records), 'advance_id', columns)

    def _download_users(self, client_id, last_download):
        """Download users from Supabase to SQLite (incl. password_hash so
        cloud/web-created users can log in offline). Owner-scoped by client_id.
        Last-Write-Wins protects a locally-newer row from being clobbered."""
        query = "SELECT * FROM users WHERE client_id = :client_id"
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, USER_COLUMN_TYPES) for r in records
        ]
        columns = ['user_id', 'email', 'password_hash', 'client_id', 'role', 'is_super_admin',
                   'created_at', 'last_login', 'is_active', 'full_name', 'phone', 'department',
                   'created_by', 'updated_at', 'updated_by', 'deleted_at', 'synced_at']

        return self._upsert_to_sqlite('users', self._stamp_synced(converted_records), 'user_id', columns)

    def _download_user_permissions(self, client_id, last_download):
        """Download user permissions. No client_id column — scope via user_id ->
        users. Must run AFTER _download_users so the FK target exists."""
        query = """
            SELECT * FROM user_permissions
            WHERE user_id IN (SELECT user_id FROM users WHERE client_id = :client_id)
        """
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY granted_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, USER_PERMISSION_COLUMN_TYPES) for r in records
        ]
        # Reverse the upload remap: cloud permission UUIDs -> local catalog UUIDs
        # (matched by name). Drop rows for a permission the LOCAL catalog lacks —
        # they can't satisfy the local FK.
        _, cloud_to_local = self._perm_id_maps()
        remapped = []
        for r in converted_records:
            pid = r.get('permission_id')
            if pid is None:
                remapped.append(r)
                continue
            local_pid = cloud_to_local.get(str(pid))
            if local_pid is not None:
                r['permission_id'] = local_pid
                remapped.append(r)
            # else: unknown permission locally — skip to avoid a local FK violation
        converted_records = remapped
        if not converted_records:
            return 0
        columns = ['id', 'user_id', 'permission_id', 'granted_at', 'granted_by', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('user_permissions', self._stamp_synced(converted_records), 'id', columns)

    def _download_notes(self, client_id, last_download):
        """Download notes. No client_id column — scope via user_id -> users."""
        query = """
            SELECT * FROM notes
            WHERE user_id IN (SELECT user_id FROM users WHERE client_id = :client_id)
        """
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        records = self._fetch_all_pg(query, params)

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, NOTES_COLUMN_TYPES) for r in records
        ]
        columns = ['note_id', 'user_id', 'title', 'content', 'created_at', 'updated_at',
                   'expires_at', 'synced_at']

        return self._upsert_to_sqlite('notes', self._stamp_synced(converted_records), 'note_id', columns)


# Global sync service instance
sync_service = SyncService()

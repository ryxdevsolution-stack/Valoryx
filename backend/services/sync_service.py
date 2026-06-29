"""
Background Sync Service - Bidirectional SQLite ↔ Supabase (PostgreSQL)
Syncs local data to cloud and vice versa every 1 hour automatically
"""
import os
import json
import logging
from datetime import datetime
import pytz
from sqlalchemy import create_engine, text
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

            self.postgres_engine = create_engine(
                db_url,
                pool_pre_ping=True,
                connect_args={'connect_timeout': 10}
            )

            # Test connections
            with self.sqlite_engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            with self.postgres_engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            logger.info("[SyncService] Initialized successfully")
            return True

        except Exception as e:
            logger.error(f"[SyncService] Initialization failed: {e}")
            return False

    def sync_all(self):
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

            # Sync GST bills
            try:
                count = self._sync_gst_bills()
                results["synced"]["gst_bills"] = count
                logger.info(f"[SyncService] Uploaded {count} GST bills")
            except Exception as e:
                logger.error(f"[SyncService] GST bill sync failed: {e}")
                results["errors"].append(f"GST bills: {str(e)}")

            # Sync non-GST bills
            try:
                count = self._sync_non_gst_bills()
                results["synced"]["non_gst_bills"] = count
                logger.info(f"[SyncService] Uploaded {count} non-GST bills")
            except Exception as e:
                logger.error(f"[SyncService] Non-GST bill sync failed: {e}")
                results["errors"].append(f"Non-GST bills: {str(e)}")

            # Sync stock
            try:
                count = self._sync_stock()
                results["synced"]["stock"] = count
                logger.info(f"[SyncService] Uploaded {count} stock entries")
            except Exception as e:
                logger.error(f"[SyncService] Stock sync failed: {e}")
                results["errors"].append(f"Stock: {str(e)}")

            # Sync customers
            try:
                count = self._sync_customers()
                results["synced"]["customers"] = count
                logger.info(f"[SyncService] Uploaded {count} customers")
            except Exception as e:
                logger.error(f"[SyncService] Customer sync failed: {e}")
                results["errors"].append(f"Customers: {str(e)}")

# Sync expenses
            try:
                count = self._sync_expenses()
                results["synced"]["expenses"] = count
                logger.info(f"[SyncService] Uploaded {count} expenses")
            except Exception as e:
                logger.error(f"[SyncService] Expense sync failed: {e}")
                results["errors"].append(f"Expenses: {str(e)}")

            # Sync expense summaries
            try:
                count = self._sync_expense_summaries()
                results["synced"]["expense_summaries"] = count
                logger.info(f"[SyncService] Uploaded {count} expense summaries")
            except Exception as e:
                logger.error(f"[SyncService] Expense summary sync failed: {e}")
                results["errors"].append(f"Expense summaries: {str(e)}")

            # Sync bulk stock orders
            try:
                count = self._sync_bulk_orders()
                results["synced"]["bulk_orders"] = count
                logger.info(f"[SyncService] Uploaded {count} bulk orders")
            except Exception as e:
                logger.error(f"[SyncService] Bulk order sync failed: {e}")
                results["errors"].append(f"Bulk orders: {str(e)}")

            # Sync bulk stock order items
            try:
                count = self._sync_bulk_order_items()
                results["synced"]["bulk_order_items"] = count
                logger.info(f"[SyncService] Uploaded {count} bulk order items")
            except Exception as e:
                logger.error(f"[SyncService] Bulk order item sync failed: {e}")
                results["errors"].append(f"Bulk order items: {str(e)}")

            # Sync users (excluding password_hash for security)
            try:
                count = self._sync_users()
                results["synced"]["users"] = count
                logger.info(f"[SyncService] Uploaded {count} users")
            except Exception as e:
                logger.error(f"[SyncService] User sync failed: {e}")
                results["errors"].append(f"Users: {str(e)}")

            # Sync user permissions
            try:
                count = self._sync_user_permissions()
                results["synced"]["user_permissions"] = count
                logger.info(f"[SyncService] Uploaded {count} user permissions")
            except Exception as e:
                logger.error(f"[SyncService] User permission sync failed: {e}")
                results["errors"].append(f"User permissions: {str(e)}")

            # Sync reports
            try:
                count = self._sync_reports()
                results["synced"]["reports"] = count
                logger.info(f"[SyncService] Uploaded {count} reports")
            except Exception as e:
                logger.error(f"[SyncService] Report sync failed: {e}")
                results["errors"].append(f"Reports: {str(e)}")

            # Sync notes
            try:
                count = self._sync_notes()
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
                count = self._sync_employees()
                results["synced"]["employees"] = count
                logger.info(f"[SyncService] Uploaded {count} employees")
            except Exception as e:
                logger.error(f"[SyncService] Employee sync failed: {e}")
                results["errors"].append(f"Employees: {str(e)}")

            try:
                count = self._sync_salary_cycles()
                results["synced"]["salary_cycles"] = count
                logger.info(f"[SyncService] Uploaded {count} salary cycles")
            except Exception as e:
                logger.error(f"[SyncService] Salary cycle sync failed: {e}")
                results["errors"].append(f"Salary cycles: {str(e)}")

            try:
                count = self._sync_employee_attendance()
                results["synced"]["employee_attendance"] = count
                logger.info(f"[SyncService] Uploaded {count} attendance records")
            except Exception as e:
                logger.error(f"[SyncService] Attendance sync failed: {e}")
                results["errors"].append(f"Attendance: {str(e)}")

            try:
                count = self._sync_salary_advances()
                results["synced"]["salary_advances"] = count
                logger.info(f"[SyncService] Uploaded {count} salary advances")
            except Exception as e:
                logger.error(f"[SyncService] Salary advance sync failed: {e}")
                results["errors"].append(f"Salary advances: {str(e)}")

            self.last_sync_time = get_current_time()

            # Calculate totals
            total_synced = sum(results["synced"].values())
            logger.info(f"[SyncService] Upload sync complete. Total: {total_synced} records")

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

    def _sync_gst_bills(self):
        """Sync GST bills from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM gst_billing
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            bills = [dict(row._mapping) for row in result]

        if not bills:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for bill in bills:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(bill, BILLING_COLUMN_TYPES)

                    if 'customer_address' not in converted or converted['customer_address'] is None:
                        converted['customer_address'] = ''
                    if 'gst_percentage' not in converted or converted['gst_percentage'] is None:
                        converted['gst_percentage'] = 0
                    if 'items' in converted and not isinstance(converted['items'], str):
                        converted['items'] = json.dumps(converted['items'])

                    pg_conn.execute(text("""
                        INSERT INTO gst_billing (
                            bill_id, client_id, bill_number, customer_name, customer_phone,
                            customer_address, items, subtotal, gst_percentage, gst_amount, final_amount,
                            payment_type, amount_received, discount_percentage, discount_amount,
                            negotiable_amount, status, created_by, created_at, updated_at
                        ) VALUES (
                            :bill_id, :client_id, :bill_number, :customer_name, :customer_phone,
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
                    """), converted)
                    pg_conn.commit()  # Commit each successful record
                    synced_ids.append(bill['bill_id'])
                except Exception as e:
                    pg_conn.rollback()  # Rollback failed record, continue with others
                    logger.error(f"[SyncService] Failed to sync GST bill {bill.get('bill_id')}: {e}")

        self._mark_as_synced('gst_billing', 'bill_id', synced_ids)
        return len(synced_ids)

    def _sync_non_gst_bills(self):
        """Sync non-GST bills from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM non_gst_billing
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            bills = [dict(row._mapping) for row in result]

        if not bills:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for bill in bills:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(bill, BILLING_COLUMN_TYPES)

                    if 'items' in converted and not isinstance(converted['items'], str):
                        converted['items'] = json.dumps(converted['items'])

                    pg_conn.execute(text("""
                        INSERT INTO non_gst_billing (
                            bill_id, client_id, bill_number, customer_name, customer_phone,
                            customer_gstin, items, total_amount, payment_type, amount_received,
                            discount_percentage, discount_amount, negotiable_amount, status,
                            created_by, created_at, updated_at
                        ) VALUES (
                            :bill_id, :client_id, :bill_number, :customer_name, :customer_phone,
                            :customer_gstin, :items, :total_amount, :payment_type, :amount_received,
                            :discount_percentage, :discount_amount, :negotiable_amount, :status,
                            :created_by, :created_at, :updated_at
                        )
                        ON CONFLICT (bill_id) DO UPDATE SET
                            items = EXCLUDED.items,
                            total_amount = EXCLUDED.total_amount,
                            updated_at = EXCLUDED.updated_at,
                            synced_at = CURRENT_TIMESTAMP
                    """), converted)
                    pg_conn.commit()  # Commit each successful record
                    synced_ids.append(bill['bill_id'])
                except Exception as e:
                    pg_conn.rollback()  # Rollback failed record, continue with others
                    logger.error(f"[SyncService] Failed to sync non-GST bill {bill.get('bill_id')}: {e}")

        self._mark_as_synced('non_gst_billing', 'bill_id', synced_ids)
        return len(synced_ids)

    def _sync_stock(self):
        """Sync stock entries from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM stock_entry
                WHERE synced_at IS NULL
                ORDER BY updated_at
                LIMIT 1000
            """))
            entries = [dict(row._mapping) for row in result]

        if not entries:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for entry in entries:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(entry, STOCK_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(entry['product_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync stock {entry.get('product_id')}: {e}")

        self._mark_as_synced('stock_entry', 'product_id', synced_ids)
        return len(synced_ids)

    def _sync_customers(self):
        """Sync customers from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM customer
                WHERE synced_at IS NULL
                ORDER BY updated_at
                LIMIT 1000
            """))
            customers = [dict(row._mapping) for row in result]

        if not customers:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for customer in customers:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(customer, CUSTOMER_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(customer['customer_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync customer {customer.get('customer_id')}: {e}")

        self._mark_as_synced('customer', 'customer_id', synced_ids)
        return len(synced_ids)

    def _sync_expenses(self):
        """Sync expenses from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM expense
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            expenses = [dict(row._mapping) for row in result]

        if not expenses:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for expense in expenses:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(expense, EXPENSE_COLUMN_TYPES)

                    if 'extra_data' in converted and not isinstance(converted['extra_data'], str):
                        converted['extra_data'] = json.dumps(converted['extra_data']) if converted['extra_data'] else None

                    pg_conn.execute(text("""
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
                        """), converted)
                    pg_conn.commit()
                    synced_ids.append(expense['expense_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync expense {expense.get('expense_id')}: {e}")

        self._mark_as_synced('expense', 'expense_id', synced_ids)
        return len(synced_ids)

    def _sync_expense_summaries(self):
        """Sync expense summaries from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM expense_summary
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            summaries = [dict(row._mapping) for row in result]

        if not summaries:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for summary in summaries:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(summary, EXPENSE_SUMMARY_COLUMN_TYPES)

                    if 'category_breakdown' in converted and not isinstance(converted['category_breakdown'], str):
                        converted['category_breakdown'] = json.dumps(converted['category_breakdown']) if converted['category_breakdown'] else None

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(summary['summary_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync expense summary {summary.get('summary_id')}: {e}")

        self._mark_as_synced('expense_summary', 'summary_id', synced_ids)
        return len(synced_ids)

    def _sync_bulk_orders(self):
        """Sync bulk stock orders from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM bulk_stock_order
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            orders = [dict(row._mapping) for row in result]

        if not orders:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for order in orders:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(order, BULK_ORDER_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(order['order_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync bulk order {order.get('order_id')}: {e}")

        self._mark_as_synced('bulk_stock_order', 'order_id', synced_ids)
        return len(synced_ids)

    def _sync_bulk_order_items(self):
        """Sync bulk stock order items from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM bulk_stock_order_item
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            items = [dict(row._mapping) for row in result]

        if not items:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for item in items:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(item, BULK_ORDER_ITEM_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(item['item_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync bulk order item {item.get('item_id')}: {e}")

        self._mark_as_synced('bulk_stock_order_item', 'item_id', synced_ids)
        return len(synced_ids)

    def _sync_users(self):
        """Sync users from SQLite to PostgreSQL (excluding password_hash)"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM users
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            users = [dict(row._mapping) for row in result]

        if not users:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for user in users:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(user, USER_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(user['user_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync user {user.get('user_id')}: {e}")

        self._mark_as_synced('users', 'user_id', synced_ids)
        return len(synced_ids)

    def _sync_user_permissions(self):
        """Sync user permissions from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM user_permissions
                WHERE synced_at IS NULL
                ORDER BY granted_at
                LIMIT 1000
            """))
            permissions = [dict(row._mapping) for row in result]

        if not permissions:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for perm in permissions:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(perm, USER_PERMISSION_COLUMN_TYPES)

                    pg_conn.execute(text("""
                        INSERT INTO user_permissions (
                            id, user_id, permission_id, granted_at, granted_by, updated_at
                        ) VALUES (
                            :id, :user_id, :permission_id, :granted_at, :granted_by, :updated_at
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            updated_at = EXCLUDED.updated_at,
                            synced_at = CURRENT_TIMESTAMP
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(perm['id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync user permission {perm.get('id')}: {e}")

        self._mark_as_synced('user_permissions', 'id', synced_ids)
        return len(synced_ids)

    def _sync_reports(self):
        """Sync reports from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM report
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            reports = [dict(row._mapping) for row in result]

        if not reports:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for report in reports:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(report, REPORT_COLUMN_TYPES)

                    if 'payment_breakdown' in converted and not isinstance(converted['payment_breakdown'], str):
                        converted['payment_breakdown'] = json.dumps(converted['payment_breakdown']) if converted['payment_breakdown'] else None

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(report['report_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync report {report.get('report_id')}: {e}")

        self._mark_as_synced('report', 'report_id', synced_ids)
        return len(synced_ids)

    def _sync_notes(self):
        """Sync notes from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM notes
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            notes = [dict(row._mapping) for row in result]

        if not notes:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for note in notes:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(note, NOTES_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(note['note_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync note {note.get('note_id')}: {e}")

        self._mark_as_synced('notes', 'note_id', synced_ids)
        return len(synced_ids)

    def _sync_employees(self):
        """Sync employees from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM employees
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            rows = [dict(row._mapping) for row in result]

        if not rows:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for rec in rows:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(rec, EMPLOYEE_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(rec['employee_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync employee {rec.get('employee_id')}: {e}")

        self._mark_as_synced('employees', 'employee_id', synced_ids)
        return len(synced_ids)

    def _sync_salary_cycles(self):
        """Sync salary cycles from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM salary_cycles
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            rows = [dict(row._mapping) for row in result]

        if not rows:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for rec in rows:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(rec, SALARY_CYCLE_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(rec['cycle_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync salary cycle {rec.get('cycle_id')}: {e}")

        self._mark_as_synced('salary_cycles', 'cycle_id', synced_ids)
        return len(synced_ids)

    def _sync_employee_attendance(self):
        """Sync attendance records from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM employee_attendance
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            rows = [dict(row._mapping) for row in result]

        if not rows:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for rec in rows:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(rec, EMPLOYEE_ATTENDANCE_COLUMN_TYPES)

                    pg_conn.execute(text("""
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
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(rec['attendance_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync attendance {rec.get('attendance_id')}: {e}")

        self._mark_as_synced('employee_attendance', 'attendance_id', synced_ids)
        return len(synced_ids)

    def _sync_salary_advances(self):
        """Sync salary advances from SQLite to PostgreSQL"""
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM salary_advances
                WHERE synced_at IS NULL
                ORDER BY created_at
                LIMIT 1000
            """))
            rows = [dict(row._mapping) for row in result]

        if not rows:
            return 0

        synced_ids = []
        with self.postgres_engine.connect() as pg_conn:
            for rec in rows:
                try:
                    converted = TypeConverter.convert_dict_from_sqlite(rec, SALARY_ADVANCE_COLUMN_TYPES)

                    pg_conn.execute(text("""
                        INSERT INTO salary_advances (
                            advance_id, employee_id, client_id, cycle_id, amount, advance_date,
                            notes, recorded_by, created_at
                        ) VALUES (
                            :advance_id, :employee_id, :client_id, :cycle_id, :amount, :advance_date,
                            :notes, :recorded_by, :created_at
                        )
                        ON CONFLICT (advance_id) DO UPDATE SET
                            amount = EXCLUDED.amount,
                            advance_date = EXCLUDED.advance_date,
                            notes = EXCLUDED.notes,
                            synced_at = CURRENT_TIMESTAMP
                    """), converted)
                    pg_conn.commit()
                    synced_ids.append(rec['advance_id'])
                except Exception as e:
                    pg_conn.rollback()
                    logger.error(f"[SyncService] Failed to sync salary advance {rec.get('advance_id')}: {e}")

        self._mark_as_synced('salary_advances', 'advance_id', synced_ids)
        return len(synced_ids)

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

            # Download each table
            tables = [
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

            # Update last download time
            self._update_last_download_time(client_id)
            self.last_download_time = get_current_time()

            total_downloaded = sum(results["downloaded"].values())
            logger.info(f"[SyncService] Download sync complete. Total: {total_downloaded} records")

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

            # Download each table (None = get all records)
            tables = [
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

            # Mark initial load complete
            self._update_last_download_time(client_id)
            self._mark_initial_load_complete(client_id)

            total_loaded = sum(results["loaded"].values())
            logger.info(f"[SyncService] Initial load complete. Total: {total_loaded} records")

            return results

        except Exception as e:
            logger.error(f"[SyncService] Initial load failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": get_current_time().isoformat()
            }

    def full_sync(self, client_id):
        """
        Perform full bidirectional sync (upload then download).

        Args:
            client_id: The client UUID

        Returns:
            dict: Combined sync results
        """
        logger.info(f"[SyncService] Starting full bidirectional sync for client {client_id}...")

        upload_results = self.sync_all()
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
                    "time": get_current_time().isoformat()
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

    def _download_gst_bills(self, client_id, last_download):
        """Download GST bills from Supabase to SQLite"""
        query = """
            SELECT * FROM gst_billing
            WHERE client_id = :client_id
        """
        if last_download:
            query += " AND updated_at > :last_download"

        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

        if not records:
            return 0

        # Convert and upsert
        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, BILLING_COLUMN_TYPES)
            if 'items' in converted and not isinstance(converted['items'], str):
                converted['items'] = json.dumps(converted['items'])
            converted_records.append(converted)

        columns = ['bill_id', 'client_id', 'bill_number', 'customer_id', 'customer_name',
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

        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

        if not records:
            return 0

        converted_records = []
        for record in records:
            converted = TypeConverter.convert_dict_to_sqlite(record, BILLING_COLUMN_TYPES)
            if 'items' in converted and not isinstance(converted['items'], str):
                converted['items'] = json.dumps(converted['items'])
            converted_records.append(converted)

        columns = ['bill_id', 'client_id', 'bill_number', 'customer_id', 'customer_name',
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

        query += " ORDER BY updated_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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

        query += " ORDER BY updated_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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

        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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

        query += " ORDER BY created_at LIMIT 1000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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

        query += " ORDER BY created_at LIMIT 1000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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

        query += " ORDER BY created_at LIMIT 5000"

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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

        query += " ORDER BY created_at LIMIT 1000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

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
        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, EMPLOYEE_COLUMN_TYPES) for r in records
        ]
        columns = ['employee_id', 'client_id', 'branch_id', 'name', 'phone', 'pay_type', 'rate',
                   'is_active', 'ot_multiplier', 'created_by', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('employees', converted_records, 'employee_id', columns)

    def _download_salary_cycles(self, client_id, last_download):
        """Download salary cycles from Supabase to SQLite"""
        query = "SELECT * FROM salary_cycles WHERE client_id = :client_id"
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, SALARY_CYCLE_COLUMN_TYPES) for r in records
        ]
        columns = ['cycle_id', 'employee_id', 'client_id', 'start_date', 'end_date', 'status',
                   'gross_salary', 'total_advances', 'net_salary', 'paid_at', 'paid_by',
                   'payment_note', 'rate_snapshot', 'pay_type_snap', 'full_day_mins',
                   'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('salary_cycles', converted_records, 'cycle_id', columns)

    def _download_employee_attendance(self, client_id, last_download):
        """Download attendance records from Supabase to SQLite"""
        query = "SELECT * FROM employee_attendance WHERE client_id = :client_id"
        if last_download:
            query += " AND updated_at > :last_download"
        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, EMPLOYEE_ATTENDANCE_COLUMN_TYPES) for r in records
        ]
        columns = ['attendance_id', 'employee_id', 'client_id', 'work_date', 'check_in', 'check_out',
                   'total_minutes', 'status', 'reason', 'auto_ot_minutes', 'approved_ot_minutes',
                   'marked_by', 'notes', 'is_active', 'deleted_at', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('employee_attendance', converted_records, 'attendance_id', columns)

    def _download_salary_advances(self, client_id, last_download):
        """Download salary advances from Supabase to SQLite.

        Advances are append-only and carry no maintained `updated_at`, so the
        incremental filter uses `created_at` instead.
        """
        query = "SELECT * FROM salary_advances WHERE client_id = :client_id"
        if last_download:
            query += " AND created_at > :last_download"
        query += " ORDER BY created_at LIMIT 5000"

        params = {"client_id": client_id}
        if last_download:
            params["last_download"] = last_download

        with self.postgres_engine.connect() as pg_conn:
            result = pg_conn.execute(text(query), params)
            records = [dict(row._mapping) for row in result]

        if not records:
            return 0

        converted_records = [
            TypeConverter.convert_dict_to_sqlite(r, SALARY_ADVANCE_COLUMN_TYPES) for r in records
        ]
        columns = ['advance_id', 'employee_id', 'client_id', 'cycle_id', 'amount', 'advance_date',
                   'notes', 'recorded_by', 'created_at', 'updated_at', 'synced_at']

        return self._upsert_to_sqlite('salary_advances', converted_records, 'advance_id', columns)


# Global sync service instance
sync_service = SyncService()

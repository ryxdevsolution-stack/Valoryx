"""
Background Sync Service - SQLite → Supabase (PostgreSQL)
Syncs local data to cloud every 2 hours automatically
"""
import os
import logging
from datetime import datetime
import pytz
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from database.type_converters import TypeConverter, BILLING_COLUMN_TYPES, STOCK_COLUMN_TYPES, CUSTOMER_COLUMN_TYPES

logger = logging.getLogger(__name__)

# Helper function to get current time in Asia/Kolkata timezone
def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)


class SyncService:
    """
    Handles background synchronization from SQLite (local) to PostgreSQL (Supabase).

    Strategy:
    1. Read unsynced records from SQLite
    2. Convert data types (SQLite → PostgreSQL)
    3. Bulk insert to Supabase
    4. Mark records as synced
    """

    def __init__(self):
        self.sqlite_engine = None
        self.postgres_engine = None
        self.last_sync_time = None

    def initialize(self):
        """Initialize database connections for sync"""
        try:
            # SQLite connection (local database)
            sqlite_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))
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
        Sync all unsynced data to Supabase.

        Returns:
            dict: Sync results with counts
        """
        if not self.postgres_engine:
            logger.warning("[SyncService] Not initialized - skipping sync")
            return {"status": "skipped", "reason": "not_initialized"}

        try:
            logger.info("[SyncService] Starting background sync...")

            results = {
                "status": "success",
                "timestamp": get_current_time().isoformat(),
                "synced": {
                    "bills": 0,
                    "stock": 0,
                    "customers": 0
                },
                "errors": []
            }

            # Sync GST bills
            try:
                gst_count = self._sync_gst_bills()
                results["synced"]["bills"] += gst_count
                logger.info(f"[SyncService] Synced {gst_count} GST bills")
            except Exception as e:
                logger.error(f"[SyncService] GST bill sync failed: {e}")
                results["errors"].append(f"GST bills: {str(e)}")

            # Sync non-GST bills
            try:
                non_gst_count = self._sync_non_gst_bills()
                results["synced"]["bills"] += non_gst_count
                logger.info(f"[SyncService] Synced {non_gst_count} non-GST bills")
            except Exception as e:
                logger.error(f"[SyncService] Non-GST bill sync failed: {e}")
                results["errors"].append(f"Non-GST bills: {str(e)}")

            # Sync stock updates
            try:
                stock_count = self._sync_stock()
                results["synced"]["stock"] = stock_count
                logger.info(f"[SyncService] Synced {stock_count} stock updates")
            except Exception as e:
                logger.error(f"[SyncService] Stock sync failed: {e}")
                results["errors"].append(f"Stock: {str(e)}")

            # Sync customers
            try:
                customer_count = self._sync_customers()
                results["synced"]["customers"] = customer_count
                logger.info(f"[SyncService] Synced {customer_count} customers")
            except Exception as e:
                logger.error(f"[SyncService] Customer sync failed: {e}")
                results["errors"].append(f"Customers: {str(e)}")

            self.last_sync_time = get_current_time()
            logger.info(f"[SyncService] Sync complete: {results}")

            return results

        except Exception as e:
            logger.error(f"[SyncService] Sync failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": get_current_time().isoformat()
            }

    def _sync_gst_bills(self):
        """Sync GST bills from SQLite to PostgreSQL"""
        # Get unsynced bills from SQLite
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

        # Convert types and upload to PostgreSQL
        synced_count = 0
        with self.postgres_engine.connect() as pg_conn:
            for bill in bills:
                try:
                    # Convert SQLite types to PostgreSQL types
                    converted = TypeConverter.convert_dict_from_sqlite(bill, BILLING_COLUMN_TYPES)

                    # Ensure customer_address has a default value if missing
                    if 'customer_address' not in converted or converted['customer_address'] is None:
                        converted['customer_address'] = ''

                    # Ensure gst_percentage has a default value if missing (required field in Supabase)
                    if 'gst_percentage' not in converted or converted['gst_percentage'] is None:
                        converted['gst_percentage'] = 0

                    # Ensure items is a JSON string (not dict)
                    if 'items' in converted and not isinstance(converted['items'], str):
                        import json
                        converted['items'] = json.dumps(converted['items'])

                    # Insert to PostgreSQL
                    # First try to update if bill_number conflict exists
                    result = pg_conn.execute(text("""
                        UPDATE gst_billing
                        SET synced_at = CURRENT_TIMESTAMP,
                            items = :items,
                            subtotal = :subtotal,
                            gst_percentage = :gst_percentage,
                            gst_amount = :gst_amount,
                            final_amount = :final_amount
                        WHERE client_id = :client_id AND bill_number = :bill_number
                    """), converted)

                    # If no rows updated, insert new record
                    if result.rowcount == 0:
                        pg_conn.execute(text("""
                            INSERT INTO gst_billing (
                                bill_id, client_id, bill_number, customer_name, customer_phone,
                                customer_address, items, subtotal, gst_percentage, gst_amount, final_amount,
                                created_by, created_at
                            ) VALUES (
                                :bill_id, :client_id, :bill_number, :customer_name, :customer_phone,
                                :customer_address, :items, :subtotal, :gst_percentage, :gst_amount, :final_amount,
                                :created_by, :created_at
                            )
                            ON CONFLICT (bill_id) DO UPDATE SET
                                synced_at = CURRENT_TIMESTAMP
                        """), converted)

                    synced_count += 1

                except Exception as e:
                    logger.error(f"[SyncService] Failed to sync bill {bill.get('bill_id')}: {e}")
                    continue

            pg_conn.commit()

        # Mark as synced in SQLite
        if synced_count > 0:
            bill_ids = [bill['bill_id'] for bill in bills[:synced_count]]
            placeholders = ','.join([f":id_{i}" for i in range(len(bill_ids))])
            params = {"synced_at": get_current_time().isoformat()}
            params.update({f"id_{i}": bill_id for i, bill_id in enumerate(bill_ids)})

            with self.sqlite_engine.connect() as sqlite_conn:
                sqlite_conn.execute(text(f"""
                    UPDATE gst_billing
                    SET synced_at = :synced_at
                    WHERE bill_id IN ({placeholders})
                """), params)
                sqlite_conn.commit()

        return synced_count

    def _sync_non_gst_bills(self):
        """Sync non-GST bills from SQLite to PostgreSQL"""
        # Get unsynced bills from SQLite
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

        # Convert types and upload to PostgreSQL
        synced_count = 0
        with self.postgres_engine.connect() as pg_conn:
            for bill in bills:
                try:
                    # Convert SQLite types to PostgreSQL types
                    converted = TypeConverter.convert_dict_from_sqlite(bill, BILLING_COLUMN_TYPES)

                    # Ensure items is a JSON string (not dict)
                    if 'items' in converted and not isinstance(converted['items'], str):
                        import json
                        converted['items'] = json.dumps(converted['items'])

                    # Insert to PostgreSQL
                    # Handle both bill_id conflict and (client_id, bill_number) conflict
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
                            synced_at = CURRENT_TIMESTAMP,
                            updated_at = EXCLUDED.updated_at,
                            total_amount = EXCLUDED.total_amount,
                            items = EXCLUDED.items
                    """), converted)

                    synced_count += 1

                except Exception as e:
                    logger.error(f"[SyncService] Failed to sync non-GST bill {bill.get('bill_id')}: {e}")
                    continue

            pg_conn.commit()

        # Mark as synced in SQLite
        if synced_count > 0:
            bill_ids = [bill['bill_id'] for bill in bills[:synced_count]]
            placeholders = ','.join([f":id_{i}" for i in range(len(bill_ids))])
            params = {"synced_at": get_current_time().isoformat()}
            params.update({f"id_{i}": bill_id for i, bill_id in enumerate(bill_ids)})

            with self.sqlite_engine.connect() as sqlite_conn:
                sqlite_conn.execute(text(f"""
                    UPDATE non_gst_billing
                    SET synced_at = :synced_at
                    WHERE bill_id IN ({placeholders})
                """), params)
                sqlite_conn.commit()

        return synced_count

    def _sync_stock(self):
        """Sync stock updates from SQLite to PostgreSQL"""
        # Get unsynced stock entries from SQLite
        with self.sqlite_engine.connect() as sqlite_conn:
            result = sqlite_conn.execute(text("""
                SELECT * FROM stock_entry
                WHERE synced_at IS NULL
                ORDER BY updated_at
                LIMIT 1000
            """))

            stock_entries = [dict(row._mapping) for row in result]

        if not stock_entries:
            return 0

        # Convert types and upload to PostgreSQL
        synced_count = 0
        with self.postgres_engine.connect() as pg_conn:
            for stock in stock_entries:
                try:
                    # Convert SQLite types to PostgreSQL types
                    converted = TypeConverter.convert_dict_from_sqlite(stock, STOCK_COLUMN_TYPES)

                    # Insert to PostgreSQL (upsert pattern)
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

                    synced_count += 1

                except Exception as e:
                    logger.error(f"[SyncService] Failed to sync stock {stock.get('product_id')}: {e}")
                    continue

            pg_conn.commit()

        # Mark as synced in SQLite
        if synced_count > 0:
            product_ids = [stock['product_id'] for stock in stock_entries[:synced_count]]
            placeholders = ','.join([f":id_{i}" for i in range(len(product_ids))])
            params = {"synced_at": get_current_time().isoformat()}
            params.update({f"id_{i}": product_id for i, product_id in enumerate(product_ids)})

            with self.sqlite_engine.connect() as sqlite_conn:
                sqlite_conn.execute(text(f"""
                    UPDATE stock_entry
                    SET synced_at = :synced_at
                    WHERE product_id IN ({placeholders})
                """), params)
                sqlite_conn.commit()

        return synced_count

    def _sync_customers(self):
        """Sync customers from SQLite to PostgreSQL"""
        # Get unsynced customers from SQLite
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

        # Convert types and upload to PostgreSQL
        synced_count = 0
        with self.postgres_engine.connect() as pg_conn:
            for customer in customers:
                try:
                    # Convert SQLite types to PostgreSQL types
                    converted = TypeConverter.convert_dict_from_sqlite(customer, CUSTOMER_COLUMN_TYPES)

                    # Insert to PostgreSQL (upsert pattern)
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

                    synced_count += 1

                except Exception as e:
                    logger.error(f"[SyncService] Failed to sync customer {customer.get('customer_id')}: {e}")
                    continue

            pg_conn.commit()

        # Mark as synced in SQLite
        if synced_count > 0:
            customer_ids = [customer['customer_id'] for customer in customers[:synced_count]]
            placeholders = ','.join([f":id_{i}" for i in range(len(customer_ids))])
            params = {"synced_at": get_current_time().isoformat()}
            params.update({f"id_{i}": customer_id for i, customer_id in enumerate(customer_ids)})

            with self.sqlite_engine.connect() as sqlite_conn:
                sqlite_conn.execute(text(f"""
                    UPDATE customer
                    SET synced_at = :synced_at
                    WHERE customer_id IN ({placeholders})
                """), params)
                sqlite_conn.commit()

        return synced_count


# Global sync service instance
sync_service = SyncService()

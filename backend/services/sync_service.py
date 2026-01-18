"""
Background Sync Service - SQLite → Supabase (PostgreSQL)
Syncs local data to cloud every 2 hours automatically
"""
import os
import logging
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from database.type_converters import TypeConverter, BILLING_COLUMN_TYPES, STOCK_COLUMN_TYPES, CUSTOMER_COLUMN_TYPES

logger = logging.getLogger(__name__)


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
                "timestamp": datetime.utcnow().isoformat(),
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

            self.last_sync_time = datetime.utcnow()
            logger.info(f"[SyncService] Sync complete: {results}")

            return results

        except Exception as e:
            logger.error(f"[SyncService] Sync failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
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

                    # Insert to PostgreSQL
                    pg_conn.execute(text("""
                        INSERT INTO gst_billing (
                            bill_id, client_id, bill_number, customer_name, customer_phone,
                            customer_address, items, subtotal, gst_amount, final_amount,
                            created_by, created_at
                        ) VALUES (
                            :bill_id::UUID, :client_id::UUID, :bill_number, :customer_name, :customer_phone,
                            :customer_address, :items::JSONB, :subtotal, :gst_amount, :final_amount,
                            :created_by::UUID, :created_at
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
            with self.sqlite_engine.connect() as sqlite_conn:
                sqlite_conn.execute(text("""
                    UPDATE gst_billing
                    SET synced_at = :synced_at
                    WHERE bill_id IN :bill_ids
                """), {"synced_at": datetime.utcnow().isoformat(), "bill_ids": tuple(bill_ids)})
                sqlite_conn.commit()

        return synced_count

    def _sync_non_gst_bills(self):
        """Sync non-GST bills from SQLite to PostgreSQL"""
        # Similar to _sync_gst_bills but for non_gst_billing table
        # TODO: Implement when needed
        return 0

    def _sync_stock(self):
        """Sync stock updates from SQLite to PostgreSQL"""
        # TODO: Implement stock sync
        return 0

    def _sync_customers(self):
        """Sync customers from SQLite to PostgreSQL"""
        # TODO: Implement customer sync
        return 0


# Global sync service instance
sync_service = SyncService()

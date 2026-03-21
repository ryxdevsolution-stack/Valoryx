"""
Run sync column migrations for SQLite and Supabase
Usage: python -m migrations.run_sync_migrations [--sqlite] [--supabase] [--both]
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def column_exists(engine, table_name, column_name):
    """Check if a column exists in a table"""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(engine, table_name):
    """Check if a table exists"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def run_sqlite_migrations(sqlite_path=None):
    """Run migrations on SQLite database"""
    if sqlite_path is None:
        sqlite_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.valoryx/local.db'))

    logger.info(f"Running SQLite migrations on: {sqlite_path}")

    if not os.path.exists(sqlite_path):
        logger.error(f"SQLite database not found at: {sqlite_path}")
        return False

    engine = create_engine(f'sqlite:///{sqlite_path}')

    migrations = [
        # payment_type
        ("payment_type", "updated_at", "ALTER TABLE payment_type ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("payment_type", "synced_at", "ALTER TABLE payment_type ADD COLUMN synced_at TIMESTAMP NULL"),

        # expense
        ("expense", "synced_at", "ALTER TABLE expense ADD COLUMN synced_at TIMESTAMP NULL"),

        # expense_summary
        ("expense_summary", "synced_at", "ALTER TABLE expense_summary ADD COLUMN synced_at TIMESTAMP NULL"),

        # bulk_stock_order
        ("bulk_stock_order", "synced_at", "ALTER TABLE bulk_stock_order ADD COLUMN synced_at TIMESTAMP NULL"),

        # bulk_stock_order_item
        ("bulk_stock_order_item", "updated_at", "ALTER TABLE bulk_stock_order_item ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("bulk_stock_order_item", "synced_at", "ALTER TABLE bulk_stock_order_item ADD COLUMN synced_at TIMESTAMP NULL"),

        # users
        ("users", "synced_at", "ALTER TABLE users ADD COLUMN synced_at TIMESTAMP NULL"),

        # report
        ("report", "updated_at", "ALTER TABLE report ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("report", "synced_at", "ALTER TABLE report ADD COLUMN synced_at TIMESTAMP NULL"),

        # notes
        ("notes", "synced_at", "ALTER TABLE notes ADD COLUMN synced_at TIMESTAMP NULL"),

        # user_permissions
        ("user_permissions", "updated_at", "ALTER TABLE user_permissions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("user_permissions", "synced_at", "ALTER TABLE user_permissions ADD COLUMN synced_at TIMESTAMP NULL"),
    ]

    with engine.connect() as conn:
        for table_name, column_name, sql in migrations:
            try:
                if not table_exists(engine, table_name):
                    logger.warning(f"Table {table_name} does not exist, skipping")
                    continue

                if column_exists(engine, table_name, column_name):
                    logger.info(f"Column {table_name}.{column_name} already exists, skipping")
                    continue

                conn.execute(text(sql))
                conn.commit()
                logger.info(f"Added column {table_name}.{column_name}")
            except Exception as e:
                logger.error(f"Error adding {table_name}.{column_name}: {e}")

        # Create sync_metadata table
        if not table_exists(engine, 'sync_metadata'):
            conn.execute(text("""
                CREATE TABLE sync_metadata (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    table_name TEXT NOT NULL,
                    last_upload_time TIMESTAMP NULL,
                    last_download_time TIMESTAMP NULL,
                    last_full_sync_time TIMESTAMP NULL,
                    records_uploaded INTEGER DEFAULT 0,
                    records_downloaded INTEGER DEFAULT 0,
                    last_upload_count INTEGER DEFAULT 0,
                    last_download_count INTEGER DEFAULT 0,
                    sync_status TEXT DEFAULT 'idle',
                    last_error TEXT NULL,
                    last_error_time TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(client_id, table_name)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_client_table ON sync_metadata(client_id, table_name)"))
            conn.commit()
            logger.info("Created sync_metadata table")
        else:
            logger.info("sync_metadata table already exists")

        # Create sync_log table
        if not table_exists(engine, 'sync_log'):
            conn.execute(text("""
                CREATE TABLE sync_log (
                    log_id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    sync_type TEXT NOT NULL,
                    table_name TEXT NULL,
                    direction TEXT NOT NULL,
                    records_processed INTEGER DEFAULT 0,
                    records_success INTEGER DEFAULT 0,
                    records_failed INTEGER DEFAULT 0,
                    status TEXT NOT NULL,
                    error_message TEXT NULL,
                    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP NULL,
                    duration_seconds INTEGER NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_log_client ON sync_log(client_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_log_time ON sync_log(started_at)"))
            conn.commit()
            logger.info("Created sync_log table")
        else:
            logger.info("sync_log table already exists")

    logger.info("SQLite migrations completed successfully")
    return True


def run_supabase_migrations(db_url=None):
    """Run migrations on Supabase/PostgreSQL database"""
    if db_url is None:
        db_url = os.getenv('DB_URL')

    if not db_url:
        logger.error("No DB_URL found for Supabase")
        return False

    logger.info("Running Supabase migrations")

    engine = create_engine(db_url, pool_pre_ping=True)

    migrations = [
        # payment_type
        ("payment_type", "updated_at", "ALTER TABLE payment_type ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"),
        ("payment_type", "synced_at", "ALTER TABLE payment_type ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # expense
        ("expense", "synced_at", "ALTER TABLE expense ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # expense_summary
        ("expense_summary", "synced_at", "ALTER TABLE expense_summary ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # bulk_stock_order
        ("bulk_stock_order", "synced_at", "ALTER TABLE bulk_stock_order ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # bulk_stock_order_item
        ("bulk_stock_order_item", "updated_at", "ALTER TABLE bulk_stock_order_item ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"),
        ("bulk_stock_order_item", "synced_at", "ALTER TABLE bulk_stock_order_item ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # users
        ("users", "synced_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # report
        ("report", "updated_at", "ALTER TABLE report ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"),
        ("report", "synced_at", "ALTER TABLE report ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # notes
        ("notes", "synced_at", "ALTER TABLE notes ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),

        # user_permissions
        ("user_permissions", "updated_at", "ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"),
        ("user_permissions", "synced_at", "ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL"),
    ]

    with engine.connect() as conn:
        for table_name, column_name, sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
                logger.info(f"Ensured column {table_name}.{column_name} exists")
            except Exception as e:
                logger.error(f"Error with {table_name}.{column_name}: {e}")

        # Create sync_metadata table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sync_metadata (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    client_id UUID NOT NULL REFERENCES client_entry(client_id),
                    table_name VARCHAR(100) NOT NULL,
                    last_upload_time TIMESTAMP WITH TIME ZONE NULL,
                    last_download_time TIMESTAMP WITH TIME ZONE NULL,
                    last_full_sync_time TIMESTAMP WITH TIME ZONE NULL,
                    records_uploaded INTEGER DEFAULT 0,
                    records_downloaded INTEGER DEFAULT 0,
                    last_upload_count INTEGER DEFAULT 0,
                    last_download_count INTEGER DEFAULT 0,
                    sync_status VARCHAR(50) DEFAULT 'idle',
                    last_error TEXT NULL,
                    last_error_time TIMESTAMP WITH TIME ZONE NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(client_id, table_name)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_client_table ON sync_metadata(client_id, table_name)"))
            conn.commit()
            logger.info("Ensured sync_metadata table exists")
        except Exception as e:
            logger.error(f"Error creating sync_metadata: {e}")

        # Create sync_log table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sync_log (
                    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    client_id UUID NOT NULL REFERENCES client_entry(client_id),
                    sync_type VARCHAR(50) NOT NULL,
                    table_name VARCHAR(100) NULL,
                    direction VARCHAR(20) NOT NULL,
                    records_processed INTEGER DEFAULT 0,
                    records_success INTEGER DEFAULT 0,
                    records_failed INTEGER DEFAULT 0,
                    status VARCHAR(50) NOT NULL,
                    error_message TEXT NULL,
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP WITH TIME ZONE NULL,
                    duration_seconds INTEGER NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_log_client ON sync_log(client_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sync_log_time ON sync_log(started_at)"))
            conn.commit()
            logger.info("Ensured sync_log table exists")
        except Exception as e:
            logger.error(f"Error creating sync_log: {e}")

        # Create updated_at trigger function
        try:
            conn.execute(text("""
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql'
            """))
            conn.commit()
            logger.info("Created/updated trigger function")
        except Exception as e:
            logger.error(f"Error creating trigger function: {e}")

    logger.info("Supabase migrations completed successfully")
    return True


if __name__ == '__main__':
    args = sys.argv[1:]

    if not args or '--both' in args:
        run_sqlite_migrations()
        run_supabase_migrations()
    elif '--sqlite' in args:
        run_sqlite_migrations()
    elif '--supabase' in args:
        run_supabase_migrations()
    else:
        print("Usage: python -m migrations.run_sync_migrations [--sqlite] [--supabase] [--both]")
        sys.exit(1)

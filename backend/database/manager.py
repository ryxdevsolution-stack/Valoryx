"""
Database Manager - Dual Database Support
Phase 1: Switches between SQLite (offline) and PostgreSQL (online)

Handles automatic detection of online/offline mode and manages database connections.
"""

import os
from sqlalchemy import create_engine, event, pool
from sqlalchemy.exc import OperationalError


class DatabaseManager:
    """
    Manages database connections for both online (PostgreSQL) and offline (SQLite) modes.

    Auto-detects which mode to use based on environment variable or connectivity.
    """

    def __init__(self, app=None):
        self.app = app
        self.mode = None
        self.engine = None

        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize with Flask app"""
        self.app = app
        self.mode = self._detect_mode()
        self.engine = self._initialize_engine()

        # Store mode in app config for other modules
        app.config['DB_MODE'] = self.mode
        app.config['SQLALCHEMY_DATABASE_URI'] = self._get_database_uri()

    def _detect_mode(self):
        """
        Detect whether to use online (PostgreSQL) or offline (SQLite) mode.

        NEW BEHAVIOR (User requirement):
        - DEFAULT: Always use offline mode (SQLite) for desktop app
        - Background sync uploads to Supabase every 2 hours
        - Only use online mode if explicitly set with DB_MODE=online

        Priority:
        1. Environment variable DB_MODE ('offline' or 'online')
        2. DEFAULT: offline mode (even if PostgreSQL is reachable)

        Returns:
            str: 'online' or 'offline'
        """
        # Check environment variable first
        db_mode = os.getenv('DB_MODE', '').lower()
        if db_mode in ['offline', 'online']:
            print(f"[DatabaseManager] Mode set by DB_MODE env: {db_mode}")
            return db_mode

        # NEW DEFAULT: Always use offline mode for desktop app
        # Background sync will upload to Supabase every 2 hours
        print("[DatabaseManager] Using offline mode (default) - background sync enabled")
        return 'offline'

    def _get_database_uri(self):
        """Get database URI based on current mode"""
        if self.mode == 'online':
            return os.getenv('DB_URL')
        else:
            # SQLite database path
            db_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))

            # Ensure directory exists
            os.makedirs(os.path.dirname(db_path), exist_ok=True)

            return f'sqlite:///{db_path}'

    def _initialize_engine(self):
        """
        Initialize SQLAlchemy engine based on mode.

        Returns:
            Engine: SQLAlchemy engine instance
        """
        database_uri = self._get_database_uri()

        if self.mode == 'online':
            # PostgreSQL configuration
            engine = create_engine(
                database_uri,
                poolclass=pool.QueuePool,
                pool_size=50,
                max_overflow=100,
                pool_pre_ping=True,
                pool_recycle=3600,
                echo=os.getenv('SQLALCHEMY_ECHO', 'false').lower() == 'true'
            )

            print(f"[DatabaseManager] PostgreSQL engine initialized")

        else:
            # SQLite configuration
            engine = create_engine(
                database_uri,
                connect_args={
                    'check_same_thread': False,  # Allow multi-threading
                    'timeout': 10  # 10 second lock timeout
                },
                poolclass=pool.StaticPool,  # Single connection pool for SQLite
                echo=os.getenv('SQLALCHEMY_ECHO', 'false').lower() == 'true'
            )

            # Enable WAL mode and foreign keys for SQLite
            @event.listens_for(engine, "connect")
            def set_sqlite_pragma(dbapi_conn, connection_record):
                cursor = dbapi_conn.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.execute("PRAGMA cache_size=10000")
                cursor.execute("PRAGMA temp_store=MEMORY")
                cursor.close()

            print(f"[DatabaseManager] SQLite engine initialized at: {database_uri}")

        return engine

    def is_online(self):
        """Check if currently in online mode"""
        return self.mode == 'online'

    def is_offline(self):
        """Check if currently in offline mode"""
        return self.mode == 'offline'

    def get_engine(self):
        """Get current database engine"""
        return self.engine

    def switch_mode(self, new_mode):
        """
        Manually switch database mode.

        WARNING: This will dispose current engine and create new one.
        Only use during startup or maintenance.

        Args:
            new_mode (str): 'online' or 'offline'
        """
        if new_mode not in ['online', 'offline']:
            raise ValueError("Mode must be 'online' or 'offline'")

        if self.mode == new_mode:
            print(f"[DatabaseManager] Already in {new_mode} mode")
            return

        print(f"[DatabaseManager] Switching from {self.mode} to {new_mode} mode")

        # Dispose old engine
        if self.engine:
            self.engine.dispose()

        # Update mode and reinitialize
        self.mode = new_mode
        self.engine = self._initialize_engine()

        if self.app:
            self.app.config['DB_MODE'] = self.mode
            self.app.config['SQLALCHEMY_DATABASE_URI'] = self._get_database_uri()

        print(f"[DatabaseManager] Switched to {new_mode} mode successfully")


# Global instance
db_manager = DatabaseManager()

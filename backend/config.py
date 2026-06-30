import os
import socket
from pathlib import Path
from dotenv import load_dotenv

# Load env file from the backend directory (where config.py lives).
# Try env.local first (used in packaged exe — NSIS strips dotfiles),
# then fall back to .env (used in dev).
_backend_dir = Path(__file__).parent
_env_local = _backend_dir / 'env.local'
_env_dot = _backend_dir / '.env'
if _env_local.exists():
    load_dotenv(_env_local)
else:
    load_dotenv(_env_dot)

# Force IPv4 resolution for better performance
def force_ipv4_dns():
    """Force DNS to resolve to IPv4 only"""
    original_getaddrinfo = socket.getaddrinfo

    def getaddrinfo_ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)

    socket.getaddrinfo = getaddrinfo_ipv4_only

# Apply IPv4 fix globally
force_ipv4_dns()


# Phase 1: Database mode detection
def get_database_mode():
    """
    Detect if app should run in online (PostgreSQL) or offline (SQLite) mode.

    DEFAULT BEHAVIOR: Always use offline mode (SQLite) for speed.
    Background sync uploads to Supabase every 2 hours.
    """
    db_mode = os.getenv('DB_MODE', '').lower()
    if db_mode in ['offline', 'online']:
        return db_mode

    # NEW DEFAULT: Always use offline mode (SQLite) for desktop app
    # Sync happens in background every 2 hours
    return 'offline'


def get_database_uri():
    """Get database URI based on mode"""
    mode = get_database_mode()

    if mode == 'online':
        return os.getenv("DB_URL", "sqlite:///app.db")
    else:
        # SQLite for offline mode
        sqlite_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.valoryx/local.db'))
        # Ensure directory exists
        db_dir = os.path.dirname(sqlite_path)
        os.makedirs(db_dir, exist_ok=True)
        # The DB holds password hashes and tenant data — owner-only access.
        # (On Windows chmod is a no-op beyond the read-only bit; harmless.)
        try:
            os.chmod(db_dir, 0o700)
            if os.path.exists(sqlite_path):
                os.chmod(sqlite_path, 0o600)
        except OSError:
            pass
        return f'sqlite:///{sqlite_path}'


class OptimizedConfig:
    """Optimized Flask configuration for high performance"""

    # -------------------------------
    # Database - OPTIMIZED SETTINGS (Phase 1: Dual Database Support)
    # -------------------------------
    DB_MODE = get_database_mode()
    SQLALCHEMY_DATABASE_URI = get_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False  # Disable to save resources

    # OPTIMIZED CONNECTION POOL SETTINGS (adapted for both PostgreSQL and SQLite)
    @staticmethod
    def get_engine_options():
        """Get engine options based on database mode"""
        mode = get_database_mode()

        if mode == 'online':
            # PostgreSQL connection pool settings
            # Supabase Session Mode pooler (port 5432) caps concurrent clients per project.
            # Keep per-process pool small so multiple Gunicorn workers fit inside the quota.
            # If traffic grows, move DB_URL to port 6543 (Transaction Mode) and set
            # prepared_statement_cache_size=0 below.
            return {
                "pool_pre_ping": True,
                "pool_recycle": 1800,
                "pool_size": 10,
                "max_overflow": 20,
                "pool_timeout": 10,
                "pool_use_lifo": True,
                "echo": False,
                "execution_options": {
                    "compiled_cache": {},
                    "isolation_level": "READ COMMITTED",
                },
                "connect_args": {
                    "connect_timeout": 30,
                    "keepalives": 1,
                    "keepalives_idle": 5,
                    "keepalives_interval": 2,
                    "keepalives_count": 2,
                    "application_name": "mj-billing-backend",
                    "options": "-c statement_timeout=10000",
                },
            }
        else:
            # SQLite connection settings
            return {
                "echo": False,
                "connect_args": {
                    "check_same_thread": False,
                    "timeout": 10,
                },
                "poolclass": None,  # SQLite uses NullPool by default
            }

    SQLALCHEMY_ENGINE_OPTIONS = get_engine_options.__func__()

    # Query optimization
    SQLALCHEMY_RECORD_QUERIES = False  # Disable in production
    SQLALCHEMY_NATIVE_UNICODE = True

    # -------------------------------
    # Cache Configuration (disabled — no Redis)
    # -------------------------------
    REDIS_URL = ""
    REDIS_AVAILABLE = False
    CACHE_TYPE = "SimpleCache"
    CACHE_REDIS_URL = None
    CACHE_DEFAULT_TIMEOUT = 300
    CACHE_KEY_PREFIX = "mj-billing:"

    # -------------------------------
    # Performance Features
    # -------------------------------
    # Enable response compression
    COMPRESS_MIMETYPES = [
        'text/html', 'text/css', 'text/xml', 'application/json',
        'application/javascript', 'application/pdf', 'image/svg+xml'
    ]
    COMPRESS_LEVEL = 6  # Balance between speed and compression
    COMPRESS_MIN_SIZE = 500  # Don't compress small responses

    # Pagination defaults
    DEFAULT_PAGE_SIZE = 50
    MAX_PAGE_SIZE = 200

    # Batch processing
    BATCH_SIZE = 100  # Process 100 items at a time in bulk operations
    BULK_INSERT_SIZE = 500  # Insert 500 records at once

    # -------------------------------
    # Task Queue (Celery)
    # -------------------------------
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    CELERY_TASK_SERIALIZER = 'json'
    CELERY_RESULT_SERIALIZER = 'json'
    CELERY_ACCEPT_CONTENT = ['json']
    CELERY_TIMEZONE = 'UTC'
    CELERY_ENABLE_UTC = True
    CELERY_TASK_TRACK_STARTED = True
    CELERY_TASK_TIME_LIMIT = 30  # 30 seconds max per task

    # -------------------------------
    # API Rate Limiting (disabled)
    # -------------------------------
    RATELIMIT_ENABLED = False
    RATELIMIT_STORAGE_URL = "memory://"
    RATELIMIT_DEFAULT = "1000/hour"
    RATELIMIT_HEADERS_ENABLED = True

    # -------------------------------
    # Request/Response Optimization
    # -------------------------------
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max request size
    JSON_SORT_KEYS = False  # Don't waste time sorting
    JSONIFY_PRETTYPRINT_REGULAR = False  # Compact JSON responses

    # -------------------------------
    # Session Configuration
    # -------------------------------
    SESSION_TYPE = 'filesystem'
    SESSION_REDIS_URL = None
    SESSION_FILE_DIR = os.path.join(os.path.dirname(__file__), '.sessions')
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_KEY_PREFIX = 'session:'
    PERMANENT_SESSION_LIFETIME = 86400  # 24 hours

    # -------------------------------
    # Monitoring & Logging
    # -------------------------------
    SLOW_QUERY_THRESHOLD = 1000  # Log queries slower than 1 second
    ENABLE_QUERY_PROFILING = os.getenv("ENABLE_PROFILING", "False").lower() == "true"
    LOG_SLOW_REQUESTS = True
    SLOW_REQUEST_THRESHOLD = 2000  # Log requests slower than 2 seconds

    # -------------------------------
    # Supabase (unchanged)
    # -------------------------------
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # -------------------------------
    # JWT - SECURITY HARDENED (Phase 1: Desktop mode support)
    # -------------------------------
    JWT_SECRET = os.getenv("JWT_SECRET")
    if not JWT_SECRET:
        raise ValueError(
            "CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set!\n"
            "Generate a strong secret with: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
            "Then add it to your .env file: JWT_SECRET=<generated-secret>"
        )
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "2"))  # Web/online mode (default 2h)
    JWT_DESKTOP_EXPIRATION_HOURS = 168  # 7 days for desktop/offline mode (Phase 2)

    # -------------------------------
    # Concurrent session policy
    # -------------------------------
    # Maximum number of simultaneously-active sessions allowed per user account.
    # 1 = single-device: a new login auto-logs-out the previous device.
    # Set higher to allow multiple devices per account; 0 disables enforcement.
    MAX_CONCURRENT_SESSIONS_PER_USER = int(
        os.getenv("MAX_CONCURRENT_SESSIONS_PER_USER", "1")
    )

    # -------------------------------
    # Flask - SECURITY HARDENED
    # -------------------------------
    SECRET_KEY = os.getenv("SECRET_KEY")
    if not SECRET_KEY:
        raise ValueError(
            "CRITICAL SECURITY ERROR: SECRET_KEY environment variable is not set!\n"
            "Generate a strong secret with: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
            "Then add it to your .env file: SECRET_KEY=<generated-secret>"
        )
    DEBUG = os.getenv("DEBUG", "False").lower() in ["true", "1", "yes"]
    PROPAGATE_EXCEPTIONS = True

    # -------------------------------
    # Razorpay (optional — payment features disabled if not set)
    # -------------------------------
    RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', '')
    RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', '')
    RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET', '')

    # -------------------------------
    # Google OAuth (optional — OAuth login disabled if not set)
    # -------------------------------
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')

    # -------------------------------
    # Desktop OAuth handoff (optional — desktop Google login disabled if not set)
    # -------------------------------
    # Shared HMAC secret used to sign/verify the short-lived assertion that
    # bridges a cloud Google login back into the offline desktop app. MUST be
    # identical in the cloud .env AND the installer's env.local. This is NOT the
    # per-install JWT_SECRET — it is a fixed value shared across all installs and
    # the cloud, and must never ship in the renderer/JS bundle.
    DESKTOP_OAUTH_SECRET = os.getenv('DESKTOP_OAUTH_SECRET', '')

    # -------------------------------
    # Email (SMTP — optional, emails disabled if not set)
    # -------------------------------
    SMTP_HOST = os.getenv('SMTP_HOST', '')
    SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
    SMTP_USER = os.getenv('SMTP_USER', '')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
    SMTP_FROM_EMAIL = os.getenv('SMTP_FROM_EMAIL', '')
    SMTP_FROM_NAME = os.getenv('SMTP_FROM_NAME', 'Valoryx')
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://valoryx.ryxtech.in')

    @classmethod
    def get_frontend_url(cls) -> str:
        """
        Return the frontend base URL for use in emails.
        Prefers the Origin header from the current request so the link
        automatically matches whatever host/port the admin is on
        (localhost:3000, :3001, :3002, or production) — no hardcoding needed.
        Falls back to FRONTEND_URL env var when called outside a request context.
        """
        try:
            from flask import request as _req
            origin = (_req.headers.get('Origin') or '').rstrip('/')
            if origin:
                return origin
        except RuntimeError:
            pass  # Outside request context (e.g. scheduler)
        return cls.FRONTEND_URL.rstrip('/')

    # -------------------------------
    # Telegram Bot (optional — scheduler disabled when token is absent)
    # -------------------------------
    TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
    TELEGRAM_REPORT_HOUR = int(os.getenv('TELEGRAM_REPORT_HOUR', '21'))
    TELEGRAM_REPORT_MINUTE = int(os.getenv('TELEGRAM_REPORT_MINUTE', '0'))

    # -------------------------------
    # CORS
    # -------------------------------
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

    # -------------------------------
    # Reverse proxy trust (ProxyFix)
    # -------------------------------
    # Number of reverse-proxy hops in front of the app. ProxyFix uses this to
    # resolve request.remote_addr from X-Forwarded-For safely. Default 1
    # matches the production deployment (nginx → gunicorn). Set 0 when the
    # app is exposed directly (then XFF is ignored entirely).
    TRUSTED_PROXY_COUNT = int(os.getenv("TRUSTED_PROXY_COUNT", "1"))

    # -------------------------------
    # Performance Monitoring
    # -------------------------------
    @classmethod
    def get_performance_config(cls):
        """Get current performance configuration"""
        return {
            "database": {
                "mode": cls.DB_MODE,
                "pool_size": cls.SQLALCHEMY_ENGINE_OPTIONS.get("pool_size", "N/A (SQLite)"),
                "max_overflow": cls.SQLALCHEMY_ENGINE_OPTIONS.get("max_overflow", "N/A (SQLite)"),
                "pool_timeout": cls.SQLALCHEMY_ENGINE_OPTIONS.get("pool_timeout", "N/A (SQLite)"),
                "statement_timeout": "10s",
            },
            "cache": {
                "enabled": False,
            },
            "batch_processing": {
                "batch_size": cls.BATCH_SIZE,
                "bulk_insert_size": cls.BULK_INSERT_SIZE,
            },
            "pagination": {
                "default_size": cls.DEFAULT_PAGE_SIZE,
                "max_size": cls.MAX_PAGE_SIZE,
            },
            "compression": {
                "enabled": True,
                "level": cls.COMPRESS_LEVEL,
                "min_size": cls.COMPRESS_MIN_SIZE,
            },
            "rate_limiting": {
                "enabled": False,
            }
        }
# Create alias for backward compatibility
Config = OptimizedConfig

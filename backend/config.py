import os
import socket
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Force IPv4 resolution for better performance
def force_ipv4_dns():
    """Force DNS to resolve to IPv4 only"""
    original_getaddrinfo = socket.getaddrinfo

    def getaddrinfo_ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)

    socket.getaddrinfo = getaddrinfo_ipv4_only

# Apply IPv4 fix globally
force_ipv4_dns()


class OptimizedConfig:
    """Optimized Flask configuration for high performance"""

    # -------------------------------
    # Database - OPTIMIZED SETTINGS
    # -------------------------------
    SQLALCHEMY_DATABASE_URI = os.getenv("DB_URL", "sqlite:///app.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False  # Disable to save resources

    # OPTIMIZED CONNECTION POOL SETTINGS
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,  # Verify connections before using
        "pool_recycle": 3600,  # Recycle connections after 1 hour
        "pool_size": 50,  # Increased pool size for high concurrency
        "max_overflow": 100,  # Allow more overflow connections
        "pool_timeout": 5,  # Quick timeout to fail fast
        "echo": False,  # Disable SQL logging in production
        "execution_options": {
            "compiled_cache": {},  # Enable query compilation caching
            "isolation_level": "READ COMMITTED",  # Prevent lock contention
        },
        "connect_args": {
            "connect_timeout": 30,  # Allow more time for initial connection
            "keepalives": 1,
            "keepalives_idle": 5,
            "keepalives_interval": 2,
            "keepalives_count": 2,
            "application_name": "mj-billing-backend",
            "options": "-c statement_timeout=10000",  # 10s timeout
        },
    }

    # Query optimization
    SQLALCHEMY_RECORD_QUERIES = False  # Disable in production
    SQLALCHEMY_NATIVE_UNICODE = True

    # -------------------------------
    # Cache Configuration (Redis optional for desktop mode)
    # -------------------------------
    REDIS_URL = os.getenv("REDIS_URL", "")
    REDIS_AVAILABLE = bool(REDIS_URL) and os.getenv("USE_REDIS", "false").lower() == "true"

    # Use SimpleCache for desktop/standalone mode, Redis for server mode
    if REDIS_AVAILABLE:
        CACHE_TYPE = "RedisCache"
        CACHE_REDIS_URL = REDIS_URL
    else:
        CACHE_TYPE = "SimpleCache"  # In-memory cache, no Redis needed
        CACHE_REDIS_URL = None

    CACHE_DEFAULT_TIMEOUT = 300  # 5 minutes default
    CACHE_KEY_PREFIX = "mj-billing:"

    # Cache timeouts for different data types
    CACHE_TIMEOUTS = {
        "stock_list": 60,  # 1 minute for stock lists
        "product_lookup": 300,  # 5 minutes for product lookups
        "analytics": 120,  # 2 minutes for analytics
        "bill_list": 30,  # 30 seconds for bill lists
        "client_info": 600,  # 10 minutes for client info
    }

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
    # API Rate Limiting
    # -------------------------------
    RATELIMIT_ENABLED = REDIS_AVAILABLE  # Only enable if Redis available
    RATELIMIT_STORAGE_URL = REDIS_URL if REDIS_AVAILABLE else "memory://"
    RATELIMIT_DEFAULT = "1000/hour"  # Default rate limit
    RATELIMIT_HEADERS_ENABLED = True

    # Specific rate limits
    RATE_LIMITS = {
        "analytics": "100/minute",
        "bulk_upload": "10/minute",
        "bill_create": "300/minute",
        "stock_update": "500/minute",
    }

    # -------------------------------
    # Request/Response Optimization
    # -------------------------------
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max request size
    JSON_SORT_KEYS = False  # Don't waste time sorting
    JSONIFY_PRETTYPRINT_REGULAR = False  # Compact JSON responses

    # -------------------------------
    # Session Configuration
    # -------------------------------
    SESSION_TYPE = 'redis' if REDIS_AVAILABLE else 'filesystem'
    SESSION_REDIS_URL = REDIS_URL if REDIS_AVAILABLE else None
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
    # JWT - SECURITY HARDENED
    # -------------------------------
    JWT_SECRET = os.getenv("JWT_SECRET")
    if not JWT_SECRET:
        raise ValueError(
            "CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set!\n"
            "Generate a strong secret with: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
            "Then add it to your .env file: JWT_SECRET=<generated-secret>"
        )
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 24

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
    # CORS
    # -------------------------------
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

    # -------------------------------
    # Performance Monitoring
    # -------------------------------
    @classmethod
    def get_performance_config(cls):
        """Get current performance configuration"""
        return {
            "database": {
                "pool_size": cls.SQLALCHEMY_ENGINE_OPTIONS["pool_size"],
                "max_overflow": cls.SQLALCHEMY_ENGINE_OPTIONS["max_overflow"],
                "pool_timeout": cls.SQLALCHEMY_ENGINE_OPTIONS["pool_timeout"],
                "statement_timeout": "10s",
            },
            "cache": {
                "enabled": bool(cls.REDIS_URL),
                "default_timeout": cls.CACHE_DEFAULT_TIMEOUT,
                "key_prefix": cls.CACHE_KEY_PREFIX,
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
                "enabled": cls.RATELIMIT_ENABLED,
                "default": cls.RATELIMIT_DEFAULT,
            }
        }
# Create alias for backward compatibility
Config = OptimizedConfig

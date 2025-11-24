"""
Cache helper utilities for performance optimization
Provides caching decorators and functions for Redis-based caching
"""
import json
import hashlib
import functools
import logging
from typing import Any, Optional, Callable
from flask import g, request
import redis
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CacheManager:
    """Centralized cache management with Redis"""

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        """Initialize Redis connection with fallback"""
        self.redis_client = None
        self.enabled = False

        try:
            self.redis_client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
                retry_on_timeout=False,
                health_check_interval=30
            )
            # Test connection
            self.redis_client.ping()
            self.enabled = True
            logger.info("Redis cache connected successfully")
        except Exception as e:
            logger.warning(f"Redis cache not available: {e}. Running without cache.")
            self.enabled = False

    def _make_cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate a unique cache key"""
        # Include client_id from g.user if available
        client_id = ""
        if hasattr(g, 'user') and g.user and 'client_id' in g.user:
            client_id = g.user['client_id']

        # Create a unique key from arguments
        key_parts = [prefix, client_id]
        key_parts.extend(str(arg) for arg in args)
        key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))

        key_string = ":".join(key_parts)

        # Hash long keys to avoid Redis key length limits
        if len(key_string) > 200:
            key_hash = hashlib.md5(key_string.encode()).hexdigest()
            return f"{prefix}:{client_id}:{key_hash}"

        return key_string

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled:
            return None

        try:
            value = self.redis_client.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.error(f"Cache get error: {e}")

        return None

    def set(self, key: str, value: Any, timeout: int = 300) -> bool:
        """Set value in cache with timeout in seconds"""
        if not self.enabled:
            return False

        try:
            json_value = json.dumps(value, default=str)
            return self.redis_client.setex(key, timeout, json_value)
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.enabled:
            return False

        try:
            return bool(self.redis_client.delete(key))
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False

    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        if not self.enabled:
            return 0

        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache delete pattern error: {e}")
            return 0

    def invalidate_client_cache(self, client_id: str):
        """Invalidate all cache for a specific client"""
        if not self.enabled:
            return

        try:
            # Delete all keys for this client
            pattern = f"*:{client_id}:*"
            deleted = self.delete_pattern(pattern)
            logger.info(f"Invalidated {deleted} cache keys for client {client_id}")
        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")


# Global cache instance
_cache_manager = None


def get_cache_manager() -> CacheManager:
    """Get or create cache manager instance"""
    global _cache_manager
    if _cache_manager is None:
        from config import Config
        redis_url = getattr(Config, 'REDIS_URL', 'redis://localhost:6379/0')
        _cache_manager = CacheManager(redis_url)
    return _cache_manager


def cache_result(timeout: int = 300, key_prefix: str = ""):
    """
    Decorator to cache function results

    Usage:
        @cache_result(timeout=600, key_prefix="stock_list")
        def get_stock_list(client_id):
            # ... expensive database query
            return results
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            cache = get_cache_manager()

            # Generate cache key
            if key_prefix:
                cache_key = cache._make_cache_key(key_prefix, *args, **kwargs)
            else:
                cache_key = cache._make_cache_key(func.__name__, *args, **kwargs)

            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_value

            # Execute function and cache result
            logger.debug(f"Cache miss: {cache_key}")
            result = func(*args, **kwargs)

            # Cache the result
            cache.set(cache_key, result, timeout)

            return result

        return wrapper
    return decorator


def cache_route(timeout: int = 60):
    """
    Decorator specifically for Flask routes
    Caches based on URL, query params, and client_id

    Usage:
        @stock_bp.route('', methods=['GET'])
        @authenticate
        @cache_route(timeout=120)
        def get_stock():
            # ... route logic
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            cache = get_cache_manager()

            # Build cache key from request
            client_id = g.user.get('client_id', '') if hasattr(g, 'user') and g.user else ''
            url_path = request.path
            query_string = request.query_string.decode('utf-8')

            cache_key = f"route:{client_id}:{url_path}:{query_string}"

            # Try to get from cache
            cached_response = cache.get(cache_key)
            if cached_response is not None:
                logger.debug(f"Route cache hit: {url_path}")
                return cached_response

            # Execute route and cache result
            logger.debug(f"Route cache miss: {url_path}")
            result = func(*args, **kwargs)

            # Only cache successful responses
            if isinstance(result, tuple):
                response_data, status_code = result
                if status_code == 200:
                    cache.set(cache_key, result, timeout)

            return result

        return wrapper
    return decorator


def invalidate_stock_cache(client_id: str):
    """Invalidate all stock-related cache for a client"""
    cache = get_cache_manager()
    cache.delete_pattern(f"*stock*:{client_id}:*")
    cache.delete_pattern(f"route:{client_id}:/api/stock*")
    logger.info(f"Invalidated stock cache for client {client_id}")


def invalidate_billing_cache(client_id: str):
    """Invalidate all billing-related cache for a client"""
    cache = get_cache_manager()
    cache.delete_pattern(f"*bill*:{client_id}:*")
    cache.delete_pattern(f"route:{client_id}:/api/billing*")
    cache.delete_pattern(f"*analytics*:{client_id}:*")
    logger.info(f"Invalidated billing cache for client {client_id}")


def warm_cache(client_id: str):
    """Pre-warm cache with frequently accessed data"""
    try:
        from models.stock_model import StockEntry
        from models.billing_model import GSTBilling, NonGSTBilling

        cache = get_cache_manager()

        # Pre-cache stock list
        stock_entries = StockEntry.query.filter_by(client_id=client_id).all()
        stock_data = [entry.to_dict() for entry in stock_entries]
        cache.set(f"stock_list:{client_id}:all", stock_data, 300)

        # Pre-cache low stock items
        low_stock = [e for e in stock_entries if e.quantity <= e.low_stock_alert]
        low_stock_data = [entry.to_dict() for entry in low_stock]
        cache.set(f"stock_alerts:{client_id}", low_stock_data, 600)

        logger.info(f"Cache warmed for client {client_id}")

    except Exception as e:
        logger.error(f"Cache warming error: {e}")


class QueryCache:
    """Cache for database query results"""

    @staticmethod
    def get_cached_query(query, cache_key: str, timeout: int = 60):
        """
        Execute query with caching

        Usage:
            results = QueryCache.get_cached_query(
                StockEntry.query.filter_by(client_id=client_id),
                f"stock:{client_id}",
                timeout=300
            )
        """
        cache = get_cache_manager()

        # Try cache first
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Execute query
        results = query.all()
        result_data = [r.to_dict() if hasattr(r, 'to_dict') else r for r in results]

        # Cache results
        cache.set(cache_key, result_data, timeout)

        return result_data


class BatchProcessor:
    """Utilities for batch processing to improve performance"""

    @staticmethod
    def process_in_batches(items, batch_size: int = 100, processor: Callable = None):
        """
        Process items in batches to avoid memory issues

        Usage:
            def process_batch(batch):
                # Process batch of items
                return processed_batch

            results = BatchProcessor.process_in_batches(
                large_list,
                batch_size=50,
                processor=process_batch
            )
        """
        results = []
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            if processor:
                batch_result = processor(batch)
                results.extend(batch_result if batch_result else [])
            else:
                results.extend(batch)
        return results

    @staticmethod
    def bulk_insert(db_session, model_class, records, batch_size: int = 500):
        """
        Bulk insert records in batches

        Usage:
            BatchProcessor.bulk_insert(
                db.session,
                StockEntry,
                new_stock_records,
                batch_size=100
            )
        """
        try:
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                db_session.bulk_insert_mappings(model_class, batch)
                db_session.commit()
                logger.info(f"Inserted batch {i//batch_size + 1} ({len(batch)} records)")

            return True
        except Exception as e:
            db_session.rollback()
            logger.error(f"Bulk insert error: {e}")
            return False


# Performance monitoring decorator
def monitor_performance(func: Callable) -> Callable:
    """
    Decorator to monitor function performance

    Usage:
        @monitor_performance
        def slow_function():
            # ... some slow operation
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        import time
        start_time = time.time()

        try:
            result = func(*args, **kwargs)
            elapsed = (time.time() - start_time) * 1000  # Convert to ms

            if elapsed > 1000:  # Log if slower than 1 second
                logger.warning(f"Slow function: {func.__name__} took {elapsed:.2f}ms")
            else:
                logger.debug(f"Function {func.__name__} took {elapsed:.2f}ms")

            return result
        except Exception as e:
            elapsed = (time.time() - start_time) * 1000
            logger.error(f"Function {func.__name__} failed after {elapsed:.2f}ms: {e}")
            raise

    return wrapper
"""
RYX Billing - Simple In-Memory Cache for Reports
Provides fast caching for frequently accessed report data
"""
from datetime import datetime, timedelta
from typing import Any, Optional, Callable
import hashlib
import json
from functools import wraps


class SimpleCache:
    """Simple in-memory cache with TTL support and max size limit"""

    def __init__(self, max_size: int = 1000):
        self._cache = {}
        self._ttl = {}
        self._max_size = max_size
        self._access_order = []  # Track access order for LRU eviction

    def _is_expired(self, key: str) -> bool:
        """Check if cache entry is expired"""
        if key not in self._ttl:
            return True
        return datetime.now() > self._ttl[key]

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if key in self._cache and not self._is_expired(key):
            return self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl_seconds: int = 300):
        """Set value in cache with TTL (default 5 minutes)"""
        # Evict oldest entries if cache is full (LRU eviction)
        if len(self._cache) >= self._max_size and key not in self._cache:
            self._evict_oldest()

        self._cache[key] = value
        self._ttl[key] = datetime.now() + timedelta(seconds=ttl_seconds)

        # Update access order
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)

    def _evict_oldest(self):
        """Evict oldest/expired entries to make room"""
        # First, remove expired entries
        expired_keys = [k for k in self._cache.keys() if self._is_expired(k)]
        for key in expired_keys:
            self.delete(key)

        # If still too full, remove oldest accessed entries (LRU)
        while len(self._cache) >= self._max_size and self._access_order:
            oldest_key = self._access_order.pop(0)
            if oldest_key in self._cache:
                del self._cache[oldest_key]
            if oldest_key in self._ttl:
                del self._ttl[oldest_key]

    def delete(self, key: str):
        """Delete value from cache"""
        if key in self._cache:
            del self._cache[key]
        if key in self._ttl:
            del self._ttl[key]
        if key in self._access_order:
            self._access_order.remove(key)

    def clear(self):
        """Clear all cache"""
        self._cache.clear()
        self._ttl.clear()
        self._access_order.clear()

    def invalidate_pattern(self, pattern: str):
        """Invalidate all keys matching pattern"""
        keys_to_delete = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_delete:
            self.delete(key)


# Global cache instance
cache = SimpleCache()


def generate_cache_key(*args, **kwargs) -> str:
    """Generate cache key from arguments"""
    key_data = f"{args}_{kwargs}"
    return hashlib.md5(key_data.encode()).hexdigest()


def cached(ttl_seconds: int = 300, key_prefix: str = ""):
    """
    Decorator to cache function results

    Usage:
        @cached(ttl_seconds=300, key_prefix="reports")
        def get_report_data(start_date, end_date):
            # expensive operation
            return data
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{generate_cache_key(*args, **kwargs)}"

            # Try to get from cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function and cache result
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl_seconds)
            return result

        return wrapper
    return decorator


def invalidate_cache(pattern: str = ""):
    """Invalidate cache by pattern"""
    if pattern:
        cache.invalidate_pattern(pattern)
    else:
        cache.clear()


# Export
__all__ = ['cache', 'cached', 'invalidate_cache', 'generate_cache_key']

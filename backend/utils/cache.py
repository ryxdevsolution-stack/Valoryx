"""
Valoryx - Cache stub (no-op implementation)
All caching has been removed. Functions kept as stubs for import compatibility.
"""


class SimpleCache:
    """No-op cache — all operations do nothing"""

    def get(self, key):
        return None

    def set(self, key, value, ttl_seconds=300):
        pass

    def delete(self, key):
        pass

    def clear(self):
        pass

    def invalidate_pattern(self, pattern):
        pass


cache = SimpleCache()


def generate_cache_key(*args, **kwargs):
    return ""


def cached(ttl_seconds=300, key_prefix=""):
    """No-op decorator"""
    import functools
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


def invalidate_cache(pattern=""):
    pass


__all__ = ['cache', 'cached', 'invalidate_cache', 'generate_cache_key']

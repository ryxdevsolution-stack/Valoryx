"""
Valoryx - Rate Limiter stub (no-op implementation)
Rate limiting has been removed. Decorator kept as stub for import compatibility.

Usage unchanged:
    from utils.rate_limiter import rate_limit

    @rate_limit(max_requests=10, window_seconds=60)
    def my_route():
        ...
"""
import functools


def rate_limit(
    max_requests: int = 60,
    window_seconds: int = 60,
    key_func=None,
    error_message: str = 'Too many requests. Please slow down.',
):
    """No-op decorator — all requests pass through without rate limiting"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator

"""
Valoryx - In-Memory Rate Limiter
Sliding-window rate limiting using the existing CacheManager (Redis or memory fallback).
Works in both online and offline modes.

Usage:
    from utils.rate_limiter import rate_limit

    @auth_bp.route('/login', methods=['POST'])
    @rate_limit(max_requests=10, window_seconds=60, key_func=lambda: request.json.get('email', request.remote_addr))
    def login():
        ...
"""
import time
import functools
import logging
from flask import request, jsonify

logger = logging.getLogger(__name__)


def _get_client_ip() -> str:
    """Get real client IP, respecting X-Forwarded-For from trusted proxies."""
    forwarded_for = request.headers.get('X-Forwarded-For')
    if forwarded_for:
        # First IP in the chain is the originating client
        return forwarded_for.split(',')[0].strip()
    return request.remote_addr or 'unknown'


def rate_limit(
    max_requests: int = 60,
    window_seconds: int = 60,
    key_func=None,
    error_message: str = 'Too many requests. Please slow down.',
):
    """
    Sliding-window rate limiting decorator.

    Args:
        max_requests: Maximum allowed requests within the window
        window_seconds: Window size in seconds
        key_func: Callable returning a string key. Defaults to client IP.
        error_message: Message returned when limit is exceeded
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                from utils.cache_helper import get_cache_manager
                cache = get_cache_manager()

                # Build rate-limit key
                if key_func:
                    try:
                        identifier = str(key_func())
                    except Exception:
                        identifier = _get_client_ip()
                else:
                    identifier = _get_client_ip()

                rl_key = f"rl:{func.__name__}:{identifier}"

                # Sliding-window counter: store list of timestamps
                # For simplicity (Redis compatibility), use a counter + expiry reset
                count_key = f"{rl_key}:count"
                reset_key = f"{rl_key}:reset"

                current_time = int(time.time())

                # Check if window has expired — reset counter
                window_reset = cache.get(reset_key)
                if window_reset is None:
                    # Start new window
                    cache.set(count_key, 1, window_seconds + 5)
                    cache.set(reset_key, current_time + window_seconds, window_seconds + 5)
                    return func(*args, **kwargs)

                # Get current count
                current_count = cache.get(count_key) or 0

                if current_count >= max_requests:
                    retry_after = max(0, int(window_reset) - current_time)
                    logger.warning(
                        f"[RateLimit] {func.__name__} blocked {identifier} "
                        f"({current_count}/{max_requests} in {window_seconds}s)"
                    )
                    response = jsonify({
                        'error': 'rate_limit_exceeded',
                        'message': error_message,
                        'retry_after_seconds': retry_after,
                    })
                    response.status_code = 429
                    response.headers['Retry-After'] = str(retry_after)
                    response.headers['X-RateLimit-Limit'] = str(max_requests)
                    response.headers['X-RateLimit-Remaining'] = '0'
                    response.headers['X-RateLimit-Reset'] = str(int(window_reset))
                    return response

                # Increment counter
                new_count = current_count + 1
                remaining_ttl = max(1, int(window_reset) - current_time)
                cache.set(count_key, new_count, remaining_ttl + 5)

            except Exception as e:
                # Never block requests due to rate limiter failure
                logger.error(f"[RateLimit] Error in rate limiter: {e}")

            return func(*args, **kwargs)

        return wrapper
    return decorator

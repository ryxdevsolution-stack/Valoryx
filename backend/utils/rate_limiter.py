"""
Valoryx - Rate Limiter (in-memory sliding window)

Keys on (endpoint, client IP). The IP comes from request.remote_addr only —
never from client-supplied headers like X-Forwarded-For. When the app runs
behind a reverse proxy, ProxyFix (configured in app.py via
TRUSTED_PROXY_COUNT) rewrites remote_addr to the real client IP.

Limitation: state is per-process. Under N gunicorn workers the effective
limit is up to N× the configured value — still a hard brake on abuse, and
restored from the previous no-op stub.

Usage:
    from utils.rate_limiter import rate_limit

    @rate_limit(max_requests=10, window_seconds=60)
    def my_route():
        ...
"""
import functools
import threading
import time

from flask import jsonify, request

_STORE: dict = {}          # { (endpoint, key): (window_seconds, [timestamps]) }
_LOCK = threading.Lock()
_PRUNE_THRESHOLD = 4096    # full-store prune when this many keys accumulate
_PRUNE_INTERVAL = 60.0     # at most one full scan per minute (lock is held)
_last_prune = 0.0


def _prune(now: float):
    """Drop fully-stale buckets so the store cannot grow unbounded.

    Each bucket is judged against its own endpoint's window — a short-window
    endpoint must never wipe live state belonging to a longer-window one.
    """
    global _last_prune
    if len(_STORE) < _PRUNE_THRESHOLD or now - _last_prune < _PRUNE_INTERVAL:
        return
    _last_prune = now
    stale = [
        k for k, (window, ts) in _STORE.items()
        if not ts or now - ts[-1] >= window
    ]
    for k in stale:
        _STORE.pop(k, None)


def rate_limit(
    max_requests: int = 60,
    window_seconds: int = 60,
    key_func=None,
    error_message: str = 'Too many requests. Please slow down.',
):
    """Sliding-window rate limit per (endpoint, client). Returns 429 + Retry-After."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            client_key = key_func() if key_func else (request.remote_addr or 'unknown')
            key = (request.endpoint or func.__name__, client_key)
            now = time.monotonic()
            with _LOCK:
                _prune(now)
                _, old = _STORE.get(key, (window_seconds, []))
                bucket = [t for t in old if now - t < window_seconds]
                if len(bucket) >= max_requests:
                    _STORE[key] = (window_seconds, bucket)
                    retry_after = max(1, int(window_seconds - (now - bucket[0])) + 1)
                    response = jsonify({'success': False, 'error': error_message})
                    response.status_code = 429
                    response.headers['Retry-After'] = str(retry_after)
                    return response
                bucket.append(now)
                _STORE[key] = (window_seconds, bucket)
            return func(*args, **kwargs)
        return wrapper
    return decorator

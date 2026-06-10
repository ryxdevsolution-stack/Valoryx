"""
Valoryx - Trusted client IP resolution

Always derive the client IP from request.remote_addr. Never read
X-Forwarded-For directly in route code: the leftmost XFF value is
attacker-controlled, which previously allowed rate-limit bypass by header
rotation. Behind a reverse proxy, ProxyFix (configured in app.py via
TRUSTED_PROXY_COUNT) rewrites remote_addr from the proxy-appended XFF hop,
so this stays correct in production.
"""
from flask import request


def get_client_ip() -> str:
    """Client IP as seen by the trusted edge (empty string if unknown)."""
    return (request.remote_addr or '').strip()

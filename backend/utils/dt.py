"""
Datetime utilities for safe comparison between naive and timezone-aware datetimes.

Supabase/PostgreSQL returns TIMESTAMPTZ columns as timezone-aware datetimes,
while datetime.utcnow() is naive. Mixing them raises TypeError on Python 3.
Use these helpers everywhere a stored datetime is compared to "now".
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


def is_past(dt: datetime | None) -> bool:
    """Return True if dt is in the past (or None). Safe with both naive and aware datetimes."""
    if dt is None:
        return True
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return now > dt

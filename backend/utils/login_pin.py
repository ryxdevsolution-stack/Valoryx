"""Quick-login PIN rules — one place for who may have a PIN and what a valid PIN is.

Used by login (routes/auth.py), the owner's Team screen (routes/team.py) and the
user's own My Profile (routes/profile.py).
"""
import re
from datetime import datetime

import bcrypt

PIN_RE = re.compile(r'^\d{4}$')
PIN_ROLES = ('staff', 'manager')       # owners and super-admins always use their password
PIN_MAX_FAILURES = 5                   # every 5 wrong PINs → 15-minute lock
PIN_LOCK_SECONDS = 15 * 60
# Failures accumulate until a successful login (they do NOT reset when a lock expires).
# At this many, PIN login is switched off until a password login or an owner reset —
# so the 10,000 PINs can't be worked through 5 at a time.
PIN_DISABLE_AFTER = 10
_OBVIOUS_PINS = {'1234', '4321', '0123', '9876'}


def pin_eligible(user) -> bool:
    return bool(user) and not user.is_super_admin and (user.role or '').lower() in PIN_ROLES


def validate_new_pin(pin: str):
    """Return an error message for a bad PIN, or None when it's acceptable."""
    if not PIN_RE.match(pin or ''):
        return 'PIN must be exactly 4 digits'
    if len(set(pin)) == 1 or pin in _OBVIOUS_PINS:
        return 'Choose a less obvious PIN (not 1111, 1234, …)'
    return None


def apply_pin(user, pin, actor_id):
    """Store a (validated) PIN hashed and clear any wrong-PIN lock. Caller commits."""
    user.pin_hash = bcrypt.hashpw(pin.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user.pin_set_at = datetime.utcnow()
    user.pin_failed_attempts, user.pin_locked_until = 0, None
    user.updated_at = datetime.utcnow()
    user.updated_by = actor_id


def clear_pin(user, actor_id):
    user.pin_hash = None
    user.pin_set_at = None
    user.pin_failed_attempts, user.pin_locked_until = 0, None
    user.updated_at = datetime.utcnow()
    user.updated_by = actor_id

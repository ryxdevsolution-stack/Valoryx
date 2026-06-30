"""
Device identity for offline bill-number prefixing.

Each offline desktop install has a short, stable code (e.g. "A7K2"). Bills made
offline are shown as ``<code>-<number>`` so two devices billing while offline
never produce the same human-facing bill number after they sync to the cloud.

Source of truth (in order):
  1. ``DEVICE_CODE`` env var — set by the Electron shell from its per-install
     ``local-secrets.json`` (survives DB resets/reinstalls of the data file).
  2. A value persisted in the local SQLite ``app_meta`` table — fallback for
     dev runs / non-Electron launches.

In ONLINE mode there is a single shared server authority, so there is no device
prefix and this returns ``None`` (web bills stay plain integers).
"""

import os
import secrets as _secrets

from sqlalchemy import text
from extensions import db

# Single letter (e.g. "A"); ambiguous I/O excluded for readability.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_CODE_LEN = 1
_cache = {}


def _is_offline():
    return os.getenv('DB_MODE', 'offline').lower() != 'online'


def _generate():
    return ''.join(_secrets.choice(_ALPHABET) for _ in range(_CODE_LEN))


def get_device_code():
    """Return this install's bill-number prefix, or None in online mode."""
    if not _is_offline():
        return None
    if 'code' in _cache:
        return _cache['code']

    code = (os.getenv('DEVICE_CODE') or '').strip().upper()
    if not code:
        code = _load_or_create_persisted()

    _cache['code'] = code
    return code


def _load_or_create_persisted():
    """Read (or lazily create) the device code in the local SQLite app_meta kv.

    Only used when the Electron-provided env var is absent (e.g. dev). app_meta
    is intentionally NOT part of the sync registry, so the code stays per-device.
    """
    try:
        db.session.execute(text(
            "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)"
        ))
        row = db.session.execute(
            text("SELECT value FROM app_meta WHERE key = 'device_code'")
        ).fetchone()
        if row and row[0]:
            return row[0]
        code = _generate()
        db.session.execute(
            text("INSERT INTO app_meta (key, value) VALUES ('device_code', :v)"),
            {"v": code},
        )
        db.session.commit()
        return code
    except Exception:
        # Never block billing on this — fall back to an ephemeral code.
        db.session.rollback()
        return _generate()

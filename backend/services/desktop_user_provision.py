"""Desktop (Electron): bring a cloud user down on their first Google login.

Automatic sync does not run on desktop installs, so a user created in the cloud after
the desktop was set up (new staff member, a new Google sign-up for the shop) never
reaches the local database — and desktop Google login could only say "not set up on
this device". This module fetches *that one user* (and their permissions) straight from
Supabase, but only when:

  * the Google identity was already verified by the cloud (signed, PKCE-bound assertion
    — checked by the caller before calling this), and
  * the cloud user belongs to a shop (client) that is already on this device.

It deliberately does NOT re-run the full first-run import: that uses INSERT OR REPLACE
on every table and would overwrite local changes that haven't been uploaded yet.
"""
import logging
import os
import uuid
from datetime import datetime

import bcrypt

from sqlalchemy import create_engine, text as sa_text

from extensions import db
from models.client_model import ClientEntry
from models.permission_model import Permission, UserPermission
from models.user_model import User
from config import Config

logger = logging.getLogger(__name__)

# Never copy credentials / device-local secrets down from the cloud row.
_SKIP_COLUMNS = {'totp_secret', 'totp_backup_codes', 'pin_hash', 'pin_set_at',
                 'pin_failed_attempts', 'pin_locked_until'}


def _plain(value):
    """UUID → str; everything else as-is (SQLite-friendly)."""
    return str(value) if isinstance(value, uuid.UUID) else value


def is_desktop_install() -> bool:
    """Offline desktop backend that can still reach the cloud database."""
    return str(getattr(Config, 'DB_MODE', '')).lower() == 'offline' and bool(os.environ.get('DB_URL'))


def _password_matches(password: str, password_hash) -> bool:
    try:
        return bool(password and password_hash) and bcrypt.checkpw(
            password.encode('utf-8'), str(password_hash).encode('utf-8'))
    except ValueError:  # malformed / empty hash (e.g. Google-only account)
        return False


def _engine():
    db_url = os.environ.get('DB_URL')
    # connect_timeout is a Postgres (Supabase) option; other drivers reject it.
    connect_args = {'connect_timeout': 15} if db_url.startswith('postgres') else {}
    return create_engine(db_url, pool_pre_ping=True, connect_args=connect_args)


def refresh_password_from_cloud(user, password: str) -> bool:
    """Desktop: the typed password failed locally — accept it if it is the CLOUD password.

    Happens after a password change / reset on the website: the cloud has the new hash,
    this device still has the old one (sync doesn't run automatically). On a match the
    local hash is replaced so later offline logins work too.
    """
    if not is_desktop_install() or not user or not password:
        return False
    engine = _engine()
    try:
        with engine.connect() as conn:
            row = conn.execute(sa_text(
                "SELECT password_hash FROM users WHERE user_id = :uid AND is_active = TRUE "
                "AND deleted_at IS NULL"), {'uid': str(user.user_id)}).first()
    finally:
        engine.dispose()
    if not row or not _password_matches(password, row[0]):
        return False
    user.password_hash = row[0]
    user.synced_at = datetime.utcnow()  # now identical to the cloud — nothing to upload
    db.session.commit()
    logger.info('Desktop login: password for %s refreshed from the cloud', user.email)
    return True


def provision_cloud_user(email: str, google_id: str = '', password: str = None):
    """Copy a verified cloud user of a shop already on this device. Returns the local User or None.

    Identity must already be proven: by a cloud-signed Google assertion (google_id), or by
    `password`, which must match the cloud user's password hash.
    """
    db_url = os.environ.get('DB_URL')
    if not db_url or not email:
        return None

    engine = _engine()
    try:
        with engine.connect() as conn:
            row = conn.execute(sa_text(
                "SELECT * FROM users WHERE lower(email) = :email AND is_active = TRUE "
                "AND deleted_at IS NULL LIMIT 1"), {'email': email.lower()}).mappings().first()
            if not row:
                return None
            if password is not None and not _password_matches(password, row.get('password_hash')):
                return None
            if google_id and row.get('google_id') and row['google_id'] != google_id:
                logger.warning('Desktop provision: google_id mismatch for %s', email)
                return None
            # Same-shop only: the device must already hold this user's client.
            client_id = str(row['client_id'])
            if not ClientEntry.query.filter_by(client_id=client_id, is_active=True).first():
                logger.info('Desktop provision: %s belongs to a shop not on this device', email)
                return None
            perm_rows = conn.execute(sa_text(
                "SELECT up.id, p.permission_name FROM user_permissions up "
                "JOIN permissions p ON p.permission_id = up.permission_id "
                "WHERE up.user_id = :uid"), {'uid': row['user_id']}).fetchall()
    finally:
        engine.dispose()

    user_id = str(row['user_id'])
    if User.query.filter_by(user_id=user_id).first():
        return User.query.filter_by(user_id=user_id, is_active=True).first()

    # Through the model (not raw SQL) so local NOT NULL columns get their defaults.
    model_cols = {c.key for c in User.__table__.columns}
    # NULLs are left out so local defaults apply (a column optional in the cloud may be
    # NOT NULL locally, e.g. report_email_frequency).
    values = {k: _plain(v) for k, v in row.items()
              if k in model_cols and k not in _SKIP_COLUMNS and v is not None}
    values['synced_at'] = datetime.utcnow()  # came from the cloud — nothing to upload
    db.session.add(User(**values))

    # Permissions are matched by name: local permission_ids differ from the cloud's.
    local_perm_ids = {p.permission_name: p.permission_id for p in Permission.query.all()}
    now = datetime.utcnow()
    for up_id, name in perm_rows:
        pid = local_perm_ids.get(name)
        if pid:
            db.session.add(UserPermission(id=str(up_id), user_id=user_id, permission_id=pid,
                                          granted_at=now, synced_at=now))
    db.session.commit()
    logger.info('Desktop provision: copied %s (%d permissions) from the cloud', email, len(perm_rows))
    return User.query.filter_by(user_id=user_id, is_active=True).first()

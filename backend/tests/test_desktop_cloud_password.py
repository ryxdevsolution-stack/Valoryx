"""Desktop password login falls back to the cloud.

The desktop keeps its own copy of users and sync doesn't run automatically, so:
- after a password change/reset on the website, the desktop still had the OLD hash and
  rejected the new password;
- a user added in the cloud after setup could not log in with a password at all.
"""
import json
import sqlite3
import uuid

import bcrypt
import pytest

from config import Config
from conftest import _bcrypt

NEW_PW = 'NewCloudPass#1'
OLD_PW = 'TestPass123!'  # sample_user's local password


def _cloud(tmp_path, rows):
    """SQLite stand-in for Supabase. rows: (user_id, client_id, email, password_hash, role)."""
    path = tmp_path / 'cloud.db'
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE users (user_id TEXT, client_id TEXT, email TEXT, password_hash TEXT, role TEXT,
            full_name TEXT, is_active BOOLEAN, is_super_admin BOOLEAN, deleted_at TEXT, google_id TEXT,
            invite_accepted BOOLEAN);
        CREATE TABLE permissions (permission_id TEXT, permission_name TEXT);
        CREATE TABLE user_permissions (id TEXT, user_id TEXT, permission_id TEXT);
    """)
    for uid, cid, email, pw_hash, role in rows:
        c.execute("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (uid, cid, email, pw_hash, role, 'Cloud User', 1, 0, None, None, 1))
    c.commit()
    c.close()
    return f"sqlite:///{path}"


@pytest.fixture
def desktop(monkeypatch):
    import routes.auth as auth_mod
    monkeypatch.setattr(Config, 'DB_MODE', 'offline')
    auth_mod._LOGIN_FAIL_STORE.clear()
    yield monkeypatch
    auth_mod._LOGIN_FAIL_STORE.clear()


def _login(http, email, pw):
    return http.post('/api/auth/login', data=json.dumps({'email': email, 'password': pw}),
                     content_type='application/json')


def test_new_password_from_website_works_on_desktop(http, desktop, tmp_path, sample_user, sample_client):
    from models.user_model import User
    url = _cloud(tmp_path, [(str(sample_user.user_id), str(sample_client.client_id), sample_user.email,
                             _bcrypt(NEW_PW), 'manager')])
    desktop.setenv('DB_URL', url)

    resp = _login(http, sample_user.email, NEW_PW)
    assert resp.status_code == 200, resp.get_json()
    stored = User.query.get(sample_user.user_id).password_hash
    assert bcrypt.checkpw(NEW_PW.encode(), stored.encode())  # local copy refreshed


def test_wrong_password_everywhere_is_refused(http, desktop, tmp_path, sample_user, sample_client):
    url = _cloud(tmp_path, [(str(sample_user.user_id), str(sample_client.client_id), sample_user.email,
                             _bcrypt(NEW_PW), 'manager')])
    desktop.setenv('DB_URL', url)
    assert _login(http, sample_user.email, 'Wrong-Everywhere1').status_code == 401


def test_website_never_uses_the_cloud_fallback(http, monkeypatch, tmp_path, sample_user, sample_client):
    import routes.auth as auth_mod
    auth_mod._LOGIN_FAIL_STORE.clear()
    monkeypatch.setattr(Config, 'DB_MODE', 'online')
    url = _cloud(tmp_path, [(str(sample_user.user_id), str(sample_client.client_id), sample_user.email,
                             _bcrypt(NEW_PW), 'manager')])
    monkeypatch.setenv('DB_URL', url)
    assert _login(http, sample_user.email, NEW_PW).status_code == 401


def test_cloud_only_user_with_correct_password_is_copied_down(http, desktop, tmp_path, sample_client):
    from models.user_model import User
    email = f'cloudonly-{uuid.uuid4().hex[:6]}@valoryx-test.invalid'
    uid = str(uuid.uuid4())
    desktop.setenv('DB_URL', _cloud(tmp_path, [(uid, str(sample_client.client_id), email,
                                                 _bcrypt(NEW_PW), 'staff')]))
    resp = _login(http, email, NEW_PW)
    assert resp.status_code == 200, resp.get_json()
    assert User.query.filter_by(email=email).first() is not None


def test_cloud_only_user_with_wrong_password_is_not_copied(http, desktop, tmp_path, sample_client):
    from models.user_model import User
    email = f'cloudonly-{uuid.uuid4().hex[:6]}@valoryx-test.invalid'
    desktop.setenv('DB_URL', _cloud(tmp_path, [(str(uuid.uuid4()), str(sample_client.client_id), email,
                                                 _bcrypt(NEW_PW), 'staff')]))
    assert _login(http, email, 'Not-Their-Password1').status_code == 401
    assert User.query.filter_by(email=email).first() is None

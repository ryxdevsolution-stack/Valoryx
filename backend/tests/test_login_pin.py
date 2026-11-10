"""Quick-login PIN (staff/managers) + sliding session renewal.

- Owner sets a 4-digit PIN; staff/manager log in with email + PIN.
- Owners can never log in with a PIN; their password is required.
- 5 wrong PINs lock PIN login for that user (owner resetting the PIN clears it).
- /auth/session-check renews an old token so an active user is never logged out.
"""
import json
import uuid
from datetime import datetime, timedelta

import jwt
import pytest

from conftest import make_token, auth_hdr, _bcrypt

PASSWORD = "TestPass123!"


@pytest.fixture(autouse=True)
def clear_limits():
    import routes.auth as auth_mod
    from utils.cache_helper import get_cache_manager
    auth_mod._LOGIN_FAIL_STORE.clear()
    yield
    auth_mod._LOGIN_FAIL_STORE.clear()
    get_cache_manager().clear() if hasattr(get_cache_manager(), 'clear') else None


def _login(http, email, secret):
    return http.post('/api/auth/login', data=json.dumps({'email': email, 'password': secret}),
                     content_type='application/json')


def _user(client, role):
    from extensions import db
    from models.user_model import User
    uid = str(uuid.uuid4())
    u = User(user_id=uid, client_id=client.client_id, email=f'{role}-{uid[:8]}@valoryx-test.invalid',
             password_hash=_bcrypt(PASSWORD), full_name=role.title(), role=role, is_active=True,
             is_super_admin=False, invite_accepted=True, totp_enabled=False)
    db.session.add(u)
    db.session.commit()
    return u


def _owner_hdr(owner, client):
    return auth_hdr(make_token(owner.user_id, client.client_id))


def _set_pin(http, owner, client, target, pin):
    return http.put(f'/api/team/{target.user_id}/pin', data=json.dumps({'pin': pin}),
                    content_type='application/json', headers=_owner_hdr(owner, client))


# ── Setting the PIN ──────────────────────────────────────────────────────────

def test_owner_sets_pin_and_staff_logs_in_with_it(http, sample_client):
    owner, staff = _user(sample_client, 'owner'), _user(sample_client, 'staff')
    assert _set_pin(http, owner, sample_client, staff, '4826').status_code == 200

    resp = _login(http, staff.email, '4826')
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json().get('token')
    # Password still works too (force_login: the PIN session above is still active).
    again = http.post('/api/auth/login', data=json.dumps({'email': staff.email, 'password': PASSWORD,
                                                           'force_login': True}),
                      content_type='application/json')
    assert again.status_code == 200


def test_pin_is_stored_hashed_and_listed_as_has_pin(http, sample_client):
    from models.user_model import User
    owner, staff = _user(sample_client, 'owner'), _user(sample_client, 'staff')
    _set_pin(http, owner, sample_client, staff, '4826')
    stored = User.query.get(staff.user_id).pin_hash
    assert stored and stored != '4826' and stored.startswith('$2')
    body = http.get('/api/team', headers=_owner_hdr(owner, sample_client)).get_json()
    row = next((m for m in body.get('data') or [] if str(m['user_id']) == str(staff.user_id)), None)
    assert row is not None, body
    assert row['has_pin'] is True and 'pin_hash' not in row


@pytest.mark.parametrize('bad', ['123', '12345', 'abcd', '1111', '1234'])
def test_weak_or_malformed_pin_rejected(http, sample_client, bad):
    owner, staff = _user(sample_client, 'owner'), _user(sample_client, 'staff')
    assert _set_pin(http, owner, sample_client, staff, bad).status_code == 400


def test_pin_cannot_be_set_for_an_owner(http, sample_client):
    owner, other_owner = _user(sample_client, 'owner'), _user(sample_client, 'owner')
    assert _set_pin(http, owner, sample_client, other_owner, '4826').status_code == 400


def test_only_owner_can_set_pins(http, sample_client):
    manager, staff = _user(sample_client, 'manager'), _user(sample_client, 'staff')
    resp = http.put(f'/api/team/{staff.user_id}/pin', data=json.dumps({'pin': '4826'}),
                    content_type='application/json', headers=_owner_hdr(manager, sample_client))
    assert resp.status_code == 403


# ── Logging in ───────────────────────────────────────────────────────────────

def test_owner_cannot_log_in_with_a_pin(http, sample_client):
    from extensions import db
    owner = _user(sample_client, 'owner')
    owner.pin_hash = _bcrypt('4826')  # even if one were somehow stored
    db.session.commit()
    assert _login(http, owner.email, '4826').status_code == 401
    assert _login(http, owner.email, PASSWORD).status_code == 200


def test_wrong_pin_rejected_and_locks_after_five(http, sample_client):
    owner, staff = _user(sample_client, 'owner'), _user(sample_client, 'staff')
    _set_pin(http, owner, sample_client, staff, '4826')
    import routes.auth as auth_mod
    for _ in range(5):
        assert _login(http, staff.email, '9137').status_code == 401
        auth_mod._LOGIN_FAIL_STORE.clear()  # isolate the PIN lock from the generic email limiter
    locked = _login(http, staff.email, '4826')
    assert locked.status_code == 429 and locked.get_json()['code'] == 'PIN_LOCKED'

    # Owner resetting the PIN clears the lock.
    _set_pin(http, owner, sample_client, staff, '5937')
    assert _login(http, staff.email, '5937').status_code == 200


def test_removed_pin_no_longer_works(http, sample_client):
    owner, staff = _user(sample_client, 'owner'), _user(sample_client, 'staff')
    _set_pin(http, owner, sample_client, staff, '4826')
    assert http.delete(f'/api/team/{staff.user_id}/pin',
                       headers=_owner_hdr(owner, sample_client)).status_code == 200
    assert _login(http, staff.email, '4826').status_code == 401


# ── Sliding session ──────────────────────────────────────────────────────────

def _token(user, client, issued_hours_ago, session=True, permissions=None):
    """A token issued `issued_hours_ago`, optionally backed by a real active session row."""
    from config import Config
    from extensions import db
    from models.session_model import UserSession
    claims = {'user_id': str(user.user_id), 'client_id': str(client.client_id), 'role': user.role,
              'email': user.email, 'is_super_admin': False, 'permissions': permissions or [],
              'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS - issued_hours_ago)}
    if session:
        sid = uuid.uuid4().hex
        db.session.add(UserSession(session_id=sid, user_id=str(user.user_id), client_id=str(client.client_id),
                                   is_active=True, expires_at=claims['exp'].replace(tzinfo=None)))
        db.session.commit()
        claims['session_id'] = sid
    return jwt.encode(claims, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)


def test_fresh_token_is_not_renewed(http, sample_client):
    staff = _user(sample_client, 'staff')
    data = http.get('/api/auth/session-check', headers=auth_hdr(_token(staff, sample_client, 1))).get_json()
    assert data['success'] is True and 'token' not in data


def test_old_token_is_renewed_while_in_use(http, sample_client):
    from config import Config
    staff = _user(sample_client, 'staff')
    data = http.get('/api/auth/session-check', headers=auth_hdr(_token(staff, sample_client, 30))).get_json()
    new = jwt.decode(data['token'], Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
    remaining = new['exp'] - datetime.utcnow().timestamp()
    assert remaining > (Config.JWT_EXPIRATION_HOURS - 1) * 3600  # full lifetime again
    assert new['user_id'] == str(staff.user_id) and new['session_id']


def test_renewal_drops_permissions_the_owner_removed(http, sample_client):
    """The old token still lists a permission the user no longer has — the renewed one must not."""
    from config import Config
    staff = _user(sample_client, 'staff')  # has no permission rows in the DB
    token = _token(staff, sample_client, 30, permissions=['use_membership', 'delete_bills'])
    new = jwt.decode(http.get('/api/auth/session-check', headers=auth_hdr(token)).get_json()['token'],
                     Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
    assert 'use_membership' not in new['permissions'] and 'delete_bills' not in new['permissions']


def test_token_without_session_is_not_renewed(http, sample_client):
    staff = _user(sample_client, 'staff')
    data = http.get('/api/auth/session-check',
                    headers=auth_hdr(_token(staff, sample_client, 30, session=False))).get_json()
    assert 'token' not in data


def test_pin_login_switches_off_after_ten_wrong_pins_until_password_login(http, sample_client):
    """Locks expire, but failures keep adding up: 10 → PIN login off until a password login."""
    from extensions import db
    from models.user_model import User
    import routes.auth as auth_mod
    owner, staff = _user(sample_client, 'owner'), _user(sample_client, 'staff')
    _set_pin(http, owner, sample_client, staff, '4826')
    for i in range(10):
        if i == 5:  # first lock "expires" — must NOT reset the count
            u = User.query.get(staff.user_id)
            u.pin_locked_until = None
            db.session.commit()
        _login(http, staff.email, '9137')
        auth_mod._LOGIN_FAIL_STORE.clear()
    u = User.query.get(staff.user_id)
    u.pin_locked_until = None
    db.session.commit()
    off = _login(http, staff.email, '4826')
    assert off.status_code == 403 and off.get_json()['code'] == 'PIN_DISABLED'

    # A correct password login re-enables PIN login.
    pw = http.post('/api/auth/login', data=json.dumps({'email': staff.email, 'password': PASSWORD,
                                                        'force_login': True}), content_type='application/json')
    assert pw.status_code == 200
    again = http.post('/api/auth/login', data=json.dumps({'email': staff.email, 'password': '4826',
                                                           'force_login': True}), content_type='application/json')
    assert again.status_code == 200


# ── Staff set their own PIN ──────────────────────────────────────────────────

def _real_login(http, email, secret):
    r = _login(http, email, secret)
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _put_own_pin(http, token, body):
    return http.put('/api/profile/pin', data=json.dumps(body), content_type='application/json',
                    headers=auth_hdr(token))


def test_login_tells_the_app_to_offer_a_pin(http, sample_client):
    staff, owner = _user(sample_client, 'staff'), _user(sample_client, 'owner')
    s = _real_login(http, staff.email, PASSWORD)['user']
    assert s['pin_eligible'] is True and s['has_pin'] is False
    o = _real_login(http, owner.email, PASSWORD)['user']
    assert o['pin_eligible'] is False


def test_staff_sets_first_pin_right_after_login_without_password(http, sample_client):
    staff = _user(sample_client, 'staff')
    token = _real_login(http, staff.email, PASSWORD)['token']
    assert _put_own_pin(http, token, {'pin': '4826'}).status_code == 200
    http.post('/api/auth/logout', headers=auth_hdr(token))
    assert _login(http, staff.email, '4826').status_code == 200


def test_changing_a_pin_needs_the_current_password(http, sample_client):
    staff = _user(sample_client, 'staff')
    token = _real_login(http, staff.email, PASSWORD)['token']
    _put_own_pin(http, token, {'pin': '4826'})
    no_pw = _put_own_pin(http, token, {'pin': '5937'})
    assert no_pw.status_code == 401 and no_pw.get_json()['code'] == 'PASSWORD_REQUIRED'
    assert _put_own_pin(http, token, {'pin': '5937', 'current_password': 'wrong'}).status_code == 401
    assert _put_own_pin(http, token, {'pin': '5937', 'current_password': PASSWORD}).status_code == 200


def test_first_pin_without_fresh_login_needs_password(http, sample_client):
    staff = _user(sample_client, 'staff')
    old_token = make_token(staff.user_id, sample_client.client_id)  # no session → not a fresh login
    assert _put_own_pin(http, old_token, {'pin': '4826'}).status_code == 401


def test_owner_cannot_set_own_pin(http, sample_client):
    owner = _user(sample_client, 'owner')
    token = _real_login(http, owner.email, PASSWORD)['token']
    assert _put_own_pin(http, token, {'pin': '4826'}).status_code == 403

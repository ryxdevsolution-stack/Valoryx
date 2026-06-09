"""Tests for concurrent-session enforcement (single-device auto-logout)."""
import uuid
from datetime import datetime, timedelta

from extensions import db
from models.session_model import UserSession
from utils.session_manager import enforce_session_limit


def _make_session(user_id, client_id, *, active=True, created_offset_min=0):
    """Insert a UserSession row and return it. created_offset_min lets us
    control age — more-negative = older."""
    s = UserSession(
        id=str(uuid.uuid4()),
        session_id=uuid.uuid4().hex,
        user_id=str(user_id),
        client_id=str(client_id),
        ip_address="127.0.0.1",
        user_agent="pytest",
        device="Desktop",
        created_at=datetime.utcnow() + timedelta(minutes=created_offset_min),
        last_seen=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=2),
        is_active=active,
    )
    db.session.add(s)
    db.session.commit()
    return s


def test_limit_1_revokes_all_other_active_sessions(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    old1 = _make_session(uid, cid, created_offset_min=-30)
    old2 = _make_session(uid, cid, created_offset_min=-10)
    current = _make_session(uid, cid, created_offset_min=0)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=1)
    db.session.commit()

    assert revoked == 2
    assert db.session.get(UserSession, old1.id).is_active is False
    assert db.session.get(UserSession, old2.id).is_active is False
    assert db.session.get(UserSession, current.id).is_active is True
    assert db.session.get(UserSession, old1.id).revoked_at is not None


def test_keeps_current_session_untouched(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    current = _make_session(uid, cid)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=1)
    db.session.commit()

    assert revoked == 0
    assert db.session.get(UserSession, current.id).is_active is True


def test_limit_2_keeps_newest_one_plus_current(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    oldest = _make_session(uid, cid, created_offset_min=-30)
    newer = _make_session(uid, cid, created_offset_min=-10)
    current = _make_session(uid, cid, created_offset_min=0)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=2)
    db.session.commit()

    assert revoked == 1
    assert db.session.get(UserSession, oldest.id).is_active is False
    assert db.session.get(UserSession, newer.id).is_active is True
    assert db.session.get(UserSession, current.id).is_active is True


def test_max_sessions_zero_disables_enforcement(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    other = _make_session(uid, cid, created_offset_min=-10)
    current = _make_session(uid, cid)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=0)
    db.session.commit()

    assert revoked == 0
    assert db.session.get(UserSession, other.id).is_active is True


def test_already_inactive_sessions_are_ignored(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    dead = _make_session(uid, cid, active=False, created_offset_min=-30)
    current = _make_session(uid, cid)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=1)
    db.session.commit()

    assert revoked == 0
    assert db.session.get(UserSession, dead.id).is_active is False


def test_second_login_without_force_returns_409(http, sample_user):
    """Second login on an account with an active session must ask for confirmation."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}

    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200, r1.get_data(as_text=True)

    r2 = http.post("/api/auth/login", json=creds)
    assert r2.status_code == 409, r2.get_data(as_text=True)
    body = r2.get_json()
    assert body["code"] == "SESSION_EXISTS"
    assert "active_session" in body
    active = UserSession.query.filter_by(
        user_id=str(sample_user.user_id), is_active=True
    ).count()
    assert active == 1


def test_force_login_takes_over_and_revokes_first(http, sample_user):
    """force_login=true completes the login and revokes the other session."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}

    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200

    r2 = http.post("/api/auth/login", json={**creds, "force_login": True})
    assert r2.status_code == 200, r2.get_data(as_text=True)

    active = UserSession.query.filter_by(
        user_id=str(sample_user.user_id), is_active=True
    ).all()
    assert len(active) == 1


def test_session_check_returns_200_when_session_active(http, sample_user, sample_client):
    """The heartbeat endpoint returns 200 for a live session."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}
    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200
    token = r1.get_json()["token"]

    r = http.get("/api/auth/session-check", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.get_json()["success"] is True

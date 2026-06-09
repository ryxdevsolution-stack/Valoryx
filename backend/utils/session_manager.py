"""Concurrent-session enforcement.

Keeps the number of simultaneously-active sessions per user at or below a
configurable limit. When a new login arrives and the user is already at the
limit, the OLDEST active sessions are revoked so the newest device wins. The
revoked device is auto-logged-out on its next request via the SESSION_REVOKED
check in utils/auth_middleware.py.
"""
from datetime import datetime

from extensions import db
from models.session_model import UserSession


def enforce_session_limit(user_id, keep_session_id, max_sessions):
    """Revoke oldest active sessions so that, counting the session identified
    by ``keep_session_id``, at most ``max_sessions`` remain active for this user.

    Mutates the matched rows (sets ``is_active=False`` and ``revoked_at``) on the
    current db.session but does NOT commit — the caller commits as part of its
    own transaction so login stays atomic.

    Args:
        user_id: the user whose sessions are being trimmed.
        keep_session_id: the just-created session that must always survive.
        max_sessions: cap on simultaneous active sessions. 0 disables enforcement.

    Returns:
        int — number of sessions revoked.
    """
    if max_sessions <= 0:
        return 0

    # Active sessions for this user EXCEPT the one we keep, oldest first.
    others = (
        UserSession.query
        .filter_by(user_id=str(user_id), is_active=True)
        .filter(UserSession.session_id != keep_session_id)
        .order_by(UserSession.created_at.asc())
        .all()
    )

    # We keep the current session plus up to (max_sessions - 1) of the most
    # recent others. Everything older than that is revoked.
    keep_others = max(0, max_sessions - 1)
    to_revoke = others if keep_others == 0 else others[:-keep_others]

    now = datetime.utcnow()
    for s in to_revoke:
        s.is_active = False
        s.revoked_at = now

    return len(to_revoke)

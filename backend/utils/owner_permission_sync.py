"""
Idempotently grant the edit_bill_price_audit permission to every existing
user with role='owner'. Called once at app startup after the permission
seeder has run.

Idempotent: skips users that already have the grant.
Safe to call from every gunicorn worker (concurrent inserts are protected
by the (user_id, permission_id) unique constraint on user_permissions).
"""
import logging
from extensions import db
from models.user_model import User
from models.permission_model import Permission, UserPermission

logger = logging.getLogger(__name__)

PERMISSION_NAME = 'edit_bill_price_audit'


def grant_audit_edit_to_owners() -> int:
    """
    Grant the audit-log edit permission to every owner who doesn't have it yet.
    Returns the number of rows inserted.
    """
    perm = Permission.query.filter_by(permission_name=PERMISSION_NAME).first()
    if not perm:
        logger.warning(
            "grant_audit_edit_to_owners: permission %s not seeded yet, skipping",
            PERMISSION_NAME,
        )
        return 0

    owners = User.query.filter_by(role='owner').all()
    if not owners:
        return 0

    owner_ids = [o.user_id for o in owners]
    already_granted = {
        up.user_id for up in UserPermission.query.filter(
            UserPermission.permission_id == perm.permission_id,
            UserPermission.user_id.in_(owner_ids),
        ).all()
    }

    inserted = 0
    for owner in owners:
        if owner.user_id in already_granted:
            continue
        db.session.add(UserPermission(
            user_id=owner.user_id,
            permission_id=perm.permission_id,
            granted_by=None,  # system auto-grant — no human grantor
        ))
        inserted += 1

    if inserted:
        try:
            db.session.commit()
            logger.info("Granted %s to %d owner(s)", PERMISSION_NAME, inserted)
        except Exception as e:
            db.session.rollback()
            logger.warning(
                "Owner auto-grant commit failed (likely concurrent worker): %s", e
            )
            return 0

    return inserted

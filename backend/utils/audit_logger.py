import uuid
import json
import logging
from datetime import datetime
from decimal import Decimal
from flask import g, request
from extensions import db
from models.audit_model import AuditLog

logger = logging.getLogger(__name__)

def _serialize_for_json(obj):
    """
    Convert non-JSON-serializable objects to JSON-serializable format
    Handles UUID, datetime, Decimal, and other common types
    """
    if obj is None:
        return None

    if isinstance(obj, dict):
        return {key: _serialize_for_json(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [_serialize_for_json(item) for item in obj]
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return str(obj)
    elif isinstance(obj, (str, int, float, bool)):
        # Already JSON-serializable primitive types
        return obj
    else:
        # Attempt to convert unknown types to string as fallback
        try:
            return str(obj)
        except Exception:
            return f"<Unserializable: {type(obj).__name__}>"

def log_action(action_type, table_name=None, record_id=None, old_data=None, new_data=None, auto_commit=False):
    """
    Log action to audit_log table with client_id
    MUST be called after any CREATE, UPDATE, DELETE operation

    Note: By default, audit logs are added to the session but NOT committed.
    The calling code should commit as part of its transaction.
    Set auto_commit=True only if you need a standalone audit log.
    """
    try:
        # Get client_id from g.user (set by authenticate decorator)
        if not hasattr(g, 'user'):
            return

        client_id = g.user.get('client_id')
        user_id = g.user.get('user_id')

        # Serialize data to ensure JSON compatibility (handles UUID, datetime, Decimal)
        serialized_old_data = _serialize_for_json(old_data) if old_data else None
        serialized_new_data = _serialize_for_json(new_data) if new_data else None

        # Create audit log entry
        audit_entry = AuditLog(
            log_id=str(uuid.uuid4()),
            client_id=client_id,
            user_id=user_id,
            action_type=action_type,
            table_name=table_name,
            record_id=record_id,
            old_data=serialized_old_data,
            new_data=serialized_new_data,
            ip_address=request.remote_addr,
            user_agent=request.user_agent.string,
            timestamp=datetime.utcnow()
        )

        db.session.add(audit_entry)

        # Only commit if explicitly requested (for performance - avoid extra round trips)
        if auto_commit:
            db.session.commit()

    except Exception as e:
        # Don't fail the main operation if audit logging fails
        logger.error(
            f"Audit log error for {action_type} on {table_name} (record: {record_id}): {str(e)}",
            exc_info=True  # Includes full traceback for debugging
        )
        if auto_commit:
            db.session.rollback()

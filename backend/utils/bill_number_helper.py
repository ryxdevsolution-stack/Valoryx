"""
Bill Number Helper - Atomic Bill Number Generation
Phase 0: Offline Desktop App Implementation

This module provides atomic bill number generation using database-level
atomic increment to prevent race conditions and duplicate bill numbers.
"""

import os

from sqlalchemy import text
from extensions import db

# Hard-coded mapping — column_name can never be user-controlled input
_BILL_COUNTER_COLS = {
    'gst':     'current_gst_bill_number',
    'non_gst': 'current_non_gst_bill_number',
}


def get_next_bill_number(client_id, bill_type='gst'):
    """
    Get next sequential bill number for a client using atomic database increment.

    This function uses PostgreSQL's INSERT ... ON CONFLICT DO UPDATE to atomically
    increment and return the next bill number. This prevents race conditions that
    can occur with the previous approach of querying max(bill_number) + 1.

    Args:
        client_id (str): The client ID
        bill_type (str): Either 'gst' or 'non_gst'

    Returns:
        int: The next sequential bill number

    Raises:
        ValueError: If bill_type is not 'gst' or 'non_gst'
        Exception: If database operation fails

    Example:
        >>> bill_number = get_next_bill_number('client-123', 'gst')
        >>> print(bill_number)  # 101

    Thread-safe: Yes (uses database-level atomic operation)
    SQLite compatible: Yes (uses standard SQL)
    """
    if bill_type not in _BILL_COUNTER_COLS:
        raise ValueError("bill_type must be 'gst' or 'non_gst'")

    # Resolved from a hard-coded dict — never from user input
    column_name = _BILL_COUNTER_COLS[bill_type]
    is_offline = os.getenv('DB_MODE', 'offline').lower() != 'online'

    try:
        if is_offline:
            # SQLite: no CAST AS UUID, no RETURNING — use two-step upsert + select
            # Both statements run in the same transaction so reads see the updated value
            upsert_sql = text(f"""
                INSERT INTO bill_number_counters (client_id, {column_name})
                VALUES (:client_id, 1)
                ON CONFLICT (client_id)
                DO UPDATE SET
                    {column_name} = {column_name} + 1,
                    updated_at = CURRENT_TIMESTAMP
            """)
            select_sql = text(f"""
                SELECT {column_name}
                FROM bill_number_counters
                WHERE client_id = :client_id
            """)
            db.session.execute(upsert_sql, {"client_id": client_id})
            result = db.session.execute(select_sql, {"client_id": client_id})
            bill_number = result.scalar()
        else:
            # PostgreSQL: RETURNING is available and CAST AS UUID is required
            # Use CAST(:client_id AS UUID) — the ::UUID shorthand confuses
            # SQLAlchemy's text() parameter parser because :: immediately
            # follows the bind-parameter colon.
            sql = text(f"""
                INSERT INTO bill_number_counters (client_id, {column_name})
                VALUES (CAST(:client_id AS UUID), 1)
                ON CONFLICT (client_id)
                DO UPDATE SET
                    {column_name} = bill_number_counters.{column_name} + 1,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING {column_name}
            """)
            result = db.session.execute(sql, {"client_id": client_id})
            bill_number = result.scalar()

        db.session.commit()
        return bill_number

    except Exception as e:
        db.session.rollback()
        print(f"Error generating bill number for client {client_id}, type {bill_type}: {str(e)}")
        raise Exception(f"Failed to generate bill number: {str(e)}")


def get_current_bill_number(client_id, bill_type='gst'):
    """
    Get the current (last used) bill number for a client without incrementing.

    Useful for displaying "Next bill number will be: X" in UI.

    Args:
        client_id (str): The client ID
        bill_type (str): Either 'gst' or 'non_gst'

    Returns:
        int: The current bill number (0 if no bills created yet)
    """
    if bill_type not in _BILL_COUNTER_COLS:
        raise ValueError("bill_type must be 'gst' or 'non_gst'")

    column_name = _BILL_COUNTER_COLS[bill_type]
    is_offline = os.getenv('DB_MODE', 'offline').lower() != 'online'
    client_id_expr = ':client_id' if is_offline else 'CAST(:client_id AS UUID)'

    try:
        sql = text(f"""
            SELECT {column_name}
            FROM bill_number_counters
            WHERE client_id = {client_id_expr}
        """)

        result = db.session.execute(sql, {"client_id": client_id})
        bill_number = result.scalar()

        return bill_number if bill_number is not None else 0

    except Exception as e:
        print(f"Error getting current bill number for client {client_id}, type {bill_type}: {str(e)}")
        return 0


def reset_bill_number(client_id, bill_type='gst', new_value=0):
    """
    Reset bill number counter to a specific value.

    ⚠️ WARNING: Use with extreme caution! This should only be used for:
    - Data migration
    - Fixing corrupted counters
    - Admin operations

    Args:
        client_id (str): The client ID
        bill_type (str): Either 'gst' or 'non_gst'
        new_value (int): The new counter value

    Returns:
        bool: True if successful

    Requires: Admin permission (should be checked before calling)
    """
    if bill_type not in _BILL_COUNTER_COLS:
        raise ValueError("bill_type must be 'gst' or 'non_gst'")

    column_name = _BILL_COUNTER_COLS[bill_type]
    is_offline = os.getenv('DB_MODE', 'offline').lower() != 'online'
    client_id_expr = ':client_id' if is_offline else 'CAST(:client_id AS UUID)'

    try:
        sql = text(f"""
            INSERT INTO bill_number_counters (client_id, {column_name})
            VALUES ({client_id_expr}, :new_value)
            ON CONFLICT (client_id)
            DO UPDATE SET
                {column_name} = :new_value,
                updated_at = CURRENT_TIMESTAMP
        """)

        db.session.execute(sql, {"client_id": client_id, "new_value": new_value})
        db.session.commit()

        return True

    except Exception as e:
        db.session.rollback()
        print(f"Error resetting bill number for client {client_id}, type {bill_type}: {str(e)}")
        raise Exception(f"Failed to reset bill number: {str(e)}")

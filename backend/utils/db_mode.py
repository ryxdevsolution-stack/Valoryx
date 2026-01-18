"""
Database Mode Helper
Phase 1: Helper functions to check online/offline mode in routes

Provides easy access to database mode from anywhere in the application.
"""

import os


def is_offline_mode():
    """
    Check if application is running in offline mode (SQLite).

    Returns:
        bool: True if offline mode, False if online mode

    Example:
        >>> if is_offline_mode():
        >>>     # Use local SQLite database
        >>>     pass
    """
    db_mode = os.getenv('DB_MODE', '').lower()
    if db_mode == 'offline':
        return True
    elif db_mode == 'online':
        return False

    # Default: online if DB_URL exists
    return not bool(os.getenv('DB_URL'))


def is_online_mode():
    """
    Check if application is running in online mode (PostgreSQL).

    Returns:
        bool: True if online mode, False if offline mode

    Example:
        >>> if is_online_mode():
        >>>     # Use PostgreSQL database
        >>>     pass
    """
    return not is_offline_mode()


def get_db_mode():
    """
    Get current database mode as string.

    Returns:
        str: 'online' or 'offline'

    Example:
        >>> mode = get_db_mode()
        >>> print(f"Running in {mode} mode")
    """
    return 'offline' if is_offline_mode() else 'online'

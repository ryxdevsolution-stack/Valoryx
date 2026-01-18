"""
Database extensions and utilities for RYX Billing Backend
Phase 1: Integrated dual database support (PostgreSQL + SQLite)
"""
from flask_sqlalchemy import SQLAlchemy
import logging

# Initialize SQLAlchemy
db = SQLAlchemy()

def init_db_safely(app):
    """
    Initialize database with error handling and dual mode support
    Returns True if initialization was successful, False otherwise
    """
    try:
        # Phase 1: Import database manager
        from database.manager import db_manager

        # Initialize database manager first (detects mode and sets up engine)
        db_manager.init_app(app)

        # Log current mode
        mode = db_manager.mode
        logging.info(f"[DatabaseManager] Running in {mode} mode")

        # Initialize SQLAlchemy with the configured database URI
        db.init_app(app)

        # Test the connection
        with app.app_context():
            db.engine.connect()

        logging.info(f"Database initialized successfully in {mode} mode")
        return True
    except Exception as e:
        logging.error(f"Database initialization failed: {str(e)}")
        return False

def test_db_connection(app):
    """
    Test database connection
    Returns True if connection is successful, False otherwise
    """
    try:
        with app.app_context():
            db.engine.connect()
        return True
    except Exception as e:
        logging.error(f"Database connection test failed: {str(e)}")
        return False

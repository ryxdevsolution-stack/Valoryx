"""
Database extensions and utilities for RYX Billing Backend
"""
from flask_sqlalchemy import SQLAlchemy
import logging

# Initialize SQLAlchemy
db = SQLAlchemy()

def init_db_safely(app):
    """
    Initialize database with error handling
    Returns True if initialization was successful, False otherwise
    """
    try:
        db.init_app(app)

        # Test the connection
        with app.app_context():
            db.engine.connect()

        logging.info("Database initialized successfully")
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

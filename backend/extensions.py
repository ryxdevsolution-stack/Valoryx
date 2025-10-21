"""
Database extensions
Separating db instance to avoid circular imports
"""
import logging
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def init_db_safely(app):
    """
    Initialize database with error handling
    Returns True if successful, False if failed
    """
    try:
        with app.app_context():
            db.init_app(app)
            # Try to create tables if they don't exist
            db.create_all()
            logging.info("Database initialized successfully")
            return True
    except Exception as e:
        logging.error(f"Database initialization failed: {str(e)}")
        return False

def test_db_connection(app):
    """
    Test database connection
    Returns True if connection works, False otherwise
    """
    try:
        with app.app_context():
            # Use a simpler test that works with both SQLite and PostgreSQL
            result = db.session.execute('SELECT 1').fetchone()
            if result:
                logging.info("Database connection test successful")
                return True
            return False
    except Exception as e:
        logging.error(f"Database connection test failed: {str(e)}")
        return False

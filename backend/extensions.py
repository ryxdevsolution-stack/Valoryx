"""
Database extensions
Separating db instance to avoid circular imports
"""
import logging
import time
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

db = SQLAlchemy()

def init_db_safely(app):
    """
    Initialize database with error handling and retry logic
    Returns True if successful, False if failed
    """
    max_retries = 3
    retry_delay = 2  # seconds

    for attempt in range(max_retries):
        try:
            with app.app_context():
                # Initialize Flask-SQLAlchemy
                db.init_app(app)

                # Test connection first with a simple query
                with db.engine.connect() as conn:
                    conn.execute(text('SELECT 1'))
                    logging.info(f"Database connection successful on attempt {attempt + 1}")

                # Create tables if they don't exist
                db.create_all()
                logging.info("Database tables created/verified successfully")
                return True

        except Exception as e:
            logging.warning(f"Database initialization attempt {attempt + 1}/{max_retries} failed: {str(e)}")

            if attempt < max_retries - 1:
                logging.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                logging.error(f"Database initialization failed after {max_retries} attempts")
                # Don't crash the app, just return False
                return False

    return False

def test_db_connection(app):
    """
    Test database connection
    Returns True if connection works, False otherwise
    """
    try:
        with app.app_context():
            # Use text() for SQLAlchemy 2.0 compatibility
            with db.engine.connect() as conn:
                result = conn.execute(text('SELECT 1')).fetchone()
                if result:
                    logging.info("Database connection test successful")
                    return True
            return False
    except Exception as e:
        logging.error(f"Database connection test failed: {str(e)}")
        return False

#!/usr/bin/env python3
"""
Migration script to add notes table
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from extensions import db
from models.notes_model import Note
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    """Add notes table to database"""
    with app.app_context():
        try:
            logger.info("Starting migration: Adding notes table")

            # Create notes table
            db.create_all()

            logger.info("✅ Notes table created successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Migration failed: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return False

if __name__ == '__main__':
    success = migrate()
    sys.exit(0 if success else 1)

"""
Migration: Change payment_type from UUID foreign key to VARCHAR
This allows storing payment methods as simple strings (cash, upi, card)
"""

from extensions import db
from sqlalchemy import text

def upgrade():
    """Apply the migration"""
    try:
        with db.engine.connect() as conn:
            # Drop foreign key constraints first
            conn.execute(text("""
                ALTER TABLE gst_billing
                DROP CONSTRAINT IF EXISTS gst_billing_payment_type_fkey;
            """))

            conn.execute(text("""
                ALTER TABLE non_gst_billing
                DROP CONSTRAINT IF EXISTS non_gst_billing_payment_type_fkey;
            """))

            # Alter column type to VARCHAR(50)
            conn.execute(text("""
                ALTER TABLE gst_billing
                ALTER COLUMN payment_type TYPE VARCHAR(50);
            """))

            conn.execute(text("""
                ALTER TABLE non_gst_billing
                ALTER COLUMN payment_type TYPE VARCHAR(50);
            """))

            conn.commit()

        print("✓ Migration completed: payment_type changed to VARCHAR(50)")
        return True

    except Exception as e:
        print(f"✗ Migration failed: {str(e)}")
        db.session.rollback()
        return False

def downgrade():
    """Revert the migration (not recommended after data migration)"""
    print("Downgrade not implemented - manual intervention required")
    return False

if __name__ == '__main__':
    from app import app
    with app.app_context():
        upgrade()

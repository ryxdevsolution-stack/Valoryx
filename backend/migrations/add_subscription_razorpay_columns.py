"""
Migration: Add razorpay_monthly_plan_id and razorpay_yearly_plan_id
to subscription_plan table in local SQLite DB.
"""
from sqlalchemy import text, inspect as sa_inspect


def run(db):
    with db.engine.connect() as conn:
        inspector = sa_inspect(db.engine)
        cols = [c['name'] for c in inspector.get_columns('subscription_plan')]
        changed = False
        if 'razorpay_monthly_plan_id' not in cols:
            conn.execute(text(
                "ALTER TABLE subscription_plan "
                "ADD COLUMN razorpay_monthly_plan_id VARCHAR(100) NULL"
            ))
            changed = True
        if 'razorpay_yearly_plan_id' not in cols:
            conn.execute(text(
                "ALTER TABLE subscription_plan "
                "ADD COLUMN razorpay_yearly_plan_id VARCHAR(100) NULL"
            ))
            changed = True
        if changed:
            conn.commit()
            print("[Migration] subscription_plan razorpay columns added")

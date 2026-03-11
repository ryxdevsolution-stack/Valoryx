"""
Seed permission_sections and link existing permissions to their sections.
Safe to run multiple times (idempotent).
"""
from sqlalchemy import text
import uuid


SECTIONS = [
    ('Billing',     ['gst_billing', 'non_gst_billing', 'view_all_bills', 'view_own_bills']),
    ('Stock',       ['manage_stock', 'view_stock']),
    ('Customers',   ['manage_customers', 'view_customers']),
    ('Reports',     ['view_reports', 'export_reports']),
    ('Settings',    ['manage_settings']),
    ('Dashboard',   ['view_dashboard']),
    ('Admin',       ['manage_users', 'manage_team']),
]


def run(db):
    with db.engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM permission_sections")).scalar()
        if count and count > 0:
            return  # already seeded

        for i, (section_name, perm_names) in enumerate(SECTIONS):
            section_id = str(uuid.uuid4())
            conn.execute(text(
                "INSERT OR IGNORE INTO permission_sections "
                "(section_id, section_name, display_order, created_at) "
                "VALUES (:id, :name, :order, datetime('now'))"
            ), {'id': section_id, 'name': section_name, 'order': i})

            # Link matching permissions to this section
            for perm_name in perm_names:
                conn.execute(text(
                    "UPDATE permissions SET section_id = :sid "
                    "WHERE permission_name = :pname "
                    "AND (section_id IS NULL OR section_id = '')"
                ), {'sid': section_id, 'pname': perm_name})

        conn.commit()
        print("[Migration] permission_sections seeded")

"""Test for Migration v20 — clarify permission descriptions.

File named test_migration_019.py per the task spec (Task 2, Phase 1).
The actual migration is v20 because v19 was already taken by _m019_added_by_label.
"""
import uuid
import pytest
from sqlalchemy import text

# The 12 (perm_name, old_desc, new_desc) pairs the migration rewrites.
REWRITES = [
    ('set_tax_rate',           'Set custom tax/GST rates',
                               'Override the tax/GST rate on individual bills at checkout'),
    ('view_all_bills',         'View all bills in the system',
                               'View bills created by every user'),
    ('view_own_bills',         'View only own created bills',
                               'View only bills this user personally created'),
    ('edit_bill_price_audit',  'Edit bill prices from the audit log',
                               'Correct historical bill prices from the audit-log view (power feature)'),
    ('custom_report_filters',  'Use custom filters in reports',
                               'Build saved custom date/branch/category filters in reports'),
    ('assign_permissions',     'Assign permissions to users',
                               'Grant or revoke permissions on any user (on this screen)'),
    ('edit_tax_settings',      'Edit tax and GST settings',
                               'Edit company-wide default GST rates and tax configuration'),
    ('view_audit_logs',        'View audit trail logs',
                               'View the audit-trail page showing who changed what and when'),
    ('manage_clients',         'Manage client organizations',
                               'Manage other tenant organizations (super-admin only)'),
    ('approve_bulk_order',     'Approve bulk stock orders',
                               'Approve a bulk-order draft so it can be sent to the supplier'),
    ('receive_bulk_order',     'Mark bulk orders as received',
                               'Confirm physical receipt of stock and add it to inventory'),
    ('manage_permissions',     'Manage user permissions',
                               'Legacy alias for permission management — kept for backward compatibility'),
]


@pytest.fixture
def db_with_old_descriptions(app):
    """Reset the 12 target rows to their OLD descriptions before the test runs."""
    from extensions import db
    with app.app_context():
        # First ensure all 12 rows exist (insert if missing).
        for perm_name, old_desc, _ in REWRITES:
            existing = db.session.execute(
                text("SELECT 1 FROM permissions WHERE permission_name = :n"),
                {'n': perm_name}
            ).fetchone()
            if not existing:
                db.session.execute(
                    text("INSERT INTO permissions (permission_id, permission_name, description) "
                         "VALUES (:id, :n, :d)"),
                    {'id': str(uuid.uuid4()), 'n': perm_name, 'd': old_desc}
                )
        # Then force each to the OLD description.
        for perm_name, old_desc, _ in REWRITES:
            db.session.execute(
                text("UPDATE permissions SET description = :d WHERE permission_name = :n"),
                {'d': old_desc, 'n': perm_name}
            )
        db.session.commit()
    return db


def test_m020_updates_all_old_descriptions(db_with_old_descriptions):
    from migrations.runner import _m020_clarify_permission_descriptions
    db = db_with_old_descriptions

    _m020_clarify_permission_descriptions(db)

    for perm_name, _, new_desc in REWRITES:
        row = db.session.execute(
            text("SELECT description FROM permissions WHERE permission_name = :n"),
            {'n': perm_name}
        ).fetchone()
        assert row is not None, f"{perm_name} missing after migration"
        assert row[0] == new_desc, f"{perm_name} description not updated (got: {row[0]!r})"


def _fetch_perm_descriptions(db):
    """Return {perm_name: description} for all 12 target permissions."""
    names = [n for n, _, _ in REWRITES]
    placeholders = ', '.join(f':n{i}' for i in range(len(names)))
    params = {f'n{i}': names[i] for i in range(len(names))}
    rows = db.session.execute(
        text(f"SELECT permission_name, description FROM permissions "
             f"WHERE permission_name IN ({placeholders})"),
        params
    )
    return {r[0]: r[1] for r in rows}


def test_m020_is_idempotent(db_with_old_descriptions):
    """Running twice changes nothing on the second pass."""
    from migrations.runner import _m020_clarify_permission_descriptions
    db = db_with_old_descriptions

    _m020_clarify_permission_descriptions(db)
    after_first = _fetch_perm_descriptions(db)

    _m020_clarify_permission_descriptions(db)
    after_second = _fetch_perm_descriptions(db)

    assert after_first == after_second


def test_m020_does_not_touch_unrelated_rows(db_with_old_descriptions):
    """A row with an unrecognized description string is left alone."""
    from migrations.runner import _m020_clarify_permission_descriptions
    db = db_with_old_descriptions

    custom_desc = 'CUSTOM EDITED DESCRIPTION — should not be touched'
    db.session.execute(
        text("UPDATE permissions SET description = :d WHERE permission_name = 'set_tax_rate'"),
        {'d': custom_desc}
    )
    db.session.commit()

    _m020_clarify_permission_descriptions(db)

    row = db.session.execute(
        text("SELECT description FROM permissions WHERE permission_name = 'set_tax_rate'")
    ).fetchone()
    assert row[0] == custom_desc, "Custom description was overwritten — migration is not safe"

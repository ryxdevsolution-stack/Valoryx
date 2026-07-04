"""
Shared fixtures for the Valoryx backend test suite.

Modes
-----
offline (default)  — SQLite :memory:, StaticPool.  Fast, no network.
                     Run: pytest
online             — Real Supabase PostgreSQL via DB_URL in backend/.env.
                     Run: pytest --online
                     Each test creates rows with unique UUIDs and deletes them
                     afterwards — production data is never touched.

Design decisions
----------------
- JWT tokens omit session_id → auth middleware skips UserSession DB lookup.
- Env vars (JWT_SECRET, SECRET_KEY) are set before any Flask/Config import
  so Config's class-level validation succeeds.
- log_action and get_next_bill_number are patched in offline mode only
  (they require PostgreSQL-specific SQL / audit_log table).
- Email helpers are always patched (never send real emails).
- Sync scheduler is always patched (prevents noise and FK errors in logs).
"""

import os
import sys

# ── Pre-import env defaults (offline mode uses test values) ───────────────────
os.environ.setdefault("JWT_SECRET", "valoryx-test-secret-2026")
os.environ.setdefault("SECRET_KEY", "valoryx-flask-secret-2026")
os.environ.setdefault("DB_MODE", "offline")

# Ensure backend/ and tests/ are importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uuid
import bcrypt
import pytest
import jwt
from datetime import datetime, timedelta
from sqlalchemy.pool import StaticPool, NullPool
from flask import Flask
from extensions import db as _db

_JWT_SECRET = os.environ["JWT_SECRET"]

# ── Online cleanup state (module-level, reset per test by app_ctx) ────────────
# Tracks client_id values created in the current test so they can be deleted.
_ONLINE_STATE: dict = {"client_ids": []}


# ═══════════════════════════════════════════════════════════════════════════════
# pytest CLI option
# ═══════════════════════════════════════════════════════════════════════════════

def pytest_addoption(parser):
    parser.addoption(
        "--online",
        action="store_true",
        default=False,
        help=(
            "Run tests against real Supabase PostgreSQL. "
            "Reads DB_URL, JWT_SECRET, SECRET_KEY from backend/.env. "
            "Test rows are created with unique UUIDs and deleted after each test."
        ),
    )


@pytest.fixture(scope="session")
def test_mode(request):
    """Returns 'online' or 'offline' for the whole test session."""
    return "online" if request.config.getoption("--online") else "offline"


# ═══════════════════════════════════════════════════════════════════════════════
# App factories
# ═══════════════════════════════════════════════════════════════════════════════

def create_test_app():
    """Offline: SQLite in-memory, StaticPool — all connections share one DB."""
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
        JWT_SECRET=os.environ["JWT_SECRET"],
        JWT_ALGORITHM="HS256",
        SECRET_KEY=os.environ["SECRET_KEY"],
        DB_MODE="offline",
        CORS_ORIGINS=[],
    )

    _db.init_app(app)

    with app.app_context():
        import models.client_model      # noqa: F401
        import models.branch_model      # noqa: F401
        import models.user_model        # noqa: F401
        import models.stock_model       # noqa: F401
        import models.billing_model     # noqa: F401
        import models.session_model     # noqa: F401
        import models.permission_model  # noqa: F401
        import models.permission_template_model  # noqa: F401

        for optional in [
            "models.customer_model",
            "models.supplier_model",
            "models.report_model",
            "models.audit_model",
            # Subscription + membership models: imported here so their tables are
            # created up front and their blueprints can be registered before the
            # app handles its first request (Flask forbids register_blueprint after).
            "models.subscription_model",
            "models.membership_tier_model",
            "models.membership_card_model",
            "models.membership_ledger_model",
        ]:
            try:
                __import__(optional)
            except (ImportError, Exception):
                pass

        # notes_model uses dialects.postgresql.UUID — skip for SQLite.
        _SQLITE_SKIP = {"notes"}
        for _tname in list(_SQLITE_SKIP):
            if _tname in _db.metadata.tables:
                _db.metadata.remove(_db.metadata.tables[_tname])
        _db.create_all()

        # Seed default permissions (same list as in app.py create_app)
        from models.permission_model import Permission
        import uuid as _uuid
        default_perms = [
            # Dashboard
            ('view_dashboard', 'Access main dashboard'),
            # Create Bill
            ('gst_billing', 'Create bills with GST'),
            ('non_gst_billing', 'Create bills without GST'),
            ('apply_discount', 'Apply discounts to bills'),
            ('add_payment', 'Add payment methods to bills'),
            ('select_customer', 'Select and assign customers to bills'),
            ('add_products', 'Add products to bills'),
            ('set_tax_rate', 'Override the tax/GST rate on individual bills at checkout'),
            # Manage Bills
            ('view_all_bills', 'View bills created by every user'),
            ('view_own_bills', 'View only bills this user personally created'),
            ('edit_bill_details', 'Edit bill information and details'),
            ('edit_bill_price_audit', 'Correct historical bill prices from the audit-log view (power feature)'),
            ('delete_bills', 'Delete bills from the system'),
            ('print_bills', 'Print bills'),
            ('download_pdf', 'Download bills as PDF'),
            ('send_email', 'Send bills via email'),
            ('mark_paid', 'Mark bills as paid'),
            ('mark_cancelled', 'Mark bills as cancelled'),
            ('duplicate_bill', 'Duplicate existing bills'),
            ('search_bills', 'Search and filter bills'),
            ('show_no_exchange', 'Show "No Exchange Available" on printed bills'),
            # Customer Management
            ('view_customers', 'View customer list and details'),
            ('add_customer', 'Add new customers'),
            ('edit_customer', 'Edit customer information'),
            ('delete_customer', 'Delete customers'),
            ('view_purchase_history', 'View customer purchase history'),
            ('import_customers', 'Import customers from file'),
            ('export_customers', 'Export customer data'),
            # Stock Management
            ('view_stock', 'View stock and inventory'),
            ('add_product', 'Add new products to inventory'),
            ('edit_product_details', 'Edit product information'),
            ('edit_pricing', 'Edit product MRP and sale price'),
            ('edit_cost_price', 'Edit product cost price'),
            ('delete_product', 'Delete products from inventory'),
            ('adjust_quantity', 'Adjust stock quantities'),
            ('view_low_stock_alerts', 'View low stock alerts'),
            ('import_stock', 'Import stock from file'),
            ('export_stock', 'Export stock data'),
            # Reports & Analytics
            ('view_sales_reports', 'View sales reports'),
            ('view_revenue_reports', 'View revenue reports'),
            ('view_profit_reports', 'View profit and margin reports'),
            ('view_inventory_reports', 'View inventory reports'),
            ('view_customer_reports', 'View customer analytics'),
            ('export_reports', 'Export reports to file'),
            ('print_reports', 'Print reports'),
            ('custom_report_filters', 'Build saved custom date/branch/category filters in reports'),
            # Payment Types
            ('view_payment_types', 'View payment types'),
            ('add_payment_type', 'Add new payment types'),
            ('edit_payment_type', 'Edit payment types'),
            ('delete_payment_type', 'Delete payment types'),
            ('set_default_payment', 'Set default payment type'),
            # User Management
            ('view_users', 'View system users'),
            ('add_user', 'Add new users'),
            ('edit_user', 'Edit user information'),
            ('delete_user', 'Delete users'),
            ('activate_deactivate_user', 'Activate or deactivate users'),
            ('assign_permissions', 'Grant or revoke permissions on any user (on this screen)'),
            ('manage_user_roles', 'Manage user roles'),
            ('view_user_activity', 'View user activity logs'),
            # Branch Management
            ('manage_branches', 'Manage shop branches'),
            ('create_branch', 'Create new branches'),
            ('edit_branch', 'Edit branch information'),
            ('delete_branch', 'Delete branches'),
            ('transfer_stock_between_branches', 'Transfer stock between branches'),
            # Settings
            ('edit_business_settings', 'Edit business information'),
            ('edit_tax_settings', 'Edit company-wide default GST rates and tax configuration'),
            ('edit_notification_settings', 'Edit notification preferences'),
            ('edit_theme_settings', 'Edit theme and appearance'),
            # Audit & Logs
            ('view_audit_logs', 'View the audit-trail page showing who changed what and when'),
            ('export_audit_logs', 'Export audit logs'),
            ('view_system_logs', 'View system error logs'),
            # System Administration
            ('manage_clients', 'Manage other tenant organizations (super-admin only)'),
            ('system_backup', 'Create system backups'),
            ('system_restore', 'Restore from backups'),
            ('maintenance_mode', 'Enable maintenance mode'),
            # Bulk Orders
            ('view_bulk_orders', 'View bulk stock orders'),
            ('create_bulk_order', 'Create new bulk stock orders'),
            ('edit_bulk_order', 'Edit bulk stock orders'),
            ('delete_bulk_order', 'Delete bulk stock orders'),
            ('approve_bulk_order', 'Approve a bulk-order draft so it can be sent to the supplier'),
            ('receive_bulk_order', 'Confirm physical receipt of stock and add it to inventory'),
            # Notes
            ('view_notes', 'View notes'),
            ('view_all_notes', 'View all users notes (admin)'),
            ('create_notes', 'Create new notes'),
            ('edit_notes', 'Edit existing notes'),
            ('delete_notes', 'Delete notes'),
            # Employees & Salary
            ('view_employees', 'View employee list and individual employee details'),
            ('add_employee', 'Add new employees to the team'),
            ('edit_employee', 'Edit employee personal and job details'),
            ('delete_employee', 'Remove employees from the team'),
            ('view_attendance', 'View attendance records and check-in/check-out logs'),
            ('mark_attendance', 'Check employees in and out for the day'),
            ('view_salary', 'View salary cycles, advances, and payment status'),
            ('manage_salary_cycles', 'Create, edit, and close monthly salary cycles'),
            ('record_advance', 'Record salary advances given to employees'),
            ('mark_salary_paid', 'Mark a salary cycle as paid out to the employee'),
            # Legacy broad permissions (kept for backward compatibility)
            ('manage_customers', 'Create/edit/delete customers'),
            ('manage_payment_types', 'Manage payment types'),
            ('manage_settings', 'Manage account settings'),
            ('manage_users', 'Create/edit/delete users'),
            ('manage_permissions', 'Legacy alias for permission management — kept for backward compatibility'),
        ]
        existing_names = {
            r[0] for r in _db.session.query(Permission.permission_name).all()
        }
        for perm_name, desc in default_perms:
            if perm_name not in existing_names:
                _db.session.add(Permission(
                    permission_id=str(_uuid.uuid4()),
                    permission_name=perm_name,
                    description=desc,
                ))
        _db.session.commit()

        # Register ALL blueprints here at app-creation time. Flask locks an app
        # against register_blueprint once it handles its first request, so any
        # test that registers lazily (membership, subscription) would fail when it
        # runs after a request-making test. Registering up front avoids that.
        for _bp_path, _prefix in [
            ("routes.auth",         "/api/auth"),
            ("routes.billing",      "/api/billing"),
            ("routes.stock",        "/api/stock"),
            ("routes.search",       "/api/search"),
            ("routes.admin",        "/api/admin"),
            ("routes.team",         "/api/team"),
            ("routes.oauth",        "/api/oauth"),
            ("routes.subscription", "/api/subscription"),
            ("routes.membership",   "/api/membership"),
            ("routes.electron", None),  # routes carry full /api/electron/* paths
        ]:
            try:
                mod = __import__(_bp_path, fromlist=[""])
                bp_name = _bp_path.split(".")[-1] + "_bp"
                app.register_blueprint(getattr(mod, bp_name), url_prefix=_prefix)
            except Exception as _e:
                import logging
                logging.warning("Blueprint %s not registered: %s", _bp_path, _e)

    return app


def create_online_app():
    """
    Online: real Supabase PostgreSQL via DB_URL from backend/.env.
    Tables already exist — no create_all() called.
    Uses NullPool so each test gets a fresh connection with no state leakage.
    """
    from dotenv import load_dotenv as _load_dotenv

    _env_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"
    )
    _load_dotenv(_env_path, override=True)

    db_url     = os.environ["DB_URL"]
    jwt_secret = os.environ["JWT_SECRET"]
    secret_key = os.environ["SECRET_KEY"]

    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI=db_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={
            "poolclass": NullPool,           # no connection reuse between tests
            "connect_args": {
                "sslmode": "require",
                "connect_timeout": 15,
            },
        },
        JWT_SECRET=jwt_secret,
        JWT_ALGORITHM="HS256",
        SECRET_KEY=secret_key,
        DB_MODE="online",
        CORS_ORIGINS=[],
    )

    _db.init_app(app)

    with app.app_context():
        # Apply any columns that exist in the ORM model but were not yet
        # migrated to the real Supabase table.  IF NOT EXISTS makes this safe
        # to run on every test session — it is a no-op when already present.
        from sqlalchemy import text as _text
        with _db.engine.connect() as _conn:
            _conn.execute(_text("""
                ALTER TABLE client_entry
                  ADD COLUMN IF NOT EXISTS email_verified              BOOLEAN   DEFAULT TRUE,
                  ADD COLUMN IF NOT EXISTS email_verification_token    TEXT,
                  ADD COLUMN IF NOT EXISTS email_verification_expires  TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS deletion_requested_at       TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS deletion_scheduled_at       TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS deletion_requested_by       TEXT,
                  ADD COLUMN IF NOT EXISTS deletion_reactivation_token TEXT
            """))
            _conn.execute(_text("""
                ALTER TABLE users
                  ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT
            """))
            # bill_number_counters: used by get_next_bill_number utility.
            # The route module shadows the utility with a same-named handler,
            # so we must patch the module-level name in online mode (see
            # patch_side_effects).  Ensure the counter table exists first.
            _conn.execute(_text("""
                CREATE TABLE IF NOT EXISTS bill_number_counters (
                    client_id              UUID PRIMARY KEY,
                    current_gst_bill_number     INT  NOT NULL DEFAULT 0,
                    current_non_gst_bill_number INT  NOT NULL DEFAULT 0,
                    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            _conn.commit()

        # Import models — tables already exist in Supabase, no DDL needed.
        import models.client_model      # noqa: F401
        import models.branch_model      # noqa: F401
        import models.user_model        # noqa: F401
        import models.stock_model       # noqa: F401
        import models.billing_model     # noqa: F401
        import models.session_model     # noqa: F401
        import models.permission_model  # noqa: F401

        for optional in [
"models.customer_model",
            "models.report_model",
            "models.audit_model",
        ]:
            try:
                __import__(optional)
            except (ImportError, Exception):
                pass

        for _bp_path, _prefix in [
            ("routes.auth",    "/api/auth"),
            ("routes.billing", "/api/billing"),
            ("routes.stock",   "/api/stock"),
        ]:
            try:
                mod = __import__(_bp_path, fromlist=[""])
                bp_name = _bp_path.split(".")[-1] + "_bp"
                app.register_blueprint(getattr(mod, bp_name), url_prefix=_prefix)
            except Exception as _e:
                import logging
                logging.warning("Blueprint %s not registered: %s", _bp_path, _e)

    return app


# ═══════════════════════════════════════════════════════════════════════════════
# Session-scoped app
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def app(test_mode):
    if test_mode == "online":
        return create_online_app()
    return create_test_app()


# ═══════════════════════════════════════════════════════════════════════════════
# Online cleanup helper
# ═══════════════════════════════════════════════════════════════════════════════

def _cleanup_online(db):
    """
    Delete every row created by this test, identified by client_id.
    Deletes in FK dependency order so no constraint violations.
    Uses .invalid email domain as a safeguard — will never match real clients.
    """
    cids = _ONLINE_STATE.get("client_ids", [])
    if not cids:
        return

    from sqlalchemy import text

    # Tables ordered by FK dependency (most-dependent first).
    _TABLES = [
        "gst_billing",
        "non_gst_billing",
        "stock_entry",
        "bill_number_counters",
        "users",
        "client_entry",
    ]

    for cid in cids:
        for tbl in _TABLES:
            try:
                db.session.execute(
                    text(f"DELETE FROM {tbl} WHERE client_id = :cid"),
                    {"cid": cid},
                )
            except Exception:
                db.session.rollback()
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        import logging
        logging.warning("[online-cleanup] commit failed: %s", exc)


# ═══════════════════════════════════════════════════════════════════════════════
# Per-test: push context + clean all rows after
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def app_ctx(app, test_mode):
    """
    Push an app context for every test; wipe rows after.

    offline — deletes all rows from all tables (safe: in-memory SQLite).
    online  — deletes only rows whose client_id was registered during this test.
    """
    _ONLINE_STATE["client_ids"] = []   # fresh per test
    ctx = app.app_context()
    ctx.push()
    yield
    from extensions import db
    if test_mode == "offline":
        db.session.remove()
        for table in reversed(db.metadata.sorted_tables):
            try:
                db.session.execute(table.delete())
            except Exception:
                db.session.rollback()
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Re-seed permissions after wiping all tables
        try:
            from models.permission_model import Permission
            import uuid as _uuid
            default_perms = [
                ('view_dashboard', 'Access main dashboard'),
                ('gst_billing', 'Create bills with GST'),
                ('non_gst_billing', 'Create bills without GST'),
                ('apply_discount', 'Apply discounts to bills'),
                ('add_payment', 'Add payment methods to bills'),
                ('select_customer', 'Select and assign customers to bills'),
                ('add_products', 'Add products to bills'),
                ('set_tax_rate', 'Override the tax/GST rate on individual bills at checkout'),
                ('view_all_bills', 'View bills created by every user'),
                ('view_own_bills', 'View only bills this user personally created'),
                ('edit_bill_details', 'Edit bill information and details'),
                ('edit_bill_price_audit', 'Correct historical bill prices from the audit-log view (power feature)'),
                ('delete_bills', 'Delete bills from the system'),
                ('print_bills', 'Print bills'),
                ('download_pdf', 'Download bills as PDF'),
                ('send_email', 'Send bills via email'),
                ('mark_paid', 'Mark bills as paid'),
                ('mark_cancelled', 'Mark bills as cancelled'),
                ('duplicate_bill', 'Duplicate existing bills'),
                ('search_bills', 'Search and filter bills'),
                ('show_no_exchange', 'Show "No Exchange Available" on printed bills'),
                ('view_customers', 'View customer list and details'),
                ('add_customer', 'Add new customers'),
                ('edit_customer', 'Edit customer information'),
                ('delete_customer', 'Delete customers'),
                ('view_purchase_history', 'View customer purchase history'),
                ('import_customers', 'Import customers from file'),
                ('export_customers', 'Export customer data'),
                ('view_stock', 'View stock and inventory'),
                ('add_product', 'Add new products to inventory'),
                ('edit_product_details', 'Edit product information'),
                ('edit_pricing', 'Edit product MRP and sale price'),
                ('edit_cost_price', 'Edit product cost price'),
                ('delete_product', 'Delete products from inventory'),
                ('adjust_quantity', 'Adjust stock quantities'),
                ('view_low_stock_alerts', 'View low stock alerts'),
                ('import_stock', 'Import stock from file'),
                ('export_stock', 'Export stock data'),
                ('view_sales_reports', 'View sales reports'),
                ('view_revenue_reports', 'View revenue reports'),
                ('view_profit_reports', 'View profit and margin reports'),
                ('view_inventory_reports', 'View inventory reports'),
                ('view_customer_reports', 'View customer analytics'),
                ('export_reports', 'Export reports to file'),
                ('print_reports', 'Print reports'),
                ('custom_report_filters', 'Build saved custom date/branch/category filters in reports'),
                ('view_payment_types', 'View payment types'),
                ('add_payment_type', 'Add new payment types'),
                ('edit_payment_type', 'Edit payment types'),
                ('delete_payment_type', 'Delete payment types'),
                ('set_default_payment', 'Set default payment type'),
                ('view_users', 'View system users'),
                ('add_user', 'Add new users'),
                ('edit_user', 'Edit user information'),
                ('delete_user', 'Delete users'),
                ('activate_deactivate_user', 'Activate or deactivate users'),
                ('assign_permissions', 'Grant or revoke permissions on any user (on this screen)'),
                ('manage_user_roles', 'Manage user roles'),
                ('view_user_activity', 'View user activity logs'),
                ('manage_branches', 'Manage shop branches'),
                ('create_branch', 'Create new branches'),
                ('edit_branch', 'Edit branch information'),
                ('delete_branch', 'Delete branches'),
                ('transfer_stock_between_branches', 'Transfer stock between branches'),
                ('edit_business_settings', 'Edit business information'),
                ('edit_tax_settings', 'Edit company-wide default GST rates and tax configuration'),
                ('edit_notification_settings', 'Edit notification preferences'),
                ('edit_theme_settings', 'Edit theme and appearance'),
                ('view_audit_logs', 'View the audit-trail page showing who changed what and when'),
                ('export_audit_logs', 'Export audit logs'),
                ('view_system_logs', 'View system error logs'),
                ('manage_clients', 'Manage other tenant organizations (super-admin only)'),
                ('system_backup', 'Create system backups'),
                ('system_restore', 'Restore from backups'),
                ('maintenance_mode', 'Enable maintenance mode'),
                ('view_bulk_orders', 'View bulk stock orders'),
                ('create_bulk_order', 'Create new bulk stock orders'),
                ('edit_bulk_order', 'Edit bulk stock orders'),
                ('delete_bulk_order', 'Delete bulk stock orders'),
                ('approve_bulk_order', 'Approve a bulk-order draft so it can be sent to the supplier'),
                ('receive_bulk_order', 'Confirm physical receipt of stock and add it to inventory'),
                ('view_notes', 'View notes'),
                ('view_all_notes', 'View all users notes (admin)'),
                ('create_notes', 'Create new notes'),
                ('edit_notes', 'Edit existing notes'),
                ('delete_notes', 'Delete notes'),
                # Employees & Salary
                ('view_employees', 'View employee list and individual employee details'),
                ('add_employee', 'Add new employees to the team'),
                ('edit_employee', 'Edit employee personal and job details'),
                ('delete_employee', 'Remove employees from the team'),
                ('view_attendance', 'View attendance records and check-in/check-out logs'),
                ('mark_attendance', 'Check employees in and out for the day'),
                ('view_salary', 'View salary cycles, advances, and payment status'),
                ('manage_salary_cycles', 'Create, edit, and close monthly salary cycles'),
                ('record_advance', 'Record salary advances given to employees'),
                ('mark_salary_paid', 'Mark a salary cycle as paid out to the employee'),
                ('manage_customers', 'Create/edit/delete customers'),
                ('manage_payment_types', 'Manage payment types'),
                ('manage_settings', 'Manage account settings'),
                ('manage_users', 'Create/edit/delete users'),
                ('manage_permissions', 'Legacy alias for permission management — kept for backward compatibility'),
            ]
            for perm_name, desc in default_perms:
                db.session.add(Permission(
                    permission_id=str(_uuid.uuid4()),
                    permission_name=perm_name,
                    description=desc,
                ))
            db.session.commit()
        except Exception as _seed_err:
            try:
                db.session.rollback()
            except Exception:
                pass
    else:
        _cleanup_online(db)
    ctx.pop()


# ═══════════════════════════════════════════════════════════════════════════════
# Per-test: patch side-effects
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def patch_side_effects(monkeypatch, test_mode):
    """
    Suppress infrastructure side-effects:

    Always patched
    - Email helpers   — never send real emails regardless of mode.
    - Sync scheduler  — prevents FK noise and scheduled jobs during tests.

    Offline only
    - log_action          — audit_log table not present in SQLite schema.
    - get_next_bill_number — uses PostgreSQL ::UUID cast; native in online mode.
    """
    # ── always: silence email helpers ────────────────────────────────────────
    for email_fn in [
        "send_welcome_email",
        "send_login_notification",
        "send_password_reset_email",
        "send_password_changed_email",
        "send_verification_email",
    ]:
        try:
            monkeypatch.setattr(f"routes.auth.{email_fn}", lambda *a, **k: None)
        except (AttributeError, ImportError, Exception):
            pass

    # Silence team invite email (send_invite_email called when creating team members)
    try:
        monkeypatch.setattr("routes.team.send_invite_email", lambda *a, **k: None)
    except (AttributeError, ImportError, Exception):
        pass

    # Silence team plan rules to use Enterprise limits in tests (avoids quota blocking)
    try:
        monkeypatch.setattr(
            "routes.team._get_plan_rules",
            lambda client_id: ("Enterprise", {"max_members": 100, "allowed_billing": ["gst_billing", "non_gst_billing"]}, False),
        )
    except (AttributeError, ImportError, Exception):
        pass

    # ── always: silence log_action ────────────────────────────────────────────
    # log_action adds AuditLog objects to the session without committing.
    # When the test later queries the DB, SQLAlchemy auto-flushes those
    # objects.  If audit_log schema drifts from the model (offline) or the
    # table is missing (online), the flush fails and aborts the PostgreSQL
    # transaction, making all subsequent queries in that connection fail with
    # InFailedSqlTransaction.  Billing tests validate billing/stock logic —
    # not audit logging — so silencing log_action in all modes is correct.
    for target in [
        "utils.audit_logger.log_action",
        "routes.billing.log_action",
        "routes.stock.log_action",
        "routes.auth.log_action",
    ]:
        try:
            monkeypatch.setattr(target, lambda *a, **k: None)
        except (AttributeError, ImportError, Exception):
            pass

    # ── always: silence webhook dispatch ─────────────────────────────────────
    # dispatch_event (in services/webhook_service.py) queries WebhookEndpoint
    # to find active endpoints.  If that table is missing or has a schema
    # drift, the query raises a PostgreSQL error that aborts the current
    # transaction.  The billing route catches the exception and still returns
    # 201, but the PostgreSQL connection is left in an aborted-transaction
    # state — any subsequent query in the same session then fails with
    # InFailedSqlTransaction.
    # Billing/stock tests are not testing webhook delivery, so silencing this
    # in both modes is safe and correct.
    try:
        monkeypatch.setattr(
            "services.webhook_service.dispatch_event", lambda *a, **k: None
        )
    except (AttributeError, ImportError, Exception):
        pass

    # ── offline only ──────────────────────────────────────────────────────────
    if test_mode == "offline":
        _counter = [1]

        def _fake_bill_number(client_id, bill_type):
            n = _counter[0]
            _counter[0] += 1
            return n

        try:
            monkeypatch.setattr(
                "routes.billing.get_next_bill_number", _fake_bill_number
            )
        except (AttributeError, ImportError, Exception):
            pass

    # ── online only ───────────────────────────────────────────────────────────
    else:
        # routes/billing.py defines a Flask route handler also named
        # get_next_bill_number() which shadows the import from
        # utils.bill_number_helper at the module level.  Restore the real
        # utility so create_gst_bill() / create_non_gst_bill() can call it
        # with the (client_id, bill_type) signature.
        try:
            from utils.bill_number_helper import (
                get_next_bill_number as _real_bill_num,
            )
            monkeypatch.setattr(
                "routes.billing.get_next_bill_number", _real_bill_num
            )
        except (AttributeError, ImportError, Exception):
            pass


# ═══════════════════════════════════════════════════════════════════════════════
# Public helpers (imported by test modules)
# ═══════════════════════════════════════════════════════════════════════════════

def make_token(
    user_id,
    client_id,
    *,
    permissions=None,
    is_super_admin=False,
    is_readonly=False,
    expired=False,
):
    """
    Return a signed JWT.
    Reads JWT_SECRET from the environment so offline and online modes both
    produce tokens the running app will accept.
    No session_id → skips UserSession validation.
    """
    secret = os.environ["JWT_SECRET"]
    exp = (
        (datetime.utcnow() - timedelta(hours=1))
        if expired
        else (datetime.utcnow() + timedelta(hours=2))
    )
    return jwt.encode(
        {
            "user_id": str(user_id),
            "client_id": str(client_id),
            "permissions": permissions or [],
            "is_super_admin": is_super_admin,
            "is_readonly": is_readonly,
            "exp": exp,
            "iat": datetime.utcnow(),
        },
        secret,
        algorithm="HS256",
    )


def auth_hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _bcrypt(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ═══════════════════════════════════════════════════════════════════════════════
# DB-object fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def http(app):
    return app.test_client()


@pytest.fixture
def sample_client(test_mode):
    from models.client_model import ClientEntry
    from extensions import db

    cid = str(uuid.uuid4())
    c = ClientEntry(
        client_id=cid,
        client_name="Test Restaurant",
        # .invalid is a reserved TLD (RFC 2606) — can never be a real address.
        email=f"test-c-{cid[:8]}@valoryx-test.invalid",
        is_active=True,
        email_verified=True,
        subscription_status="active",
    )
    db.session.add(c)
    db.session.commit()

    if test_mode == "online":
        _ONLINE_STATE["client_ids"].append(cid)

    return c


@pytest.fixture
def sample_user(sample_client):
    from models.user_model import User
    from extensions import db

    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"test-u-{uid[:8]}@valoryx-test.invalid",
        password_hash=_bcrypt("TestPass123!"),
        client_id=sample_client.client_id,
        role="manager",
        is_active=True,
        is_super_admin=False,
        full_name="Test User",
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


@pytest.fixture
def sample_stock(sample_client):
    from models.stock_model import StockEntry
    from extensions import db

    pid = str(uuid.uuid4())
    s = StockEntry(
        product_id=pid,
        client_id=sample_client.client_id,
        product_name="Widget",
        quantity=50,
        rate=500.0,
        gst_percentage=18.0,
        unit="pcs",
        hsn_code="8471",
        low_stock_alert=10,
    )
    db.session.add(s)
    db.session.commit()
    return s


@pytest.fixture
def gst_headers(sample_user, sample_client):
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["gst_billing", "non_gst_billing", "add_product", "view_stock"],
    )
    return auth_hdr(token)


@pytest.fixture
def audit_only_headers(sample_user, sample_client):
    """Auth headers for the manager sample_user (role='manager') — allowed to record
    audit corrections. (Permissions are kept for back-compat of unrelated tests.)"""
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["edit_bill_price_audit"],
    )
    return auth_hdr(token)


@pytest.fixture
def readonly_headers(sample_user, sample_client):
    """Auth headers for a read-only impersonation session — role passes the gate
    (manager) but is_readonly must block all mutations via @readonly_guard."""
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["edit_bill_price_audit"],
        is_readonly=True,
    )
    return auth_hdr(token)


@pytest.fixture
def staff_headers(sample_client):
    """Auth headers for a STAFF user — must NOT be able to record audit corrections,
    even when granted the legacy edit_bill_price_audit permission (role-based gate)."""
    from models.user_model import User
    from extensions import db

    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"staff-{uid[:8]}@valoryx-test.invalid",
        password_hash=_bcrypt("TestPass123!"),
        client_id=sample_client.client_id,
        role="staff",
        is_active=True,
        is_super_admin=False,
        full_name="Staff User",
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    token = make_token(uid, sample_client.client_id, permissions=["edit_bill_price_audit"])
    return auth_hdr(token)


@pytest.fixture
def second_client(test_mode):
    from models.client_model import ClientEntry
    from extensions import db

    cid = str(uuid.uuid4())
    c = ClientEntry(
        client_id=cid,
        client_name="Other Business",
        email=f"test-other-{cid[:8]}@valoryx-test.invalid",
        is_active=True,
        email_verified=True,
        subscription_status="active",
    )
    db.session.add(c)
    db.session.commit()

    if test_mode == "online":
        _ONLINE_STATE["client_ids"].append(cid)

    return c


@pytest.fixture
def second_user(second_client):
    from models.user_model import User
    from extensions import db

    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"test-other-{uid[:8]}@valoryx-test.invalid",
        password_hash=_bcrypt("OtherPass123!"),
        client_id=second_client.client_id,
        role="manager",
        is_active=True,
        is_super_admin=False,
        full_name="Other User",
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


@pytest.fixture
def second_stock(second_client):
    from models.stock_model import StockEntry
    from extensions import db

    pid = str(uuid.uuid4())
    s = StockEntry(
        product_id=pid,
        client_id=second_client.client_id,
        product_name="Gadget",
        quantity=30,
        rate=1000.0,
        gst_percentage=18.0,
        unit="pcs",
        low_stock_alert=5,
    )
    db.session.add(s)
    db.session.commit()
    return s

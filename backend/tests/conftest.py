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

        for optional in [
"models.customer_model",
            "models.report_model",
            "models.audit_model",
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

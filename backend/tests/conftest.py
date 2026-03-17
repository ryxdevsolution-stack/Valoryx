"""
Shared fixtures for the Valoryx backend test suite.

Design decisions:
  - SQLite :memory: with StaticPool — all connections share one in-memory DB,
    so rows inserted by fixtures are visible inside request handlers.
  - JWT tokens omit session_id → auth middleware skips UserSession DB lookup.
  - Env vars (JWT_SECRET, SECRET_KEY) are set before any Flask/Config import
    so Config's class-level validation succeeds.
  - log_action and get_next_bill_number are patched as autouse fixtures because
    they require PostgreSQL-specific SQL or the audit_log table.
"""

import os
import sys

# MUST precede all Flask/Config imports — Config raises ValueError if absent.
os.environ.setdefault("JWT_SECRET", "valoryx-test-secret-2026")
os.environ.setdefault("SECRET_KEY", "valoryx-flask-secret-2026")
os.environ.setdefault("DB_MODE", "offline")

# Ensure backend/ is importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Ensure tests/ itself is importable (allows `from conftest import make_token`).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uuid
import bcrypt
import pytest
import jwt
from datetime import datetime, timedelta
from sqlalchemy.pool import StaticPool
from flask import Flask
from extensions import db as _db

_JWT_SECRET = os.environ["JWT_SECRET"]


# ── App factory ────────────────────────────────────────────────────────────────

def create_test_app():
    """Minimal Flask app: SQLite in-memory, no schedulers, no migrations."""
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
        JWT_SECRET=_JWT_SECRET,
        JWT_ALGORITHM="HS256",
        SECRET_KEY=os.environ["SECRET_KEY"],
        DB_MODE="offline",
        CORS_ORIGINS=[],
    )

    _db.init_app(app)

    with app.app_context():
        # Register models so db.create_all() creates their tables.
        import models.client_model      # noqa: F401
        import models.branch_model      # noqa: F401  (branches table — User.branch_id FK)
        import models.user_model        # noqa: F401
        import models.stock_model       # noqa: F401
        import models.billing_model     # noqa: F401
        import models.session_model     # noqa: F401
        import models.permission_model  # noqa: F401

        for optional in [
            "models.payment_model",
            "models.customer_model",
            "models.report_model",
            "models.audit_model",
        ]:
            try:
                __import__(optional)
            except (ImportError, Exception):
                pass

        # notes_model uses dialects.postgresql.UUID (native PG type) which
        # SQLAlchemy cannot compile for SQLite.  Remove it from the shared
        # MetaData object before create_all() so SQLite never sees it.
        _SQLITE_SKIP = {"notes"}
        for _tname in list(_SQLITE_SKIP):
            if _tname in _db.metadata.tables:
                _db.metadata.remove(_db.metadata.tables[_tname])
        _db.create_all()

        # Register blueprints — wrap each to allow partial failures.
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


# ── Session-scoped app ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    return create_test_app()


# ── Per-test: push context + clean all rows ────────────────────────────────────

@pytest.fixture(autouse=True)
def app_ctx(app):
    """Push an app context for every test; wipe all rows after."""
    ctx = app.app_context()
    ctx.push()
    yield
    from extensions import db
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
    ctx.pop()


# ── Per-test: patch side-effects ───────────────────────────────────────────────

@pytest.fixture(autouse=True)
def patch_side_effects(monkeypatch):
    """
    Silence infrastructure side-effects for every test:
      - log_action: writes to audit_log table (not always present)
      - get_next_bill_number: uses PostgreSQL ::UUID cast, fails on SQLite
      - email helpers in auth route: need live SMTP
    """
    _counter = [1]

    def _fake_bill_number(client_id, bill_type):
        n = _counter[0]
        _counter[0] += 1
        return n

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

    try:
        monkeypatch.setattr("routes.billing.get_next_bill_number", _fake_bill_number)
    except (AttributeError, ImportError, Exception):
        pass

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


# ── Public helpers (imported by test modules) ──────────────────────────────────

def make_token(user_id, client_id, *, permissions=None, is_super_admin=False, expired=False):
    """Return a signed JWT. No session_id → skips UserSession validation."""
    exp = (datetime.utcnow() - timedelta(hours=1)) if expired else (datetime.utcnow() + timedelta(hours=2))
    return jwt.encode(
        {
            "user_id": str(user_id),
            "client_id": str(client_id),
            "permissions": permissions or [],
            "is_super_admin": is_super_admin,
            "exp": exp,
            "iat": datetime.utcnow(),
        },
        _JWT_SECRET,
        algorithm="HS256",
    )


def auth_hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _bcrypt(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ── DB-object fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def http(app):
    return app.test_client()


@pytest.fixture
def sample_client():
    from models.client_model import ClientEntry
    from extensions import db

    cid = str(uuid.uuid4())
    c = ClientEntry(
        client_id=cid,
        client_name="Test Restaurant",
        email=f"c-{cid[:8]}@example.com",
        is_active=True,
        email_verified=True,
        subscription_status="active",
    )
    db.session.add(c)
    db.session.commit()
    return c


@pytest.fixture
def sample_user(sample_client):
    from models.user_model import User
    from extensions import db

    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"u-{uid[:8]}@example.com",
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
def second_client():
    from models.client_model import ClientEntry
    from extensions import db

    cid = str(uuid.uuid4())
    c = ClientEntry(
        client_id=cid,
        client_name="Other Business",
        email=f"other-{cid[:8]}@example.com",
        is_active=True,
        email_verified=True,
        subscription_status="active",
    )
    db.session.add(c)
    db.session.commit()
    return c


@pytest.fixture
def second_user(second_client):
    from models.user_model import User
    from extensions import db

    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"other-{uid[:8]}@example.com",
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

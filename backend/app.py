import os
import sys
import time as _time_module
from flask import Flask, send_from_directory, g, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import Config
from extensions import db

def create_app():
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize CORS - deny all cross-origin by default when env var is unset
    cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
    if cors_origins_raw.strip():
        cors_origins = [o.strip() for o in cors_origins_raw.split(',') if o.strip()]
    else:
        cors_origins = []  # deny all cross-origin by default — safe when env var is missing

    CORS(app,
     origins=cors_origins,
     supports_credentials=True,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
     allow_headers=['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
     expose_headers=['Content-Type', 'Authorization'],
     max_age=3600)


    # Initialize database with error handling
    from extensions import init_db_safely, test_db_connection
    import logging

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    # Suppress noisy httpx request/response logs (e.g. Telegram polling spam)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)

    db_initialized = init_db_safely(app)

    # Store database status for later use
    app.config['DB_INITIALIZED'] = db_initialized

    if not db_initialized:
        logging.warning("[WARNING]  Database initialization failed - API will run with limited functionality")
    else:
        logging.info("[OK] Database initialized successfully")

    # Register all models in dependency order and force mapper configuration
    # so all relationship string-references (e.g. 'User' in UserPermission)
    # are resolved before the first request is served.
    with app.app_context():
        import models  # noqa: F401 — triggers models/__init__.py imports
        from sqlalchemy.orm import configure_mappers
        configure_mappers()

    # Sync: lazy-initialized on first button click (no background thread)
    logging.info("[INFO] Sync available on demand (manual trigger only)")

    # Run versioned migrations — skips entirely on daily open if schema is up to date
    if db_initialized:
        try:
            from migrations.runner import run_migrations_if_needed
            run_migrations_if_needed(app, db)
        except Exception as _e:
            logging.warning(f"[Migration] Migration runner failed: {_e}")

        # Permission sections seed — idempotent (INSERT OR IGNORE), fast (<5ms), always run
        try:
            with app.app_context():
                from migrations.seed_permission_sections import run as _perm_seed
                _perm_seed(db)
        except Exception as _e:
            logging.warning(f"[Migration] permission sections seed skipped: {_e}")

        # Default permissions seed — runs at every startup, inserts only missing entries
        try:
            with app.app_context():
                import uuid as _uuid
                from models.permission_model import Permission
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
                    # System Settings
                    ('view_settings', 'View system settings'),
                    ('edit_company_settings', 'Edit company information'),
                    ('edit_billing_settings', 'Edit billing configuration'),
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
                    r[0] for r in db.session.query(Permission.permission_name).all()
                }
                added = 0
                for perm_name, desc in default_perms:
                    if perm_name not in existing_names:
                        db.session.add(Permission(
                            permission_id=str(_uuid.uuid4()),
                            permission_name=perm_name,
                            description=desc,
                        ))
                        added += 1
                if added:
                    db.session.commit()
                    logging.info(f"[Seed] {added} missing permission(s) added")
                from utils.owner_permission_sync import grant_audit_edit_to_owners
                grant_audit_edit_to_owners()
        except Exception as _e:
            with app.app_context():
                db.session.rollback()
            logging.warning(f"[Seed] Permission seeding skipped: {_e}")

    # Telegram daily report scheduler (runs at TELEGRAM_REPORT_HOUR:TELEGRAM_REPORT_MINUTE IST)
    try:
        from services.telegram_scheduler import init_telegram_scheduler
        tg_scheduler = init_telegram_scheduler(app)
        if tg_scheduler:
            app.config['TELEGRAM_SCHEDULER'] = tg_scheduler
            logging.info("[OK] Telegram daily report scheduler initialized")
        else:
            logging.info("[INFO] Telegram scheduler disabled (TELEGRAM_BOT_TOKEN not set)")
    except Exception as e:
        logging.warning(f"[WARNING] Telegram scheduler failed to initialize: {e}")

    # Account deletion cleanup — runs once per day in a daemon thread.
    # Permanently deletes ClientEntry rows whose deletion_scheduled_at is in the past.
    if db_initialized:
        import threading as _threading
        import time as _time

        def _deletion_cleanup_loop():
            _INTERVAL = 24 * 3600  # run every 24 hours
            while True:
                _time.sleep(_INTERVAL)
                try:
                    with app.app_context():
                        from datetime import datetime as _dt
                        from sqlalchemy import text as _text
                        now_str = _dt.utcnow().isoformat(sep=' ')
                        # Fetch candidate client_ids before deleting so we can log them
                        rows = db.session.execute(
                            _text("SELECT client_id FROM client_entry "
                                  "WHERE deletion_scheduled_at IS NOT NULL "
                                  "AND deletion_scheduled_at <= :now"),
                            {'now': now_str}
                        ).fetchall()
                        if rows:
                            for row in rows:
                                cid = row[0]
                                db.session.execute(
                                    _text("DELETE FROM client_entry WHERE client_id = :cid"),
                                    {'cid': cid}
                                )
                                logging.info(f"[Deletion] Purged client {cid} (grace period elapsed)")
                            db.session.commit()
                except Exception as _cleanup_err:
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                    logging.warning(f"[Deletion] Cleanup run failed: {_cleanup_err}")

        _cleanup_thread = _threading.Thread(target=_deletion_cleanup_loop, daemon=True, name='deletion-cleanup')
        _cleanup_thread.start()
        logging.info("[OK] Account deletion cleanup thread started (runs every 24h)")

    # Register blueprints with error handling
    blueprints_registered = []
    import_errors = []

    # Import each blueprint separately to identify which one fails
    auth_bp = billing_bp = stock_bp = report_bp = audit_bp = None
    client_bp = customer_bp = analytics_bp = None
    permissions_bp = admin_bp = notes_bp = bulk_order_bp = expense_bp = profile_bp = None
    branch_bp = stock_transfer_bp = team_bp = invite_bp = sessions_bp = None
    totp_bp = oauth_bp = None

    try:
        from routes.auth import auth_bp
    except Exception as e:
        import_errors.append(f"auth: {str(e)}")
        logging.error(f"Failed to import auth blueprint: {e}")

    try:
        from routes.billing import billing_bp
    except Exception as e:
        import_errors.append(f"billing: {str(e)}")
        logging.error(f"Failed to import billing blueprint: {e}")

    try:
        from routes.stock import stock_bp
    except Exception as e:
        import_errors.append(f"stock: {str(e)}")
        logging.error(f"Failed to import stock blueprint: {e}")

    try:
        from routes.report import report_bp
    except Exception as e:
        import_errors.append(f"report: {str(e)}")
        logging.error(f"Failed to import report blueprint: {e}")

    try:
        from routes.audit import audit_bp
    except Exception as e:
        import_errors.append(f"audit: {str(e)}")
        logging.error(f"Failed to import audit blueprint: {e}")

    try:
        from routes.client import client_bp
    except Exception as e:
        import_errors.append(f"client: {str(e)}")
        logging.error(f"Failed to import client blueprint: {e}")

    try:
        from routes.customer import customer_bp
    except Exception as e:
        import_errors.append(f"customer: {str(e)}")
        logging.error(f"Failed to import customer blueprint: {e}")

    try:
        from routes.analytics import analytics_bp
    except Exception as e:
        import_errors.append(f"analytics: {str(e)}")
        logging.error(f"Failed to import analytics blueprint: {e}")

    try:
        from routes.permissions import permissions_bp
    except Exception as e:
        import_errors.append(f"permissions: {str(e)}")
        logging.error(f"Failed to import permissions blueprint: {e}")

    try:
        from routes.admin import admin_bp
    except Exception as e:
        import_errors.append(f"admin: {str(e)}")
        logging.error(f"Failed to import admin blueprint: {e}")

    try:
        from routes.notes import notes_bp
    except Exception as e:
        import_errors.append(f"notes: {str(e)}")
        logging.error(f"Failed to import notes blueprint: {e}")

    try:
        from routes.bulk_stock_order import bulk_order_bp
    except Exception as e:
        import_errors.append(f"bulk_order: {str(e)}")
        logging.error(f"Failed to import bulk_order blueprint: {e}")

    try:
        from routes.expense import expense_bp
    except Exception as e:
        import_errors.append(f"expense: {str(e)}")
        logging.error(f"Failed to import expense blueprint: {e}")

    try:
        from routes.profile import profile_bp
    except Exception as e:
        import_errors.append(f"profile: {str(e)}")
        logging.error(f"Failed to import profile blueprint: {e}")

    subscription_bp = None
    try:
        from routes.subscription import subscription_bp
    except Exception as e:
        import_errors.append(f"subscription: {str(e)}")
        logging.error(f"Failed to import subscription blueprint: {e}")

    try:
        from routes.branches import branch_bp
    except Exception as e:
        import_errors.append(f"branches: {str(e)}")
        logging.error(f"Failed to import branches blueprint: {e}")

    try:
        from routes.stock_transfer import stock_transfer_bp
    except Exception as e:
        import_errors.append(f"stock_transfer: {str(e)}")
        logging.error(f"Failed to import stock_transfer blueprint: {e}")

    try:
        from routes.team import team_bp
    except Exception as e:
        import_errors.append(f"team: {str(e)}")
        logging.error(f"Failed to import team blueprint: {e}")

    try:
        from routes.invite import invite_bp
    except Exception as e:
        import_errors.append(f"invite: {str(e)}")
        logging.error(f"Failed to import invite blueprint: {e}")

    try:
        from routes.sessions import sessions_bp
        from models.session_model import UserSession  # noqa: F401 — ensures table is created
    except Exception as e:
        import_errors.append(f"sessions: {str(e)}")
        logging.error(f"Failed to import sessions blueprint: {e}")

    try:
        from routes.totp import totp_bp
    except Exception as e:
        import_errors.append(f"totp: {str(e)}")
        logging.error(f"Failed to import totp blueprint: {e}")

    try:
        from routes.oauth import oauth_bp
    except Exception as e:
        import_errors.append(f"oauth: {str(e)}")
        logging.error(f"Failed to import oauth blueprint: {e}")

    impersonate_bp = None
    try:
        from routes.impersonate import impersonate_bp
    except Exception as e:
        import_errors.append(f"impersonate: {str(e)}")
        logging.error(f"Failed to import impersonate blueprint: {e}")

    webhooks_bp = None
    try:
        from routes.webhooks import webhooks_bp
        from models.webhook_model import WebhookEndpoint, WebhookDelivery  # noqa: F401 — table creation
    except Exception as e:
        import_errors.append(f"webhooks: {str(e)}")
        logging.error(f"Failed to import webhooks blueprint: {e}")

    try:
        from routes.electron import electron_bp
    except Exception as e:
        import_errors.append(f"electron: {str(e)}")
        logging.error(f"Failed to import electron blueprint: {e}")

    shop_settings_bp = None
    try:
        from routes.shop_settings import shop_settings_bp
    except Exception as e:
        import_errors.append(f"shop_settings: {str(e)}")
        logging.error(f"Failed to import shop_settings blueprint: {e}")

    suppliers_bp = None
    try:
        from routes.suppliers import suppliers_bp
    except Exception as e:
        import_errors.append(f"suppliers: {str(e)}")
        logging.error(f"Failed to import suppliers blueprint: {e}")

    contact_bp = None
    try:
        from routes.contact import contact_bp
    except Exception as e:
        import_errors.append(f"contact: {str(e)}")
        logging.error(f"Failed to import contact blueprint: {e}")

    employees_bp = None
    try:
        from routes.employees import employees_bp
    except Exception as e:
        import_errors.append(f"employees: {str(e)}")
        logging.error(f"Failed to import employees blueprint: {e}")

    search_bp = None
    try:
        from routes.search import search_bp
    except Exception as e:
        import_errors.append(f"search: {str(e)}")
        logging.error(f"Failed to import search blueprint: {e}")

    # Store import errors for debugging
    app.config['IMPORT_ERRORS'] = import_errors
    if import_errors:
        logging.error(f"Blueprint import errors: {import_errors}")

    # Register blueprints only if they were imported successfully
    if auth_bp:
        try:
            app.register_blueprint(auth_bp, url_prefix='/api/auth')
            blueprints_registered.append('auth')
        except Exception as e:
            print(f"Warning: Could not register auth blueprint: {e}")
    
    if billing_bp:
        try:
            app.register_blueprint(billing_bp, url_prefix='/api/billing')
            blueprints_registered.append('billing')
        except Exception as e:
            print(f"Warning: Could not register billing blueprint: {e}")
    
    if stock_bp:
        try:
            app.register_blueprint(stock_bp, url_prefix='/api/stock')
            blueprints_registered.append('stock')
        except Exception as e:
            print(f"Warning: Could not register stock blueprint: {e}")
    
    if report_bp:
        try:
            app.register_blueprint(report_bp, url_prefix='/api/report')
            blueprints_registered.append('report')
        except Exception as e:
            print(f"Warning: Could not register report blueprint: {e}")
    
    if audit_bp:
        try:
            app.register_blueprint(audit_bp, url_prefix='/api/audit')
            blueprints_registered.append('audit')
        except Exception as e:
            print(f"Warning: Could not register audit blueprint: {e}")
    
    if client_bp:
        try:
            app.register_blueprint(client_bp, url_prefix='/api/clients')
            blueprints_registered.append('client')
        except Exception as e:
            print(f"Warning: Could not register client blueprint: {e}")
    
    if customer_bp:
        try:
            app.register_blueprint(customer_bp, url_prefix='/api/customer')
            blueprints_registered.append('customer')
        except Exception as e:
            print(f"Warning: Could not register customer blueprint: {e}")

    if analytics_bp:
        try:
            app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
            blueprints_registered.append('analytics')
        except Exception as e:
            print(f"Warning: Could not register analytics blueprint: {e}")

    if permissions_bp:
        try:
            app.register_blueprint(permissions_bp, url_prefix='/api/permissions')
            blueprints_registered.append('permissions')
        except Exception as e:
            print(f"Warning: Could not register permissions blueprint: {e}")

    if admin_bp:
        try:
            app.register_blueprint(admin_bp, url_prefix='/api/admin')
            blueprints_registered.append('admin')
        except Exception as e:
            print(f"Warning: Could not register admin blueprint: {e}")

    if notes_bp:
        try:
            app.register_blueprint(notes_bp, url_prefix='/api')
            blueprints_registered.append('notes')
        except Exception as e:
            print(f"Warning: Could not register notes blueprint: {e}")

    if bulk_order_bp:
        try:
            app.register_blueprint(bulk_order_bp, url_prefix='/api/bulk-orders')
            blueprints_registered.append('bulk_orders')
        except Exception as e:
            print(f"Warning: Could not register bulk orders blueprint: {e}")

    if expense_bp:
        try:
            app.register_blueprint(expense_bp, url_prefix='/api/expense')
            blueprints_registered.append('expense')
        except Exception as e:
            print(f"Warning: Could not register expense blueprint: {e}")

    if profile_bp:
        try:
            app.register_blueprint(profile_bp, url_prefix='/api/profile')
            blueprints_registered.append('profile')
        except Exception as e:
            print(f"Warning: Could not register profile blueprint: {e}")

    if subscription_bp:
        try:
            app.register_blueprint(subscription_bp, url_prefix='/api/subscription')
            blueprints_registered.append('subscription')
        except Exception as e:
            print(f"Warning: Could not register subscription blueprint: {e}")

    if branch_bp:
        try:
            app.register_blueprint(branch_bp, url_prefix='/api/branches')
            blueprints_registered.append('branches')
        except Exception as e:
            print(f"Warning: Could not register branches blueprint: {e}")

    if stock_transfer_bp:
        try:
            app.register_blueprint(stock_transfer_bp, url_prefix='/api/stock-transfers')
            blueprints_registered.append('stock_transfers')
        except Exception as e:
            print(f"Warning: Could not register stock_transfer blueprint: {e}")

    if team_bp:
        try:
            app.register_blueprint(team_bp, url_prefix='/api/team')
            blueprints_registered.append('team')
        except Exception as e:
            print(f"Warning: Could not register team blueprint: {e}")

    if invite_bp:
        try:
            app.register_blueprint(invite_bp, url_prefix='/api/invite')
            blueprints_registered.append('invite')
        except Exception as e:
            print(f"Warning: Could not register invite blueprint: {e}")

    if sessions_bp:
        try:
            app.register_blueprint(sessions_bp, url_prefix='/api/sessions')
            blueprints_registered.append('sessions')
        except Exception as e:
            print(f"Warning: Could not register sessions blueprint: {e}")

    if totp_bp:
        try:
            app.register_blueprint(totp_bp, url_prefix='/api/totp')
            blueprints_registered.append('totp')
        except Exception as e:
            print(f"Warning: Could not register totp blueprint: {e}")

    if oauth_bp:
        try:
            app.register_blueprint(oauth_bp, url_prefix='/api/oauth')
            blueprints_registered.append('oauth')
        except Exception as e:
            print(f"Warning: Could not register oauth blueprint: {e}")

    if impersonate_bp:
        try:
            app.register_blueprint(impersonate_bp, url_prefix='/api/admin/impersonate')
            blueprints_registered.append('impersonate')
        except Exception as e:
            print(f"Warning: Could not register impersonate blueprint: {e}")

    if webhooks_bp:
        try:
            app.register_blueprint(webhooks_bp, url_prefix='/api/webhooks')
            blueprints_registered.append('webhooks')
        except Exception as e:
            print(f"Warning: Could not register webhooks blueprint: {e}")

    try:
        app.register_blueprint(electron_bp)
        blueprints_registered.append('electron')
    except Exception as e:
        print(f"Warning: Could not register electron blueprint: {e}")

    if shop_settings_bp:
        try:
            app.register_blueprint(shop_settings_bp, url_prefix='/api/shop-settings')
            blueprints_registered.append('shop_settings')
        except Exception as e:
            print(f"Warning: Could not register shop_settings blueprint: {e}")

    if suppliers_bp:
        try:
            app.register_blueprint(suppliers_bp, url_prefix='/api/suppliers')
            blueprints_registered.append('suppliers')
        except Exception as e:
            print(f"Warning: Could not register suppliers blueprint: {e}")

    if contact_bp:
        try:
            app.register_blueprint(contact_bp, url_prefix='/api/contact')
            blueprints_registered.append('contact')
        except Exception as e:
            print(f"Warning: Could not register contact blueprint: {e}")

    if employees_bp:
        try:
            app.register_blueprint(employees_bp, url_prefix='/api/employees')
            blueprints_registered.append('employees')
        except Exception as e:
            print(f"Warning: Could not register employees blueprint: {e}")

    if search_bp:
        try:
            app.register_blueprint(search_bp, url_prefix='/api/search')
            blueprints_registered.append('search')
        except Exception as e:
            print(f"Warning: Could not register search blueprint: {e}")

    # Store blueprint registration status
    app.config['BLUEPRINTS_REGISTERED'] = blueprints_registered

    # Telegram: manually trigger daily report (super-admin only)
    @app.route('/api/telegram/trigger-report', methods=['POST'])
    def trigger_telegram_report():
        """Fire the daily Telegram report immediately. Requires super-admin JWT."""
        from utils.auth_middleware import authenticate as _auth
        from flask import g as _g, request as _req

        # Inline auth check — route is defined outside a blueprint so we
        # call the middleware helper directly.
        token = (_req.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
        if not token:
            return {'error': 'Authentication required'}, 401

        try:
            import jwt as _jwt
            from config import Config as _Cfg
            decoded = _jwt.decode(token, _Cfg.JWT_SECRET_KEY, algorithms=['HS256'])
        except Exception:
            return {'error': 'Invalid or expired token'}, 401

        if not decoded.get('is_super_admin'):
            return {'error': 'Super-admin access required'}, 403

        sched = app.config.get('TELEGRAM_SCHEDULER')
        if not sched:
            return {
                'error': 'Telegram scheduler not configured',
                'message': 'Set TELEGRAM_BOT_TOKEN in .env and restart the server'
            }, 400

        import threading as _threading
        _threading.Thread(target=sched.trigger_now, daemon=True).start()
        return {'status': 'triggered', 'message': 'Daily report is being sent in the background'}, 200

    # Telegram: send a test message to the calling user's chat ID (auth required)
    @app.route('/api/telegram/test-send', methods=['POST'])
    def test_telegram_send():
        """
        Send a test Telegram message to the authenticated user's chat ID.
        Useful for verifying bot token and VPS outbound connectivity.
        """
        token = (request.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401

        try:
            import jwt as _jwt
            from config import Config as _Cfg
            decoded = _jwt.decode(token, _Cfg.JWT_SECRET_KEY, algorithms=['HS256'])
        except Exception:
            return jsonify({'error': 'Invalid or expired token'}), 401

        user_id = decoded.get('user_id')
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401

        from models.user_model import User
        user = User.query.filter_by(user_id=user_id).first()
        if not user or not user.telegram_chat_id:
            return jsonify({
                'error': 'No Telegram chat ID configured',
                'message': 'Set your Telegram chat ID in Profile settings first'
            }), 400

        from services.telegram_service import send_telegram_message
        ok = send_telegram_message(
            user.telegram_chat_id,
            "✅ <b>Valoryx Test Message</b>\n\nYour Telegram notifications are working correctly!"
        )

        if ok:
            return jsonify({'success': True, 'message': f'Test message sent to chat ID {user.telegram_chat_id}'}), 200
        return jsonify({'error': 'Failed to send — check TELEGRAM_BOT_TOKEN and chat ID'}), 502

    # Health check endpoint (basic uptime check)
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return {'status': 'healthy', 'message': 'Valoryx API is running'}, 200

    # Status endpoint (detailed configuration and status)
    @app.route('/api/status', methods=['GET'])
    def status_check():
        from config import Config

        # Test database connection
        db_connected = False
        try:
            db_connected = test_db_connection(app)
        except:
            pass

        # Check Supabase configuration
        supabase_url_set = bool(Config.SUPABASE_URL)
        supabase_key_set = bool(Config.SUPABASE_KEY)
        supabase_configured = supabase_url_set and supabase_key_set
        using_supabase = 'supabase' in str(Config.SQLALCHEMY_DATABASE_URI).lower() or 'postgresql' in str(Config.SQLALCHEMY_DATABASE_URI).lower()

        # Phase 1: Get database mode
        db_mode = app.config.get('DB_MODE', 'unknown')

        status = {
            'status': 'running',
            'message': 'Valoryx API is running',
            'database': {
                'initialized': db_initialized,
                'connected': db_connected,
                'type': 'PostgreSQL' if using_supabase else 'SQLite (fallback)',
                'mode': db_mode  # Phase 1: Show online/offline mode
            },
            'supabase': {
                'configured': supabase_configured,
                'url_set': supabase_url_set,
                'key_set': supabase_key_set
            },
            'blueprints': {
                'registered': app.config.get('BLUEPRINTS_REGISTERED', []),
                'count': len(app.config.get('BLUEPRINTS_REGISTERED', [])),
                'import_errors': app.config.get('IMPORT_ERRORS', [])
            },
            'cors_origins': os.environ.get('CORS_ORIGINS', 'not set'),
            'warnings': []
        }

        if not supabase_configured:
            status['warnings'].append("Supabase not configured - using SQLite fallback")

        if not db_connected:
            status['warnings'].append("Database connection failed")

        if app.config.get('IMPORT_ERRORS'):
            status['warnings'].append(f"Blueprint import errors: {len(app.config.get('IMPORT_ERRORS', []))} failures")

        # Phase 1: Add sync status
        sync_scheduler = app.config.get('SYNC_SCHEDULER')
        if sync_scheduler:
            status['sync'] = sync_scheduler.get_status()
        else:
            status['sync'] = {'enabled': False, 'reason': 'No DB_URL configured'}

        return status, 200

    # Sync endpoints - Bidirectional sync between SQLite and Supabase
    # Lazy-initialized: connects to Supabase on first use (same pattern as /api/electron/setup)

    # Stores the real error so endpoints can return it
    _sync_init_error = [None]

    def _get_or_init_scheduler():
        """Lazy-init sync scheduler on first use.
        Uses os.environ.get('DB_URL') exactly like /api/electron/setup."""
        scheduler = app.config.get('SYNC_SCHEDULER')
        if scheduler:
            return scheduler

        db_url = os.environ.get('DB_URL')
        if not db_url:
            _sync_init_error[0] = 'DB_URL not found in environment or .env file'
            logging.warning(f"[Sync] {_sync_init_error[0]}")
            return None

        try:
            from sqlalchemy import create_engine, text as sa_text
            from services.sync_service import sync_service
            from services.sync_scheduler import SyncScheduler

            sqlite_path = os.environ.get('SQLITE_DB_PATH', os.path.expanduser('~/.valoryx/local.db'))
            pg_engine = create_engine(db_url, pool_pre_ping=True, connect_args={'connect_timeout': 30})

            with pg_engine.connect() as conn:
                conn.execute(sa_text("SELECT 1"))

            sync_service.sqlite_engine = create_engine(f'sqlite:///{sqlite_path}')
            sync_service.postgres_engine = pg_engine

            scheduler = SyncScheduler(sync_service)
            scheduler.running = True
            app.config['SYNC_SCHEDULER'] = scheduler
            _sync_init_error[0] = None
            logging.info("[Sync] Ready")
            return scheduler
        except Exception as e:
            _sync_init_error[0] = str(e)
            logging.error(f"[Sync] Init failed: {e}")
            return None

    @app.route('/api/sync/trigger', methods=['POST'])
    def trigger_sync():
        """Manually trigger a sync. Query param: type=upload|download|full"""
        from flask import request
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'error': 'Sync not available', 'message': _sync_init_error[0] or 'Unknown error'}, 400

        sync_type = request.args.get('type', 'upload')
        result = scheduler.trigger_sync_now(sync_type)
        return result, 200

    @app.route('/api/sync/download', methods=['POST'])
    def trigger_download():
        """Trigger download sync from Supabase to SQLite."""
        from flask import request
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'error': 'Sync not available', 'message': _sync_init_error[0] or 'Unknown error'}, 400

        data = request.get_json() or {}
        client_id = data.get('client_id')
        if not client_id:
            return {'error': 'client_id is required'}, 400

        scheduler.set_client_id(client_id)
        result = scheduler.trigger_sync_now('download')
        return result, 200

    @app.route('/api/sync/initial', methods=['POST'])
    def trigger_initial_load():
        """Trigger initial data load from Supabase to SQLite."""
        from flask import request
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'error': 'Sync not available', 'message': _sync_init_error[0] or 'Unknown error'}, 400

        data = request.get_json() or {}
        client_id = data.get('client_id')
        if not client_id:
            return {'error': 'client_id is required'}, 400

        result = scheduler.trigger_initial_load(client_id)
        return result, 200

    @app.route('/api/sync/full', methods=['POST'])
    def trigger_full_sync():
        """Trigger full bidirectional sync (upload then download)."""
        from flask import request
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'error': 'Sync not available', 'message': _sync_init_error[0] or 'Unknown error'}, 400

        data = request.get_json() or {}
        client_id = data.get('client_id')
        if not client_id:
            return {'error': 'client_id is required'}, 400

        scheduler.set_client_id(client_id)
        result = scheduler.trigger_sync_now('full')
        return result, 200

    @app.route('/api/sync/status', methods=['GET'])
    def sync_status():
        """Get current sync status"""
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'running': False, 'reason': 'DB_URL not configured in .env'}, 200
        return scheduler.get_status(), 200

    @app.route('/api/sync/check-initial', methods=['GET'])
    def check_initial_load():
        """Check if initial data load is needed for a client."""
        from flask import request
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'needed': False, 'reason': 'Sync not available'}, 200

        client_id = request.args.get('client_id')
        if not client_id:
            return {'error': 'client_id is required'}, 400

        needed = scheduler.check_initial_load_needed(client_id)
        return {'client_id': client_id, 'initial_load_needed': needed}, 200

    @app.route('/api/sync/set-client', methods=['POST'])
    def set_sync_client():
        """Set the current client ID for sync operations."""
        from flask import request
        sync_scheduler = _get_or_init_scheduler()

        if not sync_scheduler:
            return {
                'error': 'Sync not available',
                'message': _sync_init_error[0] or 'Unknown error'
            }, 400

        data = request.get_json() or {}
        client_id = data.get('client_id')

        if not client_id:
            return {'error': 'client_id is required'}, 400

        sync_scheduler.set_client_id(client_id)
        return {
            'status': 'success',
            'client_id': client_id,
            'message': 'Client ID set for sync operations'
        }, 200

    # ==================== PERFORMANCE TIMING MIDDLEWARE ====================
    # Records start time for every request; after_request adds X-Response-Time header.
    # Works for both online (Supabase) and offline (SQLite) modes.
    @app.before_request
    def record_request_start_time():
        g._request_start_time = _time_module.time()

    # ==================== SECURITY + TIMING AFTER_REQUEST ====================
    # Adds X-Response-Time header (ms) + hardened security headers to every response.
    @app.after_request
    def add_timing_and_security_headers(response):
        # --- Timing ---
        if hasattr(g, '_request_start_time'):
            elapsed_ms = round((_time_module.time() - g._request_start_time) * 1000, 2)
            response.headers['X-Response-Time'] = f'{elapsed_ms}ms'

        # --- Security headers ---
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('X-XSS-Protection', '1; mode=block')
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        response.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        if not app.debug:
            response.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

        # CSP: strict for API routes, permissive enough for served frontend assets
        if request.path.startswith('/api/'):
            response.headers.setdefault(
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'none'"
            )
        else:
            response.headers.setdefault(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
                "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
            )

        return response

    # Handle CORS preflight requests explicitly
    @app.before_request
    def handle_preflight():
        from flask import request, make_response
        if request.method == 'OPTIONS':
            response = make_response()
            # Use CORS_ORIGINS from environment variable
            allowed_origins = os.environ.get('CORS_ORIGINS', '')
            request_origin = request.headers.get('Origin', '')

            if allowed_origins:
                # Check if request origin is in allowed list
                allowed_list = [o.strip() for o in allowed_origins.split(',') if o.strip()]
                if request_origin in allowed_list:
                    response.headers['Access-Control-Allow-Origin'] = request_origin
                else:
                    response.headers['Access-Control-Allow-Origin'] = allowed_list[0] if allowed_list else ''
            # else: CORS_ORIGINS is empty — do NOT set Access-Control-Allow-Origin at all (omit header)

            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Origin, X-Requested-With'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Max-Age'] = '3600'
            return response, 200

    # Middleware to check database connection for critical endpoints
    @app.before_request
    def check_database_for_critical_endpoints():
        from flask import request
        # Skip database check for health/status endpoints
        if request.path in ['/api/health', '/api/status', '/api/test']:
            return None

        # For other endpoints, check if database is available
        if not app.config.get('DB_INITIALIZED', False):
            # Try to reconnect if not initialized
            if not test_db_connection(app):
                return {
                    'error': 'Database unavailable',
                    'message': 'The database is currently unavailable. Please try again later.',
                    'status': 'service_degraded'
                }, 503

        return None

    # Handle HTTP exceptions properly (don't convert 404 to 500)
    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        return {
            'error': e.name,
            'message': e.description,
        }, e.code

    # Global error handler for non-HTTP exceptions
    @app.errorhandler(Exception)
    def handle_exception(e):
        # Pass through HTTP exceptions
        if isinstance(e, HTTPException):
            return handle_http_exception(e)
        import traceback
        logging.error(f"Unhandled exception: {str(e)}")
        logging.error(traceback.format_exc())
        return {
            'error': 'Internal server error',
            'message': str(e),
            'type': type(e).__name__
        }, 500

    # Add a simple test endpoint that doesn't require database
    @app.route('/api/test', methods=['GET'])
    def test_endpoint():
        return {
            'status': 'success',
            'message': 'Test endpoint working',
            'database_available': db_initialized,
            'blueprints_registered': len(app.config.get('BLUEPRINTS_REGISTERED', [])),
            'blueprints': app.config.get('BLUEPRINTS_REGISTERED', []),
            'import_errors': app.config.get('IMPORT_ERRORS', [])
        }, 200
    
    # ==================== SERVE REACT FRONTEND ====================
    # Serve the React production build from backend/static/frontend/
    FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'frontend')

    @app.route('/', methods=['GET'])
    def root():
        return send_from_directory(FRONTEND_DIR, 'index.html')

    @app.route('/frontend/')
    @app.route('/frontend')
    def serve_frontend():
        return send_from_directory(FRONTEND_DIR, 'index.html')

    @app.route('/frontend/<path:path>')
    def serve_frontend_files(path):
        # Try to serve the exact file (JS, CSS, images, etc.)
        file_path = os.path.join(FRONTEND_DIR, path)
        if os.path.isfile(file_path):
            return send_from_directory(FRONTEND_DIR, path)
        # For any non-file route, serve index.html (SPA client-side routing)
        return send_from_directory(FRONTEND_DIR, 'index.html')

    @app.route('/<path:filename>')
    def serve_frontend_static(filename):
        """Serve static files (images, favicon, etc.) from frontend dist at root level.
        This handles hardcoded paths like /RYX_Logo.png in the React app."""
        file_path = os.path.join(FRONTEND_DIR, filename)
        if os.path.isfile(file_path):
            return send_from_directory(FRONTEND_DIR, filename)
        # For SPA routes (not API, not files), serve index.html
        if not filename.startswith('api/'):
            return send_from_directory(FRONTEND_DIR, 'index.html')
        return {"error": "Not found"}, 404

    return app


# Create the app
app = create_app()

if __name__ == '__main__':
    with app.app_context():
        # Import new branch/transfer models so SQLAlchemy registers them for table creation
        from models.branch_model import Branch
        from models.branch_inventory_model import BranchInventory
        from models.stock_transfer_model import StockTransfer, StockTransferItem

        # Phase 1: Create tables automatically for SQLite (offline mode)
        try:
            if app.config.get('DB_MODE') == 'offline':
                # In offline mode, create tables automatically
                print("[SQLite] Creating tables for offline mode...")
                db.create_all()
                print("[SQLite] ✓ Tables created successfully")
            else:
                # In online mode, only create if they don't exist
                db.create_all()
        except Exception as e:
            print(f"[WARNING]  db.create_all() skipped: {e}")
            print("Database tables likely already exist - continuing...")

        # Phase 1.5: Run pending column migrations (safe to re-run)
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            existing_cols = [col['name'] for col in inspector.get_columns('client_entry')]
            if 'subscription_status' not in existing_cols:
                print("[Migration] Adding trial/subscription columns to client_entry...")
                db.session.execute(text("ALTER TABLE client_entry ADD COLUMN subscription_status VARCHAR(20) NULL"))
                db.session.execute(text("ALTER TABLE client_entry ADD COLUMN trial_start_date TIMESTAMP NULL"))
                db.session.execute(text("ALTER TABLE client_entry ADD COLUMN trial_end_date TIMESTAMP NULL"))
                db.session.commit()
                print("[Migration] ✓ Trial columns added successfully")
        except Exception as e:
            db.session.rollback()
            print(f"[Migration] Skipped trial columns (may already exist): {e}")

        # Telegram chat ID column migration (client_entry — legacy, kept for backward compat)
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            existing_cols = [col['name'] for col in inspector.get_columns('client_entry')]
            if 'telegram_chat_id' not in existing_cols:
                print("[Migration] Adding telegram_chat_id to client_entry...")
                db.session.execute(text("ALTER TABLE client_entry ADD COLUMN telegram_chat_id VARCHAR(50) NULL"))
                db.session.commit()
                print("[Migration] ✓ telegram_chat_id column added to client_entry")
        except Exception as e:
            db.session.rollback()
            print(f"[Migration] telegram_chat_id (client_entry) skipped (may already exist): {e}")

        # Telegram chat ID per-user migration (users table)
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            existing_cols = [col['name'] for col in inspector.get_columns('users')]
            if 'telegram_chat_id' not in existing_cols:
                print("[Migration] Adding telegram_chat_id to users table...")
                db.session.execute(text("ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(50) NULL"))
                db.session.commit()
                print("[Migration] ✓ telegram_chat_id column added to users")
        except Exception as e:
            db.session.rollback()
            print(f"[Migration] telegram_chat_id (users) skipped (may already exist): {e}")

        # Phase 1.6: Subscription tables + plan_id column migration
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            existing_tables = inspector.get_table_names()

            # Create subscription_plan table if missing
            if 'subscription_plan' not in existing_tables:
                print("[Migration] Creating subscription_plan table...")
                db.session.execute(text("""
                    CREATE TABLE subscription_plan (
                        plan_id TEXT PRIMARY KEY,
                        name VARCHAR(50) NOT NULL,
                        description VARCHAR(255),
                        monthly_price INTEGER NOT NULL,
                        yearly_price INTEGER NOT NULL,
                        features TEXT,
                        limits TEXT,
                        is_popular BOOLEAN DEFAULT 0,
                        is_active BOOLEAN DEFAULT 1,
                        display_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                db.session.commit()
                print("[Migration] subscription_plan table created")

            # Create payment_transaction table if missing
            if 'payment_transaction' not in existing_tables:
                print("[Migration] Creating payment_transaction table...")
                db.session.execute(text("""
                    CREATE TABLE payment_transaction (
                        transaction_id TEXT PRIMARY KEY,
                        client_id TEXT NOT NULL,
                        plan_id TEXT NOT NULL,
                        razorpay_order_id VARCHAR(100),
                        razorpay_payment_id VARCHAR(100),
                        razorpay_signature VARCHAR(255),
                        amount INTEGER NOT NULL,
                        currency VARCHAR(3) DEFAULT 'INR',
                        billing_cycle VARCHAR(10) NOT NULL,
                        status VARCHAR(20) DEFAULT 'created',
                        notes VARCHAR(255),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        paid_at TIMESTAMP,
                        FOREIGN KEY (client_id) REFERENCES client_entry(client_id),
                        FOREIGN KEY (plan_id) REFERENCES subscription_plan(plan_id)
                    )
                """))
                db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_pt_client ON payment_transaction(client_id)"))
                db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_pt_order ON payment_transaction(razorpay_order_id)"))
                db.session.commit()
                print("[Migration] payment_transaction table created")

            # Add plan_id and subscription_end_date to client_entry if missing
            existing_cols = [col['name'] for col in inspector.get_columns('client_entry')]
            if 'plan_id' not in existing_cols:
                print("[Migration] Adding plan_id and subscription_end_date to client_entry...")
                db.session.execute(text("ALTER TABLE client_entry ADD COLUMN plan_id TEXT NULL"))
                db.session.execute(text("ALTER TABLE client_entry ADD COLUMN subscription_end_date TIMESTAMP NULL"))
                db.session.commit()
                print("[Migration] plan_id and subscription_end_date columns added")

            # Seed default plans if table is empty
            from models.subscription_model import SubscriptionPlan
            import uuid as _uuid
            plan_count = db.session.query(SubscriptionPlan).count()
            if plan_count == 0:
                print("[Seed] Inserting default subscription plans...")
                default_plans = [
                    SubscriptionPlan(
                        plan_id=str(_uuid.uuid4()),
                        name='Starter',
                        description='Perfect for small businesses just getting started',
                        monthly_price=99900,
                        yearly_price=999900,
                        features=['Basic invoicing', 'Customer management', 'Email support', 'Basic reports'],
                        limits={'users': 3, 'bills_per_month': 100, 'storage_gb': 5},
                        is_popular=False,
                        display_order=1,
                    ),
                    SubscriptionPlan(
                        plan_id=str(_uuid.uuid4()),
                        name='Professional',
                        description='For growing businesses with advanced needs',
                        monthly_price=249900,
                        yearly_price=2499900,
                        features=['Everything in Starter', 'GST billing', 'Inventory management', 'Priority support', 'Advanced reports', 'Multi-user access'],
                        limits={'users': 10, 'bills_per_month': 500, 'storage_gb': 25},
                        is_popular=True,
                        display_order=2,
                    ),
                    SubscriptionPlan(
                        plan_id=str(_uuid.uuid4()),
                        name='Enterprise',
                        description='For large organizations with custom requirements',
                        monthly_price=799900,
                        yearly_price=7999900,
                        features=['Everything in Professional', 'Unlimited users', 'Custom integrations', '24/7 phone support', 'Dedicated account manager', 'SLA guarantee', 'White-label options'],
                        limits={'users': -1, 'bills_per_month': -1, 'storage_gb': 100},
                        is_popular=False,
                        display_order=3,
                    ),
                ]
                for plan in default_plans:
                    db.session.add(plan)
                db.session.commit()
                print("[Seed] 3 default subscription plans created")

        except Exception as e:
            db.session.rollback()
            print(f"[Migration] Subscription migration/seed skipped: {e}")

        # Phase 1.7: Seed default permissions (inserts only missing entries)
        try:
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
                # System Settings
                ('view_settings', 'View system settings'),
                ('edit_company_settings', 'Edit company information'),
                ('edit_billing_settings', 'Edit billing configuration'),
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
                r[0] for r in db.session.query(Permission.permission_name).all()
            }
            added = 0
            for perm_name, desc in default_perms:
                if perm_name not in existing_names:
                    db.session.add(Permission(
                        permission_id=str(_uuid.uuid4()),
                        permission_name=perm_name,
                        description=desc,
                    ))
                    added += 1
            if added:
                db.session.commit()
                print(f"[Seed] {added} missing permission(s) added")
            from utils.owner_permission_sync import grant_audit_edit_to_owners
            grant_audit_edit_to_owners()
        except Exception as e:
            db.session.rollback()
            print(f"[Seed] Permission seeding skipped: {e}")

        # Phase 1.8: Auto-create Main Branch for existing clients and migrate stock to branch_inventory
        try:
            from models.branch_model import Branch
            from models.branch_inventory_model import BranchInventory
            from models.stock_model import StockEntry
            from models.client_model import ClientEntry
            import uuid as _uuid

            # Find all clients
            all_clients = db.session.query(ClientEntry.client_id).all()
            migrated_count = 0

            for (client_id_row,) in all_clients:
                client_id = str(client_id_row)

                # Skip clients that already have at least one branch (idempotent)
                existing_branch = db.session.query(Branch).filter_by(client_id=client_id).first()
                if existing_branch:
                    continue

                # Skip clients that have no stock entries (nothing to migrate)
                stock_entries = db.session.query(StockEntry).filter_by(client_id=client_id).all()
                if not stock_entries:
                    continue

                # Create a "Main Branch" for this client
                main_branch = Branch(
                    branch_id=str(_uuid.uuid4()),
                    client_id=client_id,
                    name='Main Branch',
                    location=None,
                    is_active=True
                )
                db.session.add(main_branch)
                db.session.flush()  # Ensure branch_id is available for FK references

                # Create branch_inventory rows mirroring each stock entry
                for stock in stock_entries:
                    inv = BranchInventory(
                        id=str(_uuid.uuid4()),
                        branch_id=main_branch.branch_id,
                        product_id=stock.product_id,
                        client_id=client_id,
                        quantity=stock.quantity,
                        low_stock_alert=stock.low_stock_alert
                    )
                    db.session.add(inv)

                db.session.commit()
                migrated_count += 1
                print(f'[Migration] Created Main Branch for client {client_id} with {len(stock_entries)} inventory items')

            # Only log when work was actually done — avoids noise on every startup.
            if migrated_count > 0:
                print(f'[Migration] Main Branch migration complete: {migrated_count} client(s) migrated')

        except Exception as e:
            db.session.rollback()
            print(f'[Migration] Main Branch migration skipped: {e}')


    # [OK] Use environment PORT if available (Render/Railway sets this)
    port = int(os.environ.get("PORT", 5017))
    app.run(host="0.0.0.0", port=port, debug=app.config.get('DEBUG', False))

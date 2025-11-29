import os
import sys
from flask import Flask
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

    # Initialize CORS - use CORS_ORIGINS env var or allow all
    cors_origins = os.environ.get('CORS_ORIGINS', '*')
    if cors_origins != '*':
        cors_origins = [origin.strip() for origin in cors_origins.split(',')]

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

    db_initialized = init_db_safely(app)

    # Store database status for later use
    app.config['DB_INITIALIZED'] = db_initialized

    if not db_initialized:
        logging.warning("⚠️  Database initialization failed - API will run with limited functionality")
    else:
        logging.info("✅ Database initialized successfully")

    # Register blueprints with error handling
    blueprints_registered = []
    import_errors = []

    # Import each blueprint separately to identify which one fails
    auth_bp = billing_bp = stock_bp = report_bp = audit_bp = None
    client_bp = payment_bp = customer_bp = analytics_bp = None
    permissions_bp = admin_bp = notes_bp = bulk_order_bp = expense_bp = None

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
        from routes.payment import payment_bp
    except Exception as e:
        import_errors.append(f"payment: {str(e)}")
        logging.error(f"Failed to import payment blueprint: {e}")

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
    
    if payment_bp:
        try:
            app.register_blueprint(payment_bp, url_prefix='/api/payment')
            blueprints_registered.append('payment')
        except Exception as e:
            print(f"Warning: Could not register payment blueprint: {e}")

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

    # Store blueprint registration status
    app.config['BLUEPRINTS_REGISTERED'] = blueprints_registered

    # Health check endpoint (basic uptime check)
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return {'status': 'healthy', 'message': 'RYX Billing API is running'}, 200

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

        status = {
            'status': 'running',
            'message': 'RYX Billing API is running',
            'database': {
                'initialized': db_initialized,
                'connected': db_connected,
                'type': 'PostgreSQL' if using_supabase else 'SQLite (fallback)'
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

        return status, 200

    # Handle CORS preflight requests explicitly
    @app.before_request
    def handle_preflight():
        from flask import request, make_response
        if request.method == 'OPTIONS':
            response = make_response()
            # Use CORS_ORIGINS from environment variable
            allowed_origins = os.environ.get('CORS_ORIGINS', '*')
            request_origin = request.headers.get('Origin', '')

            if allowed_origins == '*':
                response.headers['Access-Control-Allow-Origin'] = '*'
            else:
                # Check if request origin is in allowed list
                allowed_list = [o.strip() for o in allowed_origins.split(',')]
                if request_origin in allowed_list:
                    response.headers['Access-Control-Allow-Origin'] = request_origin
                else:
                    response.headers['Access-Control-Allow-Origin'] = allowed_list[0] if allowed_list else '*'

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
    
    @app.route('/', methods=['GET'])
    def root():
        return {"status": "ok", "message": "MJ Billing backend running"}, 200


    return app


# Create the app
app = create_app()

if __name__ == '__main__':
    with app.app_context():
        # Only create tables if they don't exist - skip if schema conflicts
        try:
            db.create_all()
        except Exception as e:
            print(f"⚠️  db.create_all() skipped: {e}")
            print("Database tables likely already exist - continuing...")

    # ✅ Use environment PORT if available (Render/Railway sets this)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=app.config.get('DEBUG', False))

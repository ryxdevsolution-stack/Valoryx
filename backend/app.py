import os
import sys
from flask import Flask
from flask_cors import CORS

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import Config
from extensions import db

def create_app():
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize CORS
    CORS(app,
         origins=app.config.get('CORS_ORIGINS', '*'),
         supports_credentials=True,
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         allow_headers=['Content-Type', 'Authorization'])

    # Initialize database with error handling
    from extensions import init_db_safely, test_db_connection
    db_initialized = init_db_safely(app)
    
    # Store database status for later use
    app.config['DB_INITIALIZED'] = db_initialized

    # Register blueprints with error handling
    blueprints_registered = []
    try:
        from routes.auth import auth_bp
        from routes.billing import billing_bp
        from routes.stock import stock_bp
        from routes.report import report_bp
        from routes.audit import audit_bp
        from routes.client import client_bp
        from routes.payment import payment_bp
        from routes.customer import customer_bp
        from routes.analytics import analytics_bp
    except ImportError as e:
        print(f"Warning: Could not import routes: {e}")
        auth_bp = billing_bp = stock_bp = report_bp = audit_bp = client_bp = payment_bp = customer_bp = analytics_bp = None

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
            app.register_blueprint(client_bp, url_prefix='/api/client')
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
        
        config_status = Config.get_configuration_status()
        missing_configs = Config.get_missing_configs()
        db_url_valid, db_url_message = Config.validate_db_url()
        db_url_info = Config.get_db_url_info()
        
        status = {
            'status': 'running',
            'message': 'RYX Billing API is running',
            'database': {
                'initialized': db_initialized,
                'connected': db_connected,
                'type': 'Supabase PostgreSQL' if config_status['database']['using_supabase'] else 'SQLite (fallback)',
                'url_valid': db_url_valid,
                'url_message': db_url_message,
                'url_info': db_url_info
            },
            'supabase': {
                'configured': config_status['supabase']['configured'],
                'url_set': config_status['supabase']['url_set'],
                'key_set': config_status['supabase']['key_set']
            },
            'blueprints': {
                'registered': app.config.get('BLUEPRINTS_REGISTERED', []),
                'count': len(app.config.get('BLUEPRINTS_REGISTERED', []))
            },
            'configuration': config_status,
            'missing_configs': missing_configs,
            'warnings': []
        }
        
        # Add warnings for missing configurations
        if missing_configs:
            status['warnings'].append(f"Missing environment variables: {', '.join(missing_configs)}")
        
        if not config_status['supabase']['configured']:
            status['warnings'].append("Supabase not configured - using SQLite fallback")
        
        if not db_connected:
            status['warnings'].append("Database connection failed")
        
        if not db_url_valid:
            status['warnings'].append(f"Invalid database URL: {db_url_message}")
        
        return status, 200

    # Global error handler to prevent crashes
    @app.errorhandler(Exception)
    def handle_exception(e):
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
            'blueprints_registered': len(app.config.get('BLUEPRINTS_REGISTERED', []))
        }, 200

    return app


# Create the app
app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    # ✅ Use environment PORT if available (Render/Railway sets this)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=app.config.get('DEBUG', False))

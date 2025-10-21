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

    # Register blueprints
    try:
        from backend.routes.auth import auth_bp
        from backend.routes.billing import billing_bp
        from backend.routes.stock import stock_bp
        from backend.routes.report import report_bp
        from backend.routes.audit import audit_bp
        from backend.routes.client import client_bp
        from backend.routes.payment import payment_bp
    except ImportError:
        # Fallback to relative imports if absolute imports fail
        from routes.auth import auth_bp
        from routes.billing import billing_bp
        from routes.stock import stock_bp
        from routes.report import report_bp
        from routes.audit import audit_bp
        from routes.client import client_bp
        from routes.payment import payment_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(billing_bp, url_prefix='/api/billing')
    app.register_blueprint(stock_bp, url_prefix='/api/stock')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    app.register_blueprint(audit_bp, url_prefix='/api/audit')
    app.register_blueprint(client_bp, url_prefix='/api/client')
    app.register_blueprint(payment_bp, url_prefix='/api/payment')

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
        
        status = {
            'status': 'running',
            'message': 'RYX Billing API is running',
            'database': {
                'initialized': db_initialized,
                'connected': db_connected,
                'type': 'Supabase PostgreSQL' if config_status['database']['using_supabase'] else 'SQLite (fallback)'
            },
            'supabase': {
                'configured': config_status['supabase']['configured'],
                'url_set': config_status['supabase']['url_set'],
                'key_set': config_status['supabase']['key_set']
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
        
        return status, 200

    return app


# Create the app
app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    # ✅ Use environment PORT if available (Render/Railway sets this)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=app.config.get('DEBUG', False))

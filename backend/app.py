import os
from flask import Flask
from flask_cors import CORS
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

    # Initialize database
    db.init_app(app)

    # Register blueprints
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

    # Health check
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return {'status': 'healthy', 'message': 'RYX Billing API is running'}, 200

    return app


# Create the app
app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    # ✅ Use environment PORT if available (Render/Railway sets this)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=app.config.get('DEBUG', False))

"""
Run script for RYX Billing Backend
This ensures proper Flask application context

WARNING: This script is for DEVELOPMENT ONLY!
For production, use a WSGI server like Gunicorn or Waitress:
  gunicorn -w 4 -b 0.0.0.0:5000 app:create_app()
"""
import os
import sys
from app import create_app
from extensions import db
from config import OptimizedConfig as Config

# Create the Flask app
app = create_app()

if __name__ == '__main__':
    # SECURITY CHECK: Prevent running with debug in production
    if os.getenv('FLASK_ENV') == 'production' or os.getenv('ENVIRONMENT') == 'production':
        print("=" * 60)
        print("ERROR: DO NOT RUN run.py IN PRODUCTION!")
        print("=" * 60)
        print("Use a production WSGI server instead:")
        print("  gunicorn -w 4 -b 0.0.0.0:5000 'app:create_app()'")
        print("  or")
        print("  waitress-serve --host=0.0.0.0 --port=5000 app:create_app")
        print("=" * 60)
        sys.exit(1)

    with app.app_context():
        # Create tables if they don't exist (optional, since we use migrations)
        # db.create_all()
        pass

    # Run the app (DEVELOPMENT ONLY)
    print("=" * 60)
    print("RYX Billing API Server - DEVELOPMENT MODE")
    print("=" * 60)
    print(f"Server running at: http://localhost:5000")
    print(f"API endpoints available at: http://localhost:5000/api/")
    print(f"Debug Mode: {Config.DEBUG}")
    print("=" * 60)
    print("WARNING: This is for development only!")
    print("         Use Gunicorn/Waitress for production.")
    print("=" * 60)

    # Use Config.DEBUG from environment variable
    app.run(host='0.0.0.0', port=5000, debug=Config.DEBUG)

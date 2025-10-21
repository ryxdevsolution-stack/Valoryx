import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Flask configuration from environment variables"""

    # Database
    _db_url = os.getenv('DB_URL', 'sqlite:///app.db')
    
    # Validate and clean the database URL
    if _db_url and _db_url.startswith('postgresql://'):
        # Clean up any potential formatting issues
        _db_url = _db_url.strip()
        # Ensure proper encoding for special characters
        if '@' in _db_url and '://' in _db_url:
            # Split and rejoin to ensure proper formatting
            parts = _db_url.split('://', 1)
            if len(parts) == 2:
                scheme, rest = parts
                if '@' in rest:
                    # This is a valid postgresql URL
                    SQLALCHEMY_DATABASE_URI = _db_url
                else:
                    # Fallback to SQLite if URL is malformed
                    SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'
            else:
                SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'
        else:
            # Fallback to SQLite if URL is malformed
            SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'
    else:
        # Use SQLite as fallback
        SQLALCHEMY_DATABASE_URI = _db_url
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'connect_args': {
            'connect_timeout': 10,
            'application_name': 'mj-billing-backend'
        }
    }

    # Supabase
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')

    # JWT
    JWT_SECRET = os.getenv('JWT_SECRET', 'ryx-billing-secret-key-change-in-production')
    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRATION_HOURS = 24

    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'flask-secret-key-change-in-production')
    DEBUG = os.getenv('DEBUG', 'False') == 'True'

    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')

    @classmethod
    def is_supabase_configured(cls):
        """Check if Supabase is properly configured"""
        return bool(cls.SUPABASE_URL and cls.SUPABASE_KEY)
    
    @classmethod
    def get_configuration_status(cls):
        """Get configuration status for debugging"""
        return {
            'database': {
                'url_set': bool(cls.SQLALCHEMY_DATABASE_URI),
                'using_sqlite': cls.SQLALCHEMY_DATABASE_URI.startswith('sqlite://'),
                'using_supabase': cls.SQLALCHEMY_DATABASE_URI.startswith('postgresql://')
            },
            'supabase': {
                'url_set': bool(cls.SUPABASE_URL),
                'key_set': bool(cls.SUPABASE_KEY),
                'configured': cls.is_supabase_configured()
            },
            'jwt': {
                'secret_set': bool(cls.JWT_SECRET),
                'using_default': cls.JWT_SECRET == 'ryx-billing-secret-key-change-in-production'
            },
            'flask': {
                'secret_set': bool(cls.SECRET_KEY),
                'using_default': cls.SECRET_KEY == 'flask-secret-key-change-in-production',
                'debug_mode': cls.DEBUG
            }
        }
    
    @classmethod
    def get_missing_configs(cls):
        """Get list of missing or default configurations"""
        missing = []
        
        if not cls.SUPABASE_URL:
            missing.append('SUPABASE_URL')
        if not cls.SUPABASE_KEY:
            missing.append('SUPABASE_KEY')
        if cls.JWT_SECRET == 'ryx-billing-secret-key-change-in-production':
            missing.append('JWT_SECRET (using default - change for production)')
        if cls.SECRET_KEY == 'flask-secret-key-change-in-production':
            missing.append('SECRET_KEY (using default - change for production)')
            
        return missing
    
    @classmethod
    def validate_db_url(cls):
        """Validate the database URL format"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(cls.SQLALCHEMY_DATABASE_URI)
            
            if parsed.scheme not in ['postgresql', 'sqlite']:
                return False, f"Unsupported database scheme: {parsed.scheme}"
            
            if parsed.scheme == 'postgresql':
                if not parsed.hostname or not parsed.username:
                    return False, "PostgreSQL URL missing hostname or username"
                if not parsed.password:
                    return False, "PostgreSQL URL missing password"
            
            return True, "Valid database URL"
            
        except Exception as e:
            return False, f"Invalid database URL: {str(e)}"
    
    @classmethod
    def get_db_url_info(cls):
        """Get information about the database URL (without exposing credentials)"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(cls.SQLALCHEMY_DATABASE_URI)
            
            return {
                'scheme': parsed.scheme,
                'hostname': parsed.hostname,
                'port': parsed.port,
                'database': parsed.path.lstrip('/') if parsed.path else None,
                'username': parsed.username,
                'has_password': bool(parsed.password),
                'url_length': len(cls.SQLALCHEMY_DATABASE_URI)
            }
        except Exception as e:
            return {
                'error': str(e),
                'url_length': len(cls.SQLALCHEMY_DATABASE_URI)
            }

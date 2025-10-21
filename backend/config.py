import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Flask configuration from environment variables"""

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DB_URL', 'sqlite:///app.db')
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

import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Flask configuration from environment variables"""

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DB_URL', 'sqlite:///app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

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

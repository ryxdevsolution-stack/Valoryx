import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()


class Config:
    """Flask configuration for Railway / Supabase deployment"""

    # -------------------------------
    # Database
    # -------------------------------
    # Use PostgreSQL URL from env or fallback to SQLite
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DB_URL", "sqlite:///app.db"
    )  # Expected format: postgresql+psycopg2://username:password@host:port/dbname
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {"connect_timeout": 10, "application_name": "mj-billing-backend"},
    }

    # -------------------------------
    # Supabase
    # -------------------------------
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # -------------------------------
    # JWT
    # -------------------------------
    JWT_SECRET = os.getenv("JWT_SECRET", "ryx-billing-secret-key-change-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 24

    # -------------------------------
    # Flask
    # -------------------------------
    SECRET_KEY = os.getenv("SECRET_KEY", "flask-secret-key-change-in-production")
    DEBUG = os.getenv("DEBUG", "False").lower() in ["true", "1", "yes"]

    # -------------------------------
    # CORS
    # -------------------------------
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

    # -------------------------------
    # Helper methods
    # -------------------------------
    @classmethod
    def is_supabase_configured(cls) -> bool:
        """Check if Supabase is properly configured"""
        return bool(cls.SUPABASE_URL and cls.SUPABASE_KEY)

    @classmethod
    def get_configuration_status(cls) -> dict:
        """Get current configuration for debugging"""
        return {
            "database": {
                "url_set": bool(cls.SQLALCHEMY_DATABASE_URI),
                "using_sqlite": cls.SQLALCHEMY_DATABASE_URI.startswith("sqlite://"),
                "using_postgresql": cls.SQLALCHEMY_DATABASE_URI.startswith("postgresql://")
                or cls.SQLALCHEMY_DATABASE_URI.startswith("postgresql+psycopg2://"),
            },
            "supabase": {
                "url_set": bool(cls.SUPABASE_URL),
                "key_set": bool(cls.SUPABASE_KEY),
                "configured": cls.is_supabase_configured(),
            },
            "jwt": {
                "secret_set": bool(cls.JWT_SECRET),
                "using_default": cls.JWT_SECRET
                == "ryx-billing-secret-key-change-in-production",
            },
            "flask": {
                "secret_set": bool(cls.SECRET_KEY),
                "using_default": cls.SECRET_KEY
                == "flask-secret-key-change-in-production",
                "debug_mode": cls.DEBUG,
            },
        }

    @classmethod
    def get_missing_configs(cls) -> list[str]:
        """Return list of missing or default configs"""
        missing = []
        if not cls.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not cls.SUPABASE_KEY:
            missing.append("SUPABASE_KEY")
        if cls.JWT_SECRET == "ryx-billing-secret-key-change-in-production":
            missing.append("JWT_SECRET (default)")
        if cls.SECRET_KEY == "flask-secret-key-change-in-production":
            missing.append("SECRET_KEY (default)")
        return missing

    @classmethod
    def validate_db_url(cls) -> tuple[bool, str]:
        """Validate DB URL format"""
        try:
            from urllib.parse import urlparse

            parsed = urlparse(cls.SQLALCHEMY_DATABASE_URI)
            if parsed.scheme not in ["postgresql", "postgresql+psycopg2", "sqlite"]:
                return False, f"Unsupported scheme: {parsed.scheme}"
            if parsed.scheme.startswith("postgresql"):
                if not parsed.hostname or not parsed.username:
                    return False, "PostgreSQL URL missing hostname or username"
                if not parsed.password:
                    return False, "PostgreSQL URL missing password"
            return True, "Valid database URL"
        except Exception as e:
            return False, f"Invalid database URL: {e}"

    @classmethod
    def get_db_url_info(cls) -> dict:
        """Return parsed DB URL info without exposing password"""
        try:
            from urllib.parse import urlparse

            parsed = urlparse(cls.SQLALCHEMY_DATABASE_URI)
            return {
                "scheme": parsed.scheme,
                "hostname": parsed.hostname,
                "port": parsed.port,
                "database": parsed.path.lstrip("/") if parsed.path else None,
                "username": parsed.username,
                "has_password": bool(parsed.password),
                "url_length": len(cls.SQLALCHEMY_DATABASE_URI),
            }
        except Exception as e:
            return {"error": str(e), "url_length": len(cls.SQLALCHEMY_DATABASE_URI)}

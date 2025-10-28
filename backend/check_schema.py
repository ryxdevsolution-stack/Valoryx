from flask import Flask
from extensions import db
from config import Config
from sqlalchemy import inspect, text

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)

with app.app_context():
    inspector = inspect(db.engine)

    # Check users table columns
    print("Users table columns:")
    columns = inspector.get_columns('users')
    for col in columns:
        print(f"  {col['name']}: {col['type']}")

    # Check if permissions table exists
    tables = inspector.get_table_names()
    print(f"\nExisting tables: {tables}")

    if 'permissions' in tables:
        print("\nPermissions table columns:")
        columns = inspector.get_columns('permissions')
        for col in columns:
            print(f"  {col['name']}: {col['type']}")

    # Check data type in database
    with db.engine.connect() as conn:
        result = conn.execute(text("""
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'user_id'
        """))
        row = result.fetchone()
        if row:
            print(f"\nuser_id actual database type: {row[1]} / {row[2]}")
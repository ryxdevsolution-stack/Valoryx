"""
One-time fix: clear must_change_password for invite-accepted users.

Run from the backend/ directory:
    python fix_must_change_password.py

Supports both DB_MODE=offline (SQLite) and DB_MODE=online (PostgreSQL/Supabase).
"""
import os, sys

# Load .env
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

db_mode = os.getenv('DB_MODE', 'online').strip().lower()

if db_mode == 'offline':
    import sqlite3
    db_path = os.path.expanduser('~/.mj-billing/local.db')
    print(f"[offline] SQLite: {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Show affected rows before update
    cur.execute("""
        SELECT user_id, email, role, invite_accepted, must_change_password
        FROM users
        WHERE invite_accepted = 1 AND must_change_password = 1
    """)
    rows = cur.fetchall()
    if not rows:
        print("No users need fixing.")
        conn.close()
        sys.exit(0)

    print(f"Found {len(rows)} user(s) to fix:")
    for row in rows:
        print(f"  {row[1]} ({row[2]})")

    cur.execute("""
        UPDATE users
        SET must_change_password = 0
        WHERE invite_accepted = 1 AND must_change_password = 1
    """)
    conn.commit()
    print(f"Fixed {cur.rowcount} user(s). Done.")
    conn.close()

else:
    import psycopg2
    db_url = os.getenv('DB_URL')
    print(f"[online] PostgreSQL")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("""
        SELECT user_id, email, role
        FROM users
        WHERE invite_accepted = TRUE AND must_change_password = TRUE
    """)
    rows = cur.fetchall()
    if not rows:
        print("No users need fixing.")
        conn.close()
        sys.exit(0)

    print(f"Found {len(rows)} user(s) to fix:")
    for row in rows:
        print(f"  {row[1]} ({row[2]})")

    cur.execute("""
        UPDATE users
        SET must_change_password = FALSE
        WHERE invite_accepted = TRUE AND must_change_password = TRUE
    """)
    conn.commit()
    print(f"Fixed {cur.rowcount} user(s). Done.")
    conn.close()

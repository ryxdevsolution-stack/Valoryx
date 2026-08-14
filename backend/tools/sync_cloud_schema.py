"""Bring the Supabase (Postgres) schema in line with what this codebase expects.

The problem this solves
-----------------------
Migrations here were written against SQLite and only partly translated for
Postgres. The result is a cloud database that drifts in three separate ways,
each of which surfaces as a different runtime error:

  1. missing tables / columns      -> "column X of relation Y does not exist"
  2. legacy NOT NULL columns       -> "null value in column X violates not-null"
  3. SQLite-ish column types       -> "operator does not exist: character varying = uuid"

Fixing those one migration at a time means one deploy per error. This script
does the whole reconciliation in a single pass.

How the reference schema is decided
-----------------------------------
It trusts no existing database. It builds a throwaway SQLite database, runs
db.create_all() plus the entire migration chain against it, and treats the
result as the definition of a correct install at the current
CURRENT_SCHEMA_VERSION. Postgres is then compared against that.

The SQLite reference is translated to Postgres types on the way (DATETIME ->
TIMESTAMP, and so on). Columns backed by a db.Model declaring FlexibleUUID
become native `uuid`, because the ORM binds those parameters as ::UUID and a
varchar column makes the table writable but unreadable.

What it will and will not do
----------------------------
WILL   create missing tables, add missing columns (always NULLable, since
       ALTER ADD COLUMN NOT NULL cannot succeed on a populated table),
       convert column types where the conversion is lossless, and DROP NOT NULL
       on legacy columns the application never writes.

WILL NOT drop a table, drop a column, or delete a row. Ever. Anything it cannot
       do safely is reported as MANUAL for a human to decide.

Type conversions are attempted only from this allowlist, each with an explicit
USING cast; anything else is reported rather than guessed:

       -> uuid       from varchar/text
       -> timestamp  from date
       -> boolean    from integer/smallint
       -> jsonb      from json/text
       -> numeric    from integer/bigint  (widening only)

Every statement runs in its own transaction. One failure is logged and skipped;
it never takes the rest of the run down.

Usage
-----
    python tools/sync_cloud_schema.py             # dry run - prints the plan
    python tools/sync_cloud_schema.py --apply     # execute it
    python tools/sync_cloud_schema.py --apply --verbose
"""

import importlib
import logging
import os
import pkgutil
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect, text  # noqa: E402

# Migration bookkeeping and SQLite internals - never mirrored to the cloud.
IGNORE_TABLES = {'_schema_version', 'sqlite_sequence', 'sqlite_stat1'}

# Cloud columns the application genuinely does not know about, which are
# nevertheless correct. Keeping the reason here stops the next person from
# rediscovering it.
KNOWN_BENIGN = {
    ('bill_number_counters', 'id'):
        'BillNumberCounter declares an unused autoincrement id; every real '
        'access is raw SQL keyed on client_id.',
}

# Conversions considered safe enough to run unattended: (target, source_prefix).
SAFE_CONVERSIONS = {
    'uuid': ('character varying', 'text', 'varchar'),
    'timestamp without time zone': ('date',),
    'boolean': ('integer', 'smallint'),
    'jsonb': ('json', 'text'),
    'numeric': ('integer', 'bigint'),
}

# The reference is built on SQLite, whose type system is far coarser than
# Postgres. Where the cloud is RICHER than the reference, the cloud is right and
# there is nothing to fix — SQLite simply cannot express the distinction:
#
#   uuid vs text        SQLite stores every id as TEXT. A Postgres uuid column
#                       still accepts the plain strings the raw-SQL routes bind,
#                       because an untyped literal is cast to uuid. Only the
#                       reverse (ORM binds ::UUID, column is varchar) breaks.
#   jsonb vs text       FlexibleJSON is TEXT on SQLite, json on Postgres.
#   timestamptz vs      SQLite has no timezone-aware type at all.
#     timestamp
#
# Format: expected_reference_type -> cloud types that are acceptable anyway.
CLOUD_MAY_BE_RICHER = {
    'text': ('jsonb', 'json', 'uuid', 'character varying', 'timestamp with time zone'),
    'character varying': ('uuid', 'text', 'jsonb', 'json'),
    'timestamp without time zone': ('timestamp with time zone',),
    'numeric': ('numeric', 'double precision'),
    'integer': ('bigint',),
}


def pg_type_for(sqlite_type: str, is_uuid: bool) -> str:
    """Translate a SQLite column type to its Postgres equivalent."""
    if is_uuid:
        return 'UUID'
    t = (sqlite_type or '').upper()
    if t.startswith(('VARCHAR', 'CHAR')):
        return t
    if 'JSON' in t:
        return 'JSONB'
    if 'TEXT' in t or t == 'CLOB':
        return 'TEXT'
    if t.startswith(('NUMERIC', 'DECIMAL')):
        return t
    if 'BOOLEAN' in t or t == 'BOOL':
        return 'BOOLEAN'
    if 'BIGINT' in t:
        return 'BIGINT'
    if 'INT' in t:
        return 'INTEGER'
    if 'DATETIME' in t or 'TIMESTAMP' in t:
        return 'TIMESTAMP'
    if t == 'DATE':
        return 'DATE'
    if 'FLOAT' in t or 'REAL' in t or 'DOUBLE' in t:
        return 'DOUBLE PRECISION'
    if 'BLOB' in t:
        return 'BYTEA'
    return 'TEXT'


def normalised(pg_declared: str) -> str:
    """Compare types by their information_schema spelling."""
    t = pg_declared.strip().lower()
    t = re.sub(r'\(.*\)', '', t)
    return {
        'timestamp': 'timestamp without time zone',
        'varchar': 'character varying',
        'bool': 'boolean',
        'int': 'integer',
        'int4': 'integer',
        'int8': 'bigint',
        'decimal': 'numeric',
        'double precision': 'double precision',
    }.get(t, t)


def build_reference():
    """Reference schema from a scratch SQLite build: create_all + migrations."""
    from flask import Flask
    from extensions import db

    tmp = tempfile.mktemp(suffix='.db')
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{tmp}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)

    import models
    for mod in pkgutil.iter_modules(models.__path__):
        importlib.import_module(f'models.{mod.name}')

    with app.app_context():
        db.create_all()

    from migrations.runner import run_migrations_if_needed, CURRENT_SCHEMA_VERSION
    run_migrations_if_needed(app, db)

    tables, uuid_cols, pks = {}, {}, {}
    with app.app_context():
        from database.flexible_types import FlexibleUUID
        for mapper in db.Model.registry.mappers:
            name = mapper.persist_selectable.name
            cols = {c.name for c in mapper.persist_selectable.columns
                    if isinstance(c.type, FlexibleUUID)}
            if cols:
                uuid_cols.setdefault(name, set()).update(cols)

        insp = inspect(db.engine)
        for table in insp.get_table_names():
            if table in IGNORE_TABLES:
                continue
            tcols = {}
            for col in insp.get_columns(table):
                is_uuid = col['name'] in uuid_cols.get(table, set())
                tcols[col['name']] = pg_type_for(str(col['type']), is_uuid)
            tables[table] = tcols
            try:
                pks[table] = list(insp.get_pk_constraint(table).get('constrained_columns') or [])
            except Exception:
                pks[table] = []

        version = db.session.execute(
            text('SELECT MAX(version) FROM _schema_version')).scalar()

    try:
        os.unlink(tmp)
    except OSError:
        pass

    return tables, pks, version, CURRENT_SCHEMA_VERSION


def load_cloud(engine):
    """{table: {column: (data_type, is_nullable, has_default)}}."""
    schema = {}
    with engine.connect() as conn:
        for table, column, dtype, nullable, default in conn.execute(text("""
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        """)).fetchall():
            if table in IGNORE_TABLES:
                continue
            schema.setdefault(table, {})[column] = (
                dtype, nullable == 'YES', default is not None)
    return schema


def plan(reference, pks, cloud):
    """Build the ordered list of (kind, description, sql) actions."""
    actions, manual = [], []

    for table, ref_cols in sorted(reference.items()):
        if table not in cloud:
            cols_sql = ',\n    '.join(
                f'{c} {t}' + (' PRIMARY KEY' if pks.get(table) == [c] else '')
                for c, t in ref_cols.items())
            actions.append((
                'CREATE TABLE', table,
                f'CREATE TABLE IF NOT EXISTS {table} (\n    {cols_sql}\n)'))
            continue

        cloud_cols = cloud[table]

        # 1. Missing columns - always nullable; a populated table rejects NOT NULL.
        for col, coltype in ref_cols.items():
            if col not in cloud_cols and (table, col) not in KNOWN_BENIGN:
                actions.append((
                    'ADD COLUMN', f'{table}.{col} {coltype}',
                    f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {coltype} NULL'))

        # 2. Type mismatches.
        for col, coltype in ref_cols.items():
            if col not in cloud_cols:
                continue
            current = cloud_cols[col][0]
            target = normalised(coltype)
            if current == target:
                continue
            # The cloud being richer than SQLite's coarse type system is correct,
            # not drift — see CLOUD_MAY_BE_RICHER.
            if current in CLOUD_MAY_BE_RICHER.get(target, ()):
                continue
            allowed = SAFE_CONVERSIONS.get(target, ())
            if any(current.startswith(a) for a in allowed):
                cast = 'uuid' if target == 'uuid' else (
                    'timestamp' if target.startswith('timestamp') else
                    'boolean' if target == 'boolean' else
                    'jsonb' if target == 'jsonb' else 'numeric')
                using = f'{col}::{cast}'
                if target == 'boolean' and current in ('integer', 'smallint'):
                    using = f'{col}::int::boolean'
                actions.append((
                    'ALTER TYPE', f'{table}.{col} {current} -> {target}',
                    f'ALTER TABLE {table} ALTER COLUMN {col} TYPE {cast} USING {using}'))
            else:
                manual.append(f'{table}.{col}: cloud is {current}, expected {target}')

        # 3. Legacy NOT NULL columns the app never writes - relax, never drop.
        for col, (_dtype, nullable, has_default) in cloud_cols.items():
            if col in ref_cols or nullable or has_default:
                continue
            if (table, col) in KNOWN_BENIGN:
                continue
            actions.append((
                'DROP NOT NULL', f'{table}.{col} (legacy, app never writes it)',
                f'ALTER TABLE {table} ALTER COLUMN {col} DROP NOT NULL'))

    return actions, manual


def main():
    logging.basicConfig(level=logging.ERROR)
    apply_changes = '--apply' in sys.argv
    verbose = '--verbose' in sys.argv

    from dotenv import load_dotenv
    for candidate in ('.env', 'env.local'):
        if os.path.exists(candidate):
            load_dotenv(candidate, override=False)

    url = os.getenv('DB_URL')
    if not url:
        print('DB_URL is not set - nothing to sync against.')
        return 1

    print('Building reference schema from models + migrations...')
    reference, pks, applied, target = build_reference()
    print(f'  reference: {len(reference)} tables at schema v{applied} '
          f'(CURRENT_SCHEMA_VERSION = {target})')

    engine = create_engine(url)
    print('Reading cloud schema...')
    cloud = load_cloud(engine)
    print(f'  cloud: {len(cloud)} tables\n')

    actions, manual = plan(reference, pks, cloud)

    if not actions:
        print('Cloud schema already matches. Nothing to do.')
    else:
        print(f'{len(actions)} change(s) planned:\n')
        for kind, desc, sql in actions:
            print(f'  [{kind:<14}] {desc}')
            if verbose:
                print(f'                   {sql}')

    if manual:
        print(f'\n{len(manual)} difference(s) need a human decision '
              f'(no safe automatic conversion):')
        for m in manual:
            print(f'  - {m}')

    if not apply_changes:
        print('\nDRY RUN - nothing was changed.')
        print('Re-run with --apply to execute.')
        return 0

    if not actions:
        return 0

    print('\nApplying...')
    ok = failed = 0
    for kind, desc, sql in actions:
        # Each statement gets its own transaction so one failure cannot roll
        # back the work that already succeeded.
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
            print(f'  OK      [{kind}] {desc}')
            ok += 1
        except Exception as e:
            first_line = str(e).split('\n')[0]
            print(f'  FAILED  [{kind}] {desc}\n            {first_line}')
            failed += 1

    print(f'\nDone: {ok} applied, {failed} failed.')
    if failed:
        print('Re-run to retry the failures; every statement is idempotent.')
    print('Verify with: python tools/schema_audit.py')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())

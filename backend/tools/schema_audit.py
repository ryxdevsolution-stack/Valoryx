"""Read-only audit: cloud (Postgres) schema vs what this codebase expects.

Why this exists
---------------
Migrations in this repo create tables inside `if 'x' not in tables:` guards.
Any column added to such a CREATE block afterwards never reaches a database
where the table already existed, and unless somebody also wrote an ALTER
migration, that database stays permanently wrong. It has bitten three times:

  * v43 — supplier_deliveries missing `confirmed_by`
  * v46 — bill_payments missing `client_id`
  * v47 — bill_payments carrying a legacy NOT NULL `bill_type` the app never sets

This script finds the rest of that class *before* a customer does.

How it works
------------
It does NOT trust any single database. It builds a throwaway SQLite database,
runs `db.create_all()` plus the full migration chain against it, and treats the
result as the reference schema — i.e. exactly what a correct install looks like
at the current CURRENT_SCHEMA_VERSION. It then diffs the live cloud against it.

That reference covers raw-SQL tables (employees, salary_cycles, work_groups …)
as well as model-backed ones, which a models-only audit would miss.

Three findings are reported:

  MISSING TABLE    cloud has no such table — every query against it fails
  MISSING COLUMN   cloud table is short a column the app reads or writes
  INSERT BLOCKER   cloud column is NOT NULL with no default and is unknown to
                   the reference schema, so the app never supplies it and every
                   INSERT fails (the bill_payments `bill_type` case)

Read-only: it issues nothing but SELECTs against the cloud. Nothing is altered.

Usage
-----
    python tools/schema_audit.py            # human-readable report
    python tools/schema_audit.py --sql      # also emit repair SQL to review
"""

import importlib
import logging
import os
import pkgutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect, text  # noqa: E402

# Tables that are deliberately local-only or cloud-only; a difference here is
# not a defect. `_schema_version` is the migration bookkeeping table, and
# sqlite_* are SQLite internals.
IGNORE_TABLES = {'_schema_version', 'sqlite_sequence', 'sqlite_stat1'}

# Differences that are real but harmless, with the reason. Keeping them here
# rather than silently filtering means the next person can re-check the
# reasoning instead of rediscovering it. Format: (table, column): why.
KNOWN_BENIGN = {
    ('bill_number_counters', 'id'):
        "BillNumberCounter declares an autoincrement `id`, but nothing queries "
        "the model — every real access is raw SQL in utils/bill_number_helper.py "
        "keyed on client_id, and _OWNER_SYNC_TABLES syncs it with pk='client_id'. "
        "The cloud table using client_id as its PK is correct; the unused `id` on "
        "the model is the odd one out.",
}


def build_reference_schema():
    """Run create_all + every migration against a scratch SQLite DB.

    Returns {table_name: {column_name, …}} for a known-correct install.
    """
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

    schema = {}
    # Columns that MUST be a native uuid on Postgres: a db.Model backs them and
    # declares FlexibleUUID, so the ORM binds every value as ::UUID. A cloud
    # column left as varchar makes the table writable but unreadable.
    uuid_expected = {}
    with app.app_context():
        insp = inspect(db.engine)
        for table in insp.get_table_names():
            if table in IGNORE_TABLES:
                continue
            schema[table] = {c['name'] for c in insp.get_columns(table)}

        from database.flexible_types import FlexibleUUID
        for mapper in db.Model.registry.mappers:
            table = mapper.persist_selectable.name
            cols = {c.name for c in mapper.persist_selectable.columns
                    if isinstance(c.type, FlexibleUUID)}
            if cols:
                uuid_expected.setdefault(table, set()).update(cols)

        version = db.session.execute(
            text('SELECT MAX(version) FROM _schema_version')).scalar()

    # Best-effort cleanup; Windows keeps the file handle briefly.
    try:
        os.unlink(tmp)
    except OSError:
        pass

    return schema, uuid_expected, version, CURRENT_SCHEMA_VERSION


def load_cloud_schema(url):
    """{table: {column: (is_nullable, has_default)}} for the public schema."""
    engine = create_engine(url)
    schema = {}
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT table_name, column_name, is_nullable, column_default, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        """)).fetchall()
    for table, column, nullable, default, dtype in rows:
        if table in IGNORE_TABLES:
            continue
        schema.setdefault(table, {})[column] = (nullable == 'YES', default is not None, dtype)
    return schema


def audit(reference, cloud, uuid_expected):
    missing_tables, missing_columns, blockers, benign, wrong_type = [], [], [], [], []

    for table, ref_cols in sorted(reference.items()):
        if table not in cloud:
            missing_tables.append(table)
            continue

        cloud_cols = cloud[table]

        absent = set()
        for col in ref_cols - set(cloud_cols):
            if (table, col) in KNOWN_BENIGN:
                benign.append((table, col))
            else:
                absent.add(col)
        if absent:
            missing_columns.append((table, sorted(absent)))

        # A NOT NULL column with no default that the reference schema doesn't
        # know about can never be populated by the application.
        for col, (nullable, has_default, _dtype) in cloud_cols.items():
            if col in ref_cols or nullable or has_default:
                continue
            if (table, col) in KNOWN_BENIGN:
                benign.append((table, col))
            else:
                blockers.append((table, col))

    # Native-uuid check: ORM-backed FlexibleUUID columns typed as varchar in
    # the cloud accept writes but fail every read.
    for table, cols in sorted(uuid_expected.items()):
        if table not in cloud:
            continue
        for col in sorted(cols):
            entry = cloud[table].get(col)
            if entry and entry[2] != 'uuid':
                wrong_type.append((table, col, entry[2]))

    return missing_tables, missing_columns, blockers, benign, wrong_type


def repair_sql(missing_columns, blockers, wrong_type=()):
    """Suggested, idempotent repair statements — for review, never auto-run."""
    lines = []
    if missing_columns:
        lines.append('-- Missing columns. Types are NOT inferred; set them to match the model.')
        for table, cols in missing_columns:
            for col in cols:
                lines.append(
                    f'-- ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} <TYPE> NULL;')
    if blockers:
        lines.append('')
        lines.append('-- Insert blockers: legacy NOT NULL columns the app never writes.')
        for table, col in blockers:
            lines.append(f'ALTER TABLE {table} ALTER COLUMN {col} DROP NOT NULL;')
    return '\n'.join(lines)


def main():
    logging.basicConfig(level=logging.ERROR)

    from dotenv import load_dotenv
    for candidate in ('.env', 'env.local'):
        if os.path.exists(candidate):
            load_dotenv(candidate, override=False)

    url = os.getenv('DB_URL')
    if not url:
        print('DB_URL not set — nothing to audit against.')
        return 1

    print('Building reference schema from migrations…')
    reference, uuid_expected, applied, target = build_reference_schema()
    print(f'  reference: {len(reference)} tables at schema v{applied} '
          f'(CURRENT_SCHEMA_VERSION = {target})')

    print('Reading cloud schema…')
    cloud = load_cloud_schema(url)
    print(f'  cloud: {len(cloud)} tables\n')

    missing_tables, missing_columns, blockers, benign, wrong_type = audit(reference, cloud, uuid_expected)

    print('=' * 68)
    print('MISSING TABLES — every query against these fails')
    print('=' * 68)
    print('\n'.join(f'  {t}' for t in missing_tables) if missing_tables else '  none')

    print()
    print('=' * 68)
    print('MISSING COLUMNS — the v43 / v46 class of bug')
    print('=' * 68)
    if missing_columns:
        for table, cols in missing_columns:
            print(f'  {table}: {", ".join(cols)}')
    else:
        print('  none')

    print()
    print('=' * 68)
    print('INSERT BLOCKERS — NOT NULL, no default, unknown to the app (v47 class)')
    print('=' * 68)
    if blockers:
        for table, col in blockers:
            print(f'  {table}.{col}')
    else:
        print('  none')

    print()
    print('=' * 68)
    print('WRONG TYPE — ORM uuid column stored as varchar (writable, unreadable)')
    print('=' * 68)
    if wrong_type:
        for table, col, dtype in wrong_type:
            print(f'  {table}.{col}  is {dtype}, must be uuid')
    else:
        print('  none')

    if benign:
        print()
        print('=' * 68)
        print('KNOWN BENIGN — real differences, deliberately not defects')
        print('=' * 68)
        for table, col in benign:
            print(f'  {table}.{col}')
            print(f'      {KNOWN_BENIGN[(table, col)]}')

    total = len(missing_tables) + len(missing_columns) + len(blockers) + len(wrong_type)
    print()
    print(f'{total} issue group(s) found'
          + (f', {len(benign)} known-benign difference(s) ignored.' if benign else '.'))

    if '--sql' in sys.argv and (missing_columns or blockers or wrong_type):
        print('\n' + '=' * 68)
        print('SUGGESTED REPAIR SQL — review before running anything')
        print('=' * 68)
        print(repair_sql(missing_columns, blockers, wrong_type))

    return 0


if __name__ == '__main__':
    sys.exit(main())

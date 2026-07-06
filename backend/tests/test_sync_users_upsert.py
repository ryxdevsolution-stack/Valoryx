"""
Regression tests for the users upload SQL in SyncService._sync_users.

Background: profile edits, password changes, role changes etc. re-queue the
users row for upload by setting `synced_at = NULL`. But re-queuing only helps if
the uploader's `INSERT ... ON CONFLICT (user_id) DO UPDATE SET ...` actually
writes the changed column on the conflict (update) path — every already-synced
user hits that path. `password_hash` was in the INSERT VALUES but MISSING from
the DO UPDATE SET, so a changed password never reached the cloud and the old
password stayed valid on the live server. These tests lock that shut.

Pure unit tests — no database. We capture the SQL that _sync_users hands to
_upload_pending and assert on its structure.
"""
import re
import services.sync_service as ss


def _capture_users_insert_sql():
    """Run _sync_users with _upload_pending stubbed out, returning the insert_sql
    string it would have executed."""
    svc = ss.SyncService()
    captured = {}

    def fake_upload_pending(table, id_column, column_types, insert_sql, **kwargs):
        captured['table'] = table
        captured['sql'] = insert_sql
        return 0

    svc._upload_pending = fake_upload_pending
    svc._sync_users(client_id='test-client')
    assert captured.get('table') == 'users'
    return captured['sql']


def _split_insert_and_update(sql):
    """Return (insert_columns, update_set_clause) from an
    INSERT INTO users (...) VALUES (...) ON CONFLICT ... DO UPDATE SET ... string."""
    insert_cols_raw = re.search(r'INSERT\s+INTO\s+users\s*\((.*?)\)\s*VALUES',
                                sql, re.IGNORECASE | re.DOTALL).group(1)
    insert_cols = {c.strip() for c in insert_cols_raw.split(',') if c.strip()}
    update_clause = re.search(r'DO\s+UPDATE\s+SET\s+(.*)$',
                              sql, re.IGNORECASE | re.DOTALL).group(1)
    return insert_cols, update_clause


def test_password_hash_is_updated_on_conflict():
    """The exact regression: an existing (already-synced) user's password change
    must be written on the ON CONFLICT update path, not silently dropped."""
    sql = _capture_users_insert_sql()
    _, update_clause = _split_insert_and_update(sql)
    assert re.search(r'password_hash\s*=\s*EXCLUDED\.password_hash', update_clause), (
        "password_hash missing from ON CONFLICT DO UPDATE SET — a local password "
        "change would never propagate to the cloud / live server."
    )


def test_every_mutable_insert_column_is_also_updated_on_conflict():
    """General guard: any column we bother to INSERT (other than the immutable
    identity/creation columns) must also be refreshed on the update path, or an
    edit to only that column silently fails to sync. This is the class of bug
    that hid the password_hash omission."""
    sql = _capture_users_insert_sql()
    insert_cols, update_clause = _split_insert_and_update(sql)

    # Columns that are legitimately write-once (never updated on conflict).
    immutable = {'user_id', 'client_id', 'created_at', 'created_by'}
    mutable = insert_cols - immutable

    missing = [c for c in sorted(mutable)
               if not re.search(rf'\b{re.escape(c)}\s*=', update_clause)]
    assert not missing, (
        f"columns present in INSERT but not refreshed in ON CONFLICT DO UPDATE SET: "
        f"{missing} — edits to these fields will not reach the cloud."
    )

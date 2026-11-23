"""Salary advances / deductions — add and delete.

Bugs guarded here:
- The Add Deduction form called the cycle "optional" but the API required it, so
  saving without picking one always failed. The API now picks the open cycle that
  covers the advance date (else the latest open one) and says clearly when none exists.
- Deleting hard-DELETEd the row; on desktop the cloud still had it and the next sync
  download brought it back. Deletion is now a soft delete that every total ignores.
"""
import json
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from conftest import make_token, auth_hdr

TODAY = date.today()
PERMS = ['view_employees', 'record_advance', 'view_salary', 'manage_salary_cycles']


@pytest.fixture
def payroll(app, sample_client, sample_user):
    """Real migrated payroll schema + one employee (daily ₹1000)."""
    from extensions import db
    import migrations.runner as runner
    with app.app_context():
        for version, fn in runner.MIGRATIONS:
            if version < 14:
                continue
            try:
                fn(db)
            except Exception:
                db.session.rollback()
        emp_id = str(uuid.uuid4())
        db.session.execute(text(
            "INSERT INTO employees (employee_id, client_id, name, pay_type, rate, is_active, created_by)"
            " VALUES (:e, :c, 'Ravi', 'daily', 1000, TRUE, :u)"),
            {'e': emp_id, 'c': str(sample_client.client_id), 'u': str(sample_user.user_id)})
        db.session.commit()
        yield {'emp': emp_id, 'cid': str(sample_client.client_id), 'db': db,
               'hdr': auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=PERMS))}


def _cycle(p, start, end, status='open'):
    cy = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO salary_cycles (cycle_id, employee_id, client_id, start_date, end_date, status,"
        " created_at, updated_at) VALUES (:cy, :e, :c, :s, :en, :st, :now, :now)"),
        {'cy': cy, 'e': p['emp'], 'c': p['cid'], 's': str(start), 'en': str(end), 'st': status,
         'now': str(TODAY)})
    p['db'].session.commit()
    return cy


def _add(http, p, **body):
    return http.post(f"/api/employees/{p['emp']}/advances", data=json.dumps(body),
                     content_type='application/json', headers=p['hdr'])


def _total_advances(p, cycle_id):
    return float(p['db'].session.execute(text(
        "SELECT total_advances FROM salary_cycles WHERE cycle_id = :c"), {'c': cycle_id}).scalar() or 0)


def test_add_without_cycle_picks_the_cycle_covering_the_date(http, payroll):
    old = _cycle(payroll, TODAY - timedelta(days=60), TODAY - timedelta(days=31))
    current = _cycle(payroll, TODAY - timedelta(days=30), TODAY + timedelta(days=1))
    r = _add(http, payroll, amount=500, category='cash_advance', advance_date=str(TODAY))
    assert r.status_code == 201, r.get_json()
    assert r.get_json()['data']['cycle_id'] == current
    assert _total_advances(payroll, current) == 500 and _total_advances(payroll, old) == 0


def test_add_without_cycle_falls_back_to_latest_open_cycle(http, payroll):
    latest = _cycle(payroll, TODAY - timedelta(days=10), TODAY - timedelta(days=5))
    r = _add(http, payroll, amount=200, advance_date=str(TODAY))  # date outside every cycle
    assert r.status_code == 201, r.get_json()
    assert r.get_json()['data']['cycle_id'] == latest


def test_add_with_no_open_cycle_explains_why(http, payroll):
    _cycle(payroll, TODAY - timedelta(days=30), TODAY, status='paid')
    r = _add(http, payroll, amount=200)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'NO_OPEN_CYCLE'


def test_delete_is_soft_and_totals_ignore_it(http, payroll):
    cy = _cycle(payroll, TODAY - timedelta(days=30), TODAY + timedelta(days=1))
    a1 = _add(http, payroll, amount=500, cycle_id=cy).get_json()['data']['advance_id']
    _add(http, payroll, amount=300, cycle_id=cy)
    assert _total_advances(payroll, cy) == 800

    r = http.delete(f"/api/employees/advances/{a1}", headers=payroll['hdr'])
    assert r.status_code == 200, r.get_json()
    assert _total_advances(payroll, cy) == 300

    row = payroll['db'].session.execute(text(
        "SELECT deleted_at, synced_at FROM salary_advances WHERE advance_id = :a"), {'a': a1}).fetchone()
    assert row is not None, 'row must stay (soft delete) so the deletion syncs'
    assert row[0] is not None and row[1] is None

    cycle = http.get(f"/api/employees/{payroll['emp']}/cycles/{cy}", headers=payroll['hdr']).get_json()['data']
    assert [a['amount'] for a in cycle['advances']] == [300]

    again = http.delete(f"/api/employees/advances/{a1}", headers=payroll['hdr'])
    assert again.status_code == 404


def test_delete_refused_on_paid_cycle(http, payroll):
    cy = _cycle(payroll, TODAY - timedelta(days=30), TODAY + timedelta(days=1))
    a = _add(http, payroll, amount=500, cycle_id=cy).get_json()['data']['advance_id']
    payroll['db'].session.execute(text("UPDATE salary_cycles SET status='paid' WHERE cycle_id=:c"), {'c': cy})
    payroll['db'].session.commit()
    assert http.delete(f"/api/employees/advances/{a}", headers=payroll['hdr']).status_code == 409


def test_cycle_list_carries_each_cycles_live_deductions(http, payroll):
    """The panel's delete button renders from the LIST response — it must include advances."""
    old = _cycle(payroll, TODAY - timedelta(days=60), TODAY - timedelta(days=31))
    cur = _cycle(payroll, TODAY - timedelta(days=30), TODAY + timedelta(days=1))
    _add(http, payroll, amount=100, cycle_id=old)
    keep = _add(http, payroll, amount=500, cycle_id=cur).get_json()['data']['advance_id']
    gone = _add(http, payroll, amount=300, cycle_id=cur).get_json()['data']['advance_id']
    http.delete(f"/api/employees/advances/{gone}", headers=payroll['hdr'])

    rows = http.get(f"/api/employees/{payroll['emp']}/cycles", headers=payroll['hdr']).get_json()['data']
    by_id = {c['cycle_id']: c for c in rows}
    assert [a['advance_id'] for a in by_id[cur]['advances']] == [keep]
    assert [float(a['amount']) for a in by_id[old]['advances']] == [100]

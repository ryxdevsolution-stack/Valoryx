"""Carry-forward of advances larger than the salary, and ex-employees.

- Closing a cycle whose advances exceed its pay used to write the difference off.
  It now becomes the first deduction ('carry_forward') of the next cycle, which is
  created when it doesn't exist, and is never counted again as cash paid out.
- Removing an employee keeps every record; they drop out of pickers and show
  under status=left with the date they left, and can rejoin.
"""
import json
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from conftest import make_token, auth_hdr

PERMS = ['view_employees', 'view_salary', 'manage_salary_cycles', 'record_advance', 'mark_salary_paid',
         'delete_employee', 'edit_employee', 'add_employee']
MONTH_START = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)   # last month
MONTH_END = date.today().replace(day=1) - timedelta(days=1)


@pytest.fixture
def p(app, sample_client, sample_user):
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
        try:
            db.session.execute(text("UPDATE client_entry SET weekly_off_enabled = FALSE"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        eid = str(uuid.uuid4())
        db.session.execute(text(
            "INSERT INTO employees (employee_id, client_id, name, pay_type, rate, is_active, created_by)"
            " VALUES (:e, :c, 'Ravi', 'daily', 1000, TRUE, :u)"),
            {'e': eid, 'c': str(sample_client.client_id), 'u': str(sample_user.user_id)})
        db.session.commit()
        yield {'db': db, 'cid': str(sample_client.client_id), 'uid': str(sample_user.user_id), 'emp': eid,
               'hdr': auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=PERMS))}


def _cycle(p, start, end):
    cy = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO salary_cycles (cycle_id, employee_id, client_id, start_date, end_date, status,"
        " rate_snapshot, pay_type_snap, full_day_mins, created_at, updated_at)"
        " VALUES (:cy, :e, :c, :s, :en, 'open', 1000, 'daily', 480, :now, :now)"),
        {'cy': cy, 'e': p['emp'], 'c': p['cid'], 's': str(start), 'en': str(end), 'now': str(date.today())})
    p['db'].session.commit()
    return cy


def _work(p, day, minutes=480):
    p['db'].session.execute(text(
        "INSERT INTO employee_attendance (attendance_id, employee_id, client_id, work_date, check_in, total_minutes,"
        " status, auto_ot_minutes, marked_by, is_active, created_at, updated_at)"
        " VALUES (:a, :e, :c, :wd, :ci, :tm, 'present', 0, :u, TRUE, :now, :now)"),
        {'a': str(uuid.uuid4()), 'e': p['emp'], 'c': p['cid'], 'wd': str(day), 'ci': f'{day} 09:00:00',
         'tm': minutes, 'u': p['uid'], 'now': str(date.today())})
    p['db'].session.commit()


def _advance(http, p, cy, amount):
    r = http.post(f"/api/employees/{p['emp']}/advances", headers=p['hdr'], content_type='application/json',
                  data=json.dumps({'amount': amount, 'cycle_id': cy, 'advance_date': str(MONTH_START)}))
    assert r.status_code == 201, r.get_json()


def _pay(http, p, cy):
    r = http.post(f"/api/employees/{p['emp']}/cycles/{cy}/mark-paid", headers=p['hdr'],
                  content_type='application/json', data='{}')
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _cycle_row(p, cy):
    return dict(p['db'].session.execute(text("SELECT * FROM salary_cycles WHERE cycle_id = :c"),
                                        {'c': cy}).fetchone()._mapping)


def test_excess_advance_moves_into_existing_next_cycle(http, p):
    cur = _cycle(p, MONTH_START, MONTH_END)
    nxt = _cycle(p, MONTH_END + timedelta(days=1), MONTH_END + timedelta(days=30))
    _work(p, MONTH_START)                   # earned 1000
    _advance(http, p, cur, 3000)            # took 3000 → owes 2000
    res = _pay(http, p, cur)
    assert res['carry_forward']['amount'] == 2000 and res['carry_forward']['cycle_id'] == nxt
    assert res['carry_forward']['created'] is False
    assert float(_cycle_row(p, nxt)['total_advances']) == 2000
    nxt_view = http.get(f"/api/employees/{p['emp']}/cycles/{nxt}", headers=p['hdr']).get_json()['data']
    carried = [a for a in nxt_view['advances'] if a['category'] == 'carry_forward']
    assert len(carried) == 1 and carried[0]['carried_from_cycle_id'] == cur


def test_excess_advance_creates_next_month_when_missing(http, p):
    cur = _cycle(p, MONTH_START, MONTH_END)
    _advance(http, p, cur, 500)             # earned 0 → owes 500
    res = _pay(http, p, cur)
    cf = res['carry_forward']
    first_of_this_month = MONTH_END + timedelta(days=1)
    nxt_month = (first_of_this_month.replace(day=28) + timedelta(days=4)).replace(day=1)
    assert cf['created'] is True
    assert cf['start_date'] == str(first_of_this_month)
    assert cf['end_date'] == str(nxt_month - timedelta(days=1))   # whole next month
    assert float(_cycle_row(p, cf['cycle_id'])['net_salary']) == -500


def test_no_carry_when_salary_covers_advances(http, p):
    cur = _cycle(p, MONTH_START, MONTH_END)
    _work(p, MONTH_START)
    _advance(http, p, cur, 400)
    assert _pay(http, p, cur)['carry_forward'] is None


def test_carried_balance_is_not_counted_as_cash_again(http, p):
    cur = _cycle(p, MONTH_START, MONTH_END)
    _advance(http, p, cur, 3000)
    _pay(http, p, cur)
    frm, to = MONTH_START, date.today() + timedelta(days=40)
    s = http.get(f"/api/employees/summary?from={frm}&to={to}", headers=p['hdr']).get_json()['data']
    assert s['advances_paid_in_period'] == 3000        # only the real cash, not +3000 carried


def test_paid_cycle_payslip_shows_zero_payable_after_carry(app, http, p):
    cur = _cycle(p, MONTH_START, MONTH_END)
    _work(p, MONTH_START)
    _advance(http, p, cur, 3000)
    _pay(http, p, cur)
    from routes.employees import _build_payslip_pdf, _get_employee_any, _get_cycle
    _pdf, _name, summary = _build_payslip_pdf(_get_employee_any(p['emp'], p['cid']),
                                               _get_cycle(cur, p['emp'], p['cid']), None)
    assert summary['net'] == 0


def test_cannot_type_in_a_carry_forward_deduction(http, p):
    cur = _cycle(p, MONTH_START, MONTH_END)
    r = http.post(f"/api/employees/{p['emp']}/advances", headers=p['hdr'], content_type='application/json',
                  data=json.dumps({'amount': 100, 'cycle_id': cur, 'category': 'carry_forward'}))
    assert r.status_code == 400


# ── Ex-employees ─────────────────────────────────────────────────────────────

def _list(http, p, status=None):
    q = f'?status={status}' if status else ''
    return [e['employee_id'] for e in http.get(f'/api/employees{q}', headers=p['hdr']).get_json()['data']]


def test_leaving_keeps_records_and_hides_from_pickers(http, p):
    r = http.delete(f"/api/employees/{p['emp']}", headers=p['hdr'], content_type='application/json',
                    data=json.dumps({'left_on': str(date.today() - timedelta(days=3))}))
    assert r.status_code == 200, r.get_json()
    assert p['emp'] not in _list(http, p)
    left = http.get('/api/employees?status=left', headers=p['hdr']).get_json()['data']
    assert [e['employee_id'] for e in left] == [p['emp']]
    assert str(left[0]['left_on'])[:10] == str(date.today() - timedelta(days=3))
    assert p['emp'] in _list(http, p, 'all')


def test_leaving_with_unpaid_salary_needs_confirmation(http, p):
    _cycle(p, MONTH_START, MONTH_END)
    _work(p, MONTH_START)                            # 1000 owed, unpaid
    r = http.delete(f"/api/employees/{p['emp']}", headers=p['hdr'])
    assert r.status_code == 409 and r.get_json()['code'] == 'OPEN_CYCLE' and r.get_json()['owed'] == 1000
    r = http.delete(f"/api/employees/{p['emp']}", headers=p['hdr'], content_type='application/json',
                    data=json.dumps({'force': True}))
    assert r.status_code == 200


def test_future_leaving_date_refused(http, p):
    r = http.delete(f"/api/employees/{p['emp']}", headers=p['hdr'], content_type='application/json',
                    data=json.dumps({'left_on': str(date.today() + timedelta(days=1))}))
    assert r.status_code == 400


def test_rejoin_brings_employee_back(http, p):
    http.delete(f"/api/employees/{p['emp']}", headers=p['hdr'])
    r = http.post(f"/api/employees/{p['emp']}/rejoin", headers=p['hdr'])
    assert r.status_code == 200 and r.get_json()['data']['left_on'] is None
    assert p['emp'] in _list(http, p)
    assert http.post(f"/api/employees/{p['emp']}/rejoin", headers=p['hdr']).status_code == 409

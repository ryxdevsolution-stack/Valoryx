"""Salary maths end to end — earnings, OT, leave, advances, paid-cycle lock, payslip.

Every expected figure below is worked by hand in the comment beside it, so a
failure says which rule broke rather than just "numbers differ".
"""
import json
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from conftest import make_token, auth_hdr

START = date.today().replace(day=1) - timedelta(days=40)   # a closed-off past period
START = START.replace(day=1)
END = START + timedelta(days=27)
PERMS = ['view_employees', 'view_salary', 'manage_salary_cycles', 'record_advance',
         'mark_salary_paid', 'mark_attendance', 'view_attendance', 'edit_employee']


@pytest.fixture
def pay(app, sample_client, sample_user):
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
        # No weekly-off rule interfering with the hand-worked totals.
        try:
            db.session.execute(text("UPDATE client_entry SET weekly_off_enabled = FALSE"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        yield {'db': db, 'cid': str(sample_client.client_id), 'uid': str(sample_user.user_id),
               'hdr': auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=PERMS))}


def _employee(p, pay_type, rate, ot_mult=1.5):
    eid = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO employees (employee_id, client_id, name, pay_type, rate, ot_multiplier, is_active, created_by)"
        " VALUES (:e, :c, 'Ravi', :pt, :r, :m, TRUE, :u)"),
        {'e': eid, 'c': p['cid'], 'pt': pay_type, 'r': rate, 'm': ot_mult, 'u': p['uid']})
    cy = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO salary_cycles (cycle_id, employee_id, client_id, start_date, end_date, status,"
        " rate_snapshot, pay_type_snap, full_day_mins, created_at, updated_at)"
        " VALUES (:cy, :e, :c, :s, :en, 'open', :r, :pt, 480, :now, :now)"),
        {'cy': cy, 'e': eid, 'c': p['cid'], 's': str(START), 'en': str(END), 'r': rate, 'pt': pay_type,
         'now': str(date.today())})
    p['db'].session.commit()
    return eid, cy


def _day(p, eid, offset, minutes=None, status='present', approved_ot=None, auto_ot=None):
    aid = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO employee_attendance (attendance_id, employee_id, client_id, work_date, check_in, total_minutes,"
        " status, approved_ot_minutes, auto_ot_minutes, marked_by, is_active, created_at, updated_at)"
        " VALUES (:a, :e, :c, :wd, :ci, :tm, :st, :ot, :aot, :u, TRUE, :now, :now)"),
        {'a': aid, 'e': eid, 'c': p['cid'], 'wd': str(START + timedelta(days=offset)), 'tm': minutes,
         'ci': f"{START + timedelta(days=offset)} 09:00:00",
         'st': status, 'ot': approved_ot, 'aot': auto_ot or 0, 'u': p['uid'], 'now': str(date.today())})
    p['db'].session.commit()
    return aid


def _calc(http, p, eid, cy):
    r = http.post(f"/api/employees/{eid}/cycles/{cy}/calculate", headers=p['hdr'])
    assert r.status_code == 200, r.get_json()
    return r.get_json()['data']


def test_daily_pay_present_half_leave_absent_ot_and_advance(http, pay):
    eid, cy = _employee(pay, 'daily', 800)          # ₹800/day, 8h day, OT ×1.5
    _day(pay, eid, 0, 600, approved_ot=120, auto_ot=120)  # 10h: 1 day ₹800 + OT 120m × 800/480 × 1.5 = ₹300
    _day(pay, eid, 1, 240)                          # 4h  = half day ₹400
    _day(pay, eid, 2, status='paid_leave')          # ₹800
    _day(pay, eid, 3, status='absent')              # ₹0
    _day(pay, eid, 4, 600)                          # 10h, OT NOT approved → capped at ₹800
    http.post(f"/api/employees/{eid}/advances", headers=pay['hdr'], content_type='application/json',
              data=json.dumps({'amount': 500, 'cycle_id': cy, 'advance_date': str(START)}))
    d = _calc(http, pay, eid, cy)
    # 800+300 + 400 + 800 + 0 + 800 = 3100 ; net = 3100 − 500 = 2600
    assert float(d['cycle']['gross_salary']) == 3100.0
    assert float(d['cycle']['total_advances']) == 500.0
    assert float(d['cycle']['net_salary']) == 2600.0
    assert d['ot_summary']['total_ot_minutes'] == 120 and d['ot_summary']['total_ot_pay'] == 300.0


def test_hourly_ot_minutes_are_not_paid_twice(http, pay):
    eid, cy = _employee(pay, 'hourly', 100)         # ₹100/h, 8h day, OT ×1.5
    _day(pay, eid, 0, 600, approved_ot=120, auto_ot=120)
    # Regular 8h × 100 = 800 ; OT 2h × 100 × 1.5 = 300 → 1100.
    # (Paying all 10h as regular AND 2h as OT would give 1300.)
    d = _calc(http, pay, eid, cy)
    assert float(d['cycle']['gross_salary']) == 1100.0


def test_hourly_unapproved_extra_hours_still_paid_at_plain_rate(http, pay):
    eid, cy = _employee(pay, 'hourly', 100)
    _day(pay, eid, 0, 600, auto_ot=120)             # OT pending, not approved → 10h × 100 = 1000
    d = _calc(http, pay, eid, cy)
    assert float(d['cycle']['gross_salary']) == 1000.0


def test_paid_cycle_attendance_is_locked(http, pay):
    eid, cy = _employee(pay, 'daily', 800)
    aid = _day(pay, eid, 0, 600, auto_ot=120)
    assert http.post(f"/api/employees/{eid}/cycles/{cy}/mark-paid", headers=pay['hdr'],
                     content_type='application/json', data='{}').status_code == 200
    hdr = pay['hdr']
    assert http.post(f"/api/employees/attendance/{aid}/approve-ot", headers=hdr,
                     content_type='application/json', data=json.dumps({'ot_minutes': 120})).status_code == 409
    assert http.put(f"/api/employees/attendance/{aid}", headers=hdr, content_type='application/json',
                    data=json.dumps({'notes': 'x', 'total_minutes': 60})).status_code == 409
    assert http.delete(f"/api/employees/attendance/{aid}", headers=hdr).status_code == 409
    assert http.post(f"/api/employees/attendance/{aid}/adjust-hours", headers=hdr, content_type='application/json',
                     data=json.dumps({'deduction_minutes': 60, 'notes': 'lunch'})).status_code == 409


def test_approved_ot_cannot_exceed_time_beyond_full_day(http, pay):
    eid, cy = _employee(pay, 'daily', 800)
    aid = _day(pay, eid, 0, 600, auto_ot=120)       # only 120 min past the 8h day
    r = http.post(f"/api/employees/attendance/{aid}/approve-ot", headers=pay['hdr'],
                  content_type='application/json', data=json.dumps({'ot_minutes': 600}))
    assert r.status_code == 400


def test_payslip_renders_for_open_and_paid_and_negative_net(http, pay):
    eid, cy = _employee(pay, 'daily', 800)
    _day(pay, eid, 0, 480)                          # ₹800 earned
    http.post(f"/api/employees/{eid}/advances", headers=pay['hdr'], content_type='application/json',
              data=json.dumps({'amount': 1000, 'cycle_id': cy, 'advance_date': str(START)}))
    r = http.get(f"/api/employees/{eid}/cycles/{cy}/payslip", headers=pay['hdr'])
    assert r.status_code == 200 and r.data[:4] == b'%PDF'
    http.post(f"/api/employees/{eid}/cycles/{cy}/mark-paid", headers=pay['hdr'],
              content_type='application/json', data='{}')
    r = http.get(f"/api/employees/{eid}/cycles/{cy}/payslip", headers=pay['hdr'])
    assert r.status_code == 200 and r.data[:4] == b'%PDF'


def test_correcting_checkout_shrinks_approved_ot(http, pay):
    eid, cy = _employee(pay, 'daily', 800)
    aid = _day(pay, eid, 0, 720, approved_ot=240, auto_ot=240)   # 09:00–21:00, 4h OT approved
    d0 = START.isoformat()
    r = http.put(f"/api/employees/attendance/{aid}", headers=pay['hdr'], content_type='application/json',
                 data=json.dumps({'check_in': f'{d0}T09:00:00', 'check_out': f'{d0}T18:00:00'}))
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['data']['approved_ot_minutes'] == 60          # 9h worked → at most 1h OT
    d = _calc(http, pay, eid, cy)
    assert float(d['cycle']['gross_salary']) == 800 + 150.0              # 60m × 800/480 × 1.5

    same = http.put(f"/api/employees/attendance/{aid}", headers=pay['hdr'],
                    content_type='application/json', data='{}')
    assert same.status_code == 200


def test_break_deduction_shrinks_approved_ot(http, pay):
    eid, cy = _employee(pay, 'hourly', 100)
    aid = _day(pay, eid, 0, 600, approved_ot=120, auto_ot=120)      # 10h, 2h OT approved
    r = http.post(f"/api/employees/attendance/{aid}/adjust-hours", headers=pay['hdr'],
                  content_type='application/json', data=json.dumps({'deduction_minutes': 60, 'notes': 'lunch'}))
    assert r.status_code == 200, r.get_json()
    assert r.get_json()['data']['approved_ot_minutes'] == 60
    d = _calc(http, pay, eid, cy)
    # 9h paid: 8h × 100 + 1h × 100 × 1.5 = 950
    assert float(d['cycle']['gross_salary']) == 950.0


def test_manual_hours_beyond_full_day_appear_as_pending_ot(http, pay):
    from datetime import date as _d
    eid, _ = _employee(pay, 'daily', 800)
    # Use a cycle covering today: manual hours refuse future dates, not past ones.
    cy = str(uuid.uuid4())
    pay['db'].session.execute(text(
        "INSERT INTO salary_cycles (cycle_id, employee_id, client_id, start_date, end_date, status,"
        " rate_snapshot, pay_type_snap, full_day_mins, created_at, updated_at)"
        " VALUES (:cy, :e, :c, :s, :en, 'open', 800, 'daily', 480, :now, :now)"),
        {'cy': cy, 'e': eid, 'c': pay['cid'], 's': str(_d.today() - timedelta(days=2)),
         'en': str(_d.today() + timedelta(days=2)), 'now': str(_d.today())})
    pay['db'].session.commit()
    r = http.post(f"/api/employees/{eid}/attendance/manual", headers=pay['hdr'], content_type='application/json',
                  data=json.dumps({'work_date': str(_d.today()), 'hours': 10}))
    assert r.status_code in (200, 201), r.get_json()
    pending = http.get(f"/api/employees/{eid}/ot/pending", headers=pay['hdr']).get_json()['data']
    assert [p['auto_ot_minutes'] for p in pending] == [120]

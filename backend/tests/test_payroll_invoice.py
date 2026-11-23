"""Payroll invoices — what the principal company is billed.

Guards:
- An open cycle's stored gross is only as fresh as its last "Calculate" (₹0 until
  then); invoices must bill what was actually worked.
- A cycle is billed once: overlap matching put a cycle straddling two months on
  both months' invoices.
- Headcount counts people, not cycles.
- Invoice numbers are unique.
"""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from conftest import make_token, auth_hdr

PERMS = ['view_salary', 'manage_salary_cycles', 'view_employees']
P_START = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)   # last month
P_END = date.today().replace(day=1) - timedelta(days=1)


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
            db.session.execute(text("UPDATE client_entry SET weekly_off_enabled = FALSE, "
                                    "service_charge_percent = 10"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        yield {'db': db, 'cid': str(sample_client.client_id), 'uid': str(sample_user.user_id),
               'hdr': auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=PERMS))}


def _emp(p, name, rate=1000):
    eid = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO employees (employee_id, client_id, name, pay_type, rate, is_active, created_by)"
        " VALUES (:e, :c, :n, 'daily', :r, TRUE, :u)"),
        {'e': eid, 'c': p['cid'], 'n': name, 'r': rate, 'u': p['uid']})
    p['db'].session.commit()
    return eid


def _cycle(p, eid, start, end, status='open', gross=0, rate=1000):
    cy = str(uuid.uuid4())
    p['db'].session.execute(text(
        "INSERT INTO salary_cycles (cycle_id, employee_id, client_id, start_date, end_date, status,"
        " gross_salary, rate_snapshot, pay_type_snap, full_day_mins, created_at, updated_at)"
        " VALUES (:cy, :e, :c, :s, :en, :st, :g, :r, 'daily', 480, :now, :now)"),
        {'cy': cy, 'e': eid, 'c': p['cid'], 's': str(start), 'en': str(end), 'st': status, 'g': gross,
         'r': rate, 'now': str(date.today())})
    p['db'].session.commit()
    return cy


def _work(p, eid, day, minutes=480):
    p['db'].session.execute(text(
        "INSERT INTO employee_attendance (attendance_id, employee_id, client_id, work_date, check_in,"
        " total_minutes, status, auto_ot_minutes, marked_by, is_active, created_at, updated_at)"
        " VALUES (:a, :e, :c, :wd, :ci, :tm, 'present', 0, :u, TRUE, :now, :now)"),
        {'a': str(uuid.uuid4()), 'e': eid, 'c': p['cid'], 'wd': str(day), 'ci': f'{day} 09:00:00',
         'tm': minutes, 'u': p['uid'], 'now': str(date.today())})
    p['db'].session.commit()


def _preview(http, p, start=P_START, end=P_END):
    r = http.post('/api/payroll/invoices/preview', headers=p['hdr'],
                  json={'period_start': str(start), 'period_end': str(end)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['data']


def _create(http, p, **extra):
    body = {'period_start': str(P_START), 'period_end': str(P_END), 'customer_name': 'Acme Ltd', **extra}
    return http.post('/api/payroll/invoices', headers=p['hdr'], json=body)


def test_open_cycle_is_billed_on_work_done_not_stale_stored_gross(http, p):
    eid = _emp(p, 'Ravi')
    _cycle(p, eid, P_START, P_END, gross=0)          # never "Calculated"
    _work(p, eid, P_START)
    _work(p, eid, P_START + timedelta(days=1), 240)   # 1 + 0.5 days = 1500
    d = _preview(http, p)
    assert d['totals']['salary_total'] == 1500
    assert d['totals']['service_total'] == 150        # 10 % service charge
    assert d['totals']['taxable_total'] == 1650
    assert d['totals']['tax_total'] == 297            # 18 % GST
    assert d['totals']['cgst_total'] + d['totals']['sgst_total'] == 297
    assert d['totals']['grand_total'] == 1947


def test_paid_cycle_bills_its_sealed_gross(http, p):
    eid = _emp(p, 'Sealed')
    _cycle(p, eid, P_START, P_END, status='paid', gross=5000)
    assert _preview(http, p)['totals']['salary_total'] == 5000


def test_cycle_straddling_two_periods_is_billed_once(http, p):
    eid = _emp(p, 'Straddle')
    mid = P_END - timedelta(days=3)
    _cycle(p, eid, mid, P_END + timedelta(days=10), status='paid', gross=2000)
    r = _create(http, p)
    assert r.status_code == 201, r.get_json()
    nxt_start = P_END + timedelta(days=1)
    d = _preview(http, p, nxt_start, nxt_start + timedelta(days=27))
    assert d['totals']['salary_total'] == 0
    assert [s['employee_name'] for s in d['already_invoiced']] == ['Straddle']


def test_headcount_counts_people_not_cycles(http, p):
    eid = _emp(p, 'Two cycles')
    half = P_START + timedelta(days=14)
    _cycle(p, eid, P_START, half, status='paid', gross=1000)
    _cycle(p, eid, half + timedelta(days=1), P_END, status='paid', gross=1000)
    d = _preview(http, p)
    assert d['totals']['headcount'] == 1 and d['lines'][0]['headcount'] == 1
    assert d['totals']['salary_total'] == 2000


def test_zero_pay_cycles_are_not_billed_workers(http, p):
    _cycle(p, _emp(p, 'Idle'), P_START, P_END)
    worker = _emp(p, 'Worker')
    _cycle(p, worker, P_START, P_END, status='paid', gross=800)
    assert _preview(http, p)['totals']['headcount'] == 1


def test_invoice_number_must_be_unique(http, p):
    eid = _emp(p, 'A')
    _cycle(p, eid, P_START, P_END, status='paid', gross=800)
    assert _create(http, p, invoice_number='PINV/X/001').status_code == 201
    eid2 = _emp(p, 'B')
    _cycle(p, eid2, P_START, P_END, status='paid', gross=800)
    r = _create(http, p, invoice_number='PINV/X/001')
    assert r.status_code == 409


def test_payments_drive_status_and_balance(http, p):
    eid = _emp(p, 'Pay')
    _cycle(p, eid, P_START, P_END, status='paid', gross=1000)
    iid = _create(http, p).get_json()['data']['invoice_id']   # 1000 + 100 svc = 1100 + 198 = 1298
    r = http.post(f'/api/payroll/invoices/{iid}/payments', headers=p['hdr'], json={'amount': 500})
    assert r.get_json()['data'] == {'received_amount': 500.0, 'balance': 798.0, 'status': 'partial'}
    r = http.post(f'/api/payroll/invoices/{iid}/payments', headers=p['hdr'], json={'amount': 798})
    assert r.get_json()['data']['status'] == 'paid'
    assert http.delete(f'/api/payroll/invoices/{iid}', headers=p['hdr']).status_code == 409

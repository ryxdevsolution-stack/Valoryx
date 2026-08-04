"""
Bulk manual-hours entry must never overwrite a deliberate day-off record.

The bug: `_upsert_manual_hours` forced `status='present', reason=NULL` on every
existing row. Applying hours across "01 Jul → 31 Jul" therefore converted every
paid leave, unpaid leave, holiday, weekly-off and absent day in that month into
a worked day — silently corrupting attendance AND inflating the salary the
cycle pays out.
"""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text


TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)


@pytest.fixture
def seeded(app, sample_client, sample_user):
    """One employee with an OPEN cycle covering the last 30 days.

    The employee/salary tables have no ORM model — they are raw SQL created by
    migrations — so conftest's create_all() never makes them. Run the real
    migrations here so the test exercises the production schema rather than a
    hand-rolled copy that could drift from it.
    """
    from extensions import db
    from migrations.runner import (
        _m014_employee_salary_tables, _m015_attendance_status_column,
    )

    with app.app_context():
        _m014_employee_salary_tables(db)
        _m015_attendance_status_column(db)
        # Later migrations add columns this code path reads (is_active from the
        # soft-delete migration, is_manual_entry, deduction fields…).
        for fn_name in ('_m031_attendance_soft_delete',
                        '_m038_salary_deductions_and_manual_hours',
                        '_m039_attendance_hour_deduction'):
            try:
                import migrations.runner as _r
                getattr(_r, fn_name)(db)
            except AttributeError:
                pass   # migration renamed/absent — the columns it adds are optional here
            except Exception:
                db.session.rollback()

        emp_id = str(uuid.uuid4())
        cid = str(sample_client.client_id)
        # No `employees` row needed: _upsert_manual_hours reads only
        # salary_cycles (to find the covering cycle) and employee_attendance.
        # The caller validates the employee separately.
        db.session.execute(text(
            "INSERT INTO salary_cycles (cycle_id, employee_id, client_id, start_date, end_date,"
            " status, created_at, updated_at) VALUES (:cy, :e, :c, :s, :en, 'open', :now, :now)"),
            {'cy': str(uuid.uuid4()), 'e': emp_id, 'c': cid,
             's': str(TODAY - timedelta(days=30)), 'en': str(TODAY + timedelta(days=1)),
             'now': str(TODAY)})
        db.session.commit()
        yield {'employee_id': emp_id, 'client_id': cid}


def _mark_day(db, emp_id, cid, work_date, status):
    db.session.execute(text(
        "INSERT INTO employee_attendance (attendance_id, employee_id, client_id, work_date,"
        " total_minutes, status, reason, is_active, created_at, updated_at)"
        " VALUES (:a, :e, :c, :wd, 0, :st, 'family function', TRUE, :now, :now)"),
        {'a': str(uuid.uuid4()), 'e': emp_id, 'c': cid, 'wd': str(work_date),
         'st': status, 'now': str(TODAY)})
    db.session.commit()


def _read_day(db, emp_id, work_date):
    return db.session.execute(text(
        "SELECT status, total_minutes, reason FROM employee_attendance"
        " WHERE employee_id = :e AND work_date = :wd"),
        {'e': emp_id, 'wd': str(work_date)}).fetchone()


@pytest.mark.parametrize("status", ['paid_leave', 'unpaid_leave', 'absent', 'holiday', 'weekly_off'])
def test_manual_hours_never_overwrites_a_day_off(app, seeded, status):
    """The exact reported bug: marking paid leave, then applying bulk hours over
    a range containing that date, turned the leave into a worked day."""
    from extensions import db
    from routes.employees import _upsert_manual_hours

    with app.app_context():
        emp, cid = seeded['employee_id'], seeded['client_id']
        _mark_day(db, emp, cid, YESTERDAY, status)

        result = _upsert_manual_hours(emp, cid, YESTERDAY, 480, None)

        assert result['success'] is False
        assert result['skipped'] is True
        assert result['code'] == 'DAY_OFF'

        row = _read_day(db, emp, YESTERDAY)
        assert row[0] == status, f"{status} was overwritten"
        assert row[1] == 0, "a day off must not gain worked minutes"
        assert row[2] == 'family function', "the reason must survive"


def test_manual_hours_still_updates_an_ordinary_present_day(app, seeded):
    """Guard against over-correcting — normal days must still be updatable."""
    from extensions import db
    from routes.employees import _upsert_manual_hours

    with app.app_context():
        emp, cid = seeded['employee_id'], seeded['client_id']
        _mark_day(db, emp, cid, YESTERDAY, 'present')

        result = _upsert_manual_hours(emp, cid, YESTERDAY, 480, None)

        assert result['success'] is True
        row = _read_day(db, emp, YESTERDAY)
        assert row[0] == 'present'
        assert row[1] == 480


def test_manual_hours_creates_a_row_for_an_untouched_day(app, seeded):
    """A date with no record at all is a normal backfill — still works."""
    from extensions import db
    from routes.employees import _upsert_manual_hours

    with app.app_context():
        emp, cid = seeded['employee_id'], seeded['client_id']
        target = TODAY - timedelta(days=3)

        result = _upsert_manual_hours(emp, cid, target, 300, 'backfill')

        assert result['success'] is True
        row = _read_day(db, emp, target)
        assert row[0] == 'present'
        assert row[1] == 300


def test_a_range_applies_hours_around_the_leave_day(app, seeded):
    """End-to-end shape of the fix: hours land on working days, the leave day
    is left exactly as it was, and it is reported as skipped rather than failed."""
    from extensions import db
    from routes.employees import _upsert_manual_hours, _expand_date_range

    with app.app_context():
        emp, cid = seeded['employee_id'], seeded['client_id']
        leave_day = TODAY - timedelta(days=5)
        _mark_day(db, emp, cid, leave_day, 'paid_leave')

        dates = _expand_date_range(TODAY - timedelta(days=7), TODAY - timedelta(days=3))
        results = [_upsert_manual_hours(emp, cid, d, 480, None) for d in dates]
        db.session.commit()

        succeeded = [r for r in results if r['success']]
        skipped = [r for r in results if r.get('skipped')]

        assert len(skipped) == 1
        assert skipped[0]['work_date'] == str(leave_day)
        assert len(succeeded) == len(dates) - 1

        assert _read_day(db, emp, leave_day)[0] == 'paid_leave'
        assert _read_day(db, emp, leave_day)[1] == 0

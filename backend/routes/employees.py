"""
Employee Salary & Attendance Management routes.

Endpoints:
  Employees (CRUD):
    GET    /api/employees                                         - list active employees
    POST   /api/employees                                         - create employee
    GET    /api/employees/<employee_id>                           - get single employee
    PUT    /api/employees/<employee_id>                           - update employee
    DELETE /api/employees/<employee_id>                           - soft delete (is_active=0)

  Attendance:
    POST   /api/employees/<employee_id>/attendance/checkin        - record check_in
    POST   /api/employees/<employee_id>/attendance/checkout       - find open punch and close it
    GET    /api/employees/<employee_id>/attendance                 - daily grouped log (from/to)
    PUT    /api/employees/attendance/<attendance_id>               - edit punch times
    DELETE /api/employees/attendance/<attendance_id>               - delete punch
    GET    /api/employees/attendance/daily-summary                 - all employees for ?date=

  Salary Cycles:
    GET    /api/employees/<employee_id>/cycles                    - list cycles (newest first)
    POST   /api/employees/<employee_id>/cycles                    - create cycle
    GET    /api/employees/<employee_id>/cycles/<cycle_id>         - full detail + breakdown
    POST   /api/employees/<employee_id>/cycles/<cycle_id>/calculate    - recalculate
    POST   /api/employees/<employee_id>/cycles/<cycle_id>/mark-paid    - seal cycle
    GET    /api/employees/cycles/open                             - all open cycles for client

  Advances:
    POST   /api/employees/<employee_id>/advances                  - record advance
    DELETE /api/employees/advances/<advance_id>                   - delete advance
"""

import uuid
import logging
from datetime import datetime, date

from flask import Blueprint, request, jsonify, g
from sqlalchemy import text

from extensions import db
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission

logger = logging.getLogger(__name__)

employees_bp = Blueprint('employees', __name__)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _parse_date(value: str):
    """Parse ISO date string to date object; return None on failure."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        return None


def _parse_datetime(value: str):
    """Parse ISO datetime string to a naive UTC datetime.
    Accepts 'YYYY-MM-DDTHH:MM:SS', with 'Z' suffix, or with +HH:MM offset.
    Always strips timezone info so comparisons with stored naive datetimes work.
    """
    if not value:
        return None
    try:
        s = str(value).strip().replace('T', ' ')
        # Strip trailing Z (UTC marker)
        if s.endswith('Z'):
            s = s[:-1]
        # Strip +HH:MM or -HH:MM offset
        for sep in ('+', '-'):
            idx = s.rfind(sep, 10)  # only look after the date portion
            if idx != -1:
                s = s[:idx]
                break
        dt = datetime.fromisoformat(s)
        return dt.replace(tzinfo=None)
    except ValueError:
        return None


def _row_to_dict(row):
    """Convert a SQLAlchemy Row (from text() query) to plain dict.

    Date/datetime values are converted to ISO 8601 strings ('2026-05-28').
    Flask's default jsonify serializes date columns as RFC 2822
    ('Fri, 28 May 2026 00:00:00 GMT'), which breaks frontend string
    comparisons that expect ISO format. Converting at the serialization
    boundary keeps every downstream consumer (cycle coverage, calendar
    rendering, attendance status) working with a predictable format.
    """
    from datetime import date, datetime as _dt
    d = dict(row._mapping)
    for k, v in list(d.items()):
        # Handle both date and datetime — keep date as 'YYYY-MM-DD',
        # datetime as 'YYYY-MM-DDTHH:MM:SS'. UUID and other types pass through
        # unchanged (Flask's encoder handles them fine).
        if isinstance(v, _dt):
            d[k] = v.isoformat()
        elif isinstance(v, date):
            d[k] = v.isoformat()
    return d


def _find_covering_cycle(employee_id: str, client_id: str, work_date) -> dict | None:
    """Return the salary_cycles row whose date range covers work_date,
    or None if no cycle covers it.

    A cycle "covers" a date when start_date <= work_date <= end_date.
    """
    if hasattr(work_date, 'strftime'):
        date_str = work_date.strftime('%Y-%m-%d')
    else:
        date_str = str(work_date)
    row = db.session.execute(
        text(
            "SELECT * FROM salary_cycles "
            "WHERE employee_id = :eid AND client_id = :cid "
            "  AND start_date <= :d AND end_date >= :d "
            "LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id, 'd': date_str}
    ).fetchone()
    return _row_to_dict(row) if row else None


def _get_employee(employee_id: str, client_id: str):
    """Fetch a single active employee row or None."""
    row = db.session.execute(
        text(
            "SELECT * FROM employees "
            "WHERE employee_id = :eid AND client_id = :cid AND is_active = TRUE"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchone()
    return _row_to_dict(row) if row else None


def _get_employee_any(employee_id: str, client_id: str):
    """Fetch an employee row regardless of is_active status."""
    row = db.session.execute(
        text(
            "SELECT * FROM employees "
            "WHERE employee_id = :eid AND client_id = :cid"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchone()
    return _row_to_dict(row) if row else None


def _get_cycle(cycle_id: str, employee_id: str, client_id: str):
    """Fetch a single salary cycle row or None."""
    row = db.session.execute(
        text(
            "SELECT * FROM salary_cycles "
            "WHERE cycle_id = :cid AND employee_id = :eid AND client_id = :client"
        ),
        {'cid': cycle_id, 'eid': employee_id, 'client': client_id}
    ).fetchone()
    return _row_to_dict(row) if row else None


def _compute_total_minutes(check_in_dt: datetime, check_out_dt: datetime) -> int:
    """Return total elapsed minutes between two datetime objects (non-negative)."""
    delta = check_out_dt - check_in_dt
    return max(0, int(delta.total_seconds() // 60))


# Day-off status constants — shared between the mark_day_off endpoint and the
# salary calculator. Paid statuses count as one full day of pay; unpaid count as 0.
_DAY_OFF_PAID_STATUSES = {'paid_leave', 'holiday', 'weekly_off'}
_DAY_OFF_UNPAID_STATUSES = {'absent', 'unpaid_leave'}
_DAY_OFF_STATUSES = _DAY_OFF_PAID_STATUSES | _DAY_OFF_UNPAID_STATUSES


def _calculate_cycle_amounts(cycle: dict):
    """
    Recalculate gross, total_advances, and net salary for a cycle.

    Per-date logic (aggregated across punches):
      status='present'                              → pay by minutes worked
      status in {paid_leave, holiday, weekly_off}   → pay a full day regardless
      status in {absent, unpaid_leave}              → pay zero

    OT pay (layered on top of regular pay for 'present' days):
      approved_ot_minutes × (rate_snapshot / 60) × ot_multiplier
      Only approved OT (approved_ot_minutes IS NOT NULL and > 0) counts.
      Regular pay is still capped at full_day_mins for daily employees;
      OT is billed separately.

    Daily-rate: full day = rate_snapshot
    Hourly-rate: full day = (full_day_mins / 60) * rate_snapshot

    Returns (gross, total_advances, net, daily_breakdown).
    """
    # Fetch per-employee OT multiplier — default 1.5 when NULL (pre-migration rows).
    emp_row = db.session.execute(
        text("SELECT ot_multiplier FROM employees WHERE employee_id = :eid AND client_id = :cid LIMIT 1"),
        {'eid': cycle['employee_id'], 'cid': cycle['client_id']}
    ).fetchone()
    try:
        ot_multiplier = float((emp_row[0] if emp_row and emp_row[0] is not None else None) or 1.5)
    except (TypeError, ValueError):
        ot_multiplier = 1.5

    rows = db.session.execute(
        text(
            # MAX(status) picks any non-'present' label when both exist (shouldn't
            # happen since mark_day_off rejects mixed dates, but defensive anyway).
            # Filter: include completed punches OR any day-off row; skip
            # incomplete open check-ins (status='present' AND total_minutes IS NULL).
            # SUM(approved_ot_minutes) — NULL values are excluded by SUM; a day
            # with no approved OT rows contributes 0 via COALESCE.
            "SELECT work_date, "
            "       SUM(COALESCE(total_minutes, 0)) AS day_minutes, "
            "       MAX(status) AS day_status, "
            "       COALESCE(SUM(CASE WHEN approved_ot_minutes IS NOT NULL "
            "                         THEN approved_ot_minutes ELSE 0 END), 0) AS day_ot_minutes "
            "FROM employee_attendance "
            "WHERE client_id = :client AND employee_id = :eid "
            "  AND is_active = TRUE "
            "  AND work_date BETWEEN :start AND :end "
            "  AND (total_minutes IS NOT NULL OR status != 'present') "
            "GROUP BY work_date "
            "ORDER BY work_date"
        ),
        {
            'client': cycle['client_id'],
            'eid': cycle['employee_id'],
            'start': cycle['start_date'],
            'end': cycle['end_date'],
        }
    ).fetchall()

    full_day_mins = int(cycle.get('full_day_mins') or 480)
    rate_snapshot = float(cycle.get('rate_snapshot') or 0)
    pay_type = (cycle.get('pay_type_snap') or 'daily').lower()
    # What one full day pays (used for paid day-off statuses)
    full_day_pay = rate_snapshot if pay_type == 'daily' else (full_day_mins / 60.0) * rate_snapshot
    # Per-minute rate used for OT calculation (hourly: rate/60; daily: rate/full_day_mins)
    minute_rate = (rate_snapshot / 60.0) if pay_type == 'hourly' else (rate_snapshot / float(full_day_mins) if full_day_mins > 0 else 0)

    daily_breakdown = []
    gross = 0.0
    total_ot_minutes = 0
    total_ot_pay = 0.0

    for row in [_row_to_dict(r) for r in rows]:
        day_status = (row.get('day_status') or 'present').lower()
        mins = int(row['day_minutes'] or 0)
        hours = mins / 60.0
        ot_mins = int(row.get('day_ot_minutes') or 0)

        if day_status in _DAY_OFF_PAID_STATUSES:
            # Full day's pay; display minutes stay 0 since no work was done
            amount = full_day_pay
            days_counted = 1.0
            hours_display = round(full_day_mins / 60.0, 2)
            ot_mins = 0  # no OT on paid day-off
        elif day_status in _DAY_OFF_UNPAID_STATUSES:
            # No pay for this day
            amount = 0.0
            days_counted = 0.0
            hours_display = 0.0
            ot_mins = 0  # no OT on unpaid day-off
        else:  # 'present' — pay by minutes worked (regular pay capped, OT is extra)
            if pay_type == 'hourly':
                # Regular: pay all minutes at minute_rate
                regular_mins = mins
                amount = hours * rate_snapshot
                days_counted = hours / 8.0
            else:  # daily
                # Cap regular pay at full_day_mins; OT is the excess
                regular_mins = min(mins, full_day_mins)
                day_fraction = min(mins / full_day_mins, 1.0) if full_day_mins > 0 else 0
                amount = day_fraction * rate_snapshot
                days_counted = day_fraction
            hours_display = round(hours, 2)

        # OT pay (only for 'present' days with manager-approved OT minutes)
        ot_pay = round(ot_mins * minute_rate * ot_multiplier, 2) if ot_mins > 0 else 0.0

        gross += amount + ot_pay
        total_ot_minutes += ot_mins
        total_ot_pay += ot_pay

        daily_breakdown.append({
            'date': str(row['work_date']),
            'total_minutes': mins,
            'hours_worked': hours_display,
            'days_counted': round(days_counted, 2),
            'amount_earned': round(amount, 2),
            'status': day_status,
            'ot_minutes': ot_mins,
            'ot_pay': ot_pay,
        })

    adv_row = db.session.execute(
        text(
            "SELECT COALESCE(SUM(amount), 0) AS total "
            "FROM salary_advances WHERE cycle_id = :cid"
        ),
        {'cid': cycle['cycle_id']}
    ).fetchone()

    total_advances = float(adv_row[0])
    net = gross - total_advances

    return round(gross, 2), total_advances, round(net, 2), daily_breakdown, {
        'total_ot_minutes': total_ot_minutes,
        'total_ot_pay': round(total_ot_pay, 2),
        'ot_multiplier': ot_multiplier,
    }


# ── Employee CRUD ─────────────────────────────────────────────────────────────

@employees_bp.route('', methods=['GET'])
@authenticate
@require_permission('view_employees')
def list_employees():
    client_id = g.user['client_id']
    rows = db.session.execute(
        text(
            "SELECT * FROM employees "
            "WHERE client_id = :cid AND is_active = TRUE "
            "ORDER BY name"
        ),
        {'cid': client_id}
    ).fetchall()
    return jsonify({'success': True, 'data': [_row_to_dict(r) for r in rows]}), 200


@employees_bp.route('', methods=['POST'])
@authenticate
@require_permission('add_employee')
def create_employee():
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    name = (body.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name is required'}), 400

    pay_type = (body.get('pay_type') or '').strip().lower()
    if pay_type not in ('hourly', 'daily'):
        return jsonify({'success': False, 'error': "pay_type must be 'hourly' or 'daily'"}), 400

    rate = body.get('rate')
    try:
        rate = float(rate)
        if rate < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'rate must be a non-negative number'}), 400

    ot_multiplier = body.get('ot_multiplier')
    if ot_multiplier is not None:
        try:
            ot_multiplier = float(ot_multiplier)
            if ot_multiplier < 0:
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'ot_multiplier must be a non-negative number'}), 400
    else:
        ot_multiplier = 1.5  # sensible default

    employee_id = str(uuid.uuid4())
    now = _now_iso()

    db.session.execute(
        text(
            "INSERT INTO employees "
            "(employee_id, client_id, branch_id, name, phone, pay_type, rate, "
            " ot_multiplier, is_active, created_by, created_at, updated_at) "
            "VALUES (:eid, :cid, :bid, :name, :phone, :pay_type, :rate, "
            "        :ot_multiplier, TRUE, :created_by, :now, :now)"
        ),
        {
            'eid': employee_id,
            'cid': client_id,
            'bid': body.get('branch_id') or None,
            'name': name,
            'phone': (body.get('phone') or '').strip() or None,
            'pay_type': pay_type,
            'rate': rate,
            'ot_multiplier': ot_multiplier,
            'created_by': g.user['user_id'],
            'now': now,
        }
    )
    db.session.commit()

    emp = _get_employee(employee_id, client_id)
    return jsonify({'success': True, 'data': emp, 'message': f'Employee "{name}" created'}), 201


@employees_bp.route('/<employee_id>', methods=['GET'])
@authenticate
@require_permission('view_employees')
def get_employee(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404
    return jsonify({'success': True, 'data': emp}), 200


@employees_bp.route('/<employee_id>', methods=['PUT'])
@authenticate
@require_permission('edit_employee')
def update_employee(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    body = request.get_json(silent=True) or {}
    updates = {}

    if 'name' in body:
        name = (body['name'] or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'name cannot be empty'}), 400
        updates['name'] = name

    if 'phone' in body:
        updates['phone'] = (body['phone'] or '').strip() or None

    if 'branch_id' in body:
        updates['branch_id'] = body['branch_id'] or None

    if 'pay_type' in body:
        pt = (body['pay_type'] or '').strip().lower()
        if pt not in ('hourly', 'daily'):
            return jsonify({'success': False, 'error': "pay_type must be 'hourly' or 'daily'"}), 400
        updates['pay_type'] = pt

    if 'rate' in body:
        try:
            r = float(body['rate'])
            if r < 0:
                raise ValueError
            updates['rate'] = r
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'rate must be a non-negative number'}), 400

    if 'ot_multiplier' in body:
        try:
            om = float(body['ot_multiplier'])
            if om < 0:
                raise ValueError()
            updates['ot_multiplier'] = om
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'ot_multiplier must be a non-negative number'}), 400

    if not updates:
        return jsonify({'success': True, 'data': emp, 'message': 'Nothing to update'}), 200

    _ALLOWED_EMPLOYEE_FIELDS = {'name', 'phone', 'branch_id', 'pay_type', 'rate', 'ot_multiplier'}
    set_clause = ', '.join(f"{k} = :{k}" for k in updates if k in _ALLOWED_EMPLOYEE_FIELDS)
    updates['updated_at'] = _now_iso()
    updates['eid'] = employee_id
    updates['cid'] = client_id

    db.session.execute(
        text(
            f"UPDATE employees SET {set_clause}, updated_at = :updated_at, synced_at = NULL "
            f"WHERE employee_id = :eid AND client_id = :cid"
        ),
        updates
    )
    db.session.commit()

    emp = _get_employee(employee_id, client_id)
    return jsonify({'success': True, 'data': emp, 'message': 'Employee updated'}), 200


@employees_bp.route('/<employee_id>', methods=['DELETE'])
@authenticate
@require_permission('delete_employee')
def delete_employee(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    db.session.execute(
        text(
            "UPDATE employees SET is_active = FALSE, updated_at = :now, synced_at = NULL "
            "WHERE employee_id = :eid AND client_id = :cid"
        ),
        {'now': _now_iso(), 'eid': employee_id, 'cid': client_id}
    )
    db.session.commit()
    return jsonify({'success': True, 'message': f'Employee "{emp["name"]}" removed'}), 200


# ── Attendance ─────────────────────────────────────────────────────────────────

@employees_bp.route('/<employee_id>/attendance/checkin', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def checkin(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    # Determine the work_date that this punch belongs to so we can gate it
    # against salary-cycle coverage BEFORE touching any other data.
    body_preview = request.get_json(silent=True) or {}
    _wd_str = body_preview.get('work_date')
    _ci_str = body_preview.get('check_in')
    if _wd_str:
        wd_check = _parse_date(_wd_str)
    elif _ci_str:
        _ci_dt = _parse_datetime(_ci_str)
        wd_check = _ci_dt.date() if _ci_dt else datetime.utcnow().date()
    else:
        wd_check = datetime.utcnow().date()

    # Enforce: a salary cycle must cover this work_date.
    # Sealed (paid) cycles also block new attendance — uniform rule.
    cycle = _find_covering_cycle(employee_id, client_id, wd_check)
    if not cycle:
        return jsonify({
            'success': False,
            'error': f'No salary cycle covers {wd_check}. Please create a cycle first.',
            'code': 'NO_CYCLE',
            'work_date': str(wd_check),
        }), 409
    if cycle.get('status') != 'open':
        return jsonify({
            'success': False,
            'error': (
                f'The salary cycle for {wd_check} is sealed ({cycle.get("status")}). '
                'Cannot record new attendance.'
            ),
            'code': 'CYCLE_SEALED',
            'work_date': str(wd_check),
            'cycle_id': cycle.get('cycle_id'),
        }), 409

    # Reject if there is already an open punch (check_out IS NULL)
    open_punch = db.session.execute(
        text(
            "SELECT attendance_id FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid AND check_out IS NULL "
            "  AND is_active = TRUE "
            "LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchone()
    if open_punch:
        return jsonify({
            'success': False,
            'error': 'Employee already has an open check-in. Please check out first.',
            'open_attendance_id': open_punch[0],
        }), 409

    body = body_preview  # reuse already-parsed body
    now = datetime.utcnow()

    # Allow caller to override check_in time (e.g. retroactive entry)
    check_in_str = body.get('check_in')
    if check_in_str:
        check_in_dt = _parse_datetime(check_in_str)
        if not check_in_dt:
            return jsonify({'success': False, 'error': 'Invalid check_in datetime format'}), 400
    else:
        check_in_dt = now

    work_date_str = body.get('work_date')
    if work_date_str:
        work_date = _parse_date(work_date_str)
        if not work_date:
            return jsonify({'success': False, 'error': 'Invalid work_date format'}), 400
    else:
        work_date = check_in_dt.date()

    attendance_id = str(uuid.uuid4())
    created_at = _now_iso()

    db.session.execute(
        text(
            "INSERT INTO employee_attendance "
            "(attendance_id, employee_id, client_id, work_date, check_in, "
            " check_out, total_minutes, marked_by, notes, created_at, updated_at) "
            "VALUES (:aid, :eid, :cid, :work_date, :check_in, "
            "        NULL, NULL, :marked_by, :notes, :now, :now)"
        ),
        {
            'aid': attendance_id,
            'eid': employee_id,
            'cid': client_id,
            'work_date': str(work_date),
            'check_in': check_in_dt.strftime('%Y-%m-%d %H:%M:%S'),
            'marked_by': g.user['user_id'],
            'notes': (body.get('notes') or '').strip() or None,
            'now': created_at,
        }
    )
    db.session.commit()

    row = db.session.execute(
        text("SELECT * FROM employee_attendance WHERE attendance_id = :aid"),
        {'aid': attendance_id}
    ).fetchone()
    return jsonify({'success': True, 'data': _row_to_dict(row), 'message': 'Check-in recorded'}), 201


@employees_bp.route('/<employee_id>/attendance/checkout', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def checkout(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    # Find the most recent open punch
    open_punch_row = db.session.execute(
        text(
            "SELECT * FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid AND check_out IS NULL "
            "  AND is_active = TRUE "
            "ORDER BY check_in DESC LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchone()
    open_punch = _row_to_dict(open_punch_row) if open_punch_row else None

    if not open_punch:
        return jsonify({
            'success': False,
            'error': 'No open check-in found for this employee.',
        }), 409

    body = request.get_json(silent=True) or {}
    check_out_str = body.get('check_out')
    if check_out_str:
        check_out_dt = _parse_datetime(check_out_str)
        if not check_out_dt:
            return jsonify({'success': False, 'error': 'Invalid check_out datetime format'}), 400
    else:
        check_out_dt = datetime.utcnow()

    check_in_dt = _parse_datetime(str(open_punch['check_in']))
    if check_in_dt and check_out_dt <= check_in_dt:
        return jsonify({'success': False, 'error': 'check_out must be after check_in'}), 400

    total_minutes = _compute_total_minutes(check_in_dt, check_out_dt) if check_in_dt else None

    # Auto-detect OT minutes: anything past the cycle's full_day_mins is candidate
    # OT. Manager must approve via /attendance/<aid>/approve-ot before it counts in pay.
    work_date_for_calc = open_punch.get('work_date')
    if hasattr(work_date_for_calc, 'strftime'):
        pass  # already a date object
    elif work_date_for_calc:
        work_date_for_calc = _parse_date(str(work_date_for_calc))

    full_day_mins_for_calc = 480  # fallback default
    _ot_cycle = _find_covering_cycle(employee_id, client_id, work_date_for_calc) if work_date_for_calc else None
    if _ot_cycle and _ot_cycle.get('full_day_mins'):
        try:
            full_day_mins_for_calc = int(_ot_cycle['full_day_mins'])
        except (TypeError, ValueError):
            pass
    auto_ot = max(0, int(total_minutes or 0) - full_day_mins_for_calc)

    db.session.execute(
        text(
            "UPDATE employee_attendance "
            "SET check_out = :check_out, total_minutes = :total_minutes, "
            "    auto_ot_minutes = :auto_ot, "
            "    updated_at = :now, synced_at = NULL "
            "WHERE attendance_id = :aid AND client_id = :cid"
        ),
        {
            'check_out': check_out_dt.strftime('%Y-%m-%d %H:%M:%S'),
            'total_minutes': total_minutes,
            'auto_ot': auto_ot,
            'now': _now_iso(),
            'aid': open_punch['attendance_id'],
            'cid': client_id,
        }
    )
    db.session.commit()

    row = db.session.execute(
        text("SELECT * FROM employee_attendance WHERE attendance_id = :aid"),
        {'aid': open_punch['attendance_id']}
    ).fetchone()
    return jsonify({'success': True, 'data': _row_to_dict(row), 'message': 'Check-out recorded'}), 200


@employees_bp.route('/<employee_id>/day-off', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def mark_day_off(employee_id):
    """
    Mark a specific date as a day-off with a status and optional reason.

    Unlike check-in/check-out, day-off rows have no punch times; the status
    field determines whether the day is paid (paid_leave, holiday, weekly_off)
    or unpaid (absent, unpaid_leave). The salary calculator treats paid
    statuses as a full day's earnings regardless of minutes worked.

    Body:
      work_date: "YYYY-MM-DD"     (required)
      status:    one of _DAY_OFF_STATUSES (required)
      reason:    short label (optional, e.g. "Sick leave", "Diwali")
      notes:     free text (optional)
    """
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    body = request.get_json(silent=True) or {}

    work_date_str = body.get('work_date')
    if not work_date_str:
        return jsonify({'success': False, 'error': 'work_date is required'}), 400
    work_date = _parse_date(work_date_str)
    if not work_date:
        return jsonify({'success': False, 'error': 'Invalid work_date format'}), 400

    # Reject future dates — you can't mark "absent" before the day has passed
    if work_date > date.today():
        return jsonify({'success': False, 'error': 'Cannot mark a day off for a future date'}), 400

    # Enforce: a salary cycle (status='open') must cover this work_date.
    # Sealed (paid) cycles also block new attendance — uniform rule.
    _day_off_cycle = _find_covering_cycle(employee_id, client_id, work_date)
    if not _day_off_cycle:
        return jsonify({
            'success': False,
            'error': f'No salary cycle covers {work_date}. Please create a cycle first.',
            'code': 'NO_CYCLE',
            'work_date': str(work_date),
        }), 409
    if _day_off_cycle.get('status') != 'open':
        return jsonify({
            'success': False,
            'error': (
                f'The salary cycle for {work_date} is sealed ({_day_off_cycle.get("status")}). '
                'Cannot record new attendance.'
            ),
            'code': 'CYCLE_SEALED',
            'work_date': str(work_date),
            'cycle_id': _day_off_cycle.get('cycle_id'),
        }), 409

    status = (body.get('status') or '').strip().lower()
    if status not in _DAY_OFF_STATUSES:
        return jsonify({
            'success': False,
            'error': f'status must be one of: {", ".join(sorted(_DAY_OFF_STATUSES))}'
        }), 400

    # Reject if this date already has any attendance record (punch OR day-off).
    # Admin must delete the existing row first to change their mind — prevents
    # silent overwrites of real check-ins.
    existing = db.session.execute(
        text(
            "SELECT attendance_id, status FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid AND work_date = :wd "
            "  AND is_active = TRUE "
            "LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id, 'wd': str(work_date)}
    ).fetchone()
    if existing:
        return jsonify({
            'success': False,
            'error': 'An attendance record already exists for this date. Delete it first to re-mark.',
            'existing_attendance_id': existing[0],
            'existing_status': existing[1] if len(existing) > 1 else None,
        }), 409

    attendance_id = str(uuid.uuid4())
    now_iso = _now_iso()

    # check_in is NULL on PostgreSQL (post-v15 migration); on SQLite we fall
    # back to a midnight sentinel since the column can't be relaxed in place.
    dialect = db.engine.dialect.name
    check_in_val = None if dialect == 'postgresql' else f"{work_date} 00:00:00"

    db.session.execute(
        text(
            "INSERT INTO employee_attendance "
            "(attendance_id, employee_id, client_id, work_date, check_in, "
            " check_out, total_minutes, marked_by, notes, status, reason, "
            " created_at, updated_at) "
            "VALUES (:aid, :eid, :cid, :wd, :ci, NULL, 0, :marked_by, "
            "        :notes, :status, :reason, :now, :now)"
        ),
        {
            'aid': attendance_id,
            'eid': employee_id,
            'cid': client_id,
            'wd': str(work_date),
            'ci': check_in_val,
            'marked_by': g.user['user_id'],
            'notes': (body.get('notes') or '').strip() or None,
            'status': status,
            'reason': (body.get('reason') or '').strip() or None,
            'now': now_iso,
        }
    )
    db.session.commit()

    row = db.session.execute(
        text("SELECT * FROM employee_attendance WHERE attendance_id = :aid"),
        {'aid': attendance_id}
    ).fetchone()
    return jsonify({
        'success': True,
        'data': _row_to_dict(row),
        'message': f'Marked as {status.replace("_", " ")}'
    }), 201


@employees_bp.route('/<employee_id>/attendance', methods=['GET'])
@authenticate
@require_permission('view_attendance')
def get_attendance_log(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    # Default: current month
    today = date.today()
    default_from = date(today.year, today.month, 1)
    default_to = today

    from_date = _parse_date(request.args.get('from')) or default_from
    to_date = _parse_date(request.args.get('to')) or default_to

    rows = db.session.execute(
        text(
            "SELECT * FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid "
            "  AND is_active = TRUE "
            "  AND work_date BETWEEN :from_d AND :to_d "
            "ORDER BY work_date DESC, check_in DESC"
        ),
        {
            'eid': employee_id,
            'cid': client_id,
            'from_d': str(from_date),
            'to_d': str(to_date),
        }
    ).fetchall()

    # Group by date for a convenient daily view. Each day also gets a
    # `day_status` and `day_reason` so the frontend can render day-off entries
    # (paid_leave, holiday, absent, etc.) without having to inspect each punch.
    grouped: dict = {}
    for r in rows:
        punch = _row_to_dict(r)
        d = str(punch['work_date'])
        if d not in grouped:
            grouped[d] = {
                'work_date': d,
                'punches': [],
                'day_total_minutes': 0,
                'day_status': 'present',
                'day_reason': None,
            }
        grouped[d]['punches'].append(punch)
        if punch.get('total_minutes'):
            grouped[d]['day_total_minutes'] += punch['total_minutes']
        # A day-off row always "wins" — overrides the default 'present'
        row_status = (punch.get('status') or 'present').lower()
        if row_status != 'present':
            grouped[d]['day_status'] = row_status
            grouped[d]['day_reason'] = punch.get('reason')

    daily = sorted(grouped.values(), key=lambda x: x['work_date'], reverse=True)
    return jsonify({'success': True, 'data': daily, 'total': len(rows)}), 200


@employees_bp.route('/attendance/<attendance_id>', methods=['PUT'])
@authenticate
@require_permission('mark_attendance')
def edit_attendance(attendance_id):
    client_id = g.user['client_id']
    row = db.session.execute(
        text(
            "SELECT * FROM employee_attendance "
            "WHERE attendance_id = :aid AND client_id = :cid AND is_active = TRUE"
        ),
        {'aid': attendance_id, 'cid': client_id}
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Attendance record not found'}), 404

    body = request.get_json(silent=True) or {}
    updates = {}

    if 'check_in' in body:
        dt = _parse_datetime(body['check_in'])
        if not dt:
            return jsonify({'success': False, 'error': 'Invalid check_in datetime format'}), 400
        updates['check_in'] = dt.strftime('%Y-%m-%d %H:%M:%S')

    if 'check_out' in body:
        if body['check_out'] is None:
            updates['check_out'] = None
        else:
            dt = _parse_datetime(body['check_out'])
            if not dt:
                return jsonify({'success': False, 'error': 'Invalid check_out datetime format'}), 400
            updates['check_out'] = dt.strftime('%Y-%m-%d %H:%M:%S')

    if 'work_date' in body:
        wd = _parse_date(body['work_date'])
        if not wd:
            return jsonify({'success': False, 'error': 'Invalid work_date format'}), 400
        updates['work_date'] = str(wd)

    if 'notes' in body:
        updates['notes'] = (body['notes'] or '').strip() or None

    # Recompute total_minutes from the resolved check_in / check_out
    final_check_in_str = updates.get('check_in') or str(row['check_in'])
    final_check_out_str = updates.get('check_out') if 'check_out' in updates else str(row['check_out']) if row['check_out'] else None

    if final_check_in_str and final_check_out_str:
        ci = _parse_datetime(final_check_in_str)
        co = _parse_datetime(final_check_out_str)
        if ci and co:
            if co <= ci:
                return jsonify({'success': False, 'error': 'check_out must be after check_in'}), 400
            updates['total_minutes'] = _compute_total_minutes(ci, co)
    elif 'check_out' in updates and updates['check_out'] is None:
        updates['total_minutes'] = None

    if not updates:
        return jsonify({'success': True, 'data': _row_to_dict(row), 'message': 'Nothing to update'}), 200

    _ALLOWED_ATT_FIELDS = {'check_in', 'check_out', 'work_date', 'notes', 'total_minutes'}
    set_clause = ', '.join(f"{k} = :{k}" for k in updates if k in _ALLOWED_ATT_FIELDS)
    updates['updated_at'] = _now_iso()
    updates['aid'] = attendance_id

    db.session.execute(
        text(f"UPDATE employee_attendance SET {set_clause}, updated_at = :updated_at, synced_at = NULL WHERE attendance_id = :aid"),
        updates
    )
    db.session.commit()

    updated = db.session.execute(
        text("SELECT * FROM employee_attendance WHERE attendance_id = :aid"),
        {'aid': attendance_id}
    ).fetchone()
    return jsonify({'success': True, 'data': _row_to_dict(updated), 'message': 'Attendance updated'}), 200


@employees_bp.route('/attendance/<attendance_id>', methods=['DELETE'])
@authenticate
@require_permission('mark_attendance')
def delete_attendance(attendance_id):
    client_id = g.user['client_id']
    row = db.session.execute(
        text(
            "SELECT attendance_id FROM employee_attendance "
            "WHERE attendance_id = :aid AND client_id = :cid AND is_active = TRUE"
        ),
        {'aid': attendance_id, 'cid': client_id}
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Attendance record not found'}), 404

    db.session.execute(
        text(
            "UPDATE employee_attendance "
            "SET is_active = FALSE, deleted_at = :now, updated_at = :now, synced_at = NULL "
            "WHERE attendance_id = :aid AND client_id = :cid"
        ),
        {'now': _now_iso(), 'aid': attendance_id, 'cid': client_id}
    )
    db.session.commit()
    return jsonify({'success': True, 'message': 'Attendance record deleted'}), 200


# ── Salary Cycles ─────────────────────────────────────────────────────────────

@employees_bp.route('/<employee_id>/cycles', methods=['GET'])
@authenticate
@require_permission('view_salary')
def list_cycles(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    rows = db.session.execute(
        text(
            "SELECT * FROM salary_cycles "
            "WHERE employee_id = :eid AND client_id = :cid "
            "ORDER BY start_date DESC"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchall()
    return jsonify({'success': True, 'data': [_row_to_dict(r) for r in rows]}), 200


@employees_bp.route('/<employee_id>/cycles', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def create_cycle(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    body = request.get_json(silent=True) or {}

    start_date = _parse_date(body.get('start_date'))
    end_date = _parse_date(body.get('end_date'))
    if not start_date or not end_date:
        return jsonify({'success': False, 'error': 'start_date and end_date are required (YYYY-MM-DD)'}), 400
    if end_date < start_date:
        return jsonify({'success': False, 'error': 'end_date must be >= start_date'}), 400

    full_day_mins = int(body.get('full_day_mins') or 480)
    if full_day_mins <= 0:
        return jsonify({'success': False, 'error': 'full_day_mins must be positive'}), 400

    # Reject overlapping cycle for this employee (UNIQUE on employee_id, start_date, but also check full overlap)
    overlap = db.session.execute(
        text(
            "SELECT cycle_id FROM salary_cycles "
            "WHERE employee_id = :eid "
            "  AND NOT (end_date < :start OR start_date > :end) "
            "LIMIT 1"
        ),
        {'eid': employee_id, 'start': str(start_date), 'end': str(end_date)}
    ).fetchone()
    if overlap:
        return jsonify({
            'success': False,
            'error': 'A salary cycle already exists that overlaps with the requested date range.',
            'conflicting_cycle_id': overlap._mapping['cycle_id'],
        }), 409

    cycle_id = str(uuid.uuid4())
    now = _now_iso()

    db.session.execute(
        text(
            "INSERT INTO salary_cycles "
            "(cycle_id, employee_id, client_id, start_date, end_date, status, "
            " gross_salary, total_advances, net_salary, "
            " rate_snapshot, pay_type_snap, full_day_mins, created_at, updated_at) "
            "VALUES (:cid, :eid, :client, :start, :end, 'open', "
            "        0, 0, 0, "
            "        :rate, :pay_type, :fdm, :now, :now)"
        ),
        {
            'cid': cycle_id,
            'eid': employee_id,
            'client': client_id,
            'start': str(start_date),
            'end': str(end_date),
            'rate': float(emp['rate']),
            'pay_type': emp['pay_type'],
            'fdm': full_day_mins,
            'now': now,
        }
    )
    db.session.commit()

    cycle = _get_cycle(cycle_id, employee_id, client_id)
    return jsonify({'success': True, 'data': cycle, 'message': 'Salary cycle created'}), 201


@employees_bp.route('/<employee_id>/cycles/<cycle_id>', methods=['GET'])
@authenticate
@require_permission('view_salary')
def get_cycle_detail(employee_id, cycle_id):
    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404

    # Build per-day breakdown and advances list
    _, _, _, daily_breakdown, ot_summary = _calculate_cycle_amounts(cycle)

    advances = db.session.execute(
        text(
            "SELECT * FROM salary_advances "
            "WHERE cycle_id = :cid ORDER BY advance_date"
        ),
        {'cid': cycle_id}
    ).fetchall()

    data = dict(cycle)
    data['daily_breakdown'] = daily_breakdown
    data['advances'] = [_row_to_dict(a) for a in advances]
    data['ot_summary'] = ot_summary
    return jsonify({'success': True, 'data': data}), 200


_ALLOWED_CYCLE_EDIT_FIELDS = {'start_date', 'end_date', 'full_day_mins'}


@employees_bp.route('/<employee_id>/cycles/<cycle_id>', methods=['PUT'])
@authenticate
@require_permission('manage_salary_cycles')
def edit_cycle(employee_id, cycle_id):
    """
    Edit an OPEN salary cycle's dates or full_day_mins.
    Refuses to touch paid cycles — those are closed financial records.

    Body: any subset of { start_date, end_date, full_day_mins }
    """
    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404
    if cycle.get('status') != 'open':
        return jsonify({
            'success': False,
            'error': 'Only open cycles can be edited. Paid cycles are closed financial records.'
        }), 409

    body = request.get_json(silent=True) or {}
    updates: dict = {}

    if 'start_date' in body:
        parsed = _parse_date(body['start_date'])
        if not parsed:
            return jsonify({'success': False, 'error': 'Invalid start_date'}), 400
        updates['start_date'] = str(parsed)
    if 'end_date' in body:
        parsed = _parse_date(body['end_date'])
        if not parsed:
            return jsonify({'success': False, 'error': 'Invalid end_date'}), 400
        updates['end_date'] = str(parsed)
    if 'full_day_mins' in body:
        try:
            mins = int(body['full_day_mins'])
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'full_day_mins must be an integer'}), 400
        if mins < 60 or mins > 1440:
            return jsonify({'success': False, 'error': 'full_day_mins must be between 60 and 1440'}), 400
        updates['full_day_mins'] = mins

    if not updates:
        return jsonify({'success': False, 'error': 'No editable fields supplied'}), 400

    # Validate date ordering when both are (or will be) set
    new_start = updates.get('start_date', str(cycle['start_date']))
    new_end = updates.get('end_date', str(cycle['end_date']))
    if new_start > new_end:
        return jsonify({'success': False, 'error': 'start_date must be on or before end_date'}), 400

    # Filter through allowlist, then build parameterised SET clause.
    safe_updates = {k: v for k, v in updates.items() if k in _ALLOWED_CYCLE_EDIT_FIELDS}
    set_clause = ', '.join(f"{k} = :{k}" for k in safe_updates)
    params = {**safe_updates, 'cid': cycle_id, 'eid': employee_id, 'client_id': client_id, 'now': _now_iso()}
    db.session.execute(
        text(
            f"UPDATE salary_cycles SET {set_clause}, updated_at = :now, synced_at = NULL "
            "WHERE cycle_id = :cid AND employee_id = :eid AND client_id = :client_id "
            "  AND status = 'open'"
        ),
        params
    )
    db.session.commit()

    updated = _get_cycle(cycle_id, employee_id, client_id)
    return jsonify({'success': True, 'data': updated, 'message': 'Cycle updated'}), 200


@employees_bp.route('/<employee_id>/cycles/<cycle_id>/calculate', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def calculate_cycle(employee_id, cycle_id):
    client_id = g.user['client_id']
    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404

    if cycle['status'] != 'open':
        return jsonify({'success': False, 'error': 'Only open cycles can be recalculated'}), 400

    gross, total_advances, net, daily_breakdown, ot_summary = _calculate_cycle_amounts(cycle)

    db.session.execute(
        text(
            "UPDATE salary_cycles "
            "SET gross_salary = :gross, total_advances = :adv, net_salary = :net, "
            "    updated_at = :now, synced_at = NULL "
            "WHERE cycle_id = :cid"
        ),
        {
            'gross': gross,
            'adv': total_advances,
            'net': net,
            'now': _now_iso(),
            'cid': cycle_id,
        }
    )
    db.session.commit()

    cycle = _get_cycle(cycle_id, employee_id, client_id)
    return jsonify({
        'success': True,
        'data': {
            'cycle': cycle,
            'daily_breakdown': daily_breakdown,
            'ot_summary': ot_summary,
        },
        'message': 'Cycle recalculated',
    }), 200


@employees_bp.route('/<employee_id>/cycles/<cycle_id>/mark-paid', methods=['POST'])
@authenticate
@require_permission('mark_salary_paid')
def mark_cycle_paid(employee_id, cycle_id):
    client_id = g.user['client_id']
    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404

    body = request.get_json(silent=True) or {}
    now = _now_iso()

    # Recalculate one final time before sealing
    gross, total_advances, net, _, _ot = _calculate_cycle_amounts(cycle)

    # Use rowcount guard — only update if status is still 'open'
    result = db.session.execute(
        text(
            "UPDATE salary_cycles "
            "SET status = 'paid', gross_salary = :gross, total_advances = :adv, "
            "    net_salary = :net, paid_at = :paid_at, paid_by = :paid_by, "
            "    payment_note = :note, updated_at = :now, synced_at = NULL "
            "WHERE cycle_id = :cid AND status = 'open'"
        ),
        {
            'gross': gross,
            'adv': total_advances,
            'net': net,
            'paid_at': now,
            'paid_by': g.user['user_id'],
            'note': (body.get('payment_note') or '').strip() or None,
            'now': now,
            'cid': cycle_id,
        }
    )
    db.session.commit()

    if result.rowcount == 0:
        return jsonify({'success': False, 'error': 'Cycle is already paid or was modified concurrently.'}), 409

    # Suggest next cycle start_date = end_date + 1 day
    from datetime import timedelta
    end_dt = _parse_date(str(cycle['end_date']))
    next_start = str(end_dt + timedelta(days=1)) if end_dt else None

    updated_cycle = _get_cycle(cycle_id, employee_id, client_id)
    return jsonify({
        'success': True,
        'data': updated_cycle,
        'next_cycle_start_date': next_start,
        'message': 'Salary cycle marked as paid',
    }), 200


@employees_bp.route('/payroll-timeseries', methods=['GET'])
@authenticate
@require_permission('view_salary')
def payroll_timeseries():
    """
    Monthly payroll activity for the dashboard's trend chart.

    Aggregates THREE signals, all scoped to the last N months (default 6):
      - gross_earned:   what employees earned based on attendance (cost signal)
      - advances_paid:  sum of salary_advances.amount by advance_date
      - net_paid:       sum of MAX(net_salary, 0) from paid cycles (final settlement)
      - cash_out:       advances_paid + net_paid (total money disbursed to employees)

    Gross is computed directly from attendance rows (not from cycles), so it
    reflects true payroll cost even for months where no cycle has been closed.
    Uses the same per-row branch logic as _calculate_cycle_amounts:
      paid_leave/holiday/weekly_off → full day pay
      absent/unpaid_leave           → 0
      present                       → prorated from minutes

    Response: { data: [ { month, label, gross_earned, advances_paid, net_paid, cash_out, cycles_paid } ] }
    """
    client_id = g.user['client_id']
    try:
        months = max(1, min(24, int(request.args.get('months', 6))))
    except (TypeError, ValueError):
        months = 6

    today = date.today()
    year, month = today.year, today.month - (months - 1)
    while month <= 0:
        month += 12
        year -= 1
    from_date = date(year, month, 1)

    dialect = db.engine.dialect.name
    # Dialect-specific month-key expressions (work_date is DATE, paid_at is TIMESTAMP)
    if dialect == 'postgresql':
        month_expr_attend = "TO_CHAR(ea.work_date, 'YYYY-MM')"
        month_expr_paid = "TO_CHAR(paid_at, 'YYYY-MM')"
        month_expr_adv = "TO_CHAR(advance_date, 'YYYY-MM')"
    else:
        month_expr_attend = "strftime('%Y-%m', ea.work_date)"
        month_expr_paid = "strftime('%Y-%m', paid_at)"
        month_expr_adv = "strftime('%Y-%m', advance_date)"

    # SQLite uses scalar MAX(a,b)/MIN(a,b); PostgreSQL needs GREATEST/LEAST
    greatest = 'GREATEST' if dialect == 'postgresql' else 'MAX'
    least = 'LEAST' if dialect == 'postgresql' else 'MIN'

    # Query 1: GROSS EARNED from attendance, joined to employees for rate/pay_type.
    # Mirrors _calculate_cycle_amounts per-row logic — any drift here should be
    # fixed in both places together.
    attend_rows = db.session.execute(
        text(
            f"SELECT {month_expr_attend} AS month_key, "
            "  COALESCE(SUM( "
            "    CASE "
            "      WHEN ea.status IN ('paid_leave', 'holiday', 'weekly_off') THEN "
            "        CASE WHEN e.pay_type = 'daily' THEN CAST(e.rate AS FLOAT) "
            "             ELSE 8.0 * CAST(e.rate AS FLOAT) END "
            "      WHEN ea.status IN ('absent', 'unpaid_leave') THEN 0 "
            "      ELSE "
            "        CASE WHEN e.pay_type = 'daily' THEN "
            f"               {least}(COALESCE(ea.total_minutes, 0) / 480.0, 1.0) * CAST(e.rate AS FLOAT) "
            "             ELSE "
            "               COALESCE(ea.total_minutes, 0) / 60.0 * CAST(e.rate AS FLOAT) "
            "        END "
            "    END "
            "  ), 0) AS gross_earned "
            "FROM employee_attendance ea "
            "JOIN employees e ON e.employee_id = ea.employee_id "
            "                AND e.client_id = ea.client_id "
            "WHERE ea.client_id = :cid "
            "  AND ea.is_active = TRUE "
            "  AND ea.work_date >= :from_d "
            "  AND (ea.total_minutes IS NOT NULL OR ea.status != 'present') "
            f"GROUP BY {month_expr_attend}"
        ),
        {'cid': client_id, 'from_d': str(from_date)}
    ).fetchall()

    # Query 2: NET PAID from paid cycles (positive contributions only)
    paid_rows = db.session.execute(
        text(
            f"SELECT {month_expr_paid} AS month_key, "
            f"  COALESCE(SUM({greatest}(net_salary, 0)), 0) AS net_paid, "
            "  COUNT(*) AS cycles_paid "
            "FROM salary_cycles "
            "WHERE client_id = :cid AND status = 'paid' "
            "  AND paid_at >= :from_d "
            f"GROUP BY {month_expr_paid}"
        ),
        {'cid': client_id, 'from_d': str(from_date)}
    ).fetchall()

    # Query 3: ADVANCES paid — money disbursed mid-cycle, dated by advance_date
    adv_rows = db.session.execute(
        text(
            f"SELECT {month_expr_adv} AS month_key, "
            "  COALESCE(SUM(amount), 0) AS advances_paid "
            "FROM salary_advances "
            "WHERE client_id = :cid "
            "  AND advance_date >= :from_d "
            f"GROUP BY {month_expr_adv}"
        ),
        {'cid': client_id, 'from_d': str(from_date)}
    ).fetchall()

    # Merge by month_key
    attend_by_key = {r[0]: float(r[1] or 0) for r in attend_rows}
    paid_by_key = {r[0]: {'net_paid': float(r[1] or 0), 'cycles_paid': int(r[2] or 0)} for r in paid_rows}
    adv_by_key = {r[0]: float(r[1] or 0) for r in adv_rows}

    MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    series = []
    y, m = year, month
    for _ in range(months):
        key = f"{y:04d}-{m:02d}"
        gross = attend_by_key.get(key, 0.0)
        paid_entry = paid_by_key.get(key, {'net_paid': 0.0, 'cycles_paid': 0})
        advances = adv_by_key.get(key, 0.0)
        cash_out = paid_entry['net_paid'] + advances
        series.append({
            'month': key,
            'label': f"{MONTH_ABBREV[m - 1]} {y}",
            'gross_earned': round(gross, 2),
            'advances_paid': round(advances, 2),
            'net_paid': round(paid_entry['net_paid'], 2),
            'cash_out': round(cash_out, 2),
            'cycles_paid': paid_entry['cycles_paid'],
            # Back-compat — keep the old keys so the frontend transition is graceful
            'gross': round(gross, 2),
            'paid': round(cash_out, 2),
        })
        m += 1
        if m > 12:
            m = 1
            y += 1

    return jsonify({'success': True, 'data': series}), 200


@employees_bp.route('/summary', methods=['GET'])
@authenticate
@require_permission('view_salary')
def payroll_summary():
    """
    Aggregate payroll snapshot for the dashboard and reports.

    Optional query params:
      from=YYYY-MM-DD  — defaults to first day of current month
      to=YYYY-MM-DD    — defaults to today

    Returns a single JSON blob with all the numbers both the Dashboard and
    Reports pages need — one round-trip instead of three separate endpoints.
    """
    client_id = g.user['client_id']

    today = date.today()
    from_date = _parse_date(request.args.get('from')) or date(today.year, today.month, 1)
    to_date = _parse_date(request.args.get('to')) or today

    # SQLite uses scalar MAX(a,b); PostgreSQL needs GREATEST(a,b)
    greatest = 'GREATEST' if db.engine.dialect.name == 'postgresql' else 'MAX'

    # Single-query aggregate. Per-field design notes:
    #  - `paid_in_period` uses GREATEST(net_salary, 0) PER ROW so negative-net
    #    cycles (edge case: advances > gross) don't subtract from the total.
    #    A cycle where the employee owes money back still "paid" ₹0, not ₹-200.
    #  - `gross_in_period` captures the total earned (always ≥ 0) — used by the
    #    Payroll Trend chart as the stable primary metric.
    result = db.session.execute(
        text(
            "SELECT "
            "  (SELECT COUNT(*) FROM employees "
            "    WHERE client_id = :cid AND is_active = TRUE) AS active_employees, "
            "  (SELECT COUNT(*) FROM salary_cycles "
            "    WHERE client_id = :cid AND status = 'open') AS open_cycles, "
            f"  (SELECT COALESCE(SUM({greatest}(net_salary, 0)), 0) FROM salary_cycles "
            "    WHERE client_id = :cid AND status = 'paid' "
            "      AND paid_at BETWEEN :from_d AND :to_d_end) AS paid_in_period, "
            "  (SELECT COALESCE(SUM(gross_salary), 0) FROM salary_cycles "
            "    WHERE client_id = :cid AND status = 'paid' "
            "      AND paid_at BETWEEN :from_d AND :to_d_end) AS gross_in_period, "
            "  (SELECT COALESCE(SUM(gross_salary), 0) FROM salary_cycles "
            "    WHERE client_id = :cid AND status = 'paid') AS paid_all_time, "
            "  (SELECT COALESCE(SUM(sa.amount), 0) "
            "    FROM salary_advances sa "
            "    JOIN salary_cycles sc ON sc.cycle_id = sa.cycle_id "
            "    WHERE sa.client_id = :cid AND sc.status = 'open') AS pending_advances, "
            # Advances DATED in the period — used for P&L expense tracking in reports.
            # Different from pending_advances (all-time open-cycle) and works
            # correctly when a cycle started in a prior period.
            "  (SELECT COALESCE(SUM(amount), 0) "
            "    FROM salary_advances "
            "    WHERE client_id = :cid "
            "      AND advance_date BETWEEN :from_d AND :to_d) AS advances_paid_in_period, "
            "  (SELECT COUNT(*) FROM employee_attendance "
            "    WHERE client_id = :cid "
            "      AND is_active = TRUE "
            "      AND status IN ('paid_leave', 'unpaid_leave', 'holiday', 'weekly_off') "
            "      AND work_date BETWEEN :from_d AND :to_d) AS leave_days_period, "
            "  (SELECT COUNT(*) FROM employee_attendance "
            "    WHERE client_id = :cid "
            "      AND is_active = TRUE "
            "      AND status = 'absent' "
            "      AND work_date BETWEEN :from_d AND :to_d) AS absent_days_period "
        ),
        {
            'cid': client_id,
            'from_d': str(from_date),
            'to_d': str(to_date),
            # paid_at is a timestamp, so extend `to_date` to end-of-day for inclusive range
            'to_d_end': f"{to_date} 23:59:59",
        }
    ).fetchone()

    r = _row_to_dict(result)

    paid = float(r['paid_in_period'] or 0)
    advances_in_period = float(r['advances_paid_in_period'] or 0)
    # Total payroll expense for P&L: cash that actually left the business for
    # employee payments during this period (closed-cycle net + dated advances).
    total_payroll_expense = paid + advances_in_period

    return jsonify({
        'success': True,
        'data': {
            'active_employees': int(r['active_employees'] or 0),
            'open_cycles': int(r['open_cycles'] or 0),
            'paid_in_period': paid,
            'gross_in_period': float(r['gross_in_period'] or 0),
            'paid_all_time': float(r['paid_all_time'] or 0),
            'pending_advances': float(r['pending_advances'] or 0),
            'advances_paid_in_period': advances_in_period,
            'total_payroll_expense': round(total_payroll_expense, 2),
            'leave_days_period': int(r['leave_days_period'] or 0),
            'absent_days_period': int(r['absent_days_period'] or 0),
            'period': {'from': str(from_date), 'to': str(to_date)},
        }
    }), 200


# ── Advances ──────────────────────────────────────────────────────────────────

@employees_bp.route('/<employee_id>/advances', methods=['POST'])
@authenticate
@require_permission('record_advance')
def record_advance(employee_id):
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    body = request.get_json(silent=True) or {}

    cycle_id = (body.get('cycle_id') or '').strip()
    if not cycle_id:
        return jsonify({'success': False, 'error': 'cycle_id is required'}), 400

    # Validate cycle exists and belongs to this employee/client
    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404

    if cycle['status'] == 'paid':
        return jsonify({'success': False, 'error': 'Cannot add advances to a paid cycle'}), 409

    amount = body.get('amount')
    try:
        amount = float(amount)
        if amount <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'amount must be a positive number'}), 400

    advance_date = _parse_date(body.get('advance_date'))
    if not advance_date:
        advance_date = date.today()

    advance_id = str(uuid.uuid4())
    now = _now_iso()

    db.session.execute(
        text(
            "INSERT INTO salary_advances "
            "(advance_id, employee_id, client_id, cycle_id, amount, "
            " advance_date, notes, recorded_by, created_at, updated_at) "
            "VALUES (:aid, :eid, :cid, :cycle, :amount, "
            "        :adv_date, :notes, :recorded_by, :now, :now)"
        ),
        {
            'aid': advance_id,
            'eid': employee_id,
            'cid': client_id,
            'cycle': cycle_id,
            'amount': amount,
            'adv_date': str(advance_date),
            'notes': (body.get('notes') or '').strip() or None,
            'recorded_by': g.user['user_id'],
            'now': now,
        }
    )

    # Keep cycle totals fresh
    gross, total_advances, net, _, _ot = _calculate_cycle_amounts(cycle)
    db.session.execute(
        text(
            "UPDATE salary_cycles "
            "SET gross_salary = :gross, total_advances = :adv, net_salary = :net, "
            "    updated_at = :now, synced_at = NULL "
            "WHERE cycle_id = :cid"
        ),
        {'gross': gross, 'adv': total_advances, 'net': net, 'now': now, 'cid': cycle_id}
    )

    db.session.commit()

    row = db.session.execute(
        text("SELECT * FROM salary_advances WHERE advance_id = :aid"),
        {'aid': advance_id}
    ).fetchone()
    return jsonify({'success': True, 'data': _row_to_dict(row), 'message': 'Advance recorded'}), 201


# ── Employee History ───────────────────────────────────────────────────────────

@employees_bp.route('/<employee_id>/history', methods=['GET'])
@authenticate
@require_permission('view_employees')
def employee_history(employee_id):
    """
    Full employment history for one employee:
    - Employee profile
    - All salary cycles (oldest first) with per-cycle advances and daily breakdown
    - Attendance summary totals (total days worked, total hours)
    - Aggregate: total_earned, total_advances_taken, total_net_paid
    """
    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    # All cycles, oldest first
    cycle_rows = db.session.execute(
        text(
            "SELECT * FROM salary_cycles "
            "WHERE employee_id = :eid AND client_id = :client "
            "ORDER BY start_date ASC"
        ),
        {'eid': employee_id, 'client': client_id}
    ).fetchall()

    cycles_out = []
    total_earned = 0.0
    total_advances_taken = 0.0
    total_net_paid = 0.0

    for cr in cycle_rows:
        cycle = _row_to_dict(cr)
        gross, adv_sum, net, breakdown, _ot = _calculate_cycle_amounts(cycle)

        # Advances for this cycle
        adv_rows = db.session.execute(
            text(
                "SELECT advance_id, amount, advance_date, notes "
                "FROM salary_advances WHERE cycle_id = :cid ORDER BY advance_date"
            ),
            {'cid': cycle['cycle_id']}
        ).fetchall()
        advances = [_row_to_dict(a) for a in adv_rows]

        cycles_out.append({
            **cycle,
            'gross_salary': gross,
            'total_advances': adv_sum,
            'net_salary': net,
            'daily_breakdown': breakdown,
            'advances': advances,
        })

        if cycle['status'] == 'paid':
            total_earned += gross
            total_advances_taken += adv_sum
            total_net_paid += net

    # Attendance totals
    att_totals = db.session.execute(
        text(
            "SELECT COUNT(DISTINCT work_date) AS total_days, "
            "       COALESCE(SUM(total_minutes), 0) AS total_minutes "
            "FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :client "
            "  AND is_active = TRUE "
            "  AND total_minutes IS NOT NULL"
        ),
        {'eid': employee_id, 'client': client_id}
    ).fetchone()

    att = _row_to_dict(att_totals) if att_totals else {'total_days': 0, 'total_minutes': 0}

    return jsonify({
        'success': True,
        'data': {
            'employee': emp,
            'cycles': cycles_out,
            'attendance_summary': {
                'total_days_worked': int(att.get('total_days') or 0),
                'total_minutes_worked': int(att.get('total_minutes') or 0),
                'total_hours_worked': round(int(att.get('total_minutes') or 0) / 60.0, 1),
            },
            'totals': {
                'total_cycles': len(cycles_out),
                'paid_cycles': sum(1 for c in cycles_out if c['status'] == 'paid'),
                'open_cycles': sum(1 for c in cycles_out if c['status'] == 'open'),
                'total_earned': round(total_earned, 2),
                'total_advances_taken': round(total_advances_taken, 2),
                'total_net_paid': round(total_net_paid, 2),
            },
        },
    }), 200


# ── OT Approval ───────────────────────────────────────────────────────────────

@employees_bp.route('/<employee_id>/ot/pending', methods=['GET'])
@authenticate
@require_permission('view_salary')
def list_pending_ot(employee_id):
    """List attendance rows with auto_ot_minutes > 0 AND approved_ot_minutes IS NULL."""
    client_id = g.user['client_id']
    rows = db.session.execute(
        text(
            "SELECT * FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid "
            "  AND is_active = TRUE "
            "  AND auto_ot_minutes > 0 "
            "  AND approved_ot_minutes IS NULL "
            "ORDER BY work_date DESC"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchall()
    return jsonify({'success': True, 'data': [_row_to_dict(r) for r in rows]}), 200


@employees_bp.route('/attendance/<attendance_id>/approve-ot', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def approve_ot(attendance_id):
    """Manager approves (or rejects) OT for a specific attendance row.

    Body: { ot_minutes: <int> }  — 0 to reject, N to approve N minutes
                                    (typically equals or differs from auto_ot_minutes)
    """
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}
    ot_mins = body.get('ot_minutes')
    if ot_mins is None:
        return jsonify({'success': False, 'error': 'ot_minutes is required'}), 400
    try:
        ot_mins_int = int(ot_mins)
        if ot_mins_int < 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'ot_minutes must be a non-negative integer'}), 400

    row = db.session.execute(
        text(
            "SELECT * FROM employee_attendance "
            "WHERE attendance_id = :aid AND client_id = :cid "
            "  AND is_active = TRUE "
            "LIMIT 1"
        ),
        {'aid': attendance_id, 'cid': client_id}
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Attendance row not found'}), 404

    db.session.execute(
        text(
            "UPDATE employee_attendance SET "
            "  approved_ot_minutes = :ot, "
            "  updated_at = :now, synced_at = NULL "
            "WHERE attendance_id = :aid AND client_id = :cid"
        ),
        {'ot': ot_mins_int, 'now': _now_iso(), 'aid': attendance_id, 'cid': client_id}
    )
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'attendance_id': attendance_id, 'approved_ot_minutes': ot_mins_int},
    }), 200

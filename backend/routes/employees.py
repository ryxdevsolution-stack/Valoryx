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
    POST   /api/employees/attendance/bulk-checkin                  - check in many employees, one shared time
    POST   /api/employees/attendance/bulk-checkout                 - check out many employees, one shared time
    POST   /api/employees/<employee_id>/attendance/manual          - directly set hours worked for a date (or range via to_date)
    POST   /api/employees/attendance/bulk-manual                   - directly set hours for many employees over a date range
    GET    /api/employees/<employee_id>/attendance                 - daily grouped log (from/to)
    PUT    /api/employees/attendance/<attendance_id>               - edit punch times
    DELETE /api/employees/attendance/<attendance_id>               - delete punch
    POST   /api/employees/attendance/<attendance_id>/adjust-hours  - deduct forgotten unpaid break time
    GET    /api/employees/attendance/daily-summary                 - all employees for ?date=

  Salary Cycles:
    GET    /api/employees/<employee_id>/cycles                    - list cycles (newest first)
    POST   /api/employees/<employee_id>/cycles                    - create cycle
    GET    /api/employees/<employee_id>/cycles/<cycle_id>         - full detail + breakdown
    POST   /api/employees/<employee_id>/cycles/<cycle_id>/calculate    - recalculate
    POST   /api/employees/<employee_id>/cycles/<cycle_id>/mark-paid    - seal cycle
    GET    /api/employees/<employee_id>/cycles/<cycle_id>/payslip      - generate payslip PDF
    POST   /api/employees/<employee_id>/cycles/<cycle_id>/payslip/email - email that payslip to the employee
    POST   /api/employees/cycles/payslip/email-bulk                     - email payslips for many cycles at once
    GET    /api/employees/cycles/open                             - all open cycles for client

  Advances / Deductions:
    POST   /api/employees/<employee_id>/advances                  - record advance/deduction (cash_advance/accommodation/food/transport/other)
    DELETE /api/employees/advances/<advance_id>                   - delete advance/deduction
"""

import uuid
import re
import logging
from datetime import datetime, date, timedelta

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

    Every datetime stored in this app is naive UTC — every write path uses
    `_now_iso()` (`datetime.utcnow()`) or a `_parse_datetime()` result that has
    already had its offset/`Z` stripped. Sending that back as a bare
    "2026-07-28T05:30:00" is dangerously ambiguous: JavaScript's `new Date()`
    treats an offset-less datetime string as the BROWSER's local time, not
    UTC — so an IST browser silently misreads a UTC instant as if it were
    already IST, shifting every parsed timestamp by 5:30 (e.g. overstating a
    live "clocked in" elapsed timer by 5.5 hours). Appending 'Z' makes the
    UTC-ness explicit so `new Date()` parses it correctly everywhere at once;
    the frontend then renders it in Asia/Kolkata via explicit `timeZone`
    options, which is the only display timezone this app supports today.
    """
    from datetime import date, datetime as _dt
    d = dict(row._mapping)
    for k, v in list(d.items()):
        # Handle both date and datetime — keep date as 'YYYY-MM-DD',
        # datetime as 'YYYY-MM-DDTHH:MM:SSZ' (explicit UTC). UUID and other
        # types pass through unchanged (Flask's encoder handles them fine).
        if isinstance(v, _dt):
            d[k] = v.isoformat() + 'Z'
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


_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _validate_email(value: str | None) -> str | None:
    """Return the trimmed email, or None if blank. Raises ValueError on an
    obviously malformed address (basic shape check, not full RFC 5322)."""
    email = (value or '').strip()
    if not email:
        return None
    if not _EMAIL_RE.match(email):
        raise ValueError('Invalid email address')
    return email


def _fmt_display_date(value) -> str:
    """Format an ISO date ('2026-07-01') or datetime ('2026-07-28T09:12:49Z',
    '2026-08-03 18:08:36') as '01 Jul 2026' for payslip display.

    SQLite hands back paid_at space-separated rather than T-separated, which the
    previous 'T' in s test missed — it fell through to strptime('%Y-%m-%d'),
    raised, and printed the raw timestamp on the payslip.
    """
    if not value:
        return '—'
    s = str(value).rstrip('Z')
    try:
        dt = datetime.fromisoformat(s)
    except (ValueError, TypeError):
        try:
            dt = datetime.strptime(s[:10], '%Y-%m-%d')
        except (ValueError, TypeError):
            return str(value)
    return dt.strftime('%d %b %Y')


_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
         'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
         'Seventeen', 'Eighteen', 'Nineteen']
_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _fmt_amount_in_words(amount) -> str:
    """Whole-rupee amount spelled out using the Indian numbering system
    (Thousand / Lakh / Crore), e.g. 950000 -> 'Nine Lakh Fifty Thousand'.
    Paise are dropped — payslips round to the nearest rupee for this line."""
    n = int(round(float(amount or 0)))
    if n == 0:
        return 'Zero'
    # Net pay goes negative when advances exceed earnings. divmod on a negative
    # int wraps (−138 → "Nineteen Crore Ninety Nine Lakh..."), so strip the sign
    # first and say it in words instead.
    if n < 0:
        return f'Minus {_fmt_amount_in_words(-n)}'

    def _two_digit(x):
        if x < 20:
            return _ONES[x]
        return (_TENS[x // 10] + (f' {_ONES[x % 10]}' if x % 10 else '')).strip()

    def _three_digit(x):
        if x >= 100:
            rest = _two_digit(x % 100)
            return f'{_ONES[x // 100]} Hundred' + (f' {rest}' if rest else '')
        return _two_digit(x)

    parts = []
    crore, n = divmod(n, 1_00_00_000)
    lakh, n = divmod(n, 1_00_000)
    thousand, n = divmod(n, 1_000)
    hundred = n

    if crore:
        parts.append(f'{_two_digit(crore) if crore < 100 else _three_digit(crore)} Crore')
    if lakh:
        parts.append(f'{_two_digit(lakh)} Lakh')
    if thousand:
        parts.append(f'{_two_digit(thousand)} Thousand')
    if hundred:
        parts.append(_three_digit(hundred))

    return ' '.join(parts)


def _fmt_display_minutes(mins) -> str:
    """Format a minute count as 'Xh Ym' for payslip display, e.g. 90 -> '1h 30m'."""
    h, m = divmod(int(mins or 0), 60)
    if h == 0:
        return f'{m}m'
    if m == 0:
        return f'{h}h'
    return f'{h}h {m}m'


def _compute_total_minutes(check_in_dt: datetime, check_out_dt: datetime) -> int:
    """Return total elapsed minutes between two datetime objects (non-negative)."""
    delta = check_out_dt - check_in_dt
    return max(0, int(delta.total_seconds() // 60))


# Day-off status constants — shared between the mark_day_off endpoint and the
# salary calculator. Paid statuses count as one full day of pay; unpaid count as 0.
_DAY_OFF_PAID_STATUSES = {'paid_leave', 'holiday', 'weekly_off'}
_DAY_OFF_UNPAID_STATUSES = {'absent', 'unpaid_leave'}

# Statuses a manual/bulk hours entry must never overwrite. Each one is an
# explicit decision someone recorded about that day; silently turning it into a
# worked day corrupts both the attendance record and the salary calculation.
_PROTECTED_ATTENDANCE_STATUSES = _DAY_OFF_PAID_STATUSES | _DAY_OFF_UNPAID_STATUSES

# Human-readable labels for those statuses, used when reporting skipped days.
_STATUS_LABELS = {
    'paid_leave': 'paid leave',
    'unpaid_leave': 'unpaid leave',
    'holiday': 'a holiday',
    'weekly_off': 'a weekly off',
    'absent': 'absent',
}
_DAY_OFF_STATUSES = _DAY_OFF_PAID_STATUSES | _DAY_OFF_UNPAID_STATUSES

# Fixed deduction categories — covers cash advances plus the common in-kind
# deductions a shop makes for workers it houses/feeds/transports.
_DEDUCTION_CATEGORIES = {'cash_advance', 'accommodation', 'food', 'transport', 'other'}
CATEGORY_LABEL_MAP = {
    'cash_advance': 'Cash Advance',
    'accommodation': 'Accommodation',
    'food': 'Food',
    'transport': 'Transport',
    'other': 'Other',
}


def _weekly_off_rule(client_id: str) -> dict:
    """The client's recurring weekly-off rule, or a disabled rule.

    Returns {'enabled', 'weekday', 'saturdays'} where weekday follows Python's
    date.weekday() (Monday=0 … Sunday=6) and saturdays is a set of month
    ordinals ({2} = 2nd Saturday only).
    """
    off = {'enabled': False, 'weekday': None, 'saturdays': set()}
    try:
        row = db.session.execute(text(
            "SELECT weekly_off_enabled, weekly_off_weekday, weekly_off_saturdays "
            "FROM client_entry WHERE client_id = :cid LIMIT 1"), {'cid': client_id}).fetchone()
    except Exception:
        # Pre-v45 database (columns absent) — behave exactly as before.
        return off
    if not row:
        return off

    off['enabled'] = bool(row[0])
    if row[1] is not None:
        try:
            wd = int(row[1])
            if 0 <= wd <= 6:
                off['weekday'] = wd
        except (TypeError, ValueError):
            pass
    for part in str(row[2] or '').split(','):
        part = part.strip()
        if part.isdigit() and 1 <= int(part) <= 5:
            off['saturdays'].add(int(part))
    return off


def _is_weekly_off(day, rule: dict) -> bool:
    """True when `day` is covered by the recurring weekly-off rule.

    Saturday ordinal is computed from the day of the month rather than by
    counting backwards, so the "2nd Saturday" is the 2nd one in that calendar
    month regardless of which weekday the month starts on.
    """
    if not rule.get('enabled'):
        return False
    if rule.get('weekday') is not None and day.weekday() == rule['weekday']:
        return True
    if rule.get('saturdays') and day.weekday() == 5:
        return ((day.day - 1) // 7) + 1 in rule['saturdays']
    return False


def _advance_category_breakdown(advances: list) -> dict:
    """Sum a list of advance/deduction dicts by category, defaulting unset
    categories (pre-migration rows) to 'cash_advance'."""
    breakdown = {cat: 0.0 for cat in _DEDUCTION_CATEGORIES}
    for a in advances:
        cat = (a.get('category') or 'cash_advance')
        if cat not in breakdown:
            cat = 'other'
        breakdown[cat] += float(a.get('amount') or 0)
    return {k: round(v, 2) for k, v in breakdown.items()}


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

    # Per-row clamp so a punch's own deduction_minutes never drives it negative
    # (e.g. a forgotten 1h lunch break subtracted from a 9h punch → 8h; an
    # over-entered deduction floors at 0 rather than crediting other rows).
    greatest = 'GREATEST' if db.engine.dialect.name == 'postgresql' else 'MAX'
    rows = db.session.execute(
        text(
            # MAX(status) picks any non-'present' label when both exist (shouldn't
            # happen since mark_day_off rejects mixed dates, but defensive anyway).
            # Filter: include completed punches OR any day-off row; skip
            # incomplete open check-ins (status='present' AND total_minutes IS NULL).
            # SUM(approved_ot_minutes) — NULL values are excluded by SUM; a day
            # with no approved OT rows contributes 0 via COALESCE.
            "SELECT work_date, "
            f"       SUM({greatest}(COALESCE(total_minutes, 0) - COALESCE(deduction_minutes, 0), 0)) AS day_minutes, "
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

    # Recurring weekly off (v45). Pay comes only from attendance rows, so a date
    # with no row pays zero — the rule therefore SYNTHESISES a paid 'weekly_off'
    # day for uncovered dates it applies to. A real row always wins, which is
    # what makes "he actually worked that Sunday" just work.
    #
    # Never applied to a cycle that has already been paid: those figures were
    # frozen at payment, and re-rendering an old payslip must not restate them.
    day_rows = [_row_to_dict(r) for r in rows]
    if (cycle.get('status') or '').lower() != 'paid':
        rule = _weekly_off_rule(cycle['client_id'])
        if rule['enabled']:
            covered = {str(r['work_date']) for r in day_rows}
            # start/end come back as date objects on Postgres and strings on
            # SQLite, so normalise both before iterating.
            start = cycle['start_date'] if isinstance(cycle['start_date'], date) \
                else _parse_date(str(cycle['start_date']))
            end = cycle['end_date'] if isinstance(cycle['end_date'], date) \
                else _parse_date(str(cycle['end_date']))
            if start and end and end >= start:
                for offset in range((end - start).days + 1):
                    day = start + timedelta(days=offset)
                    if str(day) in covered or not _is_weekly_off(day, rule):
                        continue
                    day_rows.append({
                        'work_date': str(day),
                        'day_minutes': 0,
                        'day_status': 'weekly_off',
                        'day_ot_minutes': 0,
                    })
                day_rows.sort(key=lambda r: str(r['work_date']))

    for row in day_rows:
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

    try:
        email = _validate_email(body.get('email'))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid email address'}), 400

    employee_id = str(uuid.uuid4())
    now = _now_iso()

    db.session.execute(
        text(
            "INSERT INTO employees "
            "(employee_id, client_id, branch_id, name, phone, email, pay_type, rate, "
            " ot_multiplier, is_active, created_by, created_at, updated_at) "
            "VALUES (:eid, :cid, :bid, :name, :phone, :email, :pay_type, :rate, "
            "        :ot_multiplier, TRUE, :created_by, :now, :now)"
        ),
        {
            'eid': employee_id,
            'cid': client_id,
            'bid': body.get('branch_id') or None,
            'name': name,
            'phone': (body.get('phone') or '').strip() or None,
            'email': email,
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

    if 'email' in body:
        try:
            updates['email'] = _validate_email(body['email'])
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid email address'}), 400

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

    _ALLOWED_EMPLOYEE_FIELDS = {'name', 'phone', 'email', 'branch_id', 'pay_type', 'rate', 'ot_multiplier'}
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


def _bulk_checkin_one(employee_id: str, client_id: str, check_in_dt: datetime, notes: str | None) -> dict:
    """Check in a single employee as part of a bulk batch. Returns
    {employee_id, success, error?, data?} — never raises, so one bad
    employee doesn't abort the rest of the batch."""
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return {'employee_id': employee_id, 'success': False, 'error': 'Employee not found'}

    work_date = check_in_dt.date()
    cycle = _find_covering_cycle(employee_id, client_id, work_date)
    if not cycle:
        return {'employee_id': employee_id, 'success': False, 'error': f'No salary cycle covers {work_date}'}
    if cycle.get('status') != 'open':
        return {'employee_id': employee_id, 'success': False, 'error': f'Salary cycle for {work_date} is sealed'}

    open_punch = db.session.execute(
        text(
            "SELECT attendance_id FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid AND check_out IS NULL "
            "  AND is_active = TRUE LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchone()
    if open_punch:
        return {'employee_id': employee_id, 'success': False, 'error': 'Already checked in'}

    attendance_id = str(uuid.uuid4())
    now = _now_iso()
    db.session.execute(
        text(
            "INSERT INTO employee_attendance "
            "(attendance_id, employee_id, client_id, work_date, check_in, "
            " check_out, total_minutes, marked_by, notes, created_at, updated_at) "
            "VALUES (:aid, :eid, :cid, :wd, :ci, NULL, NULL, :marked_by, :notes, :now, :now)"
        ),
        {
            'aid': attendance_id, 'eid': employee_id, 'cid': client_id,
            'wd': str(work_date), 'ci': check_in_dt.strftime('%Y-%m-%d %H:%M:%S'),
            'marked_by': g.user['user_id'], 'notes': notes, 'now': now,
        }
    )
    return {'employee_id': employee_id, 'success': True, 'name': emp['name']}


@employees_bp.route('/attendance/bulk-checkin', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def bulk_checkin():
    """Check in many employees at once with one shared timestamp — for a
    supervisor marking a whole shift on one shared device, rather than each
    of 100+ employees using their own phone.

    Body: { employee_ids: [str, ...], check_in?: ISO datetime (default now), notes?: str }
    Response: { results: [{employee_id, success, error?, name?}], summary: {succeeded, failed} }
    One employee's failure (already checked in, no open cycle, etc.) never
    blocks the rest of the batch.
    """
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    employee_ids = body.get('employee_ids')
    if not isinstance(employee_ids, list) or not employee_ids:
        return jsonify({'success': False, 'error': 'employee_ids must be a non-empty array'}), 400

    check_in_str = body.get('check_in')
    check_in_dt = _parse_datetime(check_in_str) if check_in_str else datetime.utcnow()
    if not check_in_dt:
        return jsonify({'success': False, 'error': 'Invalid check_in datetime format'}), 400

    notes = (body.get('notes') or '').strip() or None

    results = [_bulk_checkin_one(eid, client_id, check_in_dt, notes) for eid in employee_ids]
    db.session.commit()

    succeeded = sum(1 for r in results if r['success'])
    return jsonify({
        'success': True,
        'data': {'results': results, 'summary': {'succeeded': succeeded, 'failed': len(results) - succeeded}},
        'message': f'Checked in {succeeded} of {len(results)} employees',
    }), 200


def _bulk_checkout_one(employee_id: str, client_id: str, check_out_dt: datetime) -> dict:
    """Check out a single employee as part of a bulk batch. Never raises."""
    open_punch_row = db.session.execute(
        text(
            "SELECT * FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid AND check_out IS NULL "
            "  AND is_active = TRUE ORDER BY check_in DESC LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id}
    ).fetchone()
    if not open_punch_row:
        return {'employee_id': employee_id, 'success': False, 'error': 'No open check-in found'}

    open_punch = _row_to_dict(open_punch_row)
    check_in_dt = _parse_datetime(str(open_punch['check_in']))
    if check_in_dt and check_out_dt <= check_in_dt:
        return {'employee_id': employee_id, 'success': False, 'error': 'check_out must be after check_in'}

    total_minutes = _compute_total_minutes(check_in_dt, check_out_dt) if check_in_dt else None

    work_date_for_calc = open_punch.get('work_date')
    if work_date_for_calc and not hasattr(work_date_for_calc, 'strftime'):
        work_date_for_calc = _parse_date(str(work_date_for_calc))
    full_day_mins_for_calc = 480
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
            "SET check_out = :co, total_minutes = :tm, auto_ot_minutes = :ot, "
            "    updated_at = :now, synced_at = NULL "
            "WHERE attendance_id = :aid AND client_id = :cid"
        ),
        {
            'co': check_out_dt.strftime('%Y-%m-%d %H:%M:%S'), 'tm': total_minutes,
            'ot': auto_ot, 'now': _now_iso(), 'aid': open_punch['attendance_id'], 'cid': client_id,
        }
    )
    return {'employee_id': employee_id, 'success': True}


@employees_bp.route('/attendance/bulk-checkout', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def bulk_checkout():
    """Check out many employees at once with one shared timestamp.

    Body: { employee_ids: [str, ...], check_out?: ISO datetime (default now) }
    Response: { results: [{employee_id, success, error?}], summary: {succeeded, failed} }
    """
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    employee_ids = body.get('employee_ids')
    if not isinstance(employee_ids, list) or not employee_ids:
        return jsonify({'success': False, 'error': 'employee_ids must be a non-empty array'}), 400

    check_out_str = body.get('check_out')
    check_out_dt = _parse_datetime(check_out_str) if check_out_str else datetime.utcnow()
    if not check_out_dt:
        return jsonify({'success': False, 'error': 'Invalid check_out datetime format'}), 400

    results = [_bulk_checkout_one(eid, client_id, check_out_dt) for eid in employee_ids]
    db.session.commit()

    succeeded = sum(1 for r in results if r['success'])
    return jsonify({
        'success': True,
        'data': {'results': results, 'summary': {'succeeded': succeeded, 'failed': len(results) - succeeded}},
        'message': f'Checked out {succeeded} of {len(results)} employees',
    }), 200


def _upsert_manual_hours(employee_id: str, client_id: str, work_date, total_minutes: int,
                         notes: str | None, protect_rule_days: bool = False) -> dict:
    """Upsert one manual-hours entry for one employee/date. Never raises —
    returns {employee_id, work_date, success, error?, code?, cycle_id?,
    attendance_id?} so callers (single or bulk) can report per-date results.

    `protect_rule_days` guards days that the recurring weekly-off rule covers but
    which have no attendance row of their own. Callers set it for MULTI-DAY
    ranges only: sweeping "01/07 → 31/07" must not quietly turn every Sunday
    into a worked day, but picking one date is a deliberate act ("he did work
    that Sunday") and is allowed to create the overriding row.
    """
    if work_date > date.today():
        return {'employee_id': employee_id, 'work_date': str(work_date), 'success': False,
                'error': 'Cannot enter hours for a future date'}

    cycle = _find_covering_cycle(employee_id, client_id, work_date)
    if not cycle:
        return {'employee_id': employee_id, 'work_date': str(work_date), 'success': False,
                'error': f'No salary cycle covers {work_date}', 'code': 'NO_CYCLE'}
    if cycle.get('status') != 'open':
        return {'employee_id': employee_id, 'work_date': str(work_date), 'success': False,
                'error': f'Salary cycle for {work_date} is sealed', 'code': 'CYCLE_SEALED',
                'cycle_id': cycle.get('cycle_id')}

    now_iso = _now_iso()
    existing = db.session.execute(
        text(
            "SELECT attendance_id, status FROM employee_attendance "
            "WHERE employee_id = :eid AND client_id = :cid AND work_date = :wd "
            "  AND is_active = TRUE LIMIT 1"
        ),
        {'eid': employee_id, 'cid': client_id, 'wd': str(work_date)}
    ).fetchone()

    # A day already marked as leave, holiday, weekly-off or absent is a
    # DELIBERATE record — never silently convert it to a worked day. The UPDATE
    # below forces status='present', so without this guard a bulk range over
    # "01/07 → 31/07" would wipe out every leave marked in that month and pay
    # the employee for days they did not work.
    if existing and (existing[1] or '').lower() in _PROTECTED_ATTENDANCE_STATUSES:
        return {'employee_id': employee_id, 'work_date': str(work_date), 'success': False,
                'skipped': True, 'code': 'DAY_OFF',
                'status': existing[1],
                'error': f'{work_date} is marked {_STATUS_LABELS.get(existing[1].lower(), existing[1])} — left unchanged'}

    # Same protection for a day that only the weekly-off rule makes a day off.
    # It has NO row, so the check above cannot see it — without this a bulk range
    # would happily insert a 'present' row over every Sunday, which is exactly
    # the corruption the guard above exists to prevent.
    if protect_rule_days and not existing and _is_weekly_off(work_date, _weekly_off_rule(client_id)):
        return {'employee_id': employee_id, 'work_date': str(work_date), 'success': False,
                'skipped': True, 'code': 'DAY_OFF',
                'status': 'weekly_off',
                'error': f'{work_date} is a weekly off — left unchanged'}

    if existing:
        attendance_id = existing[0]
        db.session.execute(
            text(
                "UPDATE employee_attendance "
                "SET total_minutes = :tm, status = 'present', reason = NULL, "
                "    is_manual_entry = TRUE, notes = :notes, "
                "    updated_at = :now, synced_at = NULL "
                "WHERE attendance_id = :aid"
            ),
            {'tm': total_minutes, 'notes': notes, 'now': now_iso, 'aid': attendance_id}
        )
    else:
        attendance_id = str(uuid.uuid4())
        dialect = db.engine.dialect.name
        check_in_val = None if dialect == 'postgresql' else f"{work_date} 00:00:00"
        db.session.execute(
            text(
                "INSERT INTO employee_attendance "
                "(attendance_id, employee_id, client_id, work_date, check_in, "
                " check_out, total_minutes, marked_by, notes, status, is_manual_entry, "
                " created_at, updated_at) "
                "VALUES (:aid, :eid, :cid, :wd, :ci, NULL, :tm, :marked_by, :notes, "
                "        'present', TRUE, :now, :now)"
            ),
            {
                'aid': attendance_id, 'eid': employee_id, 'cid': client_id, 'wd': str(work_date),
                'ci': check_in_val, 'tm': total_minutes, 'marked_by': g.user['user_id'],
                'notes': notes, 'now': now_iso,
            }
        )
    return {'employee_id': employee_id, 'work_date': str(work_date), 'success': True, 'attendance_id': attendance_id}


# Upper bound on a single manual-hours date range — generous (a full quarter)
# while still guarding against an accidental year-long range fat-fingered in.
_MAX_MANUAL_HOURS_RANGE_DAYS = 92


def _expand_date_range(from_d, to_d):
    """Inclusive list of dates from from_d to to_d. Caller has already
    validated from_d <= to_d and the range is within _MAX_MANUAL_HOURS_RANGE_DAYS."""
    from datetime import timedelta
    days = (to_d - from_d).days
    return [from_d + timedelta(days=i) for i in range(days + 1)]


@employees_bp.route('/<employee_id>/attendance/manual', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def manual_attendance(employee_id):
    """Directly set hours worked for one date (or a date range), for admins
    who don't know the employee's exact clock times — common on a
    100+-person shop floor, and handy for backfilling several missed days
    at once with the same hours. Upserts each employee_attendance row: creates
    it if none exists, otherwise overwrites its hours. No check_in/check_out
    pair is recorded — `is_manual_entry` flags the row so the UI can tell
    manual backfills apart from real punches.

    Body: { work_date: "YYYY-MM-DD", to_date?: "YYYY-MM-DD", hours: number, notes?: str }
    `to_date` is optional — omit it for a single day, or set it to apply the
    same `hours` to every day from work_date through to_date inclusive.
    """
    client_id = g.user['client_id']
    emp = _get_employee(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    body = request.get_json(silent=True) or {}

    from_d = _parse_date(body.get('work_date'))
    if not from_d:
        return jsonify({'success': False, 'error': 'work_date is required (YYYY-MM-DD)'}), 400
    to_d = _parse_date(body.get('to_date')) if body.get('to_date') else from_d
    if not to_d:
        return jsonify({'success': False, 'error': 'Invalid to_date format'}), 400
    if to_d < from_d:
        return jsonify({'success': False, 'error': 'to_date must be on or after work_date'}), 400
    if (to_d - from_d).days + 1 > _MAX_MANUAL_HOURS_RANGE_DAYS:
        return jsonify({'success': False, 'error': f'Date range cannot exceed {_MAX_MANUAL_HOURS_RANGE_DAYS} days'}), 400

    hours = body.get('hours')
    try:
        hours = float(hours)
        if hours < 0 or hours > 24:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'hours must be a number between 0 and 24'}), 400

    total_minutes = int(round(hours * 60))
    notes = (body.get('notes') or '').strip() or None

    dates = _expand_date_range(from_d, to_d)
    # Weekly-off days are protected only when this is a range sweep; a one-date
    # call is an explicit "he worked that day" and may override the rule.
    protect = len(dates) > 1
    results = [_upsert_manual_hours(employee_id, client_id, d, total_minutes, notes, protect)
               for d in dates]
    db.session.commit()

    # Single-day calls (the common case) keep their original response shape —
    # a single record, with the original NO_CYCLE/CYCLE_SEALED status codes —
    # so the existing frontend flow (and its cycle-creation prompt) keeps working.
    if len(results) == 1:
        r = results[0]
        if not r['success']:
            status = 409 if r.get('code') else 400
            error_body = {'success': False, 'error': r['error'], 'work_date': r['work_date']}
            if r.get('code'):
                error_body['code'] = r['code']
            if r.get('cycle_id'):
                error_body['cycle_id'] = r['cycle_id']
            return jsonify(error_body), status
        row = db.session.execute(
            text("SELECT * FROM employee_attendance WHERE attendance_id = :aid"),
            {'aid': r['attendance_id']}
        ).fetchone()
        return jsonify({'success': True, 'data': _row_to_dict(row), 'message': f'{hours}h recorded for {from_d}'}), 200

    succeeded = sum(1 for r in results if r['success'])
    # Days deliberately left alone (leave/holiday/absent) are reported apart
    # from real failures — they are the expected outcome, not an error.
    skipped = sum(1 for r in results if r.get('skipped'))
    failed = len(results) - succeeded - skipped
    message = f'{hours}h recorded for {succeeded} of {len(results)} days'
    if skipped:
        message += f' — {skipped} skipped (leave/absent)'
    return jsonify({
        'success': True,
        'data': {'results': results,
                 'summary': {'succeeded': succeeded, 'skipped': skipped, 'failed': failed}},
        'message': message,
    }), 200


@employees_bp.route('/attendance/bulk-manual', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def bulk_manual_attendance():
    """Directly set hours worked for many employees over a date range at
    once — e.g. backfill 10 missed days for one employee, or the same day
    for a whole shift of employees, in a single call.

    Body: { employee_ids: [str, ...], work_date: "YYYY-MM-DD", to_date?: "YYYY-MM-DD",
            hours: number, notes?: str }
    Response: { results: [{employee_id, work_date, success, error?}], summary }
    """
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    employee_ids = body.get('employee_ids')
    if not isinstance(employee_ids, list) or not employee_ids:
        return jsonify({'success': False, 'error': 'employee_ids must be a non-empty array'}), 400

    from_d = _parse_date(body.get('work_date'))
    if not from_d:
        return jsonify({'success': False, 'error': 'work_date is required (YYYY-MM-DD)'}), 400
    to_d = _parse_date(body.get('to_date')) if body.get('to_date') else from_d
    if not to_d:
        return jsonify({'success': False, 'error': 'Invalid to_date format'}), 400
    if to_d < from_d:
        return jsonify({'success': False, 'error': 'to_date must be on or after work_date'}), 400
    if (to_d - from_d).days + 1 > _MAX_MANUAL_HOURS_RANGE_DAYS:
        return jsonify({'success': False, 'error': f'Date range cannot exceed {_MAX_MANUAL_HOURS_RANGE_DAYS} days'}), 400

    hours = body.get('hours')
    try:
        hours = float(hours)
        if hours < 0 or hours > 24:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'hours must be a number between 0 and 24'}), 400

    total_minutes = int(round(hours * 60))
    notes = (body.get('notes') or '').strip() or None
    dates = _expand_date_range(from_d, to_d)

    results = []
    for employee_id in employee_ids:
        emp = _get_employee(employee_id, client_id)
        if not emp:
            for d in dates:
                results.append({'employee_id': employee_id, 'work_date': str(d), 'success': False, 'error': 'Employee not found'})
            continue
        for d in dates:
            results.append(_upsert_manual_hours(employee_id, client_id, d, total_minutes,
                                                notes, len(dates) > 1))

    db.session.commit()

    succeeded = sum(1 for r in results if r['success'])
    skipped = sum(1 for r in results if r.get('skipped'))
    failed = len(results) - succeeded - skipped
    message = f'{hours}h recorded for {succeeded} of {len(results)} employee-days'
    if skipped:
        message += f' — {skipped} skipped (leave/absent)'
    return jsonify({
        'success': True,
        'data': {'results': results,
                 'summary': {'succeeded': succeeded, 'skipped': skipped, 'failed': failed}},
        'message': message,
    }), 200


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

    # Recurring weekly off (v45). The rule creates no attendance rows — the
    # salary calculation synthesises them — so without this the calendar showed
    # nothing on a Sunday even though it was being paid as a full day. Same rule
    # and the same precedence: a real row always wins, so only dates with no row
    # of their own are filled in.
    rule = _weekly_off_rule(client_id)
    if rule['enabled']:
        for offset in range((to_date - from_date).days + 1):
            day = from_date + timedelta(days=offset)
            key = str(day)
            if key in grouped or not _is_weekly_off(day, rule):
                continue
            grouped[key] = {
                'work_date': key,
                'punches': [],
                'day_total_minutes': 0,
                'day_status': 'weekly_off',
                'day_reason': 'Weekly off',
                # Flags a day that exists only because of the rule: there is no
                # attendance row behind it, so it cannot be edited or deleted —
                # marking attendance on that date creates a real row instead.
                'is_rule_generated': True,
            }

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


@employees_bp.route('/attendance/<attendance_id>/adjust-hours', methods=['POST'])
@authenticate
@require_permission('mark_attendance')
def adjust_hours(attendance_id):
    """Deduct unpaid break time an employee forgot to clock out for, without
    destroying the original clocked total_minutes. E.g. a punch shows 9h
    worked but 1h was actually an unpaid lunch break — deduct 60 minutes with
    a note explaining why, and payroll pays 8h instead of 9h for that punch.

    Body: { deduction_minutes: int (0 to the punch's own total_minutes), notes: str (required) }
    Set deduction_minutes to 0 to clear a previously-entered deduction.
    """
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

    attendance = _row_to_dict(row)
    if attendance.get('total_minutes') is None:
        return jsonify({'success': False, 'error': 'Cannot deduct hours from a punch with no recorded duration yet (check out first)'}), 400

    body = request.get_json(silent=True) or {}

    deduction_minutes = body.get('deduction_minutes')
    try:
        deduction_minutes = int(deduction_minutes)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'deduction_minutes must be an integer'}), 400
    if deduction_minutes < 0 or deduction_minutes > int(attendance['total_minutes']):
        return jsonify({
            'success': False,
            'error': f'deduction_minutes must be between 0 and {attendance["total_minutes"]} (this punch\'s recorded duration)'
        }), 400

    notes = (body.get('notes') or '').strip()
    if deduction_minutes > 0 and not notes:
        return jsonify({'success': False, 'error': 'notes is required when deducting hours'}), 400

    db.session.execute(
        text(
            "UPDATE employee_attendance "
            "SET deduction_minutes = :dm, deduction_notes = :notes, "
            "    updated_at = :now, synced_at = NULL "
            "WHERE attendance_id = :aid AND client_id = :cid"
        ),
        {'dm': deduction_minutes, 'notes': notes or None, 'now': _now_iso(), 'aid': attendance_id, 'cid': client_id}
    )
    db.session.commit()

    updated = db.session.execute(
        text("SELECT * FROM employee_attendance WHERE attendance_id = :aid"),
        {'aid': attendance_id}
    ).fetchone()
    return jsonify({'success': True, 'data': _row_to_dict(updated), 'message': 'Hours adjusted'}), 200


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

    advances_out = [_row_to_dict(a) for a in advances]

    data = dict(cycle)
    data['daily_breakdown'] = daily_breakdown
    data['advances'] = advances_out
    data['ot_summary'] = ot_summary
    data['deductions_by_category'] = _advance_category_breakdown(advances_out)
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


def _build_payslip_pdf(emp: dict, cycle: dict, client):
    """Render a cycle's payslip and return (pdf_bytes, filename, summary).

    Shared by the download route and the email routes so a payslip that is
    mailed is byte-for-byte the one that would have been downloaded — two
    renderers would drift apart the first time either is edited.

    `summary` carries the few display strings the email body needs
    (period label, net pay, paid/open status) so callers don't recompute them.
    """
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable

    cycle_id = cycle['cycle_id']
    gross, total_advances, net, daily_breakdown, ot_summary = _calculate_cycle_amounts(cycle)

    advances = db.session.execute(
        text("SELECT * FROM salary_advances WHERE cycle_id = :cid ORDER BY advance_date"),
        {'cid': cycle_id}
    ).fetchall()
    advances_out = [_row_to_dict(a) for a in advances]
    deductions_by_category = _advance_category_breakdown(advances_out)

    currency_code = (client.currency_code if client and client.currency_code else 'INR')
    # Money words line: "Rupees ... only" reads naturally for INR; every other
    # currency gets its ISO code instead of an English noun we'd have to guess.
    currency_word = 'Rupees' if currency_code == 'INR' else currency_code
    days_present = sum(1 for d in daily_breakdown if d['status'] == 'present' and d['days_counted'] > 0)
    paid_off_days = sum(1 for d in daily_breakdown if d['status'] in _DAY_OFF_PAID_STATUSES)
    leaves_taken = sum(1 for d in daily_breakdown if d['status'] in _DAY_OFF_UNPAID_STATUSES)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=1.5 * cm, leftMargin=1.5 * cm, topMargin=1.4 * cm, bottomMargin=1.5 * cm,
    )
    elements = []
    styles = getSampleStyleSheet()

    # ── Palette ──────────────────────────────────────────────────────────────
    # Classic Indian payslip stationery: a plain black-ruled grid with a soft
    # green wash on the header/total bands. Everything on the page draws from
    # these five values so the document reads as one printed form.
    INK = colors.HexColor('#000000')       # body text, rules
    MUTED = colors.HexColor('#4b5563')     # footer / secondary notes
    GREEN = colors.HexColor('#d9ead3')     # header + totals band
    HIGHLIGHT = colors.HexColor('#ccff99')  # employee-name marker
    GRID = colors.HexColor('#7f7f7f')      # hairline cell rules
    CONTENT_W = 18 * cm

    # Explicit `leading` on every style — without it ReportLab inherits Normal's
    # leading (12, sized for 10pt), which opens an uneven gap between stacked
    # lines. leading ≈ 1.3× fontSize keeps each block evenly set.
    co_name_style = ParagraphStyle('CoName', parent=styles['Normal'], fontSize=15, leading=19,
                                   alignment=TA_CENTER, textColor=INK, fontName='Helvetica-Bold')
    co_sub_style = ParagraphStyle('CoSub', parent=styles['Normal'], fontSize=8, leading=11,
                                  alignment=TA_CENTER, textColor=INK, fontName='Times-Roman')
    title_style = ParagraphStyle('PayslipTitle', parent=styles['Normal'], fontSize=10.5, leading=14,
                                 alignment=TA_CENTER, textColor=INK, fontName='Helvetica-Bold')
    meta_style = ParagraphStyle('Meta', parent=styles['Normal'], fontSize=9, leading=13.5,
                                alignment=TA_LEFT, textColor=INK, fontName='Helvetica')
    unit_style = ParagraphStyle('Unit', parent=styles['Normal'], fontSize=8, leading=11,
                                alignment=TA_RIGHT, textColor=INK, fontName='Helvetica')

    # ── Masthead: company centred, logo parked on the right ──────────────────
    logo = None
    if client is not None:
        # Reuse the invoice PDF's hardened image loader — it refuses anything
        # that isn't a data: URI or an https URL on our own storage host, so
        # rendering a payslip can't be turned into server-side request forgery.
        try:
            from routes.payroll_invoice import _signature_flowable
            logo = _signature_flowable(client.logo_url, max_w_cm=2.6, max_h_cm=1.7)
        except Exception:
            logo = None

    co_block = [Paragraph(f"<u>{(client.client_name if client else 'Business') or 'Business'}</u>", co_name_style)]
    if client and client.gst_number:
        co_block.append(Paragraph(f"(GSTIN: {client.gst_number})", co_sub_style))

    masthead = Table(
        [['', co_block, logo or '']],
        colWidths=[3 * cm, 12 * cm, 3 * cm],
    )
    masthead.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(masthead)
    elements.append(Spacer(1, 12))

    # ── Title: name the pay period the way a payslip does ────────────────────
    # A cycle that sits inside one calendar month is titled by that month; one
    # that straddles months is titled by its actual date range, because calling
    # a 25-Jun–10-Jul cycle "the month of June" would misstate what was paid.
    start_dt, end_dt_title = _parse_date(str(cycle['start_date'])), _parse_date(str(cycle['end_date']))
    if start_dt and end_dt_title and (start_dt.year, start_dt.month) == (end_dt_title.year, end_dt_title.month):
        # period_label is the same period in sentence case, for the email
        # subject/body — title-casing the shouty PDF heading instead would
        # produce "Month Of February, 2026".
        period_label = f"{start_dt.strftime('%B')} {start_dt.year}"
        period_title = f"PAYSLIP FOR THE MONTH OF {start_dt.strftime('%B').upper()}, {start_dt.year}"
    else:
        period_label = (f"{_fmt_display_date(cycle['start_date'])} to "
                        f"{_fmt_display_date(cycle['end_date'])}")
        period_title = (f"PAYSLIP FOR THE PERIOD {_fmt_display_date(cycle['start_date'])} "
                        f"TO {_fmt_display_date(cycle['end_date'])}")
    elements.append(Paragraph(f'<u>{period_title}</u>', title_style))
    elements.append(Spacer(1, 14))

    # ── Employee particulars ─────────────────────────────────────────────────
    # "Amount / Day", not "Rate" — a payslip states what the person earns per
    # unit worked; "rate" reads like a product's unit price.
    rate_label = 'Amount / Hour' if emp.get('pay_type') == 'hourly' else 'Amount / Day'
    rate_value = f"{float(cycle.get('rate_snapshot') or 0):,.2f}"
    particulars = [
        ('Employee ID', str(emp['employee_id'])[:8].upper()),
        ('Phone', emp.get('phone') or '—'),
        ('Email', emp.get('email') or '—'),
        (rate_label, rate_value),
        ('Date of Joining', _fmt_display_date(emp.get('created_at'))),
        ('Days Paid', f"{days_present + paid_off_days} day/s"),
        ('Leaves Taken', f"{leaves_taken} day/s"),
        ('Status', 'PAID' if cycle['status'] == 'paid' else 'OPEN — PREVIEW'),
    ]
    elements.append(Paragraph(
        f'<font backcolor="#ccff99"><b>Employee Name:</b> {emp["name"]}</font>', meta_style))
    for label, value in particulars:
        elements.append(Paragraph(f'<b>{label}:</b> {value}', meta_style))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(f'(in {currency_code})', unit_style))
    elements.append(Spacer(1, 2))

    # ── Earnings vs. deductions ──────────────────────────────────────────────
    # earnings = regular pay + overtime; deductions = one row per non-zero category.
    earning_lines = [(f'Regular Pay ({days_present} present, {paid_off_days} paid off)', gross - ot_summary['total_ot_pay'])]
    if ot_summary['total_ot_minutes'] > 0:
        earning_lines.append((f"Overtime ({_fmt_display_minutes(ot_summary['total_ot_minutes'])})", ot_summary['total_ot_pay']))

    # Every category is listed, zero or not — a payslip that names each possible
    # deduction and shows a dash is how the reader confirms nothing was taken.
    deduction_lines = [
        (CATEGORY_LABEL_MAP[cat], deductions_by_category.get(cat, 0))
        for cat in CATEGORY_LABEL_MAP
    ]

    header_style = ParagraphStyle('TblHeader', parent=styles['Normal'], fontSize=8.5, leading=11,
                                  alignment=TA_CENTER, textColor=INK, fontName='Helvetica-Bold')
    cell_style = ParagraphStyle('TblCell', parent=styles['Normal'], fontSize=9, leading=12,
                                textColor=INK, fontName='Helvetica')
    cell_right_style = ParagraphStyle('TblCellRight', parent=cell_style, alignment=TA_RIGHT)
    bold_style = ParagraphStyle('TblBold', parent=cell_style, fontName='Helvetica-Bold')
    bold_right_style = ParagraphStyle('TblBoldRight', parent=bold_style, alignment=TA_RIGHT)
    bold_center_style = ParagraphStyle('TblBoldCenter', parent=bold_style, alignment=TA_CENTER)

    def _amt(value):
        """Amounts print as a dash when nil — the same convention the rest of
        the form uses for 'nothing here', and easier to scan than 0.00."""
        return f'{value:,.2f}' if value else '&#8211;'

    row_count = max(len(earning_lines), len(deduction_lines))
    table_rows = [[
        Paragraph('EARNINGS', header_style), Paragraph('AMOUNT', header_style),
        Paragraph('DEDUCTIONS', header_style), Paragraph('AMOUNT', header_style),
    ]]
    for i in range(row_count):
        e_label, e_amt = earning_lines[i] if i < len(earning_lines) else ('', None)
        d_label, d_amt = deduction_lines[i] if i < len(deduction_lines) else ('', None)
        table_rows.append([
            Paragraph(e_label, cell_style),
            Paragraph(_amt(e_amt) if e_amt is not None else '', cell_right_style),
            Paragraph(d_label, cell_style),
            Paragraph(_amt(d_amt) if d_amt is not None else '', cell_right_style),
        ])

    band_row = len(table_rows)
    table_rows.append([
        Paragraph('Gross Earnings', bold_style), Paragraph(_amt(gross), bold_right_style),
        Paragraph('Total Deductions', bold_style), Paragraph(_amt(total_advances), bold_right_style),
    ])
    gross_row = len(table_rows)
    table_rows.append([Paragraph('Gross Earnings', cell_style), '', '', Paragraph(_amt(gross), bold_right_style)])
    ded_row = len(table_rows)
    table_rows.append([Paragraph('Total Deductions', cell_style), '', '', Paragraph(_amt(total_advances), bold_right_style)])
    net_row = len(table_rows)
    table_rows.append([Paragraph('Total Net Payable', bold_center_style), '', '', Paragraph(_amt(net), bold_right_style)])
    words_row = len(table_rows)
    table_rows.append([
        Paragraph(f'{currency_word} {_fmt_amount_in_words(net)} only', bold_center_style), '', '', ''])

    pay_table = Table(table_rows, colWidths=[5.4 * cm, 3.6 * cm, 5.4 * cm, 3.6 * cm], repeatRows=1)
    pay_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, GRID),
        ('BACKGROUND', (0, 0), (-1, 0), GREEN),
        ('BACKGROUND', (0, band_row), (0, band_row), GREEN),
        ('BACKGROUND', (2, band_row), (2, band_row), GREEN),
        # The three summary rows read as one statement, so the label runs the
        # full width of the form and only the figure sits in its own cell.
        ('SPAN', (0, gross_row), (2, gross_row)),
        ('SPAN', (0, ded_row), (2, ded_row)),
        ('SPAN', (0, net_row), (2, net_row)),
        ('SPAN', (0, words_row), (-1, words_row)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(pay_table)

    note_style = ParagraphStyle('Note', parent=styles['Normal'], fontSize=8, leading=11,
                                alignment=TA_LEFT, textColor=MUTED, fontName='Helvetica', spaceBefore=8)
    if cycle['status'] == 'paid':
        paid_line = f"Paid on {_fmt_display_date(cycle['paid_at'])}" if cycle.get('paid_at') else 'Paid'
        if cycle.get('payment_note'):
            paid_line += f" &#8226; {cycle['payment_note']}"
        elements.append(Paragraph(paid_line, note_style))
    else:
        # Say so plainly — an open cycle is a running preview, not a final figure.
        elements.append(Paragraph(
            'This cycle is still open. Figures are a running total and may change before payment.',
            note_style))

    sig_style = ParagraphStyle('Sig', parent=styles['Normal'], fontSize=7, leading=10, alignment=TA_LEFT,
                               textColor=MUTED, fontName='Helvetica-Oblique', spaceBefore=6)
    elements.append(Paragraph('COMPUTER GENERATED DOCUMENT AND REQUIRES NO SIGNATURE', sig_style))

    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, leading=11, alignment=TA_CENTER,
                                  textColor=MUTED, fontName='Times-Roman')
    footer_bits = []
    if client and client.address:
        footer_bits.append(' '.join(client.address.split()))
    if client and client.phone:
        footer_bits.append(f"Ph: {client.phone}")
    elements.append(Spacer(1, 24))
    elements.append(HRFlowable(width=CONTENT_W, thickness=0.5, color=GRID, spaceAfter=8))
    elements.append(Paragraph(' &#8226; '.join(footer_bits) or 'Computer-generated payslip', footer_style))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()

    safe_name = re.sub(r'[^A-Za-z0-9_.-]', '_', emp['name'].replace(' ', '_')) or 'Employee'
    filename = f"Payslip_{safe_name}_{cycle['start_date']}_to_{cycle['end_date']}.pdf"
    summary = {
        'period_label': period_label,
        'period_range': f"{_fmt_display_date(cycle['start_date'])} to {_fmt_display_date(cycle['end_date'])}",
        'net': net,
        'net_display': f"{currency_word} {net:,.2f}",
        'status': cycle['status'],
    }
    return pdf_bytes, filename, summary


@employees_bp.route('/<employee_id>/cycles/<cycle_id>/payslip', methods=['GET'])
@authenticate
@require_permission('view_salary')
def cycle_payslip(employee_id, cycle_id):
    """Download a one-page payslip PDF for a salary cycle — its pay period,
    days worked, overtime, deductions by category, and net pay. Available for
    both open and paid cycles (an open one is a preview of what's owed so
    far); the payment date/note only appear once the cycle is actually paid.
    """
    from io import BytesIO
    from flask import send_file
    from models.client_model import ClientEntry

    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404

    client = ClientEntry.query.filter_by(client_id=client_id).first()
    pdf_bytes, filename, _summary = _build_payslip_pdf(emp, cycle, client)
    return send_file(BytesIO(pdf_bytes), mimetype='application/pdf',
                     as_attachment=True, download_name=filename)


def _payslip_email_message(emp: dict, cycle: dict, client, to_email: str) -> dict:
    """Render the payslip and wrap it in a ready-to-send email message dict."""
    from utils.email_service import build_payslip_email

    pdf_bytes, filename, summary = _build_payslip_pdf(emp, cycle, client)
    subject, html = build_payslip_email(
        employee_name=emp['name'],
        business_name=(client.client_name if client else 'Your employer') or 'Your employer',
        period_label=summary['period_label'],
        period_range=summary['period_range'],
        net_display=summary['net_display'],
        is_paid=summary['status'] == 'paid',
    )
    return {
        'to_email': to_email,
        'subject': subject,
        'html_body': html,
        'attachment_bytes': pdf_bytes,
        'attachment_filename': filename,
        'attachment_mime': 'application/pdf',
    }


@employees_bp.route('/<employee_id>/cycles/<cycle_id>/payslip/email', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def email_cycle_payslip(employee_id, cycle_id):
    """Email one employee their payslip for a cycle, as a PDF attachment.

    Goes to the employee's stored address unless the body supplies `email`,
    which lets an admin send a one-off copy (to themselves, or to a worker
    whose address hasn't been recorded) without editing the employee record.

    Requires manage_salary_cycles rather than view_salary: this leaves the
    building. Being allowed to look at payroll is not the same as being allowed
    to mail it to someone.
    """
    from models.client_model import ClientEntry
    from utils.email_service import send_emails_with_attachment

    client_id = g.user['client_id']
    emp = _get_employee_any(employee_id, client_id)
    if not emp:
        return jsonify({'success': False, 'error': 'Employee not found'}), 404

    cycle = _get_cycle(cycle_id, employee_id, client_id)
    if not cycle:
        return jsonify({'success': False, 'error': 'Salary cycle not found'}), 404

    body = request.get_json(silent=True) or {}
    try:
        to_email = _validate_email(body.get('email')) or _validate_email(emp.get('email'))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid email address'}), 400
    if not to_email:
        return jsonify({
            'success': False,
            'error': f"{emp['name']} has no email address. Add one on the employee record first.",
        }), 400

    client = ClientEntry.query.filter_by(client_id=client_id).first()
    try:
        message = _payslip_email_message(emp, cycle, client, to_email)
    except Exception as e:
        logger.error('[Payslip email] Failed to render payslip for %s: %s', employee_id, e)
        return jsonify({'success': False, 'error': 'Could not generate the payslip PDF'}), 500

    result = send_emails_with_attachment([message])[0]
    if not result['sent']:
        return jsonify({'success': False, 'error': result['error'] or 'Failed to send the email'}), 502

    return jsonify({
        'success': True,
        'sent_to': to_email,
        'message': f"Payslip emailed to {to_email}",
    }), 200


# One request must not turn into an unbounded render-and-send loop; a payroll
# run larger than this is a sign the caller means to send everything ever.
_PAYSLIP_BULK_LIMIT = 100


@employees_bp.route('/cycles/payslip/email-bulk', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def email_payslips_bulk():
    """Email payslips for several cycles at once.

    Body: {"cycle_ids": ["…", "…"]}. Each cycle carries its own employee, so
    the caller doesn't have to pair them up.

    Always 200 with a per-cycle outcome — a partial send is the normal case
    (someone has no email on file, one address bounces), and reporting the
    whole batch as failed because of one bad row would hide the sends that did
    go through. Callers read `results` and the summary counts.
    """
    from models.client_model import ClientEntry
    from utils.email_service import send_emails_with_attachment

    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}
    cycle_ids = body.get('cycle_ids')
    if not isinstance(cycle_ids, list) or not cycle_ids:
        return jsonify({'success': False, 'error': 'cycle_ids must be a non-empty list'}), 400
    # De-duplicate but keep the caller's order, so nobody is mailed twice.
    seen_ids, ordered_ids = set(), []
    for cid in cycle_ids:
        cid = str(cid)
        if cid not in seen_ids:
            seen_ids.add(cid)
            ordered_ids.append(cid)
    if len(ordered_ids) > _PAYSLIP_BULK_LIMIT:
        return jsonify({
            'success': False,
            'error': f'Too many payslips in one request (max {_PAYSLIP_BULK_LIMIT})',
        }), 400

    client = ClientEntry.query.filter_by(client_id=client_id).first()

    results = []       # one entry per requested cycle, in request order
    messages = []      # only the ones we could actually build
    message_index = {}  # position in `messages` -> position in `results`

    for cid in ordered_ids:
        row = db.session.execute(
            text("SELECT * FROM salary_cycles WHERE cycle_id = :cid AND client_id = :client"),
            {'cid': cid, 'client': client_id}
        ).fetchone()
        cycle = _row_to_dict(row) if row else None
        if not cycle:
            results.append({'cycle_id': cid, 'employee_name': None, 'sent': False,
                            'error': 'Salary cycle not found'})
            continue

        emp = _get_employee_any(cycle['employee_id'], client_id)
        if not emp:
            results.append({'cycle_id': cid, 'employee_name': None, 'sent': False,
                            'error': 'Employee not found'})
            continue

        try:
            to_email = _validate_email(emp.get('email'))
        except ValueError:
            to_email = None
        if not to_email:
            results.append({'cycle_id': cid, 'employee_name': emp['name'], 'sent': False,
                            'error': 'No valid email address on file'})
            continue

        try:
            message = _payslip_email_message(emp, cycle, client, to_email)
        except Exception as e:
            logger.error('[Payslip email] Failed to render payslip for cycle %s: %s', cid, e)
            results.append({'cycle_id': cid, 'employee_name': emp['name'], 'sent': False,
                            'error': 'Could not generate the payslip PDF'})
            continue

        message_index[len(messages)] = len(results)
        messages.append(message)
        results.append({'cycle_id': cid, 'employee_name': emp['name'], 'email': to_email,
                        'sent': False, 'error': None})

    for i, outcome in enumerate(send_emails_with_attachment(messages)):
        slot = results[message_index[i]]
        slot['sent'] = outcome['sent']
        slot['error'] = outcome['error']

    sent_count = sum(1 for r in results if r['sent'])
    failed_count = len(results) - sent_count
    return jsonify({
        'success': True,
        'sent': sent_count,
        'failed': failed_count,
        'results': results,
        'message': (
            f"{sent_count} payslip{'' if sent_count == 1 else 's'} emailed"
            + (f", {failed_count} failed" if failed_count else '')
        ),
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

    category = (body.get('category') or 'cash_advance').strip().lower()
    if category not in _DEDUCTION_CATEGORIES:
        return jsonify({
            'success': False,
            'error': f'category must be one of: {", ".join(sorted(_DEDUCTION_CATEGORIES))}'
        }), 400

    advance_date = _parse_date(body.get('advance_date'))
    if not advance_date:
        advance_date = date.today()

    advance_id = str(uuid.uuid4())
    now = _now_iso()

    db.session.execute(
        text(
            "INSERT INTO salary_advances "
            "(advance_id, employee_id, client_id, cycle_id, amount, category, "
            " advance_date, notes, recorded_by, created_at, updated_at) "
            "VALUES (:aid, :eid, :cid, :cycle, :amount, :category, "
            "        :adv_date, :notes, :recorded_by, :now, :now)"
        ),
        {
            'aid': advance_id,
            'eid': employee_id,
            'cid': client_id,
            'cycle': cycle_id,
            'amount': amount,
            'category': category,
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


@employees_bp.route('/advances/<advance_id>', methods=['DELETE'])
@authenticate
@require_permission('record_advance')
def delete_advance(advance_id):
    """Remove a mis-entered advance/deduction and recalculate its cycle."""
    client_id = g.user['client_id']
    row = db.session.execute(
        text("SELECT * FROM salary_advances WHERE advance_id = :aid AND client_id = :cid"),
        {'aid': advance_id, 'cid': client_id}
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Advance not found'}), 404

    advance = _row_to_dict(row)
    cycle_id = advance.get('cycle_id')
    cycle = _get_cycle(cycle_id, advance['employee_id'], client_id) if cycle_id else None
    if cycle and cycle.get('status') == 'paid':
        return jsonify({'success': False, 'error': 'Cannot delete a deduction from a paid cycle'}), 409

    db.session.execute(
        text("DELETE FROM salary_advances WHERE advance_id = :aid AND client_id = :cid"),
        {'aid': advance_id, 'cid': client_id}
    )

    if cycle:
        gross, total_advances, net, _, _ot = _calculate_cycle_amounts(cycle)
        db.session.execute(
            text(
                "UPDATE salary_cycles "
                "SET gross_salary = :gross, total_advances = :adv, net_salary = :net, "
                "    updated_at = :now, synced_at = NULL "
                "WHERE cycle_id = :cid"
            ),
            {'gross': gross, 'adv': total_advances, 'net': net, 'now': _now_iso(), 'cid': cycle_id}
        )

    db.session.commit()
    return jsonify({'success': True, 'message': 'Deduction removed'}), 200


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
                "SELECT advance_id, amount, category, advance_date, notes "
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
            'deductions_by_category': _advance_category_breakdown(advances),
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

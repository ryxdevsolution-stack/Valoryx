"""
Payroll invoicing — bill a principal company for supplied labour.

A labour contractor pays 30-40 workers directly (payslips already handle that),
then raises ONE GST invoice on the company those workers were supplied to. The
invoice groups workers into work groups ("Bay 1", "Blasting & Painting"), adds a
per-group service charge, and applies GST — CGST+SGST within the state, IGST
across state lines.

Endpoints:
  Work groups:
    GET    /api/payroll/work-groups                  - list groups
    POST   /api/payroll/work-groups                  - create group
    PUT    /api/payroll/work-groups/<group_id>       - update group
    DELETE /api/payroll/work-groups/<group_id>       - soft delete (is_active=0)
    POST   /api/payroll/work-groups/assign           - assign employees to a group

  Invoices:
    POST   /api/payroll/invoices/preview             - build line totals for a period, nothing saved
    POST   /api/payroll/invoices                     - save an invoice
    GET    /api/payroll/invoices                     - list (with computed balance)
    GET    /api/payroll/invoices/<invoice_id>        - full detail + lines + employees + payments
    DELETE /api/payroll/invoices/<invoice_id>        - delete a draft
    GET    /api/payroll/invoices/<invoice_id>/pdf    - render the GST invoice PDF
    POST   /api/payroll/invoices/<invoice_id>/payments - record money received
"""

import uuid
import logging
from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, request, jsonify, g
from sqlalchemy import text

from extensions import db
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission

logger = logging.getLogger(__name__)

payroll_invoice_bp = Blueprint('payroll_invoice', __name__)

UNGROUPED_LABEL = 'Ungrouped workers'


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _row_to_dict(row):
    if row is None:
        return None
    return {k: v for k, v in dict(row._mapping).items()}


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except (ValueError, TypeError):
        return None


def _money(value) -> float:
    """Round to 2dp using banker's-safe HALF_UP.

    Every amount on a tax invoice must add up exactly — float accumulation
    leaves 833045.7799999999 sitting where the tax authority expects
    833045.78, and the CGST+SGST halves must sum to the total tax.
    """
    return float(Decimal(str(value or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def _num(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _client_row(client_id):
    return _row_to_dict(db.session.execute(
        text("SELECT * FROM client_entry WHERE client_id = :cid"), {'cid': client_id}
    ).fetchone())


def _state_code(value) -> str:
    """Normalise '33-Tamil Nadu', '33', 'Tamil Nadu' to a comparable key.

    GST place-of-supply is decided on the numeric state code. Users type it
    every which way, so compare on digits when both sides have them and fall
    back to a lowercased name match otherwise.
    """
    s = str(value or '').strip()
    if not s:
        return ''
    digits = ''.join(ch for ch in s.split('-')[0] if ch.isdigit())
    if digits:
        return digits.zfill(2)
    return s.lower()


def _resolve_tax_mode(client, customer_state) -> str:
    """'intra' → CGST+SGST, 'inter' → IGST.

    Falls back to intra when either side's state is unknown: a wrong IGST
    split is harder to correct after filing than a wrong intra one, and intra
    is what a single-state contractor raises 99% of the time.
    """
    own = _state_code((client or {}).get('state_code'))
    other = _state_code(customer_state)
    if not own or not other:
        return 'intra'
    return 'inter' if own != other else 'intra'


def _default_gst_rate(client) -> float:
    """Read the client's configured default rate (tax_config.default_rate)."""
    cfg = (client or {}).get('tax_config')
    if isinstance(cfg, str):
        try:
            import json
            cfg = json.loads(cfg)
        except (ValueError, TypeError):
            cfg = None
    if isinstance(cfg, dict):
        rate = cfg.get('default_rate')
        if rate is not None:
            return _num(rate)
    return 18.0


def _next_invoice_number(client_id) -> str:
    """PINV/YYYY-YY/NNN — its own series, never mixed with sales bills.

    Indian financial year (April-March) so the series resets with the books.
    """
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    prefix = f"PINV/{fy_start}-{str(fy_start + 1)[-2:]}/"

    row = db.session.execute(text(
        "SELECT invoice_number FROM payroll_invoices "
        "WHERE client_id = :cid AND invoice_number LIKE :pfx "
        "ORDER BY invoice_number DESC LIMIT 1"
    ), {'cid': client_id, 'pfx': f'{prefix}%'}).fetchone()

    seq = 1
    if row:
        try:
            seq = int(str(row[0]).rsplit('/', 1)[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"{prefix}{seq:03d}"


def _split_tax(taxable: float, rate: float, tax_mode: str):
    """Return (cgst, sgst, igst) for one line.

    The halves are derived from the rounded total rather than rounded
    independently, so CGST + SGST always equals the tax shown on the line.
    """
    total_tax = _money(taxable * rate / 100.0)
    if tax_mode == 'inter':
        return 0.0, 0.0, total_tax
    half = _money(total_tax / 2)
    # Give any odd paisa to CGST so the two halves reconstruct total_tax exactly.
    return _money(total_tax - half), half, 0.0


def _fmt_date(value) -> str:
    """DD-MM-YYYY — the convention on Indian tax invoices."""
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
    return dt.strftime('%d-%m-%Y')


class _NoRedirect:
    """urllib redirect handler that refuses every redirect.

    Built as a plain class and mixed in via build_opener so the import of
    urllib.request stays local to the one function that needs it.
    """

    def __init__(self):
        import urllib.request

        class _Handler(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                logger.warning('[Payroll] signature_url redirected — refusing to follow')
                return None

        self._handler = _Handler()

    def __getattr__(self, name):
        return getattr(self._handler, name)


def _host_is_allowed(url) -> bool:
    """True only for the project's own storage host, resolving to a public IP.

    Two gates, because either alone is bypassable:
      1. Hostname must equal the configured Supabase host — stops arbitrary URLs.
      2. Every address that hostname resolves to must be publicly routable —
         stops an allowlisted-looking name (or a DNS record an attacker
         controls) from pointing at loopback, RFC1918 or link-local 169.254.x.x,
         which is how cloud metadata endpoints get reached.
    """
    import socket
    import ipaddress
    from urllib.parse import urlparse
    from config import Config

    allowed_host = urlparse(Config.SUPABASE_URL or '').hostname
    host = urlparse(url).hostname
    if not allowed_host or not host or host.lower() != allowed_host.lower():
        logger.warning('[Payroll] signature_url host not allowed — skipping image')
        return False

    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        logger.warning(f'[Payroll] signature_url host did not resolve: {e}')
        return False

    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            logger.warning(f'[Payroll] signature_url resolves to non-public {ip} — skipping image')
            return False
    return True


def _signature_flowable(signature_url):
    """Return a ReportLab Image for the authorised signature, or None.

    Only two sources are honoured: an inline data: URI, and an https URL on the
    project's own Supabase storage host. Rendering an arbitrary user-supplied
    URL would turn "download my invoice" into a server-side request forgery —
    the PDF service would happily fetch http://169.254.169.254/ or an internal
    admin endpoint on the attacker's behalf. Anything else is skipped and the
    invoice falls back to blank space above the signatory line.
    """
    from io import BytesIO
    url = (signature_url or '').strip()
    if not url:
        return None

    raw = None
    try:
        if url.startswith('data:image/'):
            import base64
            header, _, payload = url.partition(',')
            if 'base64' not in header or not payload:
                return None
            raw = base64.b64decode(payload, validate=True)
        elif url.startswith('https://'):
            if not _host_is_allowed(url):
                return None
            import urllib.request
            # Redirects are REFUSED, not followed. Checking the host before the
            # request is not enough on its own: an allowlisted storage URL can
            # answer 302 to http://169.254.169.254/ (cloud metadata) or an
            # internal admin endpoint, and urlopen follows it by default — the
            # allowlist would have inspected only the first hop.
            opener = urllib.request.build_opener(_NoRedirect())
            with opener.open(url, timeout=5) as resp:  # nosec B310 - https, host allowlisted, redirects refused
                raw = resp.read(2 * 1024 * 1024)  # cap: a signature is a few KB
        else:
            return None

        if not raw:
            return None

        from reportlab.platypus import Image
        from reportlab.lib.utils import ImageReader
        from reportlab.lib.units import cm

        reader = ImageReader(BytesIO(raw))
        iw, ih = reader.getSize()
        if not iw or not ih:
            return None
        max_w, max_h = 3.6 * cm, 1.8 * cm
        scale = min(max_w / iw, max_h / ih)
        return Image(BytesIO(raw), width=iw * scale, height=ih * scale)
    except Exception as e:
        # A broken signature image must never take the whole invoice down.
        logger.warning(f'[Payroll] signature image skipped: {e}')
        return None


# ── Work groups ──────────────────────────────────────────────────────────────

@payroll_invoice_bp.route('/work-groups', methods=['GET'])
@authenticate
@require_permission('view_salary')
def list_work_groups():
    """Groups plus a live headcount, so the UI can show 'Bay 1 · 12 workers'."""
    try:
        client_id = g.user['client_id']
        rows = db.session.execute(text("""
            SELECT wg.*, (
                SELECT COUNT(*) FROM employees e
                WHERE e.work_group_id = wg.group_id AND e.is_active = 1
            ) AS employee_count
            FROM work_groups wg
            WHERE wg.client_id = :cid AND wg.is_active = 1
            ORDER BY wg.display_order, wg.name
        """), {'cid': client_id}).fetchall()

        ungrouped = db.session.execute(text(
            "SELECT COUNT(*) FROM employees "
            "WHERE client_id = :cid AND is_active = 1 AND "
            "(work_group_id IS NULL OR work_group_id = '')"
        ), {'cid': client_id}).scalar() or 0

        return jsonify({
            'success': True,
            'data': [_row_to_dict(r) for r in rows],
            'ungrouped_count': int(ungrouped),
        }), 200
    except Exception as e:
        logger.error(f'[Payroll] list_work_groups failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to load work groups'}), 500


@payroll_invoice_bp.route('/work-groups', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def create_work_group():
    try:
        client_id = g.user['client_id']
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Group name is required'}), 400
        if len(name) > 150:
            return jsonify({'success': False, 'error': 'Group name is too long (max 150)'}), 400

        dup = db.session.execute(text(
            "SELECT group_id FROM work_groups "
            "WHERE client_id = :cid AND LOWER(name) = LOWER(:name) AND is_active = 1"
        ), {'cid': client_id, 'name': name}).fetchone()
        if dup:
            return jsonify({'success': False, 'error': f'A group named "{name}" already exists'}), 409

        svc = data.get('service_charge_percent')
        if svc is not None and not (0 <= _num(svc) <= 100):
            return jsonify({'success': False, 'error': 'Service charge % must be between 0 and 100'}), 400

        group_id = str(uuid.uuid4())
        db.session.execute(text("""
            INSERT INTO work_groups
                (group_id, client_id, name, description, hsn_code,
                 service_charge_percent, display_order, is_active, created_by, created_at, updated_at)
            VALUES (:gid, :cid, :name, :desc, :hsn, :svc, :ord, 1, :by, :now, :now)
        """), {
            'gid': group_id, 'cid': client_id, 'name': name,
            'desc': (data.get('description') or '').strip() or None,
            'hsn': (data.get('hsn_code') or '').strip() or None,
            'svc': _num(svc) if svc is not None else None,
            'ord': int(data.get('display_order') or 0),
            'by': g.user['user_id'], 'now': _now_iso(),
        })
        db.session.commit()

        row = db.session.execute(text(
            "SELECT * FROM work_groups WHERE group_id = :gid"), {'gid': group_id}).fetchone()
        return jsonify({'success': True, 'data': _row_to_dict(row), 'message': 'Work group created'}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] create_work_group failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to create work group'}), 500


@payroll_invoice_bp.route('/work-groups/<group_id>', methods=['PUT'])
@authenticate
@require_permission('manage_salary_cycles')
def update_work_group(group_id):
    try:
        client_id = g.user['client_id']
        existing = db.session.execute(text(
            "SELECT * FROM work_groups WHERE group_id = :gid AND client_id = :cid"),
            {'gid': group_id, 'cid': client_id}).fetchone()
        if not existing:
            return jsonify({'success': False, 'error': 'Work group not found'}), 404

        data = request.get_json() or {}
        fields, params = [], {'gid': group_id, 'cid': client_id, 'now': _now_iso()}

        if 'name' in data:
            name = (data.get('name') or '').strip()
            if not name:
                return jsonify({'success': False, 'error': 'Group name is required'}), 400
            fields.append('name = :name')
            params['name'] = name
        if 'description' in data:
            fields.append('description = :desc')
            params['desc'] = (data.get('description') or '').strip() or None
        if 'hsn_code' in data:
            fields.append('hsn_code = :hsn')
            params['hsn'] = (data.get('hsn_code') or '').strip() or None
        if 'service_charge_percent' in data:
            svc = data.get('service_charge_percent')
            if svc is not None and not (0 <= _num(svc) <= 100):
                return jsonify({'success': False, 'error': 'Service charge % must be between 0 and 100'}), 400
            fields.append('service_charge_percent = :svc')
            params['svc'] = _num(svc) if svc is not None else None
        if 'display_order' in data:
            fields.append('display_order = :ord')
            params['ord'] = int(data.get('display_order') or 0)

        if not fields:
            return jsonify({'success': False, 'error': 'Nothing to update'}), 400

        # synced_at = NULL so the edit actually uploads on the next sync.
        fields.extend(['updated_at = :now', 'synced_at = NULL'])
        db.session.execute(text(
            f"UPDATE work_groups SET {', '.join(fields)} "
            f"WHERE group_id = :gid AND client_id = :cid"), params)
        db.session.commit()

        row = db.session.execute(text(
            "SELECT * FROM work_groups WHERE group_id = :gid"), {'gid': group_id}).fetchone()
        return jsonify({'success': True, 'data': _row_to_dict(row), 'message': 'Work group updated'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] update_work_group failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to update work group'}), 500


@payroll_invoice_bp.route('/work-groups/<group_id>', methods=['DELETE'])
@authenticate
@require_permission('manage_salary_cycles')
def delete_work_group(group_id):
    """Soft delete. Members are unassigned rather than deleted — they keep
    getting paid, they just fall into the Ungrouped line until reassigned."""
    try:
        client_id = g.user['client_id']
        existing = db.session.execute(text(
            "SELECT group_id FROM work_groups WHERE group_id = :gid AND client_id = :cid"),
            {'gid': group_id, 'cid': client_id}).fetchone()
        if not existing:
            return jsonify({'success': False, 'error': 'Work group not found'}), 404

        now = _now_iso()
        db.session.execute(text(
            "UPDATE employees SET work_group_id = NULL, updated_at = :now, synced_at = NULL "
            "WHERE work_group_id = :gid AND client_id = :cid"),
            {'gid': group_id, 'cid': client_id, 'now': now})
        db.session.execute(text(
            "UPDATE work_groups SET is_active = 0, updated_at = :now, synced_at = NULL "
            "WHERE group_id = :gid AND client_id = :cid"),
            {'gid': group_id, 'cid': client_id, 'now': now})
        db.session.commit()
        return jsonify({'success': True, 'message': 'Work group removed'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] delete_work_group failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to delete work group'}), 500


@payroll_invoice_bp.route('/work-groups/assign', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def assign_employees_to_group():
    """Body: { group_id: str|null, employee_ids: [str] }. null unassigns."""
    try:
        client_id = g.user['client_id']
        data = request.get_json() or {}
        group_id = data.get('group_id') or None
        employee_ids = data.get('employee_ids') or []

        if not isinstance(employee_ids, list) or not employee_ids:
            return jsonify({'success': False, 'error': 'employee_ids must be a non-empty list'}), 400
        if len(employee_ids) > 500:
            return jsonify({'success': False, 'error': 'Too many employees in one request (max 500)'}), 400

        if group_id:
            grp = db.session.execute(text(
                "SELECT group_id FROM work_groups "
                "WHERE group_id = :gid AND client_id = :cid AND is_active = 1"),
                {'gid': group_id, 'cid': client_id}).fetchone()
            if not grp:
                return jsonify({'success': False, 'error': 'Work group not found'}), 404

        now = _now_iso()
        updated = 0
        for emp_id in employee_ids:
            res = db.session.execute(text(
                "UPDATE employees SET work_group_id = :gid, updated_at = :now, synced_at = NULL "
                "WHERE employee_id = :eid AND client_id = :cid"),
                {'gid': group_id, 'eid': str(emp_id), 'cid': client_id, 'now': now})
            updated += res.rowcount or 0
        db.session.commit()

        return jsonify({'success': True, 'updated': updated,
                        'message': f'{updated} employee(s) updated'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] assign_employees_to_group failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to assign employees'}), 500


# ── Invoice building ─────────────────────────────────────────────────────────

def _collect_lines(client_id, period_start, period_end, employee_ids, overrides, client):
    """Sum each work group's salary for the period and apply its service charge.

    Bills GROSS salary: advances and deductions are settled between the
    contractor and the worker, and are none of the principal company's business.

    Cycles are matched by overlap rather than exact equality — a cycle running
    28 Apr → 27 May still belongs in a May invoice.
    """
    params = {'cid': client_id, 'start': str(period_start), 'end': str(period_end)}
    emp_filter = ''
    if employee_ids:
        placeholders = ', '.join(f':e{i}' for i in range(len(employee_ids)))
        emp_filter = f' AND e.employee_id IN ({placeholders})'
        for i, eid in enumerate(employee_ids):
            params[f'e{i}'] = str(eid)

    rows = db.session.execute(text(f"""
        SELECT e.employee_id, e.name AS employee_name, e.work_group_id,
               sc.cycle_id, sc.gross_salary
        FROM salary_cycles sc
        JOIN employees e ON e.employee_id = sc.employee_id
        WHERE sc.client_id = :cid
          AND sc.start_date <= :end
          AND sc.end_date   >= :start
          {emp_filter}
        ORDER BY e.name
    """), params).fetchall()

    groups = {r['group_id']: r for r in [
        _row_to_dict(x) for x in db.session.execute(text(
            "SELECT * FROM work_groups WHERE client_id = :cid AND is_active = 1 "
            "ORDER BY display_order, name"), {'cid': client_id}).fetchall()
    ]}

    default_gst = _default_gst_rate(client)
    default_svc = _num((client or {}).get('service_charge_percent'))
    overrides = overrides or {}

    buckets = {}
    for row in rows:
        r = _row_to_dict(row)
        gid = r.get('work_group_id') or ''
        bucket = buckets.setdefault(gid, {'employees': [], 'salary': 0.0})
        bucket['salary'] += _num(r.get('gross_salary'))
        bucket['employees'].append({
            'employee_id': r['employee_id'],
            'employee_name': r['employee_name'],
            'cycle_id': r.get('cycle_id'),
            'gross_salary': _money(r.get('gross_salary')),
        })

    lines = []
    for gid, bucket in buckets.items():
        group = groups.get(gid)
        ov = overrides.get(gid or 'ungrouped') or {}

        svc_pct = ov.get('service_charge_percent')
        if svc_pct is None:
            svc_pct = (group or {}).get('service_charge_percent')
        if svc_pct is None:
            svc_pct = default_svc
        svc_pct = _num(svc_pct)

        gst_rate = _num(ov.get('gst_rate') if ov.get('gst_rate') is not None else default_gst)
        salary = _money(bucket['salary'])
        service_amount = _money(salary * svc_pct / 100.0)
        taxable = _money(salary + service_amount)
        headcount = len(bucket['employees'])

        base_label = (group or {}).get('name') or UNGROUPED_LABEL
        description = ov.get('description') or (
            f"{base_label} ({headcount} worker{'s' if headcount != 1 else ''})"
        )

        lines.append({
            'group_id': gid or None,
            'description': description,
            'hsn_code': ov.get('hsn_code') or (group or {}).get('hsn_code'),
            'headcount': headcount,
            'salary_amount': salary,
            'service_charge_percent': svc_pct,
            'service_charge_amount': service_amount,
            'taxable_amount': taxable,
            'gst_rate': gst_rate,
            'sort_order': int((group or {}).get('display_order') or 999),
            'employees': bucket['employees'],
        })

    # Ungrouped last, everything else by the group's own display order.
    lines.sort(key=lambda ln: (ln['group_id'] is None, ln['sort_order'], ln['description']))
    return lines


def _apply_tax(lines, tax_mode):
    """Compute per-line tax and the invoice totals from the line values."""
    totals = {
        'salary_total': 0.0, 'service_total': 0.0, 'taxable_total': 0.0,
        'cgst_total': 0.0, 'sgst_total': 0.0, 'igst_total': 0.0,
        'tax_total': 0.0, 'grand_total': 0.0, 'headcount': 0,
    }
    for i, line in enumerate(lines):
        cgst, sgst, igst = _split_tax(line['taxable_amount'], line['gst_rate'], tax_mode)
        line['cgst_amount'] = cgst
        line['sgst_amount'] = sgst
        line['igst_amount'] = igst
        line['line_total'] = _money(line['taxable_amount'] + cgst + sgst + igst)
        line['sort_order'] = i

        totals['salary_total'] += line['salary_amount']
        totals['service_total'] += line['service_charge_amount']
        totals['taxable_total'] += line['taxable_amount']
        totals['cgst_total'] += cgst
        totals['sgst_total'] += sgst
        totals['igst_total'] += igst
        totals['headcount'] += line['headcount']

    for key in ('salary_total', 'service_total', 'taxable_total',
                'cgst_total', 'sgst_total', 'igst_total'):
        totals[key] = _money(totals[key])
    totals['tax_total'] = _money(totals['cgst_total'] + totals['sgst_total'] + totals['igst_total'])
    totals['grand_total'] = _money(totals['taxable_total'] + totals['tax_total'])
    return totals


def _customer_row(customer_id, client_id):
    if not customer_id:
        return None
    return _row_to_dict(db.session.execute(text(
        "SELECT * FROM customer WHERE customer_id = :id AND client_id = :cid"),
        {'id': customer_id, 'cid': client_id}).fetchone())


@payroll_invoice_bp.route('/invoices/preview', methods=['POST'])
@authenticate
@require_permission('view_salary')
def preview_invoice():
    """Build the invoice in memory so the UI can show it before anything is saved.

    Body: { period_start, period_end, customer_id?, customer_state?,
            employee_ids?: [str], line_overrides?: {group_id: {...}} }
    """
    try:
        client_id = g.user['client_id']
        data = request.get_json() or {}

        period_start = _parse_date(data.get('period_start'))
        period_end = _parse_date(data.get('period_end'))
        if not period_start or not period_end:
            return jsonify({'success': False, 'error': 'period_start and period_end are required (YYYY-MM-DD)'}), 400
        if period_end < period_start:
            return jsonify({'success': False, 'error': 'period_end cannot be before period_start'}), 400

        client = _client_row(client_id)
        customer = _customer_row(data.get('customer_id'), client_id)
        customer_state = data.get('customer_state') or (customer or {}).get('customer_state')
        tax_mode = data.get('tax_mode') or _resolve_tax_mode(client, customer_state)
        if tax_mode not in ('intra', 'inter'):
            return jsonify({'success': False, 'error': "tax_mode must be 'intra' or 'inter'"}), 400

        lines = _collect_lines(client_id, period_start, period_end,
                               data.get('employee_ids') or [],
                               data.get('line_overrides') or {}, client)
        totals = _apply_tax(lines, tax_mode)

        return jsonify({
            'success': True,
            'data': {
                'period_start': str(period_start),
                'period_end': str(period_end),
                'tax_mode': tax_mode,
                'invoice_number_preview': _next_invoice_number(client_id),
                'customer': customer,
                'lines': lines,
                'totals': totals,
            }
        }), 200
    except Exception as e:
        logger.error(f'[Payroll] preview_invoice failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to build invoice preview'}), 500


@payroll_invoice_bp.route('/invoices', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def create_invoice():
    """Persist an invoice. Line amounts are frozen at save time — a sent invoice
    must keep showing the figures it was sent with."""
    try:
        client_id = g.user['client_id']
        data = request.get_json() or {}

        period_start = _parse_date(data.get('period_start'))
        period_end = _parse_date(data.get('period_end'))
        if not period_start or not period_end:
            return jsonify({'success': False, 'error': 'period_start and period_end are required'}), 400
        if period_end < period_start:
            return jsonify({'success': False, 'error': 'period_end cannot be before period_start'}), 400

        client = _client_row(client_id)
        customer = _customer_row(data.get('customer_id'), client_id)
        customer_name = (data.get('customer_name') or (customer or {}).get('customer_name') or '').strip()
        if not customer_name:
            return jsonify({'success': False, 'error': 'A company to bill is required'}), 400

        customer_state = data.get('customer_state') or (customer or {}).get('customer_state')
        tax_mode = data.get('tax_mode') or _resolve_tax_mode(client, customer_state)

        lines = _collect_lines(client_id, period_start, period_end,
                               data.get('employee_ids') or [],
                               data.get('line_overrides') or {}, client)
        if not lines:
            return jsonify({
                'success': False,
                'error': 'No salary cycles found for that period — create the pay cycles first.'
            }), 400
        totals = _apply_tax(lines, tax_mode)

        invoice_id = str(uuid.uuid4())
        invoice_number = (data.get('invoice_number') or '').strip() or _next_invoice_number(client_id)
        invoice_date = _parse_date(data.get('invoice_date')) or date.today()
        now = _now_iso()

        db.session.execute(text("""
            INSERT INTO payroll_invoices (
                invoice_id, client_id, invoice_number, invoice_date, period_start, period_end,
                customer_id, customer_name, customer_address, customer_gstin, customer_state,
                customer_phone, ship_to, place_of_supply, tax_mode, gst_rate,
                salary_total, service_total, taxable_total,
                cgst_total, sgst_total, igst_total, tax_total, grand_total,
                received_amount, status, notes, terms, created_by, created_at, updated_at
            ) VALUES (
                :iid, :cid, :num, :idate, :pstart, :pend,
                :custid, :custname, :custaddr, :custgstin, :custstate,
                :custphone, :shipto, :pos, :tmode, :grate,
                :salary, :service, :taxable,
                :cgst, :sgst, :igst, :tax, :grand,
                0, :status, :notes, :terms, :by, :now, :now
            )
        """), {
            'iid': invoice_id, 'cid': client_id, 'num': invoice_number,
            'idate': str(invoice_date), 'pstart': str(period_start), 'pend': str(period_end),
            'custid': data.get('customer_id') or None, 'custname': customer_name,
            'custaddr': data.get('customer_address') or (customer or {}).get('customer_address'),
            'custgstin': data.get('customer_gstin') or (customer or {}).get('customer_gstin'),
            'custstate': customer_state,
            'custphone': data.get('customer_phone') or (customer or {}).get('customer_phone'),
            'shipto': data.get('ship_to') or None,
            'pos': data.get('place_of_supply') or customer_state or None,
            'tmode': tax_mode, 'grate': _default_gst_rate(client),
            'salary': totals['salary_total'], 'service': totals['service_total'],
            'taxable': totals['taxable_total'], 'cgst': totals['cgst_total'],
            'sgst': totals['sgst_total'], 'igst': totals['igst_total'],
            'tax': totals['tax_total'], 'grand': totals['grand_total'],
            'status': data.get('status') or 'issued',
            'notes': data.get('notes') or None,
            'terms': data.get('terms') or (client or {}).get('invoice_terms'),
            'by': g.user['user_id'], 'now': now,
        })

        for line in lines:
            line_id = str(uuid.uuid4())
            db.session.execute(text("""
                INSERT INTO payroll_invoice_lines (
                    line_id, client_id, invoice_id, group_id, description, hsn_code,
                    headcount, salary_amount, service_charge_percent, service_charge_amount,
                    taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount,
                    line_total, sort_order, created_at, updated_at
                ) VALUES (
                    :lid, :cid, :iid, :gid, :desc, :hsn,
                    :head, :salary, :svcpct, :svcamt,
                    :taxable, :grate, :cgst, :sgst, :igst,
                    :total, :ord, :now, :now
                )
            """), {
                'lid': line_id, 'cid': client_id, 'iid': invoice_id,
                'gid': line['group_id'], 'desc': line['description'], 'hsn': line['hsn_code'],
                'head': line['headcount'], 'salary': line['salary_amount'],
                'svcpct': line['service_charge_percent'], 'svcamt': line['service_charge_amount'],
                'taxable': line['taxable_amount'], 'grate': line['gst_rate'],
                'cgst': line['cgst_amount'], 'sgst': line['sgst_amount'], 'igst': line['igst_amount'],
                'total': line['line_total'], 'ord': line['sort_order'], 'now': now,
            })

            for emp in line['employees']:
                db.session.execute(text("""
                    INSERT INTO payroll_invoice_employees (
                        id, client_id, invoice_id, line_id, employee_id, employee_name,
                        cycle_id, gross_salary, created_at
                    ) VALUES (:id, :cid, :iid, :lid, :eid, :ename, :cyid, :gross, :now)
                """), {
                    'id': str(uuid.uuid4()), 'cid': client_id, 'iid': invoice_id, 'lid': line_id,
                    'eid': emp['employee_id'], 'ename': emp['employee_name'],
                    'cyid': emp['cycle_id'], 'gross': emp['gross_salary'], 'now': now,
                })

        db.session.commit()
        logger.info(f'[Payroll] invoice {invoice_number} created for client {client_id} '
                    f'({len(lines)} lines, total {totals["grand_total"]})')

        return jsonify({'success': True, 'data': {'invoice_id': invoice_id,
                                                  'invoice_number': invoice_number,
                                                  'totals': totals},
                        'message': f'Invoice {invoice_number} created'}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] create_invoice failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to create invoice'}), 500


@payroll_invoice_bp.route('/invoices', methods=['GET'])
@authenticate
@require_permission('view_salary')
def list_invoices():
    """Paginated list. Balance is computed, never read from a stored column."""
    try:
        client_id = g.user['client_id']
        page = max(1, int(request.args.get('page') or 1))
        per_page = min(100, max(1, int(request.args.get('per_page') or 20)))
        status = (request.args.get('status') or '').strip()

        where = 'WHERE client_id = :cid'
        params = {'cid': client_id}
        if status:
            where += ' AND status = :status'
            params['status'] = status

        total = db.session.execute(text(
            f"SELECT COUNT(*) FROM payroll_invoices {where}"), params).scalar() or 0

        params.update({'limit': per_page, 'offset': (page - 1) * per_page})
        rows = db.session.execute(text(f"""
            SELECT * FROM payroll_invoices {where}
            ORDER BY invoice_date DESC, created_at DESC
            LIMIT :limit OFFSET :offset
        """), params).fetchall()

        out = []
        for row in rows:
            inv = _row_to_dict(row)
            inv['balance'] = _money(_num(inv.get('grand_total')) - _num(inv.get('received_amount')))
            out.append(inv)

        return jsonify({'success': True, 'data': out, 'total': int(total),
                        'page': page, 'per_page': per_page}), 200
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Invalid pagination parameters'}), 400
    except Exception as e:
        logger.error(f'[Payroll] list_invoices failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to load invoices'}), 500


@payroll_invoice_bp.route('/invoices/<invoice_id>', methods=['GET'])
@authenticate
@require_permission('view_salary')
def get_invoice(invoice_id):
    try:
        client_id = g.user['client_id']
        inv = _row_to_dict(db.session.execute(text(
            "SELECT * FROM payroll_invoices WHERE invoice_id = :iid AND client_id = :cid"),
            {'iid': invoice_id, 'cid': client_id}).fetchone())
        if not inv:
            return jsonify({'success': False, 'error': 'Invoice not found'}), 404

        lines = [_row_to_dict(r) for r in db.session.execute(text(
            "SELECT * FROM payroll_invoice_lines WHERE invoice_id = :iid AND client_id = :cid "
            "ORDER BY sort_order"), {'iid': invoice_id, 'cid': client_id}).fetchall()]
        employees = [_row_to_dict(r) for r in db.session.execute(text(
            "SELECT * FROM payroll_invoice_employees WHERE invoice_id = :iid AND client_id = :cid "
            "ORDER BY employee_name"), {'iid': invoice_id, 'cid': client_id}).fetchall()]
        payments = [_row_to_dict(r) for r in db.session.execute(text(
            "SELECT * FROM payroll_invoice_payments WHERE invoice_id = :iid AND client_id = :cid "
            "ORDER BY payment_date DESC, created_at DESC"),
            {'iid': invoice_id, 'cid': client_id}).fetchall()]

        by_line = {}
        for emp in employees:
            by_line.setdefault(emp.get('line_id'), []).append(emp)
        for line in lines:
            line['employees'] = by_line.get(line['line_id'], [])

        inv['balance'] = _money(_num(inv.get('grand_total')) - _num(inv.get('received_amount')))
        inv['lines'] = lines
        inv['payments'] = payments
        return jsonify({'success': True, 'data': inv}), 200
    except Exception as e:
        logger.error(f'[Payroll] get_invoice failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to load invoice'}), 500


@payroll_invoice_bp.route('/invoices/<invoice_id>', methods=['DELETE'])
@authenticate
@require_permission('manage_salary_cycles')
def delete_invoice(invoice_id):
    """Only while nothing has been received against it — a paid-against invoice
    is a financial record, not a draft."""
    try:
        client_id = g.user['client_id']
        inv = _row_to_dict(db.session.execute(text(
            "SELECT * FROM payroll_invoices WHERE invoice_id = :iid AND client_id = :cid"),
            {'iid': invoice_id, 'cid': client_id}).fetchone())
        if not inv:
            return jsonify({'success': False, 'error': 'Invoice not found'}), 404
        if _num(inv.get('received_amount')) > 0:
            return jsonify({
                'success': False,
                'error': 'This invoice has payments recorded against it and cannot be deleted.'
            }), 409

        for table in ('payroll_invoice_employees', 'payroll_invoice_lines', 'payroll_invoices'):
            key = 'invoice_id'
            db.session.execute(text(
                f"DELETE FROM {table} WHERE {key} = :iid AND client_id = :cid"),
                {'iid': invoice_id, 'cid': client_id})
        db.session.commit()
        return jsonify({'success': True, 'message': 'Invoice deleted'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] delete_invoice failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to delete invoice'}), 500


@payroll_invoice_bp.route('/invoices/<invoice_id>/payments', methods=['POST'])
@authenticate
@require_permission('manage_salary_cycles')
def record_payment(invoice_id):
    """Record money received. received_amount is recomputed from the ledger, so
    a duplicate request can never inflate the total beyond what was inserted."""
    try:
        client_id = g.user['client_id']
        data = request.get_json() or {}
        amount = _num(data.get('amount'))
        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than zero'}), 400

        inv = _row_to_dict(db.session.execute(text(
            "SELECT * FROM payroll_invoices WHERE invoice_id = :iid AND client_id = :cid"),
            {'iid': invoice_id, 'cid': client_id}).fetchone())
        if not inv:
            return jsonify({'success': False, 'error': 'Invoice not found'}), 404

        outstanding = _money(_num(inv['grand_total']) - _num(inv['received_amount']))
        if amount > outstanding + 0.01:
            return jsonify({
                'success': False,
                'error': f'Amount exceeds the outstanding balance of {outstanding:,.2f}'
            }), 400

        now = _now_iso()
        db.session.execute(text("""
            INSERT INTO payroll_invoice_payments (
                payment_id, client_id, invoice_id, amount, payment_method,
                reference_no, payment_date, notes, recorded_by, created_at, updated_at
            ) VALUES (:pid, :cid, :iid, :amt, :method, :ref, :pdate, :notes, :by, :now, :now)
        """), {
            'pid': str(uuid.uuid4()), 'cid': client_id, 'iid': invoice_id, 'amt': _money(amount),
            'method': (data.get('payment_method') or '').strip() or None,
            'ref': (data.get('reference_no') or '').strip() or None,
            'pdate': data.get('payment_date') or now,
            'notes': (data.get('notes') or '').strip() or None,
            'by': g.user['user_id'], 'now': now,
        })

        received = _money(db.session.execute(text(
            "SELECT COALESCE(SUM(amount), 0) FROM payroll_invoice_payments "
            "WHERE invoice_id = :iid AND client_id = :cid"),
            {'iid': invoice_id, 'cid': client_id}).scalar() or 0)
        balance = _money(_num(inv['grand_total']) - received)
        status = 'paid' if balance <= 0.01 else 'partial'

        db.session.execute(text(
            "UPDATE payroll_invoices SET received_amount = :recv, status = :status, "
            "updated_at = :now, synced_at = NULL "
            "WHERE invoice_id = :iid AND client_id = :cid"),
            {'recv': received, 'status': status, 'now': now,
             'iid': invoice_id, 'cid': client_id})
        db.session.commit()

        return jsonify({'success': True,
                        'data': {'received_amount': received, 'balance': balance, 'status': status},
                        'message': 'Payment recorded'}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f'[Payroll] record_payment failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to record payment'}), 500


# ── Invoice PDF ──────────────────────────────────────────────────────────────

_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
         'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
         'Seventeen', 'Eighteen', 'Nineteen']
_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _words(n: int) -> str:
    """Indian numbering (Thousand / Lakh / Crore) for a non-negative int."""
    if n == 0:
        return 'Zero'

    def two(x):
        return _ONES[x] if x < 20 else (_TENS[x // 10] + (f' {_ONES[x % 10]}' if x % 10 else '')).strip()

    def three(x):
        if x >= 100:
            rest = two(x % 100)
            return f'{_ONES[x // 100]} Hundred' + (f' {rest}' if rest else '')
        return two(x)

    parts = []
    crore, n = divmod(n, 1_00_00_000)
    lakh, n = divmod(n, 1_00_000)
    thousand, hundred = divmod(n, 1_000)
    if crore:
        parts.append(f'{two(crore) if crore < 100 else three(crore)} Crore')
    if lakh:
        parts.append(f'{two(lakh)} Lakh')
    if thousand:
        parts.append(f'{two(thousand)} Thousand')
    if hundred:
        parts.append(three(hundred))
    return ' '.join(parts)


def _amount_in_words(amount, currency_word='Rupees') -> str:
    """'Eight Lakh Thirty Three Thousand and Forty Five Rupees and Seventy Eight
    Paisa only' — the wording used on Indian tax invoices."""
    value = Decimal(str(_num(amount))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    negative = value < 0
    value = abs(value)
    whole = int(value)
    paisa = int((value - whole) * 100)

    text_out = f'{_words(whole)} {currency_word}'
    if paisa:
        text_out += f' and {_words(paisa)} Paisa'
    text_out += ' only'
    return f'Minus {text_out}' if negative else text_out


@payroll_invoice_bp.route('/invoices/<invoice_id>/pdf', methods=['GET'])
@authenticate
@require_permission('view_salary')
def invoice_pdf(invoice_id):
    """Render the GST service invoice.

    Layout follows the standard Indian tax-invoice anatomy: seller + invoice
    meta, Bill To / Ship To, line items with HSN and per-line tax, totals,
    amount in words, an HSN-wise tax summary (mandatory on B2B invoices), and a
    footer carrying bank details, terms and the signature block.
    """
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from flask import send_file

    client_id = g.user['client_id']
    inv = _row_to_dict(db.session.execute(text(
        "SELECT * FROM payroll_invoices WHERE invoice_id = :iid AND client_id = :cid"),
        {'iid': invoice_id, 'cid': client_id}).fetchone())
    if not inv:
        return jsonify({'success': False, 'error': 'Invoice not found'}), 404

    lines = [_row_to_dict(r) for r in db.session.execute(text(
        "SELECT * FROM payroll_invoice_lines WHERE invoice_id = :iid AND client_id = :cid "
        "ORDER BY sort_order"), {'iid': invoice_id, 'cid': client_id}).fetchall()]

    client = _client_row(client_id) or {}
    copy_label = (request.args.get('copy') or 'ORIGINAL FOR RECIPIENT').strip().upper()[:40]

    # ReportLab's built-in fonts have no rupee glyph — it renders as a black box.
    symbol = (client.get('currency_symbol') or '₹')
    cur = 'Rs. ' if symbol == '₹' else f'{symbol} '
    is_inter = (inv.get('tax_mode') == 'inter')

    INK = colors.HexColor('#0f172a')
    MUTED = colors.HexColor('#64748b')
    LINE = colors.HexColor('#cbd5e1')
    BAND = colors.HexColor('#f1f5f9')

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=f"Invoice {inv['invoice_number']}",
                            rightMargin=1.2 * cm, leftMargin=1.2 * cm,
                            topMargin=1.0 * cm, bottomMargin=1.2 * cm)
    styles = getSampleStyleSheet()
    W = 18.6 * cm

    def st(name, size=8.5, bold=False, align=TA_LEFT, color=INK, leading=None):
        return ParagraphStyle(name, parent=styles['Normal'], fontSize=size,
                              leading=leading or size * 1.35, alignment=align, textColor=color,
                              fontName='Helvetica-Bold' if bold else 'Helvetica')

    s_label = st('lbl', 7.5, color=MUTED)
    s_val = st('val', 8.5)
    s_val_b = st('valb', 8.5, bold=True)
    s_head = st('head', 7.5, bold=True, align=TA_CENTER, color=colors.white)
    s_cell = st('cell', 8)
    s_cell_r = st('cellr', 8, align=TA_RIGHT)
    s_cell_c = st('cellc', 8, align=TA_CENTER)
    s_cell_rb = st('cellrb', 8, bold=True, align=TA_RIGHT)
    s_title = st('title', 13, bold=True, align=TA_CENTER)
    s_copy = st('copy', 7.5, align=TA_RIGHT, color=MUTED)

    elements = [
        Table([[Paragraph('Service Invoice', s_title), Paragraph(copy_label, s_copy)]],
              colWidths=[13 * cm, 5.6 * cm],
              style=TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0),
                                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                                ('VALIGN', (0, 0), (-1, -1), 'BOTTOM')])),
    ]

    # ── Seller block + invoice meta ─────────────────────────────────────────
    seller_bits = [Paragraph((client.get('client_name') or 'Business'), st('co', 12, bold=True))]
    for label, value in [('', client.get('address')), ('', client.get('address2')),
                         ('Phone no.: ', client.get('phone')), ('Email: ', client.get('email')),
                         ('GSTIN: ', client.get('gst_number')), ('State: ', client.get('state_code')),
                         ('Website: ', client.get('website'))]:
        if value:
            seller_bits.append(Paragraph(f'{label}{value}'.replace('\n', '<br/>'), s_val))

    meta_rows = [
        ['Invoice No.', inv['invoice_number'], 'Date', _fmt_date(inv.get('invoice_date'))],
        ['Place of Supply', inv.get('place_of_supply') or '—', 'Pay Period',
         f"{_fmt_date(inv.get('period_start'))} to {_fmt_date(inv.get('period_end'))}"],
    ]
    meta_tbl = Table(
        [[Paragraph(r[0], s_label), Paragraph(str(r[1] or '—'), s_val_b),
          Paragraph(r[2], s_label), Paragraph(str(r[3] or '—'), s_val_b)] for r in meta_rows],
        # Sums to 10.6cm: the parent cell is 11.3cm wide minus 8pt padding each
        # side, and a nested table that overruns its cell silently draws past
        # the frame instead of wrapping.
        colWidths=[2.2 * cm, 3.2 * cm, 2.0 * cm, 3.2 * cm])
    meta_tbl.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))

    header_tbl = Table([[seller_bits, meta_tbl]], colWidths=[7.3 * cm, 11.3 * cm])
    header_tbl.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('LINEAFTER', (0, 0), (0, 0), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(header_tbl)

    # ── Bill To / Ship To ───────────────────────────────────────────────────
    bill_bits = [Paragraph('Bill To', s_label),
                 Paragraph(inv.get('customer_name') or '—', s_val_b)]
    for value in [inv.get('customer_address'),
                  f"Contact No.: {inv['customer_phone']}" if inv.get('customer_phone') else None,
                  f"GSTIN: {inv['customer_gstin']}" if inv.get('customer_gstin') else None,
                  f"State: {inv['customer_state']}" if inv.get('customer_state') else None]:
        if value:
            bill_bits.append(Paragraph(str(value).replace('\n', '<br/>'), s_val))

    ship_bits = [Paragraph('Ship To', s_label),
                 Paragraph(str(inv.get('ship_to') or inv.get('customer_address') or '—')
                           .replace('\n', '<br/>'), s_val)]

    parties = Table([[bill_bits, ship_bits]], colWidths=[9.3 * cm, 9.3 * cm])
    parties.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('LINEAFTER', (0, 0), (0, 0), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(parties)

    # ── Line items ──────────────────────────────────────────────────────────
    tax_head = 'IGST' if is_inter else 'GST'
    item_rows = [[Paragraph('Sl.', s_head), Paragraph('Service Description', s_head),
                  Paragraph('HSN/SAC', s_head), Paragraph('Workers', s_head),
                  Paragraph('Salary', s_head), Paragraph('Service<br/>Charge', s_head),
                  Paragraph('Taxable', s_head), Paragraph(tax_head, s_head),
                  Paragraph('Amount', s_head)]]

    for i, ln in enumerate(lines, start=1):
        tax_amt = _num(ln.get('igst_amount')) if is_inter else (
            _num(ln.get('cgst_amount')) + _num(ln.get('sgst_amount')))
        svc_pct = _num(ln.get('service_charge_percent'))
        item_rows.append([
            Paragraph(str(i), s_cell_c),
            Paragraph(ln.get('description') or '—', s_cell),
            Paragraph(ln.get('hsn_code') or '—', s_cell_c),
            Paragraph(str(int(_num(ln.get('headcount')))), s_cell_c),
            Paragraph(f"{_num(ln.get('salary_amount')):,.2f}", s_cell_r),
            Paragraph(f"{_num(ln.get('service_charge_amount')):,.2f}<br/>"
                      f"<font size=6 color='#64748b'>({svc_pct:g}%)</font>", s_cell_r),
            Paragraph(f"{_num(ln.get('taxable_amount')):,.2f}", s_cell_r),
            Paragraph(f"{tax_amt:,.2f}<br/>"
                      f"<font size=6 color='#64748b'>({_num(ln.get('gst_rate')):g}%)</font>", s_cell_r),
            Paragraph(f"{_num(ln.get('line_total')):,.2f}", s_cell_r),
        ])

    total_workers = sum(int(_num(ln.get('headcount'))) for ln in lines)
    item_rows.append([
        Paragraph('', s_cell), Paragraph('Total', s_cell_rb), Paragraph('', s_cell),
        Paragraph(str(total_workers), s_cell_c),
        Paragraph(f"{_num(inv.get('salary_total')):,.2f}", s_cell_rb),
        Paragraph(f"{_num(inv.get('service_total')):,.2f}", s_cell_rb),
        Paragraph(f"{_num(inv.get('taxable_total')):,.2f}", s_cell_rb),
        Paragraph(f"{_num(inv.get('tax_total')):,.2f}", s_cell_rb),
        Paragraph(f"{_num(inv.get('grand_total')):,.2f}", s_cell_rb),
    ])

    # Must sum to W (18.6cm) — the content width between the page margins.
    items_tbl = Table(item_rows, repeatRows=1,
                      colWidths=[0.8 * cm, 4.2 * cm, 1.7 * cm, 1.5 * cm,
                                 2.3 * cm, 2.0 * cm, 2.2 * cm, 1.9 * cm, 2.0 * cm])
    last = len(item_rows) - 1
    items_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), INK),
        ('BACKGROUND', (0, last), (-1, last), BAND),
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(items_tbl)

    # ── Amount in words + totals ────────────────────────────────────────────
    balance = _money(_num(inv.get('grand_total')) - _num(inv.get('received_amount')))
    amount_rows = [('Sub Total', _num(inv.get('taxable_total')), False)]
    if is_inter:
        amount_rows.append((f"IGST", _num(inv.get('igst_total')), False))
    else:
        amount_rows.append(('CGST', _num(inv.get('cgst_total')), False))
        amount_rows.append(('SGST', _num(inv.get('sgst_total')), False))
    amount_rows.append(('Total', _num(inv.get('grand_total')), True))
    amount_rows.append(('Received', _num(inv.get('received_amount')), False))
    amount_rows.append(('Balance', balance, True))

    amounts_tbl = Table(
        [[Paragraph(label, s_cell_rb if bold else s_cell),
          Paragraph(f'{cur}{value:,.2f}', s_cell_rb if bold else s_cell_r)]
         for label, value, bold in amount_rows],
        colWidths=[4.3 * cm, 4.0 * cm])
    amounts_tbl.setStyle(TableStyle([
        ('INNERGRID', (0, 0), (-1, -1), 0.4, LINE),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, len(amount_rows) - 1), (-1, len(amount_rows) - 1), BAND),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))

    words_cell = [
        Paragraph('Invoice Amount In Words', s_label),
        Paragraph(_amount_in_words(inv.get('grand_total')), s_val_b),
    ]
    words_tbl = Table([[words_cell, amounts_tbl]], colWidths=[10.3 * cm, 8.3 * cm])
    words_tbl.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('LINEAFTER', (0, 0), (0, 0), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (0, 0), 7), ('BOTTOMPADDING', (0, 0), (0, 0), 7),
        ('LEFTPADDING', (0, 0), (0, 0), 8), ('RIGHTPADDING', (0, 0), (0, 0), 8),
        ('TOPPADDING', (1, 0), (1, 0), 0), ('BOTTOMPADDING', (1, 0), (1, 0), 0),
        ('LEFTPADDING', (1, 0), (1, 0), 0), ('RIGHTPADDING', (1, 0), (1, 0), 0),
    ]))
    elements.append(words_tbl)

    # ── HSN-wise tax summary (mandatory on B2B tax invoices) ────────────────
    by_hsn = {}
    for ln in lines:
        key = (ln.get('hsn_code') or '—', _num(ln.get('gst_rate')))
        agg = by_hsn.setdefault(key, {'taxable': 0.0, 'cgst': 0.0, 'sgst': 0.0, 'igst': 0.0})
        agg['taxable'] += _num(ln.get('taxable_amount'))
        agg['cgst'] += _num(ln.get('cgst_amount'))
        agg['sgst'] += _num(ln.get('sgst_amount'))
        agg['igst'] += _num(ln.get('igst_amount'))

    if is_inter:
        hsn_rows = [[Paragraph('HSN/SAC', s_head), Paragraph('Taxable amount', s_head),
                     Paragraph('IGST Rate', s_head), Paragraph('IGST Amount', s_head),
                     Paragraph('Total Tax Amount', s_head)]]
        for (hsn, rate), agg in by_hsn.items():
            hsn_rows.append([
                Paragraph(hsn, s_cell), Paragraph(f"{_money(agg['taxable']):,.2f}", s_cell_r),
                Paragraph(f'{rate:g}%', s_cell_c), Paragraph(f"{_money(agg['igst']):,.2f}", s_cell_r),
                Paragraph(f"{_money(agg['igst']):,.2f}", s_cell_r),
            ])
        hsn_rows.append([
            Paragraph('Total', s_cell_rb), Paragraph(f"{_num(inv.get('taxable_total')):,.2f}", s_cell_rb),
            Paragraph('', s_cell), Paragraph(f"{_num(inv.get('igst_total')):,.2f}", s_cell_rb),
            Paragraph(f"{_num(inv.get('tax_total')):,.2f}", s_cell_rb),
        ])
        hsn_widths = [3.6 * cm, 4.0 * cm, 2.6 * cm, 4.0 * cm, 4.4 * cm]
    else:
        hsn_rows = [[Paragraph('HSN/SAC', s_head), Paragraph('Taxable amount', s_head),
                     Paragraph('CGST Rate', s_head), Paragraph('CGST Amount', s_head),
                     Paragraph('SGST Rate', s_head), Paragraph('SGST Amount', s_head),
                     Paragraph('Total Tax Amount', s_head)]]
        for (hsn, rate), agg in by_hsn.items():
            half = rate / 2
            hsn_rows.append([
                Paragraph(hsn, s_cell), Paragraph(f"{_money(agg['taxable']):,.2f}", s_cell_r),
                Paragraph(f'{half:g}%', s_cell_c), Paragraph(f"{_money(agg['cgst']):,.2f}", s_cell_r),
                Paragraph(f'{half:g}%', s_cell_c), Paragraph(f"{_money(agg['sgst']):,.2f}", s_cell_r),
                Paragraph(f"{_money(agg['cgst'] + agg['sgst']):,.2f}", s_cell_r),
            ])
        hsn_rows.append([
            Paragraph('Total', s_cell_rb), Paragraph(f"{_num(inv.get('taxable_total')):,.2f}", s_cell_rb),
            Paragraph('', s_cell), Paragraph(f"{_num(inv.get('cgst_total')):,.2f}", s_cell_rb),
            Paragraph('', s_cell), Paragraph(f"{_num(inv.get('sgst_total')):,.2f}", s_cell_rb),
            Paragraph(f"{_num(inv.get('tax_total')):,.2f}", s_cell_rb),
        ])
        hsn_widths = [3.0 * cm, 3.4 * cm, 2.0 * cm, 2.9 * cm, 2.0 * cm, 2.9 * cm, 2.4 * cm]

    hsn_tbl = Table(hsn_rows, colWidths=hsn_widths, repeatRows=1)
    hsn_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), INK),
        ('BACKGROUND', (0, len(hsn_rows) - 1), (-1, len(hsn_rows) - 1), BAND),
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(hsn_tbl)

    # ── Footer: bank details · terms · signature ────────────────────────────
    bank_bits = [Paragraph('Bank Details', st('bk', 8, bold=True))]
    for label, value in [('Name: ', client.get('bank_name')),
                         ('Account No.: ', client.get('bank_account_no')),
                         ('IFSC code: ', client.get('bank_ifsc')),
                         ("Account Holder's Name: ", client.get('bank_account_holder'))]:
        if value:
            bank_bits.append(Paragraph(f'{label}{value}', s_val))
    if client.get('upi_id'):
        bank_bits.append(Paragraph(f"UPI: {client['upi_id']}", s_val))
    if len(bank_bits) == 1:
        bank_bits.append(Paragraph('—', st('none', 8, color=MUTED)))

    terms_text = (inv.get('terms') or client.get('invoice_terms')
                  or 'Thanks for doing business with us!')
    terms_bits = [Paragraph('Terms and conditions', st('tc', 8, bold=True)),
                  Paragraph(str(terms_text).replace('\n', '<br/>'), s_val)]

    sign_bits = [Paragraph(f"For: {client.get('client_name') or 'Business'}",
                           st('for', 8, align=TA_CENTER))]
    sign_img = _signature_flowable(client.get('signature_url'))
    if sign_img is not None:
        sign_bits.append(Spacer(1, 4))
        sign_bits.append(sign_img)
    else:
        sign_bits.append(Spacer(1, 34))
    sign_bits.append(Paragraph('Authorized Signatory', st('sig', 8, bold=True, align=TA_CENTER)))

    footer_tbl = Table([[bank_bits, terms_bits, sign_bits]],
                       colWidths=[6.4 * cm, 6.2 * cm, 6.0 * cm])
    footer_tbl.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.7, LINE),
        ('LINEAFTER', (0, 0), (1, 0), 0.5, LINE),
        ('VALIGN', (0, 0), (1, 0), 'TOP'),
        ('VALIGN', (2, 0), (2, 0), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(footer_tbl)

    elements.append(Spacer(1, 8))
    elements.append(Paragraph(
        'Computer-generated invoice &#8226; Valoryx', st('ftr', 6.5, align=TA_CENTER, color=MUTED)))

    doc.build(elements)
    buffer.seek(0)
    safe_number = str(inv['invoice_number']).replace('/', '-')
    return send_file(buffer, mimetype='application/pdf', as_attachment=True,
                     download_name=f'Invoice_{safe_number}.pdf')

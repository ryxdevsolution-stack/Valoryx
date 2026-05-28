# Salary Cycle Enforcement & Overtime Tracking

**Date:** 2026-05-27  
**Migration:** v24  
**Status:** Implemented

---

## 1. Cycle-Enforcement Rule

Every attendance entry point enforces that a salary cycle (status = `open`) covers the target `work_date`.

**Applies to:**
- `POST /api/employees/<id>/attendance/checkin`
- `POST /api/employees/<id>/day-off` (mark leave / absent / holiday / weekly-off)

**Rules:**
- If **no cycle covers** the work_date → `409 NO_CYCLE` with body `{ code: "NO_CYCLE", work_date }`
- If a cycle covers it but is **sealed (paid)** → `409 CYCLE_SEALED` with body `{ code: "CYCLE_SEALED", cycle_id }`
- Future dates outside cycles are also blocked (uniform rule — no exceptions for "pre-entry")
- Checkout (`POST /attendance/checkout`) is NOT gated — you can only check out an existing check-in, which was already gated at check-in time

**Frontend behavior:**
- Calendar cells with no covering cycle render with a red border + red dot
- Calendar cells in a sealed cycle render grayed-out with strikethrough
- Clicking a no-cycle day shows a toast: _"No salary cycle covers this date. Create a cycle first."_ and (if manager) opens the new-cycle modal after 300ms
- The header Check In button is visually dimmed and shows a tooltip when today has no open cycle

---

## 2. OT Data Model

### Database columns (added in migration v24)

| Table | Column | Type | Semantics |
|---|---|---|---|
| `employees` | `ot_multiplier` | `DECIMAL(4,2) NULL` | Per-employee OT rate multiplier. NULL → defaults to 1.5 at runtime |
| `employee_attendance` | `auto_ot_minutes` | `INTEGER NOT NULL DEFAULT 0` | Auto-computed at checkout: `max(0, total_minutes − cycle.full_day_mins)` |
| `employee_attendance` | `approved_ot_minutes` | `INTEGER NULL` | Manager decision: NULL = pending, 0 = rejected, N = approved N minutes |

### State machine for `approved_ot_minutes`

```
NULL      →  pending (not yet reviewed by manager)
0         →  rejected (no OT pay)
N > 0     →  approved (N minutes paid at OT rate)
```

Only rows with `auto_ot_minutes > 0 AND approved_ot_minutes IS NULL` appear in the pending OT panel.

---

## 3. OT Payout Formula

```
ot_pay = approved_ot_minutes × (rate_snapshot / 60) × ot_multiplier
```

Where:
- `approved_ot_minutes` — manager-approved count (must be non-null and > 0)
- `rate_snapshot` — the rate frozen into the salary cycle at creation time
- `ot_multiplier` — from `employees.ot_multiplier` (default 1.5 when NULL)

**Important:** Regular pay is **capped at `full_day_mins`** for daily-rate employees. OT pay is layered on top — not included in the regular pay cap.

Example for a daily employee earning ₹600/day with `full_day_mins=480`:
- Worked 600 minutes, approved OT = 120 minutes
- Regular pay: `min(600/480, 1.0) × 600 = ₹600`
- OT pay: `120 × (600/480) × 1.5 = ₹225`
- Total: `₹825`

---

## 4. Per-Employee OT Multiplier

- Default: **1.5×** (1.5 times the regular per-minute rate)
- Set in the Add Employee modal (new employees) or via PUT `/api/employees/<id>`
- Stored as `employees.ot_multiplier DECIMAL(4,2)`
- Existing employees with NULL after migration automatically use 1.5 in all salary calculations
- Validation: must be a non-negative number (`ot_multiplier >= 0`)

---

## 5. Migration v24 Columns

Migration function: `_m024_ot_columns(db)` in `backend/migrations/runner.py`

```
CURRENT_SCHEMA_VERSION = 24
```

Columns added:
```sql
ALTER TABLE employees            ADD COLUMN ot_multiplier      DECIMAL(4,2) NULL;
ALTER TABLE employee_attendance  ADD COLUMN auto_ot_minutes     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employee_attendance  ADD COLUMN approved_ot_minutes INTEGER NULL;
```

Migration is idempotent — re-running on an already-migrated schema is a no-op.

---

## 6. Calendar Visual Signals (Frontend)

AttendancePanel mini-calendar uses four coverage states per cell:

| State | Visual | Tooltip |
|---|---|---|
| Open cycle covers date + has entry | Green (present) / Amber (paid off) / Gray (unpaid off) | Normal |
| Open cycle covers date + no entry | Gray (clickable for managers) | "Absent — click to mark leave / absent" |
| **No cycle covers date** | White bg, red border, small red dot | "No salary cycle — create one first" |
| **Cycle covers date but sealed** | Gray, dimmed, strikethrough text | "Cycle sealed (paid) — cannot mark attendance" |
| Future date | Light gray, disabled | "Future date" |

Legend at the bottom of the calendar includes a "No cycle" key.

---

## 7. PendingOTPanel Manager Flow

Component: `frontend-react/src/components/salary/PendingOTPanel.tsx`

**Renders when:** An employee is selected AND the current user has `manage_salary_cycles` permission.

**Data source:** `GET /api/employees/<id>/ot/pending`  
Returns attendance rows where `auto_ot_minutes > 0 AND approved_ot_minutes IS NULL`.

**Actions:**
- **Approve** → `POST /api/employees/attendance/<aid>/approve-ot { ot_minutes: <auto_ot_minutes> }`
  - Sets `approved_ot_minutes = auto_ot_minutes`
- **Reject** → `POST /api/employees/attendance/<aid>/approve-ot { ot_minutes: 0 }`
  - Sets `approved_ot_minutes = 0`
- After either action: toast confirmation, list refreshes, cycle totals refresh

**Effect on pay:** Approved OT is included in the next `calculate_cycle` call. OT pay appears as:
- A per-row `ot_minutes` / `ot_pay` column in the daily breakdown table
- An `ot_summary` banner at the top of the expanded cycle detail showing total OT hours and total OT pay

---

## 8. API Endpoints Added

| Method | URL | Permission | Description |
|---|---|---|---|
| GET | `/api/employees/<id>/ot/pending` | `view_salary` | List pending OT rows for an employee |
| POST | `/api/employees/attendance/<aid>/approve-ot` | `manage_salary_cycles` | Approve or reject OT for an attendance row |
| GET | `/api/employees/<id>/cycles/covering?date=YYYY-MM-DD` | `view_salary` | Return the cycle covering a given date, or null |

---

## 9. Files Changed

**Backend:**
- `backend/migrations/runner.py` — v24 migration, bumped `CURRENT_SCHEMA_VERSION` to 24
- `backend/routes/employees.py` — `_find_covering_cycle`, cycle gates on checkin/day-off, auto_ot on checkout, OT approval endpoints, ot_multiplier in create/update, OT in `_calculate_cycle_amounts`

**Frontend:**
- `frontend-react/src/pages/Salary.tsx` — Updated Employee/DailyBreakdown/SalaryCycle types, added OTSummary type, wired PendingOTPanel
- `frontend-react/src/components/salary/AttendancePanel.tsx` — isCovered helper, cycle fetch, calendar coverage states, Check In button gating
- `frontend-react/src/components/salary/SalaryModals.tsx` — ot_multiplier field in AddEmployeeModal
- `frontend-react/src/components/salary/SalaryPanel.tsx` — OT columns in daily breakdown table, OT summary banner
- `frontend-react/src/components/salary/PendingOTPanel.tsx` — new component (manager OT approval panel)

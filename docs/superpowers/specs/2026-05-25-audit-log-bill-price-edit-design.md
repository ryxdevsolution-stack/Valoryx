# Edit Bill Price from Audit Log — Design Spec

**Date:** 2026-05-25
**Scope:** Flask backend (`backend/`) + React frontend (`frontend-react/`)
**Goal:** Allow owners (and users they delegate to) to correct bill pricing from the Auditor Reports page, with an option to also update the master product rate so future bills inherit the change. Preserve full audit history.

---

## 1. User Experience

### 1.1 Entry point
On the Auditor Reports page ([`frontend-react/src/pages/Audit.tsx`](../../../frontend-react/src/pages/Audit.tsx)), each bill row in the GST bills list gets an **Edit** action (icon button).

- Visible only when `hasPermission('edit_bill_price_audit')` returns true.
- Wrapped in `<PermissionGate permission="edit_bill_price_audit">` so unauthorized users see nothing.
- Disabled (with tooltip "Cancelled bills cannot be edited") for bills whose `status === 'cancelled'`.

### 1.2 Edit modal
Clicking Edit opens `EditBillPriceDialog`:

- Shows bill header (bill number, customer name, date) as read-only.
- Lists every line item in an editable table.
- **Editable per line:** `rate`, `quantity`, `discount`, `tax_percent`.
- **Read-only per line:** `item_name`, `item_code`, `hsn_code`.
- **Live recomputation:** the dialog recomputes line totals, subtotal, total tax, and grand total on every edit and shows them in a sticky footer. No backend call until Save.
- Footer buttons: **Cancel** and **Save**.

### 1.3 Save scope prompt
On Save click, before any backend call, show `SaveScopeDialog` with three buttons:

- **Save for this bill only** — updates this bill's line items only.
- **Save & update master rate** — updates this bill AND writes the new `rate` back to the matching `StockEntry` rows. Future bills inherit the new rate.
- **Cancel** — close the prompt, keep the edit dialog open.

After confirmation, fire the backend call. On success, refresh the bill row, close both dialogs, show a toast describing what changed (e.g. `"Bill #INV-001 updated. 3 master rates updated."` or `"Bill #INV-001 updated."`).

---

## 2. Permission Model

### 2.1 New permission
Add a single new permission to the existing permissions table:

| Field | Value |
|---|---|
| `permission_key` | `edit_bill_price_audit` |
| `section_key` | `billing` |
| `description` | `Edit bill prices from the audit log` |
| `is_active` | `true` |

Seeded alongside existing permissions in [`backend/app.py`](../../../backend/app.py) wherever the current permission seeder runs.

### 2.2 Owner default grant
On app startup, after permission seeding, run an idempotent grant step:

- Find every user with `role = 'owner'` for each `client_id`.
- For each such user, ensure a `UserPermission` row exists for `edit_bill_price_audit`. Skip if it already exists.
- Log a single info-level message per client showing how many owner grants were inserted (zero is fine and means already-applied).

This must run inside the existing migration / startup hooks so a fresh deploy and an existing deploy both arrive at the same state.

### 2.3 Granting to others
No new UI is needed. The new permission appears automatically in the existing permissions management screen (it is pulled from `GET /permissions/all`). The owner uses the existing permissions UI to grant or revoke for any user they manage — including newly created users. New users get no grant by default; the owner explicitly enables `edit_bill_price_audit` per user.

---

## 3. Backend Changes

### 3.1 Endpoint: `PUT /billing/<bill_id>`
File: [`backend/routes/billing.py`](../../../backend/routes/billing.py) (existing handler around line 1130).

**Authorization change:** today it requires `edit_bill_details`. Change to allow EITHER:
- `edit_bill_details` (existing broad permission), OR
- `edit_bill_price_audit` (the new permission).

If a `require_any_permission([...])` decorator does not exist in [`backend/utils/permission_middleware.py`](../../../backend/utils/permission_middleware.py), add one. It should mirror the existing `require_permission` decorator but accept a list and pass if any permission is present, or the caller is super-admin.

**New query parameter:** `?update_master=true|false` (defaults to `false`).

**When `update_master=true`:**
- For each edited line item where `rate` changed, look up the corresponding `StockEntry` by `product_id` / `item_code` (whichever the bill item already references).
- Update `StockEntry.rate` to the new value.
- Log a separate audit row per stock update: `log_action('UPDATE', 'stock', stock_id, old_data={'rate': old_rate}, new_data={'rate': new_rate, 'source': 'audit_log_edit', 'triggered_by_bill_id': bill_id})`.
- If no matching `StockEntry` is found (e.g., manually-typed service item), silently skip that line. Do NOT 404 the whole request.

**Atomicity:** wrap the bill update and any stock updates in the same database transaction. If any step fails, roll back everything.

**Field whitelist when caller has only `edit_bill_price_audit`:** when the caller does NOT have `edit_bill_details` but DOES have `edit_bill_price_audit`, reject any payload field outside the pricing whitelist (`rate`, `quantity`, `discount`, `tax_percent`, plus the implicit recomputed totals). Returns `400` with `{"success": false, "error": "Only pricing fields are editable with audit permission"}`.

### 3.2 Audit logging
Bill UPDATE is already logged automatically via the existing `log_action('UPDATE', 'gst_billing'|'non_gst_billing', ...)` call. No change there.

Stock UPDATE rows from the master-rate sync are new and described in 3.1 above.

### 3.3 Cancelled bills
The existing handler already rejects edits when `bill.status == 'cancelled'`. Keep this behavior unchanged — applies to both old and new callers.

---

## 4. Frontend Changes

### 4.1 New files
- `frontend-react/src/components/audit/EditBillPriceDialog.tsx` — the edit modal (line-item editor + live totals).
- `frontend-react/src/components/audit/SaveScopeDialog.tsx` — the three-way confirm dialog.

### 4.2 Modified files
- [`frontend-react/src/pages/Audit.tsx`](../../../frontend-react/src/pages/Audit.tsx)
  - Add Edit button to each row.
  - Wrap in `<PermissionGate permission="edit_bill_price_audit">`.
  - Wire button click to open `EditBillPriceDialog` with the row's bill.
  - On save success, refresh the bill list (re-fetch or local update).

- `frontend-react/src/services/billingService.ts` (or current bill service file)
  - Add `updateBillFromAudit(billId: string, payload: BillEditPayload, opts: { updateMaster: boolean }): Promise<Bill>`.
  - Calls `PUT /billing/<billId>?update_master=<true|false>` via the shared `api` axios instance.

### 4.3 Types
Add to `frontend-react/src/types/billing.ts`:
```ts
export interface BillEditPayload {
  items: Array<{
    item_id: string;
    rate: number;
    quantity: number;
    discount: number;
    tax_percent: number;
  }>;
}
```

### 4.4 Live recompute logic
Recompute in the dialog (no backend round-trip until Save):
```
line_subtotal = rate * quantity
line_discount_amount = line_subtotal * (discount / 100)
line_taxable = line_subtotal - line_discount_amount
line_tax_amount = line_taxable * (tax_percent / 100)
line_total = line_taxable + line_tax_amount

bill_subtotal = sum(line_subtotal)
bill_discount = sum(line_discount_amount)
bill_tax = sum(line_tax_amount)
bill_total = sum(line_total)
```
This mirrors the formula used in [`CreateBill.tsx`](../../../frontend-react/src/pages/billing/CreateBill.tsx). Per the project's DRY rule, extract the math into a shared util `frontend-react/src/utils/billCalc.ts` and refactor `CreateBill.tsx` to call it. Both pages must use the same source of truth for bill arithmetic.

---

## 5. Edge Cases & Constraints

| # | Case | Handling |
|---|---|---|
| 1 | Cancelled bill | Edit button disabled; backend rejects (existing behavior preserved). |
| 2 | Quantity change | Existing endpoint already adjusts stock entry counts when qty changes; keep that. |
| 3 | Master rate update for non-stock item (manual service line) | Silently skip that line in the stock-sync step; do not error. |
| 4 | Multi-item bill with "update master" | Every edited line item's master rate gets updated. |
| 5 | GST vs non-GST bills | Both handled by the same endpoint; both supported. |
| 6 | Caller has only `edit_bill_price_audit` and submits non-pricing fields | Backend returns 400 with explanatory error (field-whitelist enforcement). |
| 7 | Concurrent edits (two users edit the same bill simultaneously) | Out of scope. Last write wins. No optimistic locking added. |
| 8 | Bulk edit across multiple bills | Out of scope. One bill at a time. |
| 9 | Editing customer/date/item identity | Out of scope of this feature. Existing `edit_bill_details` flow handles those elsewhere. |

---

## 6. Audit Trail Expectations

After a price edit from the audit log, the audit_log table should contain:
- 1 row: `UPDATE` on `gst_billing` (or `non_gst_billing`) with `old_data` and `new_data` showing pricing field changes.
- 0–N rows: `UPDATE` on `stock`, one per line item whose master rate was synced (only when `update_master=true`).

Each row records the acting `user_id`, `client_id`, IP, and user-agent automatically via the existing `audit_logger` utility.

---

## 7. Out of Scope

- Optimistic locking / conflict detection for concurrent edits.
- Editing fields other than rate / quantity / discount / tax percent.
- Bulk editing across multiple bills.
- Editing already-cancelled bills.
- Any change to the AdminAudit page ([`frontend-react/src/pages/admin/AdminAudit.tsx`](../../../frontend-react/src/pages/admin/AdminAudit.tsx)).
- Roll-back/undo UI (the audit history serves as the record; no in-app revert button).

---

## 8. Files Touched (Summary)

**New:**
- `frontend-react/src/components/audit/EditBillPriceDialog.tsx`
- `frontend-react/src/components/audit/SaveScopeDialog.tsx`
- `frontend-react/src/utils/billCalc.ts`

**Modified:**
- `frontend-react/src/pages/Audit.tsx`
- `frontend-react/src/services/billingService.ts` (or wherever bill service lives — confirm during implementation)
- `frontend-react/src/types/billing.ts`
- `backend/app.py` (permission seed + owner grant)
- `backend/routes/billing.py` (allow new permission, add `update_master` query param, stock sync logic, field whitelist)
- `backend/utils/permission_middleware.py` (add `require_any_permission` decorator if missing)
- `frontend-react/src/pages/billing/CreateBill.tsx` (refactor to call the shared `billCalc.ts` util — required, not optional)

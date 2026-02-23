# Branch Stock Transfer System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-branch inventory management with a request-approve stock transfer workflow to Valoryx.

**Architecture:** New `branches`, `branch_inventory`, `stock_transfers`, and `stock_transfer_items` tables added to the existing Flask + SQLAlchemy backend. New `/api/branches` and `/api/stock-transfers` blueprint routes. React TypeScript frontend gets a new "Stock Transfer" nav section with tabbed pages for creating transfers, managing approvals, viewing history, and managing branches. Existing `stock_entry` stays as the product catalog; per-branch quantities live in `branch_inventory`.

**Tech Stack:** Python/Flask/SQLAlchemy (backend), React 18/TypeScript/Vite/Tailwind (frontend), PostgreSQL+SQLite dual-mode (database), Axios (HTTP client), lucide-react (icons)

**Design Doc:** `docs/plans/2026-02-23-branch-stock-transfer-design.md`

---

## Task 1: Create Branch Model

**Files:**
- Create: `backend/models/branch_model.py`

**Step 1: Create the Branch model**

```python
from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID

class Branch(db.Model):
    """Physical branch/location for a client"""
    __tablename__ = 'branches'

    __table_args__ = (
        db.Index('idx_branches_client', 'client_id'),
    )

    branch_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    location = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'branch_id': str(self.branch_id) if self.branch_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'name': self.name,
            'location': self.location,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
```

**Step 2: Commit**

```bash
git add backend/models/branch_model.py
git commit -m "feat(models): add Branch model for multi-branch support"
```

---

## Task 2: Create Branch Inventory Model

**Files:**
- Create: `backend/models/branch_inventory_model.py`

**Step 1: Create the BranchInventory model**

```python
from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID

class BranchInventory(db.Model):
    """Per-branch stock quantities — links products (stock_entry) to branches"""
    __tablename__ = 'branch_inventory'

    __table_args__ = (
        db.UniqueConstraint('branch_id', 'product_id', name='uq_branch_product'),
        db.Index('idx_branch_inv_client_branch', 'client_id', 'branch_id'),
    )

    id = db.Column(FlexibleUUID, primary_key=True)
    branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=False)
    product_id = db.Column(FlexibleUUID, db.ForeignKey('stock_entry.product_id'), nullable=False)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    low_stock_alert = db.Column(db.Integer, default=10)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    branch = db.relationship('Branch', backref=db.backref('inventory_items', lazy='dynamic'))
    product = db.relationship('StockEntry', backref=db.backref('branch_quantities', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'branch_id': str(self.branch_id) if self.branch_id else None,
            'product_id': str(self.product_id) if self.product_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'quantity': self.quantity,
            'low_stock_alert': self.low_stock_alert,
            'product_name': self.product.product_name if self.product else None,
            'category': self.product.category if self.product else None,
            'rate': float(self.product.rate) if self.product else None,
            'cost_price': float(self.product.cost_price) if self.product and self.product.cost_price else None,
            'mrp': float(self.product.mrp) if self.product and self.product.mrp else None,
            'unit': self.product.unit if self.product else None,
            'item_code': self.product.item_code if self.product else None,
            'barcode': self.product.barcode if self.product else None,
            'is_low_stock': self.quantity <= self.low_stock_alert,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
```

**Step 2: Commit**

```bash
git add backend/models/branch_inventory_model.py
git commit -m "feat(models): add BranchInventory model for per-branch stock tracking"
```

---

## Task 3: Create Stock Transfer and Transfer Items Models

**Files:**
- Create: `backend/models/stock_transfer_model.py`

**Step 1: Create StockTransfer and StockTransferItem models**

```python
from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID

class StockTransfer(db.Model):
    """Stock transfer request between branches with approval workflow"""
    __tablename__ = 'stock_transfers'

    __table_args__ = (
        db.Index('idx_transfers_client_status', 'client_id', 'status'),
    )

    transfer_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    from_branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=False)
    to_branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending, approved, rejected, completed
    notes = db.Column(db.Text, nullable=True)
    requested_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=False)
    approved_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    from_branch = db.relationship('Branch', foreign_keys=[from_branch_id])
    to_branch = db.relationship('Branch', foreign_keys=[to_branch_id])
    requester = db.relationship('User', foreign_keys=[requested_by])
    approver = db.relationship('User', foreign_keys=[approved_by])
    items = db.relationship('StockTransferItem', backref='transfer', lazy='joined', cascade='all, delete-orphan')

    def to_dict(self, include_items=True):
        result = {
            'transfer_id': str(self.transfer_id) if self.transfer_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'from_branch_id': str(self.from_branch_id) if self.from_branch_id else None,
            'to_branch_id': str(self.to_branch_id) if self.to_branch_id else None,
            'from_branch_name': self.from_branch.name if self.from_branch else None,
            'to_branch_name': self.to_branch.name if self.to_branch else None,
            'status': self.status,
            'notes': self.notes,
            'requested_by': str(self.requested_by) if self.requested_by else None,
            'requester_name': self.requester.full_name if self.requester else None,
            'approved_by': str(self.approved_by) if self.approved_by else None,
            'approver_name': self.approver.full_name if self.approver else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_items:
            result['items'] = [item.to_dict() for item in self.items]
        return result


class StockTransferItem(db.Model):
    """Individual product line item in a stock transfer"""
    __tablename__ = 'stock_transfer_items'

    id = db.Column(FlexibleUUID, primary_key=True)
    transfer_id = db.Column(FlexibleUUID, db.ForeignKey('stock_transfers.transfer_id'), nullable=False)
    product_id = db.Column(FlexibleUUID, db.ForeignKey('stock_entry.product_id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    # Relationship
    product = db.relationship('StockEntry')

    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'transfer_id': str(self.transfer_id) if self.transfer_id else None,
            'product_id': str(self.product_id) if self.product_id else None,
            'product_name': self.product.product_name if self.product else None,
            'item_code': self.product.item_code if self.product else None,
            'unit': self.product.unit if self.product else None,
            'quantity': self.quantity,
        }
```

**Step 2: Commit**

```bash
git add backend/models/stock_transfer_model.py
git commit -m "feat(models): add StockTransfer and StockTransferItem models with approval workflow"
```

---

## Task 4: Create Database Migration SQL

**Files:**
- Create: `backend/migrations/020_create_branches_and_transfers.sql`

**Step 1: Write migration SQL**

Write SQL that creates the 4 new tables (`branches`, `branch_inventory`, `stock_transfers`, `stock_transfer_items`) with proper constraints. Use `CREATE TABLE IF NOT EXISTS` for idempotency (matching existing migration pattern). Include both PostgreSQL UUID and SQLite-compatible column types using the project's convention (FlexibleUUID handles this at the ORM level, but the raw SQL should use `TEXT` for UUIDs to be SQLite-compatible).

**Step 2: Add inline migration to `backend/app.py`**

In the `if __name__ == '__main__'` block of `app.py`, add `CREATE TABLE IF NOT EXISTS` statements (following the existing pattern of inline migrations with try/except). This ensures tables are created on app startup for both SQLite and PostgreSQL modes.

Look at existing inline migrations in `app.py` (search for `ALTER TABLE` or `CREATE TABLE`) and follow the same pattern.

**Step 3: Commit**

```bash
git add backend/migrations/020_create_branches_and_transfers.sql backend/app.py
git commit -m "feat(db): add migration for branches, branch_inventory, stock_transfers, stock_transfer_items"
```

---

## Task 5: Create Branch Routes (API Endpoints)

**Files:**
- Create: `backend/routes/branches.py`
- Modify: `backend/app.py` (register new blueprint)

**Step 1: Create branch routes**

Blueprint: `branch_bp = Blueprint('branches', __name__)`

Endpoints to implement:

1. `GET /` — List branches for client. Decorator: `@authenticate`. Query: `Branch.query.filter_by(client_id=g.user['client_id'], is_active=True).all()`. Response: `{ success: true, data: [...] }`

2. `POST /` — Create branch. Decorator: `@authenticate`. Role check: `g.user['role']` must be `owner` or `admin`, else return 403. Generate UUID via `uuid.uuid4()`. Validate `name` is required. Response: 201 with branch dict.

3. `PUT /<branch_id>` — Update branch. Same role check. Find by `branch_id` + `client_id`. Update `name` and `location` fields. Response: 200.

4. `DELETE /<branch_id>` — Soft-delete. Same role check. Set `is_active = False`. Response: 200.

Follow the pattern from `backend/routes/stock.py`: decorator order is `@route` → `@authenticate` → role check in function body. Always scope by `client_id = g.user['client_id']`.

**Step 2: Register blueprint in `backend/app.py`**

```python
from routes.branches import branch_bp
app.register_blueprint(branch_bp, url_prefix='/api/branches')
```

Add this near the other blueprint registrations (after `bulk_order_bp`).

**Step 3: Commit**

```bash
git add backend/routes/branches.py backend/app.py
git commit -m "feat(api): add branch CRUD endpoints at /api/branches"
```

---

## Task 6: Create Stock Transfer Routes (API Endpoints)

**Files:**
- Create: `backend/routes/stock_transfer.py`
- Modify: `backend/app.py` (register new blueprint)

**Step 1: Create stock transfer routes**

Blueprint: `stock_transfer_bp = Blueprint('stock_transfers', __name__)`

Endpoints to implement:

1. **`POST /`** — Create transfer request.
   - Role check: owner or admin only.
   - Accept: `{ from_branch_id, to_branch_id, items: [{ product_id, quantity }], notes? }`
   - Validate: branches exist and belong to client, `from != to`, items not empty, max 100 items.
   - Validate: each product exists in `stock_entry` for this client.
   - Validate: each product has sufficient quantity in `branch_inventory` at source branch.
   - Create `StockTransfer` (status='pending') + `StockTransferItem` rows. Do NOT move stock yet.
   - Generate UUIDs via `uuid.uuid4()`.
   - Response: 201 with transfer dict.

2. **`GET /`** — List transfers.
   - Role check: owner or admin only.
   - Optional query params: `status`, `from_branch_id`, `to_branch_id`, `page` (default 1), `per_page` (default 20).
   - Filter by `client_id`. Order by `created_at DESC`. Paginate.
   - Response: `{ success, data, total, page, per_page }`

3. **`GET /<transfer_id>`** — Transfer detail.
   - Fetch by `transfer_id` + `client_id`. Include items.
   - Response: `{ success, data: transfer.to_dict() }`

4. **`POST /<transfer_id>/approve`** — Approve and execute transfer.
   - Role check: owner or admin only.
   - Find transfer. Must be `status == 'pending'`, else 400.
   - Inside a transaction with row-level locks:
     - For each item: validate source `branch_inventory` still has sufficient stock.
     - For each item: deduct from source `branch_inventory.quantity`.
     - For each item: add to destination `branch_inventory` (create row if absent, add if exists).
     - Update `stock_entry.quantity` = sum of all `branch_inventory` quantities for that product.
   - Set `status='completed'`, `approved_by=g.user['user_id']`, `approved_at=now`, `completed_at=now`.
   - Response: 200.

5. **`POST /<transfer_id>/reject`** — Reject transfer.
   - Role check: owner or admin only.
   - Find transfer. Must be `status == 'pending'`, else 400.
   - Set `status='rejected'`, `approved_by=g.user['user_id']`, `approved_at=now`.
   - Accept optional `{ reason }` in body, append to `notes`.
   - Response: 200.

6. **`GET /branches/<branch_id>/inventory`** — Get inventory at a specific branch.
   - `@authenticate` (any authenticated user).
   - Verify branch belongs to client.
   - Query `BranchInventory.query.filter_by(branch_id=..., client_id=...).all()`.
   - Join with `StockEntry` to include product details.
   - Response: `{ success, data: [...] }`

**Step 2: Register blueprint in `backend/app.py`**

```python
from routes.stock_transfer import stock_transfer_bp
app.register_blueprint(stock_transfer_bp, url_prefix='/api/stock-transfers')
```

**Step 3: Commit**

```bash
git add backend/routes/stock_transfer.py backend/app.py
git commit -m "feat(api): add stock transfer endpoints with approval workflow"
```

---

## Task 7: Add Stock Transfer Navigation to Sidebar

**Files:**
- Modify: `frontend-react/src/components/Sidebar.tsx`

**Step 1: Add ArrowLeftRight icon import**

Add `ArrowLeftRight` to the lucide-react import at the top of the file.

**Step 2: Add "Stock Transfer" to the `allNavigation` array**

Insert after the "Stock Management" entry (index 4), before "Reports":

```typescript
{ name: 'Stock Transfer', href: '/stock-transfer', icon: ArrowLeftRight, ownerOnly: true },
```

**Step 3: Update navigation filtering logic**

In the `navigation` useMemo, add handling for `ownerOnly` items. The user's role is available from `useClient()` as `user.role`. Filter: if item has `ownerOnly: true`, check `user.role === 'owner' || user.role === 'admin'`.

**Step 4: Commit**

```bash
git add frontend-react/src/components/Sidebar.tsx
git commit -m "feat(nav): add Stock Transfer to sidebar for owner/admin users"
```

---

## Task 8: Add Frontend Routes

**Files:**
- Modify: `frontend-react/src/router.tsx`

**Step 1: Add lazy imports for new pages**

```typescript
const StockTransfer = React.lazy(() => import('@/pages/stock-transfer/StockTransfer'))
const BranchManagement = React.lazy(() => import('@/pages/stock-transfer/BranchManagement'))
```

**Step 2: Add routes**

In the main app routes section (after `/stock`):

```tsx
<Route path="/stock-transfer" element={<StockTransfer />} />
<Route path="/stock-transfer/branches" element={<BranchManagement />} />
```

**Step 3: Commit**

```bash
git add frontend-react/src/router.tsx
git commit -m "feat(routes): add stock transfer and branch management frontend routes"
```

---

## Task 9: Create Stock Transfer Main Page (Frontend)

**Files:**
- Create: `frontend-react/src/pages/stock-transfer/StockTransfer.tsx`

**Step 1: Build the tabbed Stock Transfer page**

Use `DashboardLayout` wrapper (from `@/components/DashboardLayout`).

Three tabs:
1. **Create Transfer** — Cart-based UI:
   - Branch selectors (From / To) — fetch from `GET /api/branches`
   - Product selector — fetch from `GET /api/stock-transfers/branches/<branch_id>/inventory`
   - Quantity input with +/- controls
   - "Add to Transfer List" button → cart state
   - Cart display with per-item remove, quantity adjust
   - Notes textarea
   - "Submit Transfer Request" button → `POST /api/stock-transfers`

2. **Pending Approvals** — List view:
   - Fetch `GET /api/stock-transfers?status=pending`
   - Each row shows: from/to branch, requester, date, item count
   - Expand to see item details
   - "Approve" button → `POST /api/stock-transfers/<id>/approve`
   - "Reject" button → `POST /api/stock-transfers/<id>/reject` (with optional reason prompt)

3. **Transfer History** — List view:
   - Fetch `GET /api/stock-transfers` (all statuses)
   - Filter dropdowns: status, branch, date range
   - Status badges: green (completed), red (rejected), yellow (pending)
   - Expandable rows showing item details

Use Tailwind classes matching the existing Valoryx design (reference `Stock.tsx` for spacing, card styles, dark mode classes). Use `api` from `@/lib/api.ts` for all HTTP calls. Handle loading, error, and empty states.

Icons from lucide-react: `ArrowLeftRight`, `ArrowRight`, `Package`, `MapPin`, `Check`, `X`, `Clock`, `History`, `Plus`, `Minus`, `ShoppingCart`, `Trash2`, `Building2`, `AlertCircle`.

**Step 2: Commit**

```bash
git add frontend-react/src/pages/stock-transfer/StockTransfer.tsx
git commit -m "feat(ui): add Stock Transfer page with create, approvals, and history tabs"
```

---

## Task 10: Create Branch Management Page (Frontend)

**Files:**
- Create: `frontend-react/src/pages/stock-transfer/BranchManagement.tsx`

**Step 1: Build the Branch Management page**

Use `DashboardLayout` wrapper.

Features:
- List all branches with name, location, status (active/inactive)
- "Add Branch" button → inline form or modal (name + location fields)
- Edit branch (inline or modal)
- Deactivate branch (soft delete with confirmation)
- Navigate back to Stock Transfer page

API calls: `GET/POST/PUT/DELETE /api/branches` via `api` from `@/lib/api.ts`.

Add a link/button on the Stock Transfer page header area: "Manage Branches" → `/stock-transfer/branches`.

**Step 2: Commit**

```bash
git add frontend-react/src/pages/stock-transfer/BranchManagement.tsx
git commit -m "feat(ui): add Branch Management page for creating and editing branches"
```

---

## Task 11: Data Migration — Auto-Create Main Branch for Existing Clients

**Files:**
- Create: `backend/migrations/021_migrate_existing_stock_to_branches.sql`
- Modify: `backend/app.py` (add inline migration in startup)

**Step 1: Write migration logic**

In `app.py` startup (within the `with app.app_context()` block), add a migration function:

1. Find all clients that have stock entries but no branches.
2. For each such client, create a "Main Branch" in the `branches` table.
3. For each `stock_entry` belonging to that client, create a `branch_inventory` row linking the product to the Main Branch with the existing quantity.

Use `try/except` to make it idempotent (skip if branches already exist for a client).

**Step 2: Write the equivalent SQL migration file**

For manual application on production PostgreSQL.

**Step 3: Commit**

```bash
git add backend/migrations/021_migrate_existing_stock_to_branches.sql backend/app.py
git commit -m "feat(migration): auto-create Main Branch and migrate existing stock to branch_inventory"
```

---

## Task 12: Integration — Wire Up Table Creation in App Startup

**Files:**
- Modify: `backend/app.py`

**Step 1: Ensure all new models are imported**

In `app.py`, add imports for the new models so SQLAlchemy registers them with `db.create_all()`:

```python
from models.branch_model import Branch
from models.branch_inventory_model import BranchInventory
from models.stock_transfer_model import StockTransfer, StockTransferItem
```

These imports should go near the existing model imports in `app.py`.

**Step 2: Verify `db.create_all()` is called**

The existing `app.py` calls `db.create_all()` within the app context. Verify the new tables will be created. If not, add explicit `CREATE TABLE IF NOT EXISTS` in the inline migration block.

**Step 3: Commit**

```bash
git add backend/app.py
git commit -m "feat(startup): register new models for auto table creation"
```

---

## Task 13: End-to-End Testing — Manual Verification

**Steps:**

1. Start backend: `cd backend && python app.py`
2. Start frontend: `cd frontend-react && npm run dev`
3. Log in as an owner/admin user
4. Verify "Stock Transfer" appears in the sidebar nav
5. Navigate to `/stock-transfer/branches` → Create 2 branches (e.g., "Main Store", "Warehouse")
6. Verify existing stock has been migrated to "Main Branch" (if applicable)
7. Go to Create Transfer tab → Select From Branch → Select To Branch → Add products → Submit
8. Go to Pending Approvals tab → See the pending transfer → Approve it
9. Verify stock quantities updated at both branches
10. Go to Transfer History → Verify completed transfer shows with details
11. Test rejection flow: create another transfer → Reject it → Verify no stock movement
12. Test as a non-owner/admin user → Verify "Stock Transfer" nav is hidden
13. Test edge cases: transfer more than available stock, same branch, empty cart

---

## Task Dependency Order

```
Task 1 (Branch model)
Task 2 (BranchInventory model) — depends on Task 1
Task 3 (StockTransfer model) — depends on Task 1
Task 4 (Migration SQL) — depends on Tasks 1-3
Task 5 (Branch routes) — depends on Tasks 1, 4
Task 6 (Transfer routes) — depends on Tasks 1-4
Task 7 (Sidebar nav) — independent
Task 8 (Frontend routes) — independent
Task 9 (Transfer page) — depends on Tasks 5, 6, 7, 8
Task 10 (Branch mgmt page) — depends on Tasks 5, 7, 8
Task 11 (Data migration) — depends on Tasks 1-4
Task 12 (App startup wiring) — depends on Tasks 1-4
Task 13 (E2E testing) — depends on all above
```

**Parallelizable groups:**
- Tasks 1-3 (models) can be done together
- Tasks 7-8 (sidebar + routes) can be done in parallel with Tasks 5-6 (backend routes)
- Tasks 9-10 (frontend pages) depend on backend being ready

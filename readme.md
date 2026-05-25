# Valoryx Software - Development Guide

## Project Overview
Multi-tenant retail/billing platform with complete client isolation via `client_id`.
What started as a simple GST / Non-GST invoice tool is now a full point-of-sale + back-office
suite covering pending payments, exchanges, multi-branch stock movement, supplier purchases,
expenses, payroll, notes and a full audit trail — designed to run **offline-first** on the
counter and sync to Supabase in the background.

---

## What changed vs. the old billing system

The first version of Valoryx ("old billing") could only do one thing well: create a GST or
Non-GST invoice and decrement stock. Every other shop workflow — taking partial payments,
moving stock between branches, recording a supplier delivery, tracking an expense, fixing a
mistake on yesterday's bill — had to be done outside the app, on paper or in Excel. That made
audits painful and made the numbers untrustworthy at month-end.

The current build closes those gaps. Below is the side-by-side: what the old billing forced
you to do manually, and which new module now handles it.

| Area | Old billing (pain) | New module (fix) |
| --- | --- | --- |
| **Bill payment** | Bill = paid. No way to invoice now and collect later. | **Pending Bills** — bills can be saved as *Pending*, partially paid, or marked paid later via `/api/billing/<id>/mark-paid`. Customer credit is visible per bill. |
| **Returns & exchanges** | Cancel + recreate, stock stayed wrong. | **Exchange** (`pages/billing/Exchange.tsx`) — issue a structured return/exchange that reverses stock and links back to the original bill. |
| **Bill mistakes** | A deleted bill was gone. Audit holes. | **Restore Bills** (`RestoreBills.tsx`) — soft-deleted bills are recoverable with full history. Nothing is destroyed. |
| **Multi-branch shops** | One stock pool. Branches couldn't move goods. | **Stock Transfer** (`pages/stock-transfer/`, `routes/stock_transfer.py`) — branch-aware transfers with sender/receiver authority, in-transit state, and per-branch inventory. |
| **Supplier purchases** | Stock magically appeared with no paper trail. | **Suppliers + Deliveries** (`routes/suppliers.py`) — supplier master, delivery drafts, product confirmation, delivery-note file upload/download, complete-on-receipt that updates stock. |
| **Large procurement** | Multiple POs typed manually into stock. | **Bulk Stock Order** (`routes/bulk_stock_order.py`) — auto-numbered POs (`ORD-YYYY-###`), multi-line items, status flow, and one-click stock receipt. |
| **Shop expenses** | Tracked outside the system (Excel / paper). | **Expense** (`routes/expense.py`) — category-tagged expenses with date, amount, summaries by period, and contribution to true profit. |
| **Daily reminders / handover notes** | Sticky notes on the monitor. | **Notes** (`routes/notes.py`) — per-user notes with optional auto-expiry, scoped to the logged-in cashier. |
| **Auditability** | Best-effort log; some routes skipped it. | **Audit Log** (`routes/audit.py` + `Audit.tsx`) — every create/update/delete is logged with `client_id`, permission-gated views, and date filters. `view_all_bills` vs `view_own_bills` enforced server-side. |
| **Payroll** | Done manually outside the app. | **Salary / Employees / Attendance** (`pages/Salary.tsx`, `routes/employees.py`) — employee master, attendance cycles, advances, payroll computation with trend charts. |
| **Customers** | Free-text name on each bill. | **Customers** (`Customers.tsx`, `routes/customer.py`) — customer master linked to bills, supports email/address, used by GST invoices. |
| **Permissions** | One role: owner. | **Roles + Permissions** (`routes/permissions.py`) — `owner / manager / admin / staff / cashier`, fine-grained permission checks on routes (`view_audit_logs`, `view_all_bills`, etc.). |
| **Going offline** | Backend down → counter down. | **Offline-first** — backend can run in `DB_MODE=offline` against local SQLite (`~/.mj-billing/local.db`), syncs to Supabase in the background. POS keeps billing during internet outages. |
| **Desktop install** | Browser tab only. | **Electron app** (`electron/`) — packaged Windows/Linux desktop build with auto-update; web build still works at the same URL. |
| **POS UX** | List-only product picker. | **Card / List toggle** on `CreateBill.tsx` (F3 shortcut), mobile cart, profit summary bar, faster keyboard flow. |
| **Performance** | 3–9 s page loads (live Supabase per request). | Local SQLite round-trips ≈0.7 ms vs 307 ms on remote. Routes now respond in **1–20 ms**, with in-memory analytics cache and request-scoped session caching. |
| **Security** | Hardening done ad-hoc. | Security regression suite (`backend/tests/test_security.py`), TOTP 2FA, forced password change, IP/last-seen tracking, session table, throttled writes. |

> Net effect: a shop owner can now run the day end-to-end inside Valoryx — take a sale, hold
> a pending bill, accept a return, receive a supplier delivery, log an expense, transfer
> stock to another branch, run payroll, and read a clean audit trail — without ever opening
> Excel.

---

## Project Structure
```
Valoryx/
├── migration/         # PostgreSQL/Supabase migrations (source of truth for cloud schema)
├── backend/           # Flask app, models, routes, SQLite offline mirror, sync service
│   ├── routes/        # Feature blueprints (billing, suppliers, expense, notes, …)
│   ├── models/        # SQLAlchemy models
│   ├── migrations/    # Local SQLite migration runner (versioned, currently v16)
│   └── tests/         # Pytest suite incl. security regressions
├── frontend-react/    # React 18 + TypeScript + Vite + Tailwind (the live frontend)
│   └── src/pages/     # billing/, stock-transfer/, admin/, Suppliers.tsx, Salary.tsx, …
├── electron/          # Desktop wrapper (auto-update enabled)
└── docs/              # Design docs and plans
```

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, Framer Motion (dev server on `:3002`)
- **Backend**: Flask + SQLAlchemy (runs on `:5017`)
- **Database**: Supabase (PostgreSQL) for cloud + local SQLite mirror for offline-first POS
- **Cache**: Redis when available, in-memory fallback otherwise
- **Auth**: JWT, optional Google OAuth, optional TOTP 2FA
- **Desktop**: Electron with auto-update

## CRITICAL DEVELOPMENT RULES (ALWAYS FOLLOW)

### 1. NO HARDCODING
- Never hardcode values, URLs, IPs, client IDs, or localhost
- Always use environment variables (.env files)
- All configurations must be externalized

### 2. CLIENT ID ISOLATION
- **MANDATORY**: Every SQL query MUST include client_id in WHERE clause
- **MANDATORY**: Every API endpoint MUST filter by client_id
- **MANDATORY**: Every data fetch MUST scope to authenticated client only
- This ensures complete data isolation between clients

### 3. CLEAN CODEBASE PRINCIPLES
- **NO DUPLICATE CODE**: Reuse existing files, functions, and components
- **NO DUPLICATE FILES**: Always check and use existing files before creating new ones
- **NO MOCK DATA**: Always use real-time data from backend APIs
- **NO OVERLAPPING**: One responsibility per file/component
- **SINGLE SOURCE OF TRUTH**: Each logic exists in exactly one place

### 4. FILE MANAGEMENT
- **ANALYZE FIRST**: Always check existing structure before creating files
- **MINIMAL FILES**: Only create files absolutely necessary for the task
- **DELETE AFTER TESTING**: Remove test files once testing is complete
- **NO MULTIPLE MD FILES**: Update this readme.md only, don't create additional docs
- **CLEAN IMPORTS**: Remove unused imports immediately
- **NO COMMENTED CODE**: Delete commented-out code blocks
- **NO CONSOLE.LOGS**: Remove console.logs from production code

### 5. DATABASE MIGRATIONS
- **MIGRATION FOLDER ONLY**: All migrations go in /migration folder
- **NO SCATTERED MIGRATIONS**: Never create migrations outside /migration
- **PROPER NAMING**: Use timestamp-based naming (e.g., 20231015_create_clients_table.sql)
- **CLIENT ID REQUIRED**: Every table must have client_id column with proper indexing
- **ROLLBACK SUPPORT**: Every migration should have up and down scripts

### 6. API & BACKEND RULES (Python Flask)
- **CLIENT ID VERIFICATION**: Verify client_id from authenticated session/token
- **NO DIRECT DB ACCESS**: Use proper models/repositories
- **SINGLE API CALLS**: Consolidate data fetching, avoid multiple calls
- **ERROR HANDLING**: Proper error messages and status codes
- **VALIDATION**: Validate all inputs before processing
- **BLUEPRINTS**: Use Flask blueprints for route organization
- **DATABASE**: Use SQLAlchemy or similar ORM with proper connection pooling

### 7. FRONTEND RULES
- **ENVIRONMENT VARIABLES**: Use REACT_APP_API_URL from .env
- **NO LOCALHOST**: Never hardcode API endpoints
- **REAL-TIME DATA**: Always fetch from backend, never mock
- **RESPONSIVE DESIGN**: Mobile-first, works on all screen sizes (320px to 4K+)
- **NO FIXED PIXELS**: Use rem, em, %, vw, vh, Tailwind utilities
- **OPTIMIZE**: Lazy loading, React.memo, useMemo, useCallback where needed

### 8. WORKFLOW PROCESS
1. **Backend First**: Always implement backend before frontend
2. **Migration First**: Database changes via migration folder
3. **Test & Delete**: Test thoroughly, then delete test files
4. **Update This File**: Document major changes here for continuity
5. **Clean As You Go**: Remove unused dependencies, imports, files

### 9. GIT & VERSION CONTROL
- Commit frequently with clear messages
- Never commit .env files
- Keep .gitignore updated
- Review changes before committing

## DEVELOPMENT FLOW

### Adding New Features
1. Create database migration in /migration (if needed)
2. Run migration and verify
3. Implement backend API with client_id filtering
4. Test backend endpoints
5. Implement frontend consuming real API
6. Test end-to-end with real data
7. Clean up: remove test files, unused code, console.logs
8. Update this readme if significant changes made

### SQL Query Template
```sql
-- ALWAYS include client_id in WHERE clause
SELECT * FROM table_name
WHERE client_id = ? AND other_conditions;

INSERT INTO table_name (client_id, col1, col2)
VALUES (?, ?, ?);

UPDATE table_name
SET col1 = ?, col2 = ?
WHERE client_id = ? AND id = ?;

DELETE FROM table_name
WHERE client_id = ? AND id = ?;
```

### API Endpoint Template (Flask)
```python
# ALWAYS verify and filter by client_id
from flask import Blueprint, request, jsonify, g
from functools import wraps

api = Blueprint('api', __name__)

# Authentication decorator
def authenticate(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Verify token and set g.user with client_id
        token = request.headers.get('Authorization')
        user = verify_token(token)  # Your auth logic
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
        g.user = user
        return f(*args, **kwargs)
    return decorated_function

# GET endpoint example
@api.route('/endpoint', methods=['GET'])
@authenticate
def get_endpoint():
    client_id = g.user['client_id']  # From auth token/session
    data = Model.query.filter_by(client_id=client_id).all()
    return jsonify([item.to_dict() for item in data]), 200

# POST endpoint example
@api.route('/endpoint', methods=['POST'])
@authenticate
def create_endpoint():
    client_id = g.user['client_id']
    data = request.get_json()

    # Validate input
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Create new record with client_id
    new_item = Model(client_id=client_id, **data)
    db.session.add(new_item)
    db.session.commit()

    return jsonify(new_item.to_dict()), 201

# UPDATE endpoint example
@api.route('/endpoint/<int:id>', methods=['PUT'])
@authenticate
def update_endpoint(id):
    client_id = g.user['client_id']

    # MUST filter by both client_id and id
    item = Model.query.filter_by(
        client_id=client_id,
        id=id
    ).first_or_404()

    data = request.get_json()
    for key, value in data.items():
        setattr(item, key, value)

    db.session.commit()
    return jsonify(item.to_dict()), 200

# DELETE endpoint example
@api.route('/endpoint/<int:id>', methods=['DELETE'])
@authenticate
def delete_endpoint(id):
    client_id = g.user['client_id']

    # MUST filter by both client_id and id
    item = Model.query.filter_by(
        client_id=client_id,
        id=id
    ).first_or_404()

    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Deleted successfully'}), 200
```

### Flask Model Template
```python
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class BaseModel(db.Model):
    __abstract__ = True

    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

# Example model extending BaseModel
class Invoice(BaseModel):
    __tablename__ = 'invoices'

    invoice_number = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Decimal(10, 2), nullable=False)
    status = db.Column(db.String(20), default='pending')

    # Composite index for client_id queries
    __table_args__ = (
        db.Index('idx_client_invoice', 'client_id', 'invoice_number'),
    )

    def to_dict(self):
        data = super().to_dict()
        data.update({
            'invoice_number': self.invoice_number,
            'amount': str(self.amount),
            'status': self.status
        })
        return data
```

## IMPORTANT REMINDERS
- ✅ Do what is asked - nothing more, nothing less
- ✅ Check existing files before creating new ones
- ✅ Use real-time data always
- ✅ Client ID filtering is MANDATORY
- ✅ Keep codebase clean, readable, and maintainable
- ✅ Delete test files after testing
- ✅ Update this file for continuity
- ❌ No hardcoding
- ❌ No mock data
- ❌ No duplicate code/files
- ❌ No multiple documentation files
- ❌ No migrations outside /migration folder

## Core Modules (current build)

Each module is `client_id`-scoped end-to-end. Files in parentheses are the entry points.

1. **Authentication & sessions** — JWT login, Google OAuth, TOTP 2FA, forced password
   reset, session tracking (`routes/auth.py`, `oauth.py`, `totp.py`, `sessions.py`)
2. **Dashboard & Analytics** — live KPIs, payment breakdowns, period-over-period
   (`pages/Dashboard.tsx`, `routes/analytics.py`)
3. **Billing**
   - **Create Bill** — GST + Non-GST, card/list product picker, F3 toggle, profit bar
     (`pages/billing/CreateBill.tsx`)
   - **Pending Bills** — save unpaid, mark paid later (`POST /api/billing/<id>/mark-paid`)
   - **Exchange** — structured returns that reverse stock (`pages/billing/Exchange.tsx`)
   - **Restore Bills** — undelete soft-deleted bills (`pages/billing/RestoreBills.tsx`)
4. **Stock**
   - **Stock master** with low-stock alerts (`pages/Stock.tsx`, `routes/stock.py`)
   - **Stock Transfer** between branches with in-transit state
     (`pages/stock-transfer/`, `routes/stock_transfer.py`)
   - **Bulk Stock Order** (PO) — auto-numbered `ORD-YYYY-###`
     (`routes/bulk_stock_order.py`)
5. **Suppliers** — vendor master, delivery drafts, delivery-note upload, complete-on-receipt
   stock update (`pages/Suppliers.tsx`, `routes/suppliers.py`)
6. **Customers** — customer master linked to bills (`pages/Customers.tsx`, `routes/customer.py`)
7. **Expense** — categorized expenses with summaries (`routes/expense.py`)
8. **Salary / Employees / Attendance** — payroll cycles, advances, trend charts
   (`pages/Salary.tsx`, `routes/employees.py`)
9. **Notes** — per-user sticky notes with optional expiry (`routes/notes.py`)
10. **Reports** — combined GST + Non-GST reporting with payment breakdown
    (`pages/Reports.tsx`, `routes/report.py`)
11. **Audit Log** — every mutation recorded, permission-filtered viewing
    (`pages/Audit.tsx`, `routes/audit.py`)
12. **Branches** — multi-location support, branch managers
    (`pages/admin/BranchManagement.tsx`, `routes/branches.py`)
13. **Team / Permissions** — role + fine-grained permission model
    (`routes/team.py`, `routes/permissions.py`, `routes/invite.py`)
14. **Shop Settings** — bill numbering, GST defaults, logo, etc.
    (`pages/ShopSettings.tsx`, `routes/shop_settings.py`)
15. **Subscription & Billing-of-the-app** — Razorpay subscription, trial expiry
    (`routes/subscription.py`, `pages/TrialExpired.tsx`)
16. **Admin (super admin)** — multi-client management, impersonation, admin audit
    (`pages/admin/`, `routes/admin.py`, `routes/impersonate.py`)
17. **Electron desktop** — packaged app with auto-update (`electron/`, `pages/ElectronSetup.tsx`)

## Database Tables (all `client_id`-scoped)

Cloud schema lives in `/migration` (Supabase, source of truth). Local SQLite schema is built
by `backend/migrations/runner.py` and is currently at **v16**.

Old (still present): `users`, `client_entry`, `gst_billing`, `non_gst_billing`,
`stock_entry`, `payment_type`, `report`, `audit_log`.

New tables added by later migrations:
- `customers` — customer master linked to bills
- `suppliers`, `supplier_deliveries`, `supplier_delivery_items` — supplier purchase flow (v9)
- `bulk_stock_orders`, `bulk_stock_order_items` — purchase orders
- `stock_transfers`, `stock_transfer_items`, `branch_inventory` — multi-branch stock
- `branches` — physical locations
- `employees`, `attendance`, `salary_cycles`, `salary_advances` — payroll
- `expenses` — categorized expenses
- `notes` — per-user sticky notes
- `sessions` — active user sessions
- `sync_metadata`, `sync_log` — offline sync bookkeeping (v8)
- `permissions`, `role_permissions`, `user_permissions` — fine-grained access

## Authentication Flow
1. App loads → RYX logo fullscreen (2s fade via Framer Motion)
2. Login page → Email/Password + Supabase Auth
3. Fetch client_id from users table
4. Store client_id in JWT token and session
5. Load dashboard with client_id context
6. **ALL queries filtered by client_id from token**

## Billing Logic
### GST Scenario
- Enable GST input (5%, 12%, 18%, 28%)
- Calculate: `gst_amount = (subtotal * gst_percentage) / 100`
- Calculate: `final_amount = subtotal + gst_amount`
- Save to `gst_billing` table with client_id
- Include in audit reports
- Reduce stock with client_id filter

### Non-GST Scenario
- GST fields disabled
- `final_amount = subtotal` (no GST)
- Save to `non_gst_billing` table with client_id
- Exclude from audit reports
- Reduce stock with client_id filter

## Stock Management
- **Add Stock**: Auto-sum if product exists for client_id
- **Reduce Stock**: Automatic on billing (filtered by client_id)
- **View Stock**: Always filtered by client_id
- **Alerts**: Low stock notifications per client

## Environment Variables
### Backend (.env)
```bash
DB_URL=postgresql://user:pass@host:5432/db
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
JWT_SECRET=your-secret-key
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:5017/api
```

## Implementation Status

### ✅ Completed - Backend
1. **Database Migrations** (10 files in /migration folder)
   - ✅ Client Entry, Users, Payment Types, Stock Entry
   - ✅ GST Billing, Non-GST Billing, Reports, Audit Logs
   - ✅ Auto-reduction triggers for stock on billing
   - ✅ Row Level Security (RLS) policies enabled

2. **Flask Backend API** (Complete REST API)
   - ✅ Authentication (login, register, logout, verify) with JWT
   - ✅ Billing (GST & Non-GST creation, listing, details)
   - ✅ Stock management (add with auto-sum, list, alerts, update, delete)
   - ✅ Reports (GST + Non-GST combined data with payment breakdown)
   - ✅ Audit logging (all CRUD operations tracked)
   - ✅ Client management (create, get, update)

3. **Core Features**
   - ✅ JWT authentication with client_id extraction
   - ✅ Client ID isolation on ALL endpoints
   - ✅ Automatic stock reduction via database trigger
   - ✅ Audit logging for all actions
   - ✅ GST calculation (5%, 12%, 18%, 28%)
   - ✅ Sequential bill numbering per client
   - ✅ Low stock alerts per client

### ✅ Completed - Frontend Core
4. **Next.js 14 Frontend** (TypeScript + Tailwind CSS + Framer Motion)
   - ✅ Complete project setup with all configurations
   - ✅ RYX logo animation (2s fade with Framer Motion)
   - ✅ Authentication pages (login, register) with validation
   - ✅ Client Context with JWT token management
   - ✅ API client (axios) with automatic token injection
   - ✅ Protected routes wrapper with auth redirect
   - ✅ Dashboard layout with sidebar navigation
   - ✅ Dashboard page with live statistics
   - ✅ Responsive design (mobile-first approach)

### 🔄 Deployment Steps
1. **✅ DONE - Run Database Migrations** - All 9 migrations executed successfully on Supabase
2. **✅ DONE - Database Verified** - All 8 tables and 5 triggers created
3. **🔄 IN PROGRESS - Create Test Data** - Run migration 011 for test login credentials
4. **Test Backend** - Login with test credentials, test all endpoints
5. **Install Frontend** - `cd frontend && npm install`
6. **Start Frontend** - `npm run dev` (runs at http://localhost:3000)
7. **Test Complete Flow** - Logo animation → Login → Dashboard

### ⚠️ Recent Fixes Applied
- **Fixed circular import issue**: Created `extensions.py` to separate `db` instance from `app.py`
- **Fixed client.py syntax**: Changed `methods='PUT'` to `methods=['PUT']`
- **Added run.py**: Proper Flask app runner with application context
- All imports updated to use `from extensions import db` instead of `from app import db`

### 📦 Optional Pages (Core is Complete)
- Billing forms (GST/Non-GST with validation)
- Stock management pages (list, add, edit, alerts)
- Reports generation (date range, export)
- Audit logs (filtering, pagination)
- Payment types management

## Quick Start

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python run.py
# API runs at http://localhost:5017
```

**Important**: Always use `python run.py` instead of `python app.py` to avoid circular import issues.

### Run Database Migrations
Connect to Supabase PostgreSQL and run migrations in order:
```sql
-- Run each file from 001 to 009 in /migration folder
\i migration/001_create_client_entry.sql
\i migration/002_create_users.sql
-- ... through 009_create_stock_reduction_trigger.sql
```

### Test API
```bash
# 1. Create client
curl -X POST http://localhost:5017/api/client \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test Company","email":"test@company.com","phone":"1234567890"}'

# 2. Register user (use client_id from step 1)
curl -X POST http://localhost:5017/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123","client_id":"<client_id>"}'

# 3. Login (get JWT token)
curl -X POST http://localhost:5017/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123"}'
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

## Documentation
- **Backend API**: See [backend/README.md](backend/README.md) for complete API documentation
- **Frontend**: See [frontend/README.md](frontend/README.md) for frontend setup and features
- **Migrations**: See [migration/010_run_all_migrations.sql](migration/010_run_all_migrations.sql) for migration guide

## File Count Summary
```
✅ Migration Files: 11 SQL files (001-009 + 010 runner + 011 test data)
✅ Backend Files: 22 Python files (including extensions.py, run.py, check_database.py)
✅ Frontend Files: 15+ TypeScript/TSX files
✅ Configuration Files: 10+ config files
✅ Documentation: 4 comprehensive files (3 READMEs + IMPLEMENTATION_COMPLETE.md)
```

## Current Implementation Status (Updated)

### ✅ Database Layer - COMPLETE
- All 8 tables created and verified
- All 5 triggers working (stock reduction, timestamps)
- Row Level Security (RLS) enabled
- Connected and verified via `check_database.py`

### ✅ Backend API - COMPLETE & TESTED
- Flask app with proper application context
- Circular import issue FIXED (extensions.py pattern)
- All 6 API blueprints registered
- Database connection verified
- Ready for login testing

### ✅ Frontend - CORE COMPLETE
- Next.js 14 with TypeScript
- RYX logo animation (2s fade)
- Authentication pages (login, register)
- Dashboard with real-time stats
- Client Context with JWT management

---
**Last Updated**: 2026-05-25
**Project**: Valoryx Software (multi-tenant retail platform)
**Backend Status**: ✅ Offline-first (SQLite mirror) + Supabase sync, schema v16
**Frontend Status**: ✅ React 18 / Vite, full module set live (billing, stock, suppliers, expense, payroll, notes, audit)
**Desktop**: ✅ Electron build with auto-update

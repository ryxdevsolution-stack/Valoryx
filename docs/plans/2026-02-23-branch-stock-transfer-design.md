# Branch Stock Transfer System — Design Document

**Date:** 2026-02-23
**Status:** Approved
**Author:** Claude Code

## Overview

Add multi-branch support to Valoryx with a stock transfer system that allows clients to manage inventory across multiple physical locations. Transfers follow a request-approve workflow for controlled stock movement.

## Requirements

- A single client (business) can have multiple branches/locations
- Each branch tracks its own stock quantity independently (per-branch inventory)
- Stock transfers require an approval workflow: Request → Approve/Reject → Complete
- Only owner/admin roles can create branches and manage transfers
- New "Stock Transfer" section in the navigation sidebar
- Existing stock features (barcode, import/export, bulk orders) continue working

## Architecture Decision

**Approach: Branch-Scoped Stock (Catalog + Branch Inventory)**

- `stock_entry` remains the product catalog (name, price, barcode, GST info)
- New `branch_inventory` table tracks per-branch quantities
- `stock_transfers` + `stock_transfer_items` track transfer requests and their items
- `branches` table stores branch/location information

This separates product definition from location-specific quantities, preventing data duplication and scaling well with many branches.

## Database Schema

### New Table: `branches`

| Column | Type | Constraints |
|--------|------|-------------|
| branch_id | UUID | PK |
| client_id | UUID | FK → client_entry, NOT NULL, INDEX |
| name | String(255) | NOT NULL |
| location | String(500) | Nullable |
| is_active | Boolean | DEFAULT true |
| created_at | DateTime | DEFAULT now |
| updated_at | DateTime | DEFAULT now, ON UPDATE now |

### New Table: `branch_inventory`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| branch_id | UUID | FK → branches, NOT NULL |
| product_id | UUID | FK → stock_entry, NOT NULL |
| client_id | UUID | FK → client_entry, NOT NULL, INDEX |
| quantity | Integer | NOT NULL, DEFAULT 0 |
| low_stock_alert | Integer | DEFAULT 10 |
| created_at | DateTime | DEFAULT now |
| updated_at | DateTime | DEFAULT now, ON UPDATE now |

**Indexes:** `(client_id, branch_id)`, `(branch_id, product_id)` UNIQUE

### New Table: `stock_transfers`

| Column | Type | Constraints |
|--------|------|-------------|
| transfer_id | UUID | PK |
| client_id | UUID | FK → client_entry, NOT NULL, INDEX |
| from_branch_id | UUID | FK → branches, NOT NULL |
| to_branch_id | UUID | FK → branches, NOT NULL |
| status | String(20) | NOT NULL, DEFAULT 'pending' |
| notes | Text | Nullable |
| requested_by | UUID | FK → users, NOT NULL |
| approved_by | UUID | FK → users, Nullable |
| approved_at | DateTime | Nullable |
| completed_at | DateTime | Nullable |
| created_at | DateTime | DEFAULT now |

**Status values:** `pending`, `approved`, `rejected`, `completed`

### New Table: `stock_transfer_items`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| transfer_id | UUID | FK → stock_transfers, NOT NULL |
| product_id | UUID | FK → stock_entry, NOT NULL |
| quantity | Integer | NOT NULL |

### Existing Table Changes

`stock_entry.quantity` — becomes a computed/synced total across all branches. No column removed; updated when branch_inventory changes.

## Transfer Workflow

```
1. Owner creates transfer request
   → Status: PENDING
   → No stock movement yet

2. Owner/Admin reviews request
   → APPROVED: Stock deducted from source branch_inventory, added to destination
     → Status: COMPLETED
   → REJECTED: No stock movement
     → Status: REJECTED

3. On approval:
   - Validate source branch still has sufficient stock
   - Deduct from source branch_inventory
   - Add to destination branch_inventory (create row if absent)
   - Update stock_entry.quantity (total across branches)
   - Record approved_by, approved_at, completed_at
```

## API Endpoints

### Branch Management (`/api/branches`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/branches` | Authenticated | List branches for client |
| POST | `/api/branches` | Owner/Admin | Create branch |
| PUT | `/api/branches/<id>` | Owner/Admin | Update branch |
| DELETE | `/api/branches/<id>` | Owner/Admin | Soft-delete branch |

### Stock Transfers (`/api/stock-transfers`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/stock-transfers` | Owner/Admin | Create transfer request (batch items) |
| GET | `/api/stock-transfers` | Owner/Admin | List transfers (filters: status, branch, date) |
| GET | `/api/stock-transfers/<id>` | Owner/Admin | Transfer detail with items |
| POST | `/api/stock-transfers/<id>/approve` | Owner/Admin | Approve and execute transfer |
| POST | `/api/stock-transfers/<id>/reject` | Owner/Admin | Reject transfer |

### Branch Inventory (`/api/branches/<id>/inventory`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/branches/<id>/inventory` | Authenticated | Get inventory at branch |

## Frontend

### Navigation

New item in sidebar between "Stock Management" and "Reports":
- **Label:** "Stock Transfer"
- **Icon:** `ArrowLeftRight` (lucide-react)
- **Route:** `/stock-transfer`
- **Visibility:** Owner/Admin role only (checked via `user.role`)

### Pages

1. **`/stock-transfer`** — Tabbed main page:
   - **Create Transfer** — Cart-based UI: select from/to branch, add products, submit request
   - **Pending Approvals** — List pending transfers with approve/reject actions
   - **Transfer History** — All completed/rejected transfers with filters

2. **`/stock-transfer/branches`** — Branch management (CRUD)

### UI Components

- Branch selector dropdowns (reused across tabs)
- Product picker with branch-specific stock quantities
- Transfer cart with +/- quantity controls
- Transfer status badges (pending/approved/rejected/completed)
- Transfer detail modal/expandable row

## Migration Strategy

For existing clients with stock data but no branches:
1. Auto-create a "Main Branch" for every existing client
2. Create `branch_inventory` rows copying `stock_entry.quantity` for the main branch
3. Existing features continue working against `stock_entry` (product catalog)

## Security

- All endpoints require JWT authentication
- Branch/transfer operations restricted to owner/admin role
- Client isolation enforced via `client_id` on every query
- Row-level locking on `branch_inventory` during transfer approval (prevent race conditions)
- Batch size limit: 100 items per transfer request

## Reference

Inspired by The-Soup-Story-Pos stock transfer system, adapted for Valoryx's architecture:
- Multi-tenant via `client_id` (not `tenant_id`)
- UUID primary keys (not integer)
- Approval workflow (POS uses instant transfers)
- Separate catalog + inventory model (POS duplicates products per branch)
- TypeScript frontend (POS uses JSX)

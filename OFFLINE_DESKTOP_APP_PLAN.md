# Desktop Offline-First Billing App - Complete Implementation Plan

## Executive Summary

Your proposed architecture (SQLite offline + Supabase online with 1-hour sync) is **fundamentally sound** but has **17 critical failure scenarios** that must be addressed. This comprehensive plan provides:

- Detailed analysis of all failure scenarios from a QA/tester perspective
- Complete implementation roadmap (6-8 weeks)
- Database schema changes required
- Risk mitigation strategies
- Testing checklist

---

## Your Proposed Architecture

### Design Summary
- **Dual Database**: SQLite (offline) + PostgreSQL/Supabase (online)
- **Sync Interval**: Every 1 hour + on app close
- **Offline Capability**: Full billing functionality without internet
- **Data Flow**: Local-first, bulk upload to cloud when online

### Approved Requirements
- ✅ **Bill Numbers**: SQLite sequential numbering (server reassigns on sync to avoid conflicts)
- ✅ **Stock Conflicts**: Reject oversold bills during sync (strict inventory control)
- ✅ **Sync Frequency**: Fixed 1-hour interval + sync on app close
- ✅ **Offline Auth**: 7-day JWT tokens for desktop app

### Strengths ✅
1. Allows business continuity during internet outages
2. Reduces API costs (batched operations)
3. Faster user experience (local database)
4. Natural fit for desktop deployment

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Electron Desktop App                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         Frontend (Next.js bundled as static)           │  │
│  │    Detects: online_mode=true/false (navigator.onLine)  │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │ HTTP localhost:5000                       │
│  ┌────────────────▼───────────────────────────────────────┐  │
│  │            Flask Backend (subprocess)                  │  │
│  │         Database Abstraction Layer (DAL)               │  │
│  │    Switches between SQLite/PostgreSQL at runtime      │  │
│  └───┬───────────────────────────────────┬────────────────┘  │
│      │ Offline Mode                      │ Online/Sync       │
│      ▼                                    ▼                   │
│  ┌───────────────────┐            ┌──────────────────────┐   │
│  │ SQLite (Local)    │◄─Sync──────► PostgreSQL (Supabase)│   │
│  │ ~/.mj-billing.db  │            │ Remote cloud DB      │   │
│  │ WAL mode enabled  │            │ Source of truth      │   │
│  └───────────────────┘            └──────────────────────┘   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │      Background Sync Engine (every 1 hour + on close)  │  │
│  │  - Upload pending bills, stock changes                 │  │
│  │  - Server reassigns bill numbers                       │  │
│  │  - Reject oversold bills (conflict resolution)         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## CRITICAL FAILURE SCENARIOS (17 Total)

### CATEGORY 1: DATA INTEGRITY FAILURES

#### ❌ Scenario 1: Duplicate Bill Numbers (CRITICAL BLOCKER)
**Problem**: Multiple offline clients generate sequential bill numbers independently

**Example**:
```
Device A (offline): Creates bills #101, #102, #103
Device B (offline): Creates bills #101, #102, #103
Both sync to server → UNIQUE CONSTRAINT VIOLATION
```

**Current Code Issue**: `backend\routes\billing.py:63-65`
```python
last_bill = GSTBilling.query.filter_by(client_id=client_id)\
    .order_by(GSTBilling.bill_number.desc()).first()
bill_number = (last_bill.bill_number + 1) if last_bill else 1
```

**Impact**: Sync fails, bills trapped, data loss risk

**Solution**:
- Offline: SQLite generates sequential numbers locally
- On Sync: Server reassigns sequential bill numbers
- Store both: offline_bill_number + server_bill_number

---

#### ❌ Scenario 2: Stock Overselling (CRITICAL BLOCKER)
**Problem**: Multiple devices sell the same stock without awareness

**Example**:
```
Central Stock: 10 units of Product X
Device A (offline): Sells 8 units → Local stock = 2
Device B (offline): Sells 7 units → Local stock = 3
Both sync → Server stock = 10 - 8 - 7 = -5 units ❌
```

**Impact**: Negative stock, overselling, inventory discrepancies

**Solution**:
- Pre-sync validation: Check server stock before applying sales
- Reject invalid bills: Mark as "sync_failed" if insufficient stock
- Alert user with options: cancel/backorder/manual resolution

---

#### ❌ Scenario 3: Concurrent Product Edits (MEDIUM RISK)
**Problem**: Same product edited on multiple devices offline

**Solution**: Last-Write-Wins (LWW) with timestamps, or manual conflict resolution UI

---

#### ❌ Scenario 4: Customer Data Desynchronization (LOW RISK)
**Solution**: Don't sync computed fields (total_spent, total_bills), recompute on server

---

### CATEGORY 2: SYNC INFRASTRUCTURE FAILURES

#### ❌ Scenario 5: Partial Sync Failure (CRITICAL)
**Problem**: Network drops mid-sync

**Solution**:
- Atomic batches (10 bills per transaction)
- Sync markers (pending/synced/failed status)
- Resume on retry

---

#### ❌ Scenario 6: App Crashes During Sync (MEDIUM RISK)
**Solution**: WAL mode, graceful shutdown, crash recovery on restart

---

#### ❌ Scenario 7: 1-Hour Sync Interval Too Long (BUSINESS RISK)
**Solution**: Manual sync button, configurable intervals, real-time fallback when online

---

#### ❌ Scenario 8: Sync Conflicts on App Close (HIGH RISK)
**Solution**: Block exit until sync completes, show progress modal

---

### CATEGORY 3: OFFLINE MODE FAILURES

#### ❌ Scenario 9: SQLite Database Corruption (CRITICAL)
**Solution**:
- Enable WAL mode
- Daily backups
- Integrity checks on startup

---

#### ❌ Scenario 10: Disk Space Exhaustion (MEDIUM RISK)
**Solution**: Monitor disk space, auto-purge synced records >30 days

---

#### ❌ Scenario 11: Clock Skew / Date Issues (LOW RISK)
**Solution**: Store both client_timestamp and server_timestamp

---

### CATEGORY 4: AUTHENTICATION & SECURITY FAILURES

#### ❌ Scenario 12: JWT Token Expiry During Offline (CRITICAL)
**Current**: 24-hour JWT expiry
**Solution**: 7-day access token + 30-day refresh token for desktop

---

#### ❌ Scenario 13: Multi-User Conflict (MEDIUM RISK)
**Solution**: Store user_id in offline records, validate on sync

---

#### ❌ Scenario 14: Permission Changes Not Synced (LOW RISK)
**Solution**: Re-fetch permissions on each online connection

---

### CATEGORY 5: DATABASE MIGRATION & SCHEMA FAILURES

#### ❌ Scenario 15: Schema Mismatch During Sync (CRITICAL BLOCKER)
**Solution**: Schema versioning, backward compatibility, migration on sync

---

#### ❌ Scenario 16: SQLite vs PostgreSQL Incompatibility (MEDIUM RISK)
**Solution**: ORM abstraction (SQLAlchemy), type mapping layer

---

#### ❌ Scenario 17: Bulk Upload Performance Degradation (HIGH RISK)
**Solution**: Batch processing (50 bills/request), increase timeout, async processing

---

## IMPLEMENTATION PHASES (6-8 Weeks)

### PHASE 0: Prerequisites (BLOCKING) - 3-4 days
**Must complete before starting other phases**

#### 1. Remove Database Trigger Dependency (CRITICAL)
**Problem**: Stock reduction via PostgreSQL trigger won't work in SQLite

**File**: `backend/routes/billing.py`

**Current code** (lines 85-94):
```python
db.session.add(new_bill)
db.session.commit()
# Stock reduction handled by database trigger
```

**Change to**:
```python
try:
    db.session.add(new_bill)
    db.session.flush()

    # Reduce stock with row locking (prevents overselling)
    for item in data['items']:
        product = StockEntry.query.filter_by(
            product_id=item['product_id'],
            client_id=client_id
        ).with_for_update().first()  # ROW LOCK

        if product.quantity < item['quantity']:
            raise ValueError(f"Insufficient stock for {item['product_name']}")

        product.quantity -= item['quantity']

    db.session.commit()  # Atomic: bill + stock reduction
except:
    db.session.rollback()
    raise
```

**Apply to**: All billing functions (create_gst_bill, create_non_gst_bill, update_bill, exchange_bill, cancel_bill)

#### 2. Fix Bill Number Race Condition
**Problem**: Two concurrent requests can generate duplicate bill numbers

**Solution**: Create atomic counter table
```sql
CREATE TABLE bill_number_counters (
    client_id TEXT PRIMARY KEY,
    current_gst_bill_number INTEGER DEFAULT 0,
    current_non_gst_bill_number INTEGER DEFAULT 0
);
```

**New helper**:
```python
def get_next_bill_number(client_id, bill_type='gst'):
    # Database-level atomic increment (no race condition)
    result = db.session.execute(text("""
        INSERT INTO bill_number_counters (client_id, current_{}_bill_number)
        VALUES (:client_id, 1)
        ON CONFLICT (client_id)
        DO UPDATE SET current_{}_bill_number = bill_number_counters.current_{}_bill_number + 1
        RETURNING current_{}_bill_number
    """.format(bill_type, bill_type, bill_type, bill_type)),
    {"client_id": client_id})
    return result.scalar()
```

---

### PHASE 1: Dual Database Support - 5-7 days

#### Create Database Abstraction Layer
**New file**: `backend/database/manager.py` (200 lines)

**Purpose**: Switch between SQLite (offline) and PostgreSQL (online) transparently

```python
class DatabaseManager:
    def __init__(self):
        self.mode = self._detect_mode()  # 'offline' or 'online'
        self.engine = self._initialize_engine()

    def _detect_mode(self):
        # Check if PostgreSQL reachable
        try:
            # Attempt connection to Supabase
            return 'online'
        except:
            return 'offline'

    def _initialize_engine(self):
        if self.mode == 'online':
            return create_engine(SUPABASE_URI)
        else:
            db_path = os.path.expanduser('~/.mj-billing/local.db')
            engine = create_engine(f'sqlite:///{db_path}')

            # Enable WAL mode for better concurrency
            @event.listens_for(engine, "connect")
            def set_sqlite_pragma(conn, record):
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA foreign_keys=ON")

            return engine
```

#### Type Conversion Layer
**New file**: `backend/database/type_converters.py` (100 lines)

Handle PostgreSQL ↔ SQLite type differences:
- UUID → TEXT
- JSONB → TEXT (JSON string)
- NUMERIC(12,2) → REAL

---

### PHASE 2: Offline Authentication (7-Day Tokens) - 2-3 days

#### Extended JWT Tokens
**File**: `backend/config.py`

```python
JWT_DESKTOP_EXPIRATION_HOURS = 168  # 7 days for desktop app
```

#### Refresh Token System
**New table**:
```sql
CREATE TABLE refresh_tokens (
    token_id TEXT PRIMARY KEY,
    user_id TEXT,
    client_id TEXT,
    token TEXT UNIQUE,
    device_id TEXT,
    expires_at TIMESTAMP,  -- 30 days
    is_revoked BOOLEAN DEFAULT FALSE
);
```

**New endpoint**: `POST /api/auth/desktop-login`
- Issues 7-day access token
- Issues 30-day refresh token
- Stored securely in Electron (OS-level encryption)

---

### PHASE 3: Offline Bill Management - 5-7 days

#### Add Sync Tracking to All Tables
**Migration**: Apply to all 21 tables
```sql
ALTER TABLE gst_billing ADD COLUMN sync_status TEXT DEFAULT 'synced';  -- 'pending'/'synced'/'failed'
ALTER TABLE gst_billing ADD COLUMN synced_at TIMESTAMP;
ALTER TABLE gst_billing ADD COLUMN sync_error TEXT;
ALTER TABLE gst_billing ADD COLUMN local_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_gst_billing_sync ON gst_billing(sync_status, client_id);
```

#### Offline Bill Creation
**File**: `backend/routes/billing.py`

```python
is_offline = db_manager.is_offline()

new_bill = GSTBilling(
    bill_id=str(uuid.uuid4()),
    bill_number=get_next_bill_number(client_id),  # Local sequence
    # ... fields ...
    sync_status='pending' if is_offline else 'synced',
    local_created_at=datetime.utcnow()
)
```

---

### PHASE 4: Sync Engine Implementation - 7-10 days

#### Bulk Upload API
**New file**: `backend/routes/sync.py` (400 lines)

**Key endpoint**: `POST /api/sync/bills/upload`

**Request**:
```json
{
  "gst_bills": [{
    "bill_id": "uuid",
    "bill_number": 101,  // Local number
    "customer_name": "John Doe",
    "items": [...],
    "local_created_at": "2025-01-15T10:30:00Z"
  }]
}
```

**Response**:
```json
{
  "success_count": 10,
  "failed_count": 2,
  "results": [
    {
      "bill_id": "uuid",
      "status": "success",
      "server_bill_number": 205,  // Server reassigned
      "message": "Bill synced (renumbered: 101 → 205)"
    },
    {
      "bill_id": "uuid",
      "status": "failed",
      "error": "STOCK_CONFLICT",
      "conflicts": ["Insufficient stock for Product X"]
    }
  ]
}
```

**Stock Conflict Resolution Logic**:
```python
def _process_bill_upload(bill_data, client_id):
    # Validate stock availability
    for item in bill_data['items']:
        product = StockEntry.query.filter_by(...).with_for_update().first()
        if product.quantity < item['quantity']:
            # REJECT ENTIRE BILL (strict enforcement)
            return {
                'status': 'failed',
                'error': 'STOCK_CONFLICT',
                'conflicts': [f"Insufficient stock for {item['product_name']}"]
            }

    # Assign server bill number
    server_bill_number = get_next_bill_number(client_id)

    # Create bill + reduce stock atomically
    new_bill = GSTBilling(
        bill_id=bill_data['bill_id'],  # Keep same UUID
        bill_number=server_bill_number,  # Server-assigned sequential
        sync_status='synced',
        synced_at=datetime.utcnow()
    )

    db.session.commit()

    return {'status': 'success', 'server_bill_number': server_bill_number}
```

#### Background Sync Scheduler
**New file**: `electron/main/sync-scheduler.js` (250 lines)

```javascript
class SyncScheduler {
    start() {
        // Sync every 1 hour
        setInterval(() => this.performSync(), 60 * 60 * 1000);

        // CRITICAL: Sync on app close (blocking)
        app.on('before-quit', async (event) => {
            event.preventDefault();
            await this.performSync();  // Wait for completion
            app.exit(0);
        });
    }

    async performSync() {
        if (!navigator.onLine) return;

        // Upload bills in batches of 50
        const billsResult = await this.uploadBills();

        // Update local database with server bill numbers
        await this.updateLocalBillNumbers(billsResult.results);

        // Notify UI
        mainWindow.webContents.send('sync-completed', billsResult);
    }
}
```

---

### PHASE 5: Electron Desktop Integration - 7-10 days

#### Main Process
**New file**: `electron/main.js` (300 lines)

```javascript
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');

let flaskProcess;

// Start Flask backend as subprocess
function startFlaskBackend() {
    flaskProcess = spawn('python', ['backend/app.py'], {
        env: { ...process.env, DB_MODE: 'offline' }
    });
}

app.whenReady().then(async () => {
    await startFlaskBackend();
    createWindow();

    // Start 1-hour sync scheduler
    new SyncScheduler(mainWindow).start();
});
```

#### Frontend Sync UI
**New file**: `frontend/src/components/SyncStatusIndicator.tsx` (150 lines)

```typescript
export default function SyncStatusIndicator() {
    const [syncStatus, setSyncStatus] = useState({
        pending: 0,
        is_syncing: false
    });

    return (
        <div className="sync-indicator">
            {syncStatus.pending > 0 && (
                <Badge>{syncStatus.pending} bills pending sync</Badge>
            )}
            <Button onClick={() => window.electron.syncNow()}>
                Sync Now
            </Button>
        </div>
    );
}
```

---

## DATABASE SCHEMA CHANGES SUMMARY

### 1. Bill Number Counters (New Table)
```sql
CREATE TABLE bill_number_counters (
    client_id TEXT PRIMARY KEY,
    current_gst_bill_number INTEGER DEFAULT 0,
    current_non_gst_bill_number INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Sync Tracking (Add to ALL 21 tables)
```sql
-- Example for gst_billing
ALTER TABLE gst_billing ADD COLUMN sync_status TEXT DEFAULT 'synced';
ALTER TABLE gst_billing ADD COLUMN synced_at TIMESTAMP;
ALTER TABLE gst_billing ADD COLUMN sync_error TEXT;
ALTER TABLE gst_billing ADD COLUMN local_created_at TIMESTAMP;
CREATE INDEX idx_gst_billing_sync ON gst_billing(sync_status, client_id);

-- Repeat for: non_gst_billing, stock_entry, customer, payment_type,
-- expense, bulk_stock_order, audit_log, notes, etc.
```

### 3. Refresh Tokens (New Table)
```sql
CREATE TABLE refresh_tokens (
    token_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    device_id TEXT,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## CRITICAL FILES TO MODIFY

### Backend (Python/Flask)
1. **backend/routes/billing.py** - Remove trigger dependency, add stock reduction (Lines 85-94, 171-180, 664-665, 738-739, 834-856, 1013-1033, 1132-1142)
2. **backend/routes/stock.py** - Add row-level locking
3. **backend/config.py** - Add SQLite connection, 7-day JWT
4. **backend/models/billing_model.py** - Add sync_status columns
5. **backend/models/stock_model.py** - Add sync_status columns
6. **NEW: backend/database/manager.py** - Database abstraction layer (200 lines)
7. **NEW: backend/routes/sync.py** - Sync API endpoints (400 lines)
8. **NEW: backend/database/type_converters.py** - PostgreSQL ↔ SQLite type mapping (100 lines)

### Frontend (Next.js/React)
1. **frontend/src/contexts/ClientContext.tsx** - Desktop login support
2. **NEW: frontend/src/contexts/SyncContext.tsx** - Sync state management (150 lines)
3. **NEW: frontend/src/components/SyncStatusIndicator.tsx** - Sync UI widget (150 lines)
4. **NEW: frontend/src/app/admin/sync-status/page.tsx** - Sync dashboard (300 lines)

### Desktop (Electron)
1. **NEW: electron/main.js** - Main process, Flask subprocess (300 lines)
2. **NEW: electron/preload.js** - IPC bridge (100 lines)
3. **NEW: electron/main/sync-scheduler.js** - 1-hour sync timer (250 lines)
4. **NEW: electron/main/secure-storage.js** - Token storage (80 lines)

### Database Migrations
1. **NEW: migration/020_add_sync_tracking.sql** - Add sync columns to all tables
2. **NEW: migration/021_bill_number_counters.sql** - Atomic counter table
3. **NEW: migration/022_refresh_tokens.sql** - Refresh token system

---

## RISK MITIGATION

### Risk 1: Stock Overselling
**Solution**: Server validates stock availability during sync, rejects entire bill if any item oversold

### Risk 2: Bill Number Conflicts
**Solution**: Server reassigns sequential bill numbers on sync (local numbers are temporary)

### Risk 3: Partial Sync Failure
**Solution**: Batch uploads (50 bills/batch), idempotent APIs (UUID-based duplicate detection)

### Risk 4: SQLite Database Corruption
**Solution**: WAL mode enabled, daily auto-backups, startup integrity checks

### Risk 5: Network Interruption Mid-Sync
**Solution**: Resume capability, automatic retry on next sync cycle

### Risk 6: Token Expiry During Long Offline
**Solution**: 7-day access token + 30-day refresh token, auto-refresh when online

---

## ESTIMATED TIMELINE

- **Phase 0 (Blockers)**: 3-4 days
- **Phase 1 (Foundation)**: 5-7 days
- **Phase 2 (Auth)**: 2-3 days
- **Phase 3 (Offline Bills)**: 5-7 days
- **Phase 4 (Sync Engine)**: 7-10 days
- **Phase 5 (Electron)**: 7-10 days
- **Testing & QA**: 5-7 days

**Total**: 6-8 weeks (40-50 working days)

---

## TESTING CHECKLIST

### Offline Mode Tests
- [ ] Create bill offline, verify stock reduces locally
- [ ] Create 1000 bills offline, verify performance
- [ ] Force-close app during bill creation, verify recovery
- [ ] Fill disk space, verify graceful degradation
- [ ] Change device clock, verify timestamp handling

### Sync Tests
- [ ] Sync 1000 bills successfully
- [ ] Interrupt network during sync, verify resume
- [ ] Create duplicate bill numbers on 2 devices, verify resolution
- [ ] Oversell stock on 2 devices, verify rejection
- [ ] Edit same product on 2 devices, verify conflict UI

### Concurrency Tests
- [ ] 2 users create bills simultaneously offline
- [ ] Sync from 3 devices at once to server
- [ ] Admin changes permissions while cashier offline

### Recovery Tests
- [ ] Corrupt SQLite file, verify backup restore
- [ ] Expire JWT during offline mode, verify handling
- [ ] Server schema update while client offline, verify migration

---

## VERDICT

✅ **Your plan is SOLID** with the following adjustments:
1. Bill numbers: SQLite sequential (server reassigns on sync to avoid conflicts)
2. Stock conflicts: Strict rejection during sync (maintains inventory accuracy)
3. Sync frequency: 1-hour interval + app close (as proposed)
4. Offline auth: 7-day tokens (extended from current 24h)

**Priority**: Complete Phase 0 (remove trigger dependency + fix race conditions) BEFORE starting offline mode implementation.

---

## Next Steps

1. Review this plan and approve
2. Set up development environment (Electron, SQLite testing)
3. Start with Phase 0 (Critical blockers)
4. Create proof-of-concept for database switching
5. Proceed phase by phase

**Document Version**: 1.0
**Last Updated**: December 28, 2025
**Status**: Ready for Implementation

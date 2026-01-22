# Prevent Duplicate Sync - Solution

## The Problem

You already have data in Supabase from 2 days ago, but:
- That data doesn't have `synced_at` column (it's NULL)
- SQLite also doesn't have `synced_at` set for those records
- When sync runs, it tries to INSERT the same records again → **duplicate error**

## The Solution

Mark all existing records as "already synced" so they won't be uploaded again.

---

## Option 1: Quick Fix (Recommended)

Run this Python script to automatically mark matching records as synced:

```bash
cd backend
python mark_existing_synced.py
```

**What it does**:
1. Gets all record IDs from Supabase
2. Finds matching records in SQLite
3. Marks them as synced in BOTH databases
4. Only NEW records will sync from now on

**Expected Output**:
```
======================================================================
Marking Existing Records as Synced
======================================================================

[GST Bills]
----------------------------------------------------------------------
  Found 6 records in Supabase
  [OK] Marked 6 records as synced in SQLite
  [OK] Marked all records as synced in Supabase

[Non-GST Bills]
----------------------------------------------------------------------
  Found 7 records in Supabase
  [OK] Marked 7 records as synced in SQLite
  [OK] Marked all records as synced in Supabase

[Stock Entries]
----------------------------------------------------------------------
  Found 89 records in Supabase
  [OK] Marked 89 records as synced in SQLite
  [OK] Marked all records as synced in Supabase

[Customers]
----------------------------------------------------------------------
  Found 5 records in Supabase
  [OK] Marked 5 records as synced in SQLite
  [OK] Marked all records as synced in Supabase

======================================================================
[OK] Complete! Marked 107 total records as synced
======================================================================
```

---

## Option 2: Manual SQL (If you prefer SQL)

### Step 1: Mark Supabase Records
Run this in Supabase SQL Editor:

```sql
-- Copy from migration/MARK_EXISTING_AS_SYNCED.sql
UPDATE gst_billing SET synced_at = CURRENT_TIMESTAMP WHERE synced_at IS NULL;
UPDATE non_gst_billing SET synced_at = CURRENT_TIMESTAMP WHERE synced_at IS NULL;
UPDATE stock_entry SET synced_at = CURRENT_TIMESTAMP WHERE synced_at IS NULL;
UPDATE customer SET synced_at = CURRENT_TIMESTAMP WHERE synced_at IS NULL;
```

### Step 2: Mark SQLite Records
Run this Python snippet:

```bash
cd backend
python mark_existing_synced.py
```

---

## After Running the Fix

### 1. Verify All Marked
```bash
cd backend
python check_synced_status.py
```

**Expected Output**:
```
[Summary] Unsynced Records:
Customers:      0 unsynced
Stock entries:  0 unsynced
GST bills:      0 unsynced
Non-GST bills:  0 unsynced

[OK] All records are synced!
```

### 2. Test Sync
```bash
curl -X POST http://localhost:5000/api/sync/trigger
```

**Expected Response** (should show 0 synced because everything is already marked):
```json
{
  "status": "success",
  "synced": {
    "bills": 0,
    "customers": 0,
    "stock": 0
  },
  "errors": []
}
```

### 3. Test with NEW Data
Create a new customer or bill in your app, then run sync again:
```bash
curl -X POST http://localhost:5000/api/sync/trigger
```

**This time it should sync only the NEW record**:
```json
{
  "status": "success",
  "synced": {
    "bills": 0,
    "customers": 1,
    "stock": 0
  },
  "errors": []
}
```

---

## How It Works

### Before:
```
SQLite:           Supabase:
customer_id: 123  customer_id: 123
synced_at: NULL   synced_at: NULL

Sync runs → Tries to INSERT 123 again → DUPLICATE ERROR
```

### After:
```
SQLite:                           Supabase:
customer_id: 123                  customer_id: 123
synced_at: 2026-01-18 06:30:00   synced_at: 2026-01-18 06:30:00

Sync runs → Skips 123 (already synced) → No duplicate
```

---

## Files Created

1. **[backend/mark_existing_synced.py](backend/mark_existing_synced.py)** - Python script to mark records
2. **[migration/MARK_EXISTING_AS_SYNCED.sql](migration/MARK_EXISTING_AS_SYNCED.sql)** - SQL for Supabase only

---

## Summary

**Quick Fix (Do This)**:
```bash
cd backend
python mark_existing_synced.py
```

Then test sync:
```bash
curl -X POST http://localhost:5000/api/sync/trigger
```

Done! No more duplicate errors.

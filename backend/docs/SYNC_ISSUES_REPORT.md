# Sync System Issues Report

## Overview
This document details all issues found during comprehensive testing of the SQLite-Supabase bidirectional sync system.

---

## ISSUE #1: Transaction Cascade Failure (FIXED)

**Status:** FIXED

**Problem:**
When uploading records from SQLite to Supabase, if one INSERT failed (e.g., due to unique constraint violation), the entire batch of records failed. PostgreSQL aborts the current transaction after the first error, causing all subsequent INSERT attempts to fail with:
```
current transaction is aborted, commands ignored until end of transaction block
```

**Root Cause:**
All INSERT operations were in a single transaction with only one `pg_conn.commit()` at the end of the loop.

**Solution:**
Modified all 13 upload sync methods to use per-record commit/rollback:
- `pg_conn.commit()` after each successful record
- `pg_conn.rollback()` on failure, then continue with next record

**Files Modified:**
- `backend/services/sync_service.py` - All upload methods

**Code Pattern Applied:**
```python
# Before (batch commit):
for record in records:
    pg_conn.execute(insert_query, record)
pg_conn.commit()  # Single commit at end

# After (per-record commit):
for record in records:
    try:
        pg_conn.execute(insert_query, record)
        pg_conn.commit()  # Commit each successful record
        synced_ids.append(record_id)
    except Exception as e:
        pg_conn.rollback()  # Rollback failed record
        logger.error(f"Failed to sync: {e}")
```

---

## ISSUE #2: Duplicate Bill Number Conflict (DATA ISSUE)

**Status:** REQUIRES MANUAL RESOLUTION

**Problem:**
10 records in SQLite `non_gst_billing` table cannot be uploaded to Supabase because they have bill_numbers (1-10) that already exist in Supabase with different bill_ids.

**Error:**
```
psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "idx_non_gst_billing_number"
Key (client_id, bill_number)=(85f5a5f7-6a3d-4a89-8f9b-9d5b5f5e8a7c, 1) already exists
```

**Root Cause:**
- SQLite has bills created locally (Jan 2026) with bill_numbers 1-10
- Supabase has older bills (Oct 2025) with same bill_numbers 1-10 but different bill_ids
- The unique constraint is on (client_id, bill_number), not bill_id

**Resolution Options:**

### Option A: Keep Supabase Data
1. Delete conflicting SQLite bills with bill_numbers 1-10
2. Re-download from Supabase
```sql
-- In SQLite
DELETE FROM non_gst_billing WHERE bill_number IN (1,2,3,4,5,6,7,8,9,10);
```
Then trigger download sync.

### Option B: Keep SQLite Data
1. Delete old Supabase bills with bill_numbers 1-10
2. Re-upload SQLite data
```sql
-- In Supabase (PostgreSQL)
DELETE FROM non_gst_billing
WHERE client_id = '85f5a5f7-6a3d-4a89-8f9b-9d5b5f5e8a7c'
AND bill_number IN (1,2,3,4,5,6,7,8,9,10);
```
Then trigger upload sync.

### Option C: Keep Both (Renumber)
1. Update SQLite bill_numbers to start from 11
```sql
-- In SQLite
UPDATE non_gst_billing SET bill_number = bill_number + 10 WHERE bill_number <= 10;
```
2. Upload as new bills

---

## ISSUE #3: Missing Columns in SQLite (FIXED)

**Status:** FIXED

**Problem:**
Download sync failed with:
```
sqlite3.OperationalError: table gst_billing has no column named customer_address
```

**Root Cause:**
Supabase had columns that SQLite schema was missing:
- `gst_billing`: customer_address, customer_email, customer_id
- `non_gst_billing`: customer_address, customer_email, customer_id

**Solution:**
Added missing columns to SQLite:
```sql
ALTER TABLE gst_billing ADD COLUMN customer_address TEXT DEFAULT "";
ALTER TABLE gst_billing ADD COLUMN customer_email TEXT DEFAULT "";
ALTER TABLE gst_billing ADD COLUMN customer_id TEXT NULL;
ALTER TABLE non_gst_billing ADD COLUMN customer_address TEXT DEFAULT "";
ALTER TABLE non_gst_billing ADD COLUMN customer_email TEXT DEFAULT "";
ALTER TABLE non_gst_billing ADD COLUMN customer_id TEXT NULL;
```

---

## ISSUE #4: Download Column List Mismatch (FIXED)

**Status:** FIXED

**Problem:**
The download sync methods had hardcoded column lists that didn't include the new customer columns.

**Solution:**
Updated column lists in `sync_service.py`:

**gst_billing (line ~1269):**
```python
columns = ['bill_id', 'client_id', 'bill_number', 'customer_id', 'customer_name',
           'customer_phone', 'customer_email', 'customer_address', 'items', 'subtotal',
           'gst_percentage', 'gst_amount', 'final_amount', 'payment_type', 'amount_received',
           'discount_percentage', 'discount_amount', 'negotiable_amount', 'status',
           'created_by', 'created_at', 'updated_at', 'synced_at']
```

**non_gst_billing (line ~1306):**
```python
columns = ['bill_id', 'client_id', 'bill_number', 'customer_id', 'customer_name',
           'customer_phone', 'customer_email', 'customer_address', 'customer_gstin',
           'items', 'total_amount', 'payment_type', 'amount_received', 'discount_percentage',
           'discount_amount', 'negotiable_amount', 'status', 'created_by',
           'created_at', 'updated_at', 'synced_at']
```

---

## ISSUE #5: Type Converter Missing NUMERIC Columns (FIXED PREVIOUSLY)

**Status:** FIXED

**Problem:**
Decimal conversion errors during sync due to missing column mappings.

**Solution:**
Added all NUMERIC columns to `BILLING_COLUMN_TYPES` in `type_converters.py`:
```python
BILLING_COLUMN_TYPES = {
    # ... existing columns ...
    'gst_percentage': 'NUMERIC',
    'amount_received': 'NUMERIC',
    'discount_percentage': 'NUMERIC',
    'discount_amount': 'NUMERIC',
    'negotiable_amount': 'NUMERIC',
    'balance_due': 'NUMERIC',
}
```

---

## Test Results Summary

### Upload Sync (SQLite → Supabase)
| Table | Status | Notes |
|-------|--------|-------|
| gst_billing | ✅ Works | 0 unsynced records |
| non_gst_billing | ⚠️ Partial | 10 records blocked by duplicate constraint |
| stock_entry | ✅ Works | 0 unsynced records |
| customer | ✅ Works | 0 unsynced records |
| payment_type | ✅ Works | 0 unsynced records |
| expense | ✅ Works | 0 unsynced records |
| expense_summary | ✅ Works | 0 unsynced records |
| bulk_stock_order | ✅ Works | 0 unsynced records |
| bulk_stock_order_item | ✅ Works | 0 unsynced records |
| users | ✅ Works | 0 unsynced records |
| user_permissions | ✅ Works | 0 unsynced records |
| report | ✅ Works | 0 unsynced records |
| notes | ✅ Works | 0 unsynced records |

### Download Sync (Supabase → SQLite)
| Table | Status | Notes |
|-------|--------|-------|
| gst_billing | ✅ Works | All records exist locally |
| non_gst_billing | ✅ Works | All records exist locally |
| stock_entry | ✅ Works | All records exist locally |
| customer | ✅ Works | All records exist locally |
| payment_type | ✅ Works | 0 records to download |
| expense | ✅ Works | 0 records to download |
| bulk_stock_order | ✅ Works | 0 records to download |
| bulk_stock_order_item | ✅ Works | 0 records to download |
| users | ✅ Works | 0 records to download |
| notes | ✅ Works | 0 records to download |

---

## Recommendations

1. **Resolve Data Conflict**: Choose Option A, B, or C for the 10 non_gst_billing records with duplicate bill_numbers.

2. **Prevent Future Conflicts**: Consider one of:
   - Use UUID as the unique identifier instead of sequential bill_number
   - Include device/source identifier in the unique constraint
   - Use a more sophisticated conflict resolution strategy

3. **Monitoring**: Add monitoring for sync failures to catch similar issues early.

4. **Schema Sync**: Ensure any future schema changes are applied to both databases before deploying.

---

## Files Modified During Fix

1. `backend/services/sync_service.py`
   - Per-record commit/rollback for all 13 upload methods
   - Updated download column lists for gst_billing and non_gst_billing

2. `backend/database/type_converters.py`
   - Added missing NUMERIC column mappings

3. SQLite Database (direct ALTER TABLE)
   - Added customer_address, customer_email, customer_id to gst_billing
   - Added customer_address, customer_email, customer_id to non_gst_billing

---

*Report generated: January 28, 2026*

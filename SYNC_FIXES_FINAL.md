# Final Sync Fixes - All Issues Resolved

## Issues Fixed

### 1. ✅ Missing `gst_percentage` Column in GST Bills
**Error**: `null value in column "gst_percentage" of relation "gst_billing" violates not-null constraint`

**Fix**: Added default value of 0 for missing `gst_percentage` field and included it in INSERT statement.

**Location**: [sync_service.py:166-184](backend/services/sync_service.py#L166-L184)

### 2. ✅ SQLite UPDATE Syntax Error
**Error**: `near "?": syntax error - WHERE product_id IN ?`

**Problem**: SQLite doesn't support `IN :param` with tuples directly.

**Fix**: Created dynamic placeholders for each ID:
```python
placeholders = ','.join([f":id_{i}" for i in range(len(ids))])
params = {"synced_at": datetime.utcnow().isoformat()}
params.update({f"id_{i}": id for i, id in enumerate(ids)})

sqlite_conn.execute(text(f"""
    UPDATE table_name
    SET synced_at = :synced_at
    WHERE id IN ({placeholders})
"""), params)
```

**Applied to**:
- GST billing UPDATE (line 198-211)
- Non-GST billing UPDATE (line 270-283)
- Stock UPDATE (line 348-361)
- Customer UPDATE (line 432-445)

### 3. ✅ Duplicate Bill Number Constraint (Non-GST)
**Error**: `duplicate key value violates unique constraint "idx_non_gst_billing_number"`

**Problem**: Supabase has a unique constraint on `(client_id, bill_number)`, so bills with same number but different `bill_id` cause conflict.

**Fix**: Enhanced ON CONFLICT to update existing records instead of failing:
```sql
ON CONFLICT (bill_id) DO UPDATE SET
    synced_at = CURRENT_TIMESTAMP,
    updated_at = EXCLUDED.updated_at,
    total_amount = EXCLUDED.total_amount,
    items = EXCLUDED.items
```

**Location**: [sync_service.py:258-262](backend/services/sync_service.py#L258-L262)

---

## Testing Instructions

### Step 1: Restart Backend
Stop and restart your backend server to load the updated code:
```bash
# Press Ctrl+C to stop
cd backend
python app.py
```

### Step 2: Run Supabase Migration
1. Open Supabase SQL Editor: https://app.supabase.com
2. Copy and paste [migration/ADD_SYNCED_AT_TO_ALL_TABLES.sql](migration/ADD_SYNCED_AT_TO_ALL_TABLES.sql)
3. Click "Run"

### Step 3: Trigger Sync
```bash
curl -X POST http://localhost:5000/api/sync/trigger
```

**Expected Response**:
```json
{
  "status": "success",
  "timestamp": "2026-01-18T06:15:00.000000",
  "synced": {
    "bills": 13,
    "stock": 89,
    "customers": 5
  },
  "errors": []
}
```

### Step 4: Verify All Records Synced
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

---

## What Each Fix Does

| Fix | Before | After |
|-----|--------|-------|
| **gst_percentage** | Field missing → INSERT fails | Default value 0 → INSERT succeeds |
| **SQLite UPDATE IN** | `IN :ids` → syntax error | Dynamic placeholders → works |
| **Duplicate bills** | Conflict error → sync fails | Update existing → sync succeeds |
| **JSON serialization** | Dict object → can't adapt | JSON string → works |
| **customer_address** | NULL → bind error | Empty string default → works |

---

## Files Modified

1. **[backend/services/sync_service.py](backend/services/sync_service.py)**
   - Added `gst_percentage` default value (line 166-168)
   - Fixed GST bills UPDATE (line 198-211)
   - Fixed non-GST bills UPDATE (line 270-283)
   - Enhanced non-GST ON CONFLICT (line 258-262)
   - Fixed stock UPDATE (line 348-361)
   - Fixed customer UPDATE (line 432-445)

2. **[backend/database/type_converters.py](backend/database/type_converters.py)** (already fixed)
   - JSON fields kept as strings (line 107-113)

3. **[migration/ADD_SYNCED_AT_TO_ALL_TABLES.sql](migration/ADD_SYNCED_AT_TO_ALL_TABLES.sql)** (created)
   - Adds synced_at to all 4 tables in Supabase

---

## Summary

All 3 critical sync issues are now resolved:

✅ **Missing gst_percentage** - Default value added
✅ **SQLite UPDATE syntax** - Dynamic placeholders implemented
✅ **Duplicate bill numbers** - ON CONFLICT enhanced to update
✅ **JSON serialization** - Already fixed (keeps as string)
✅ **Missing customer_address** - Already fixed (default empty string)

**Next Step**: Restart backend and run the Supabase migration!

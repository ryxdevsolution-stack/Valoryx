# Database Migrations

## Migration Status

### ✅ Base Migrations (Already Run)
These migrations create the core database structure. **Already executed in Supabase.**

- `001_create_client_entry.sql` - Client table
- `002_create_users.sql` - Users table
- `003_create_payment_type.sql` - Payment types
- `004_create_stock_entry.sql` - Stock/inventory
- `005_create_gst_billing.sql` - GST billing
- `006_create_non_gst_billing.sql` - Non-GST billing
- `007_create_report.sql` - Reports
- `008_create_audit_log.sql` - Audit logging
- `009_create_stock_reduction_trigger.sql` - Auto stock reduction
- `010_run_all_migrations.sql` - Migration runner guide
- `011_create_test_client_and_user.sql` - Test data

### 🚀 Unified Billing Migration (Run This Next)

**File:** `RUN_THIS_IN_SUPABASE.sql`

**Purpose:** Adds support for:
- Barcode scanning
- Item codes (SKU)
- Per-product GST percentages
- HSN/SAC codes

**How to Run:**
1. Open https://app.supabase.com/project/habjhxjutlgnjwjbpkvl/sql/new
2. Copy contents of `RUN_THIS_IN_SUPABASE.sql`
3. Paste and click "RUN"
4. Verify success message

**What it adds to `stock_entry`:**
- `item_code` VARCHAR(50) - Product SKU
- `barcode` VARCHAR(100) - Barcode for scanner
- `gst_percentage` DECIMAL(5,2) - GST rate (0, 5, 12, 18, 28)
- `hsn_code` VARCHAR(20) - HSN/SAC code

---

### 🔧 Fix Stock Trigger for New Products (IMPORTANT - Run This!)

**File:** `FIX_STOCK_TRIGGER_FOR_NEW_PRODUCTS.sql`

**Purpose:** Fixes error when adding new products during billing

**The Problem:**
When you create a new product on-the-fly during billing (like adding "Soap" that's not in inventory), the system generates a temporary ID like `temp-1760725955353`. The old database trigger tried to reduce stock for ALL products, including these temp ones, causing this error:

```
invalid input syntax for type uuid: "temp-1760725955353"
```

**The Solution:**
This migration updates the stock reduction trigger to:
- ✅ Skip stock reduction for products with temp IDs (new products)
- ✅ Still reduce stock for existing products (normal flow)
- ✅ Allow seamless billing with mixed existing and new products

**How to Run:**
1. Open https://app.supabase.com/project/YOUR_PROJECT/sql/new
2. Copy contents of `FIX_STOCK_TRIGGER_FOR_NEW_PRODUCTS.sql`
3. Paste and click "RUN"
4. Look for: "SUCCESS: Stock reduction trigger updated to handle new products!"

**When to Run:**
⚠️ Run this immediately if you're seeing UUID conversion errors when creating bills with new products

---

## After Migration

Once all migrations are executed:

1. ✅ Restart backend: `cd backend && python run.py`
2. ✅ Stock model will have new fields
3. ✅ Unified billing API will work
4. ✅ Barcode lookup will work
5. ✅ New product creation during billing will work
6. ✅ Frontend can use all features

---

## Migration Order

1. ✅ Base migrations (already done)
2. ⏳ `RUN_THIS_IN_SUPABASE.sql` (if not done)
3. ⚠️ `FIX_STOCK_TRIGGER_FOR_NEW_PRODUCTS.sql` (MUST RUN NOW)

---

**Last Updated:** 2025-10-17

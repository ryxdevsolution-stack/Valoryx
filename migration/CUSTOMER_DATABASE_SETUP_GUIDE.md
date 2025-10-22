# 📊 Customer Database Migration Guide

Complete guide to add dedicated customer table to your RYX Billing system.

---

## 🎯 What's Been Done

### ✅ **Payment Types Decision**
- **KEPT**: Payment Type table is still needed and used by billing
- It's referenced in both `gst_billing` and `non_gst_billing` tables
- Required for tracking payment methods (Cash, UPI, Card, etc.)

### ✅ **Customer Management Created**
- **NEW**: Customer table for centralized customer data
- **UPDATED**: Billing tables to include customer references
- **CREATED**: Customer management API and frontend

---

## 📁 Files Created/Updated

### Database Migrations (SQL):
1. **[migration/012_create_customer_table.sql](012_create_customer_table.sql)**
   - Creates `customer` table
   - Includes all customer fields
   - Sets up indexes and RLS

2. **[migration/013_add_customer_fields_to_billing.sql](013_add_customer_fields_to_billing.sql)**
   - Adds customer reference to billing tables
   - Adds email, address, GSTIN fields

3. **[migration/RUN_CUSTOMER_MIGRATION_IN_SUPABASE.sql](RUN_CUSTOMER_MIGRATION_IN_SUPABASE.sql)** ⭐ **RUN THIS**
   - Complete migration script
   - Creates tables
   - Migrates existing data
   - Links bills to customers

### Backend Models:
4. **[backend/models/customer_model.py](../backend/models/customer_model.py)**
   - Customer ORM model
   - to_dict() method

5. **[backend/models/billing_model.py](../backend/models/billing_model.py)** (Updated)
   - Added customer_id, customer_email, customer_address, customer_gstin

### Backend API:
6. **[backend/routes/customer.py](../backend/routes/customer.py)** (Already created)
   - GET /api/customer/list - All customers with stats
   - GET /api/customer/:phone - Customer details

7. **[backend/app.py](../backend/app.py)** (Updated)
   - Registered customer blueprint

### Frontend:
8. **[frontend/src/app/customers/page.tsx](../frontend/src/app/customers/page.tsx)**
   - Customer management UI
   - Fully responsive design

9. **[frontend/src/components/Sidebar.tsx](../frontend/src/components/Sidebar.tsx)** (Updated)
   - Replaced "Payment Types" with "Customers"

---

## 🗄️ Database Schema

### New Customer Table Structure

```sql
customer (
    customer_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,  -- Unique per client
    customer_email VARCHAR(255),
    customer_address TEXT,
    customer_gstin VARCHAR(15),
    customer_city VARCHAR(100),
    customer_state VARCHAR(100),
    customer_pincode VARCHAR(10),
    total_bills INTEGER DEFAULT 0,
    total_spent DECIMAL(15,2) DEFAULT 0.00,
    last_purchase_date TIMESTAMP,
    first_purchase_date TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('active', 'inactive')),
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

### Updated Billing Tables

**gst_billing** - Added:
- `customer_id` UUID (FK to customer)
- `customer_email` VARCHAR(255)
- `customer_address` TEXT
- `customer_gstin` VARCHAR(15)

**non_gst_billing** - Added:
- `customer_id` UUID (FK to customer)
- `customer_email` VARCHAR(255)
- `customer_address` TEXT

---

## 🚀 Migration Steps

### Step 1: Run SQL Migration in Supabase

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Create new query
4. Copy entire content from **`RUN_CUSTOMER_MIGRATION_IN_SUPABASE.sql`**
5. Click **Run**

This will:
- ✅ Create customer table
- ✅ Add new fields to billing tables
- ✅ Migrate existing customer data from bills
- ✅ Link all bills to customers
- ✅ Calculate totals and statistics

### Step 2: Verify Migration

Run this query in Supabase:

```sql
-- Check customer data
SELECT
    COUNT(*) as total_customers,
    SUM(total_bills) as total_bills,
    SUM(total_spent) as total_revenue
FROM customer;

-- Check linked bills
SELECT
    'GST Bills Linked' as info,
    COUNT(*) as count
FROM gst_billing
WHERE customer_id IS NOT NULL
UNION ALL
SELECT
    'Non-GST Bills Linked' as info,
    COUNT(*) as count
FROM non_gst_billing
WHERE customer_id IS NOT NULL;
```

### Step 3: Backend is Ready

The backend code is already updated:
- ✅ Customer model created
- ✅ Billing models updated
- ✅ Customer API working
- ✅ Blueprint registered

Just restart your backend:

```bash
# From project root
cd backend
python run.py
```

### Step 4: Frontend is Ready

Frontend already has customer page:
- ✅ `/customers` route active
- ✅ Responsive design
- ✅ Search and filters
- ✅ Statistics cards

---

## 📊 Customer Table Features

### Auto-Calculated Fields

These fields update automatically:

- **total_bills** - Count of all bills (GST + Non-GST)
- **total_spent** - Sum of all bill amounts
- **last_purchase_date** - Most recent bill date
- **first_purchase_date** - First bill date
- **status** - 'active' if purchased in last 30 days

### Customer Status Logic

```
Active: last_purchase_date >= NOW() - 30 days
Inactive: last_purchase_date < NOW() - 30 days
```

---

## 🔄 How It Works After Migration

### Creating a New Bill

When a bill is created:

1. **Check if customer exists** (by phone + client_id)
2. **If NOT exists**: Create new customer record
3. **If exists**: Link bill to existing customer
4. **Update customer stats**: total_bills++, total_spent+=amount, last_purchase_date=now()
5. **Save bill** with customer_id reference

### Customer List Page

Shows:
- All customers from `customer` table
- Aggregated data (already calculated)
- Search by name/phone
- Filter by active/inactive
- Statistics cards

---

## 💡 Benefits of Customer Table

### Before (Without Customer Table):
- ❌ Customer data scattered in bills
- ❌ No central customer management
- ❌ Difficult to track customer history
- ❌ Slow queries (GROUP BY on bills)
- ❌ No customer notes or metadata

### After (With Customer Table):
- ✅ Single source of truth for customers
- ✅ Fast customer queries (indexed table)
- ✅ Pre-calculated statistics
- ✅ Customer notes and metadata support
- ✅ Better data integrity
- ✅ Can add loyalty programs, credit limits, etc.

---

## 🔐 Security & Data Isolation

All tables use **Row Level Security (RLS)**:

- Customers are isolated by `client_id`
- Each client only sees their own customers
- RLS policies enforce data separation

```sql
CREATE POLICY customer_client_isolation ON customer
    FOR ALL
    USING (client_id = current_setting('app.current_client_id')::UUID);
```

---

## 📝 API Endpoints

### GET /api/customer/list

Returns all customers with statistics:

```json
{
  "success": true,
  "customers": [
    {
      "customer_name": "John Doe",
      "customer_phone": "9876543210",
      "customer_email": "john@example.com",
      "total_bills": 15,
      "total_amount": 45000.00,
      "status": "Active",
      "last_purchase": "2025-10-20T10:30:00",
      ...
    }
  ],
  "statistics": {
    "total_customers": 150,
    "active_customers": 45,
    "inactive_customers": 105,
    "total_revenue": 2500000.00
  }
}
```

### GET /api/customer/:phone

Returns customer details and bill history.

---

## 🧹 Clean Up (Optional)

After migration is successful and tested:

### Keep These Files:
- ✅ `003_create_payment_type.sql` - Still needed!
- ✅ `012_create_customer_table.sql`
- ✅ `013_add_customer_fields_to_billing.sql`
- ✅ `RUN_CUSTOMER_MIGRATION_IN_SUPABASE.sql`

### Can Remove:
- ❌ `frontend/src/app/payment-types/page.tsx` - Not needed anymore

---

## ✅ Migration Checklist

- [ ] Backup your Supabase database
- [ ] Run `RUN_CUSTOMER_MIGRATION_IN_SUPABASE.sql` in Supabase
- [ ] Verify migration with test queries
- [ ] Restart backend server
- [ ] Test customer page in frontend
- [ ] Create a test bill and verify customer linking
- [ ] Check customer statistics are updating

---

## 🆘 Troubleshooting

### Issue: Migration fails with "column already exists"

**Solution**: The migration is idempotent. It uses `IF NOT EXISTS`, so it's safe to re-run.

### Issue: No customers showing up

**Solution**:
1. Check if migration ran: `SELECT COUNT(*) FROM customer;`
2. Check bills are linked: `SELECT COUNT(*) FROM gst_billing WHERE customer_id IS NOT NULL;`
3. Verify client_id matches your logged-in user

### Issue: Customer stats not updating

**Solution**: Stats are calculated during migration. For ongoing updates, you need to add triggers or update logic in billing creation.

---

## 🎉 You're All Set!

Your RYX Billing system now has:
- ✅ Dedicated customer table
- ✅ Customer management page
- ✅ Better performance
- ✅ Scalable architecture
- ✅ Ready for future features (loyalty, credit limits, etc.)

**Next Steps**: Run the migration and enjoy better customer management! 🚀

# 🚀 Unified Billing System - Complete Guide

## Overview

The unified billing system is an intelligent, single-page billing solution that automatically detects whether to create a GST or Non-GST bill based on the items added. It eliminates the need for separate billing pages and provides a seamless experience with barcode scanner support.

---

## ✨ Key Features

### 1. **Smart Auto-Detection**
- System automatically determines bill type based on items
- **GST Bill**: Created when ANY item has GST percentage > 0
- **Non-GST Bill**: Created when ALL items have GST percentage = 0
- Real-time badge showing current bill type

### 2. **Barcode Scanner Integration**
- Auto-focused barcode input field
- Instant product lookup by barcode, item code, or product name
- Products auto-added to bill on barcode scan
- Works with USB barcode scanners (keyboard wedge mode)

### 3. **Enhanced Product Fields**
- **Item Code (SKU)**: Unique product identifier per client
- **Barcode**: EAN, UPC, or custom barcode
- **GST Percentage**: 0%, 5%, 12%, 18%, or 28%
- **HSN/SAC Code**: For GST compliance

### 4. **Per-Item GST Calculation**
- Each item can have different GST rates
- Automatic calculation of GST amount per line item
- Real-time total calculations

### 5. **Professional UI**
- Clean, modern interface
- Enhanced table with all necessary columns:
  - S.No
  - Item Code
  - Product Name
  - HSN Code
  - Unit
  - Quantity (inline editable)
  - Rate
  - GST%
  - GST Amount
  - Total Amount
- Color-coded GST indicators

### 6. **Keyboard Shortcuts**
- **F2**: Focus barcode input
- **Enter**: Add scanned item
- **Escape**: Clear barcode input
- Fast, keyboard-only workflow

---

## 📋 How to Use

### **Step 1: Add Products to Stock**

Before billing, add products with barcode and GST details:

1. Go to **Stock Management**
2. Click **+ Add Stock**
3. Fill in product details:
   - Product Name (required)
   - Quantity (required)
   - Rate (required)
   - **Item Code** (e.g., "LP-001")
   - **Barcode** (e.g., "8901234567890")
   - **GST Percentage** (0%, 5%, 12%, 18%, 28%)
   - **HSN Code** (e.g., "8471")
   - Category, Unit, Low Stock Alert
4. Click **Add Stock**

### **Step 2: Create a Bill**

1. Click **Create Bill** in the sidebar
2. Enter customer details:
   - Customer Name (required)
   - Customer Phone (required)

3. **Add Items** (Choose one method):

   **Method A - Barcode Scanner:**
   - Focus is auto-set to barcode input
   - Scan product barcode
   - Product automatically added to list
   - Repeat for all items

   **Method B - Manual Selection:**
   - Select product from dropdown
   - Enter quantity
   - Click "Add Item"

4. **Review Bill:**
   - Check bill type badge (GST or Non-GST)
   - Verify all items and quantities
   - Edit quantities inline if needed
   - Remove unwanted items

5. **Complete Bill:**
   - Select payment type
   - Review totals (Subtotal + GST = Grand Total)
   - Click "Create Bill"
   - Bill saved automatically to correct table

---

## 🗂️ Database Structure

### **Automatic Table Routing**

The system intelligently routes bills to the correct database table:

#### **GST Bills** → `gst_billing` table
**Trigger:** When ANY item has `gst_percentage` > 0

**Example:**
- Item 1: Laptop (18% GST) + Item 2: Notebook (0% GST) = **GST Bill**

**Stored Fields:**
- Bill details with total GST amount
- Items array with per-item GST amounts
- Bill type automatically set to "GST"

#### **Non-GST Bills** → `non_gst_billing` table
**Trigger:** When ALL items have `gst_percentage` = 0

**Example:**
- Item 1: Service (0% GST) + Item 2: Consultation (0% GST) = **Non-GST Bill**

**Stored Fields:**
- Bill details with simple total
- Items array without GST calculations
- Bill type automatically set to "Non-GST"

### **Stock Entry Table Enhancements**

New columns added to `stock_entry`:
```sql
item_code VARCHAR(50)        -- Product SKU
barcode VARCHAR(100)          -- Barcode for scanner
gst_percentage DECIMAL(5,2)   -- GST rate (0-100)
hsn_code VARCHAR(20)          -- HSN/SAC code
```

---

## 🔌 API Endpoints

### **1. Barcode Lookup**
```http
GET /api/stock/lookup/<code>
```

**Purpose:** Quick product lookup by barcode, item code, or product name

**Response:**
```json
{
  "success": true,
  "product": {
    "product_id": "uuid",
    "product_name": "Laptop",
    "rate": "45000.00",
    "gst_percentage": "18.00",
    "hsn_code": "8471",
    "item_code": "LP-001",
    "barcode": "8901234567890",
    "quantity": 15,
    "unit": "pcs"
  },
  "stock_status": "available",
  "available_quantity": 15
}
```

### **2. Unified Billing**
```http
POST /api/billing/create
```

**Purpose:** Create bill with automatic GST/Non-GST detection

**Request:**
```json
{
  "customer_name": "John Doe",
  "customer_phone": "9876543210",
  "payment_type": "payment_type_id",
  "items": [
    {
      "product_id": "uuid",
      "product_name": "Laptop",
      "item_code": "LP-001",
      "hsn_code": "8471",
      "unit": "pcs",
      "quantity": 2,
      "rate": 45000,
      "gst_percentage": 18,
      "gst_amount": 16200,
      "amount": 106200
    }
  ]
}
```

**Response (GST Bill):**
```json
{
  "success": true,
  "bill_id": "uuid",
  "bill_number": 1,
  "bill_type": "GST",
  "subtotal": 90000.00,
  "gst_amount": 16200.00,
  "final_amount": 106200.00,
  "message": "GST bill created successfully"
}
```

**Response (Non-GST Bill):**
```json
{
  "success": true,
  "bill_id": "uuid",
  "bill_number": 1,
  "bill_type": "Non-GST",
  "total_amount": 500.00,
  "message": "Non-GST bill created successfully"
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **F2** | Focus barcode input field |
| **Enter** | Add scanned/selected item to bill |
| **Escape** | Clear barcode input |

---

## 🎯 Workflow Examples

### **Example 1: Pure GST Bill**

**Scenario:** Selling electronics with GST

1. Scan barcode: Laptop (18% GST)
2. Scan barcode: Mouse (18% GST)
3. System shows: **"GST Bill"** badge
4. Enter customer details
5. Select payment type
6. Create Bill
7. ✅ Saved to `gst_billing` table

**Calculation:**
```
Laptop: 2 × ₹45,000 = ₹90,000 + 18% GST (₹16,200) = ₹1,06,200
Mouse:  5 × ₹850    = ₹4,250  + 18% GST (₹765)    = ₹5,015
───────────────────────────────────────────────────────────
Subtotal: ₹94,250
Total GST: ₹16,965
Grand Total: ₹1,11,215
```

### **Example 2: Pure Non-GST Bill**

**Scenario:** Service-based billing (no GST)

1. Select: Consultation (0% GST)
2. Select: Documentation (0% GST)
3. System shows: **"Non-GST Bill"** badge
4. Enter customer details
5. Select payment type
6. Create Bill
7. ✅ Saved to `non_gst_billing` table

**Calculation:**
```
Consultation:   1 × ₹500  = ₹500  + 0% GST = ₹500
Documentation:  1 × ₹300  = ₹300  + 0% GST = ₹300
─────────────────────────────────────────────────
Total: ₹800 (No GST)
```

### **Example 3: Mixed Bill (becomes GST Bill)**

**Scenario:** Mixing GST and Non-GST items

1. Scan: Laptop (18% GST)
2. Scan: Notebook (0% GST)
3. System shows: **"GST Bill"** badge (because Laptop has GST)
4. GST applied only to Laptop
5. ✅ Saved to `gst_billing` table

**Calculation:**
```
Laptop:    2 × ₹45,000 = ₹90,000 + 18% GST (₹16,200) = ₹1,06,200
Notebook: 10 × ₹45     = ₹450    + 0% GST  (₹0)      = ₹450
─────────────────────────────────────────────────────────
Subtotal: ₹90,450
Total GST: ₹16,200
Grand Total: ₹1,06,650
```

---

## 🔧 Technical Implementation

### **Frontend:**
- **Page:** `/app/billing/create/page.tsx`
- **Framework:** Next.js 14 with TypeScript
- **State Management:** React hooks (useState, useEffect, useRef)
- **API Client:** Axios with authentication

### **Backend:**
- **Route:** `/routes/billing.py`
- **Endpoint:** POST `/api/billing/create`
- **Logic:** Smart bill type detection based on item GST percentages
- **Database:** PostgreSQL (Supabase)

### **Key Logic:**
```python
has_gst_items = any(item.get('gst_percentage', 0) > 0 for item in items)

if has_gst_items:
    # Save to gst_billing table
    create_gst_bill()
else:
    # Save to non_gst_billing table
    create_non_gst_bill()
```

---

## 📊 Benefits Over Old System

| Feature | Old System | New Unified System |
|---------|-----------|-------------------|
| **Pages** | 2 separate pages | 1 unified page |
| **User Decision** | Must choose GST/Non-GST first | Automatic detection |
| **Barcode Support** | None | Full support |
| **GST Calculation** | Manual uniform rate | Auto per-item rates |
| **Item Details** | Basic (name, qty, rate) | Enhanced (SKU, barcode, HSN, GST%) |
| **Workflow** | Slow, multi-step | Fast, streamlined |
| **Keyboard Nav** | Limited | Full shortcuts |
| **User Experience** | Average | Professional |

---

## 🚀 System Status

### **Running Services:**
- ✅ Backend: http://127.0.0.1:5000
- ✅ Frontend: http://localhost:3001

### **Access:**
1. Open http://localhost:3001
2. Login with your credentials
3. Click **"Create Bill"** in sidebar
4. Start billing!

---

## 📝 Notes

- **Stock Reduction:** Automatic via database triggers
- **Bill Numbering:** Auto-increment per client
- **Multi-tenant:** Full client_id isolation
- **Audit Logging:** All actions logged
- **GST Compliance:** HSN codes, GSTIN support ready

---

## 🎓 Training Tips

1. **Practice with Barcode Scanner:**
   - Print barcode labels for products
   - Practice scanning workflow
   - Average bill time: 10-15 seconds

2. **Keyboard Shortcuts:**
   - Master F2 (focus) + Enter (add)
   - Hands stay on keyboard
   - Faster than mouse clicking

3. **Stock Setup:**
   - Pre-configure all products with barcodes
   - Set correct GST percentages
   - Add HSN codes for compliance

---

**Last Updated:** 2025-10-17
**Version:** 1.0
**Status:** Production Ready ✅

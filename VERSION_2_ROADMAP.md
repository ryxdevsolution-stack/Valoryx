# MJ Billing Software - Version 2 Roadmap

> **Document Created:** November 27, 2025
> **Current Version:** 1.0
> **Target Version:** 2.0
> **Overall Assessment:** 7.5/10 - Solid foundation, needs enterprise features

---

## Table of Contents

1. [Current State Overview](#current-state-overview)
2. [Technology Stack](#technology-stack)
3. [Existing Features](#existing-features)
4. [Missing Features Analysis](#missing-features-analysis)
5. [Database Improvements](#database-improvements)
6. [UI/UX Improvements](#uiux-improvements)
7. [Security Enhancements](#security-enhancements)
8. [Performance Optimizations](#performance-optimizations)
9. [Implementation Phases](#implementation-phases)
10. [API Endpoints Reference](#api-endpoints-reference)
11. [Database Schema Reference](#database-schema-reference)

---

## Current State Overview

### Component Assessment

| Component | Technology | Status | Rating |
|-----------|------------|--------|--------|
| Frontend | Next.js 16, React 18, TypeScript, Tailwind CSS | Production Ready | ⭐⭐⭐⭐ |
| Backend | Flask 3.0, PostgreSQL, Redis, JWT Auth | Production Ready | ⭐⭐⭐⭐ |
| Database | 21 Tables, Multi-tenant, RLS Policies | Production Ready | ⭐⭐⭐⭐ |
| Mobile | PWA Support | Basic | ⭐⭐⭐ |
| Printing | Browser Print, PDF, WhatsApp | Working | ⭐⭐⭐⭐ |
| Security | JWT, bcrypt, RLS | Good | ⭐⭐⭐⭐ |

---

## Technology Stack

### Frontend
```
- Framework: Next.js 16.0.3
- UI Library: React 18.3.1
- Language: TypeScript 5.3.3
- Styling: Tailwind CSS 3.4.18
- Animation: Framer Motion 10.16.16
- Charts: Highcharts 12.4.0
- Icons: Lucide React 0.548.0
- HTTP Client: Axios 1.6.2
- Date Handling: date-fns 3.0.6
- Printing: react-to-print 3.2.0
- PWA: next-pwa 5.6.0
```

### Backend
```
- Framework: Flask 3.0.0
- Server: Gunicorn 21.2.0
- Database: PostgreSQL (Supabase)
- ORM: Flask-SQLAlchemy 3.1.1
- Cache: Redis 5.0.1
- Auth: PyJWT 2.8.0, bcrypt 4.1.2
- Data Processing: pandas 2.2.3
- Excel: openpyxl 3.1.5
- PDF: reportlab 4.2.5
```

### Database
```
- Type: PostgreSQL via Supabase
- Tables: 21
- Multi-tenancy: Client-level isolation with RLS
- Indexes: 60+
- Triggers: 4+
```

---

## Existing Features

### ✅ Billing System
- [x] GST & Non-GST dual billing
- [x] Multi-tab bill creation with auto-save drafts
- [x] Split payment support (Cash, Card, UPI, etc.)
- [x] Barcode scanning integration
- [x] Sequential bill numbering per client
- [x] Percentage-based discounts
- [x] Bill editing and modification
- [x] Bill exchange/return (basic)
- [x] Customer GSTIN support for B2B

### ✅ Stock Management
- [x] Real-time inventory tracking
- [x] Low stock alerts with configurable thresholds
- [x] Bulk CSV/Excel import & export
- [x] Bulk purchase orders with supplier tracking
- [x] HSN codes and GST percentage per product
- [x] Automatic stock reduction on billing
- [x] Item code and barcode support
- [x] Multiple pricing fields (rate, cost_price, MRP)

### ✅ Customer Management
- [x] Customer database with complete details
- [x] GSTIN support for B2B customers
- [x] Purchase history tracking
- [x] Total spending & lifetime value calculation
- [x] Phone-based quick lookup
- [x] Auto-generated customer codes

### ✅ User Experience
- [x] Dark/Light mode toggle with persistence
- [x] Fully responsive mobile design
- [x] Smooth page transitions (Framer Motion)
- [x] Skeleton loaders for loading states
- [x] PWA support (installable as app)
- [x] Browser printing support (thermal receipt optimized)
- [x] PDF download and WhatsApp sharing

### ✅ Security & Multi-tenancy
- [x] JWT authentication (24-hour expiry)
- [x] Role-based access control (Admin, Manager, Staff)
- [x] Granular permissions system (15+ permissions)
- [x] Complete audit logging with IP tracking
- [x] Client-level data isolation (Row-Level Security)
- [x] bcrypt password hashing
- [x] Super admin functionality

### ✅ Reporting & Analytics
- [x] Dashboard with revenue trends
- [x] Peak hours analysis chart
- [x] Top products visualization
- [x] Top customers by spending
- [x] Payment method breakdown
- [x] Expense tracking with categories
- [x] Date range filtering
- [x] GST audit report generation

### ✅ Admin Features
- [x] Multi-client management
- [x] User management with bulk actions
- [x] Permission assignment interface
- [x] Client logo upload
- [x] Audit log viewer

---

## Missing Features Analysis

### 🔴 Critical Priority (P0) - Must Have for V2

#### 1. Invoice PDF Generation
- **Status:** Not Implemented
- **Impact:** Very High
- **Description:** Customers cannot download or save invoices
- **Requirements:**
  - [ ] Generate PDF from bill data using ReportLab
  - [ ] Include company logo and branding
  - [ ] Add terms and conditions section
  - [ ] Support multiple page invoices
  - [ ] Download button on bill view page
  - [ ] Batch PDF generation for date range

#### 2. Email Integration
- **Status:** Not Implemented
- **Impact:** Very High
- **Description:** No automated communication with customers
- **Requirements:**
  - [ ] SMTP configuration in settings
  - [ ] Email invoice to customer
  - [ ] Payment reminder emails
  - [ ] Low stock notification emails
  - [ ] Daily/weekly report emails
  - [ ] Email templates management
  - [ ] Email delivery tracking

#### 3. Credit Note / Debit Note System
- **Status:** Partial (Exchange exists)
- **Impact:** High
- **Description:** No proper return/refund workflow
- **Requirements:**
  - [ ] Credit note generation for returns
  - [ ] Debit note for additional charges
  - [ ] Link to original invoice
  - [ ] Stock adjustment on return
  - [ ] Credit note PDF generation
  - [ ] Credit balance tracking per customer

#### 4. Payment Tracking & Reconciliation
- **Status:** Not Implemented
- **Impact:** High
- **Description:** No tracking of pending/partial payments
- **Requirements:**
  - [ ] Payment transaction table
  - [ ] Partial payment support
  - [ ] Payment against multiple invoices
  - [ ] Bank deposit linking
  - [ ] Payment receipt generation
  - [ ] Payment history per customer

#### 5. Customer Credit Management
- **Status:** Not Implemented
- **Impact:** High
- **Description:** No credit limits for B2B customers
- **Requirements:**
  - [ ] Credit limit field per customer
  - [ ] Credit utilization tracking
  - [ ] Alert when approaching limit
  - [ ] Block billing when limit exceeded
  - [ ] Credit period (payment terms)
  - [ ] Credit approval workflow

#### 6. Outstanding & Aging Analysis
- **Status:** Not Implemented
- **Impact:** High
- **Description:** No overdue invoice tracking
- **Requirements:**
  - [ ] Age-wise outstanding report (0-30, 31-60, 61-90, 90+ days)
  - [ ] Customer-wise pending amounts
  - [ ] Collection priority list
  - [ ] Overdue alerts
  - [ ] Statement of accounts per customer

#### 7. Invoice Template Customization
- **Status:** Fixed template only
- **Impact:** High
- **Description:** No branding options for invoices
- **Requirements:**
  - [ ] Multiple template designs
  - [ ] Company logo placement
  - [ ] Custom header/footer text
  - [ ] Color scheme options
  - [ ] Terms and conditions editor
  - [ ] Bank details section

#### 8. Data Backup System
- **Status:** Not Implemented
- **Impact:** High
- **Description:** No automated backup mechanism
- **Requirements:**
  - [ ] Scheduled automatic backups
  - [ ] Manual backup trigger
  - [ ] Backup to cloud storage
  - [ ] Backup encryption
  - [ ] Restore functionality
  - [ ] Backup history and logs

#### 9. Two-Factor Authentication (2FA)
- **Status:** Not Implemented
- **Impact:** High
- **Description:** No additional security layer
- **Requirements:**
  - [ ] TOTP (Google Authenticator) support
  - [ ] SMS OTP option
  - [ ] Email OTP option
  - [ ] Remember device option
  - [ ] 2FA enforcement for admins
  - [ ] Recovery codes

---

### 🟡 High Priority (P1) - Should Have for V2

#### 10. SMS/WhatsApp Notifications
- **Status:** Not Implemented
- **Impact:** Medium-High
- **Requirements:**
  - [ ] SMS gateway integration (MSG91, Twilio)
  - [ ] WhatsApp Business API integration
  - [ ] Bill delivery via WhatsApp
  - [ ] Payment confirmation SMS
  - [ ] Low stock alerts via SMS
  - [ ] Template management

#### 11. Online Payment Gateway
- **Status:** Not Implemented
- **Impact:** Medium-High
- **Requirements:**
  - [ ] Razorpay integration
  - [ ] Stripe integration (optional)
  - [ ] Payment link generation
  - [ ] QR code for UPI payment
  - [ ] Payment status webhook handling
  - [ ] Refund processing

#### 12. Quotation/Estimate System
- **Status:** Not Implemented
- **Impact:** Medium
- **Requirements:**
  - [ ] Create quotations
  - [ ] Quotation validity period
  - [ ] Convert quote to invoice
  - [ ] Quote revision history
  - [ ] Quote PDF generation
  - [ ] Quote email to customer

#### 13. Advanced Discount Engine
- **Status:** Basic percentage only
- **Impact:** Medium
- **Requirements:**
  - [ ] Fixed amount discounts
  - [ ] Quantity-based discounts
  - [ ] Customer-specific pricing
  - [ ] Bulk/wholesale discounts
  - [ ] Promotional campaigns
  - [ ] Coupon code system
  - [ ] Discount approval workflow
  - [ ] Maximum discount limits per user

#### 14. GST Return Reports
- **Status:** Not Implemented
- **Impact:** Medium
- **Requirements:**
  - [ ] GSTR-1 format export
  - [ ] GSTR-2 format export
  - [ ] HSN summary report
  - [ ] B2B/B2C segregation
  - [ ] Tax liability summary
  - [ ] ITC (Input Tax Credit) tracking

#### 15. Scheduled/Automated Reports
- **Status:** Not Implemented
- **Impact:** Medium
- **Requirements:**
  - [ ] Daily sales summary email
  - [ ] Weekly performance report
  - [ ] Monthly P&L statement
  - [ ] Scheduled report configuration
  - [ ] Multiple recipient support
  - [ ] Report format options (PDF, Excel)

#### 16. Background Job Processing
- **Status:** Celery configured but not used
- **Impact:** Medium
- **Requirements:**
  - [ ] Implement Celery workers
  - [ ] Bulk email sending
  - [ ] Report generation queue
  - [ ] Data export jobs
  - [ ] Cleanup scheduled tasks
  - [ ] Job status monitoring

---

### 🟢 Medium Priority (P2) - Nice to Have for V2

#### 17. Multi-Currency Support
- **Status:** INR only
- **Requirements:**
  - [ ] Currency master table
  - [ ] Exchange rate management
  - [ ] Currency conversion on billing
  - [ ] Multi-currency reports

#### 18. Inventory Forecasting
- **Status:** Not Implemented
- **Requirements:**
  - [ ] Demand prediction based on history
  - [ ] Reorder point suggestions
  - [ ] Seasonal trend analysis
  - [ ] Stock-out prediction alerts

#### 19. FIFO/LIFO/WAC Costing
- **Status:** Not Implemented
- **Requirements:**
  - [ ] Inventory valuation methods
  - [ ] Cost of goods sold tracking
  - [ ] Batch-wise costing
  - [ ] Inventory aging report

#### 20. Supplier Management
- **Status:** Basic in bulk orders
- **Requirements:**
  - [ ] Supplier master table
  - [ ] Supplier ledger
  - [ ] Purchase order management
  - [ ] Supplier performance metrics
  - [ ] Payment tracking to suppliers

#### 21. Delivery/Fulfillment Tracking
- **Status:** Not Implemented
- **Requirements:**
  - [ ] Delivery address management
  - [ ] Shipment tracking
  - [ ] Delivery status updates
  - [ ] Proof of delivery

#### 22. API Documentation
- **Status:** Not Implemented
- **Requirements:**
  - [ ] Swagger/OpenAPI specification
  - [ ] Interactive API docs
  - [ ] API versioning
  - [ ] Rate limiting documentation

---

### 🔵 Low Priority (P3) - Future Consideration

#### 23. Multi-Warehouse Support
- **Requirements:**
  - [ ] Warehouse/location master
  - [ ] Stock per warehouse
  - [ ] Inter-warehouse transfer
  - [ ] Location-specific pricing

#### 24. Serial Number Tracking
- **Requirements:**
  - [ ] Serial number field per item
  - [ ] Warranty mapping to serial
  - [ ] Serial number history

#### 25. Recurring Billing/Subscriptions
- **Requirements:**
  - [ ] Recurring invoice templates
  - [ ] Subscription management
  - [ ] Auto-billing schedules
  - [ ] Renewal reminders

#### 26. Real-time WebSocket Updates
- **Requirements:**
  - [ ] Live dashboard updates
  - [ ] Real-time notifications
  - [ ] Multi-user collaboration alerts

#### 27. Mobile App (Native)
- **Requirements:**
  - [ ] React Native app
  - [ ] Offline billing capability
  - [ ] Camera barcode scanning
  - [ ] Push notifications
  - [ ] Biometric authentication

#### 28. GraphQL API
- **Requirements:**
  - [ ] GraphQL endpoint
  - [ ] Subscriptions for real-time
  - [ ] Efficient data fetching

#### 29. Third-Party Integrations
- **Requirements:**
  - [ ] Tally integration
  - [ ] QuickBooks integration
  - [ ] Bank statement import
  - [ ] E-commerce platform sync

#### 30. Loyalty/Rewards Program
- **Requirements:**
  - [ ] Points system
  - [ ] Reward redemption
  - [ ] Tier-based benefits
  - [ ] Points expiry management

---

## Database Improvements

### New Tables Required for V2

```sql
-- 1. Credit Note Table
CREATE TABLE credit_note (
    credit_note_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    credit_note_number VARCHAR(50) UNIQUE,
    original_bill_id UUID,
    original_bill_type VARCHAR(20), -- 'gst' or 'non_gst'
    customer_id UUID REFERENCES customer(customer_id),
    items JSONB,
    total_amount NUMERIC(12,2),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 2. Debit Note Table
CREATE TABLE debit_note (
    debit_note_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    debit_note_number VARCHAR(50) UNIQUE,
    original_bill_id UUID,
    original_bill_type VARCHAR(20),
    customer_id UUID REFERENCES customer(customer_id),
    items JSONB,
    total_amount NUMERIC(12,2),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 3. Payment Transaction Table
CREATE TABLE payment_transaction (
    transaction_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    customer_id UUID REFERENCES customer(customer_id),
    bill_id UUID,
    bill_type VARCHAR(20),
    payment_type_id UUID REFERENCES payment_type(payment_type_id),
    amount NUMERIC(12,2),
    transaction_date TIMESTAMP DEFAULT NOW(),
    reference_number VARCHAR(100),
    payment_mode VARCHAR(50), -- 'cash', 'card', 'upi', 'bank_transfer', 'online'
    gateway_reference VARCHAR(100), -- For online payments
    status VARCHAR(20) DEFAULT 'completed',
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Quotation Table
CREATE TABLE quotation (
    quotation_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    quotation_number VARCHAR(50) UNIQUE,
    customer_id UUID REFERENCES customer(customer_id),
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    items JSONB,
    subtotal NUMERIC(12,2),
    discount_percentage NUMERIC(5,2),
    gst_percentage NUMERIC(5,2),
    gst_amount NUMERIC(12,2),
    total_amount NUMERIC(12,2),
    valid_until DATE,
    status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'
    converted_to_bill_id UUID,
    notes TEXT,
    terms_conditions TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 5. Supplier Table
CREATE TABLE supplier (
    supplier_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    supplier_code VARCHAR(50),
    supplier_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    gstin VARCHAR(15),
    pan VARCHAR(10),
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    bank_ifsc VARCHAR(20),
    payment_terms INTEGER DEFAULT 30, -- Days
    credit_limit NUMERIC(12,2),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 6. Invoice Template Table
CREATE TABLE invoice_template (
    template_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    template_name VARCHAR(100),
    template_type VARCHAR(20), -- 'gst', 'non_gst', 'quotation'
    header_html TEXT,
    footer_html TEXT,
    terms_conditions TEXT,
    logo_position VARCHAR(20) DEFAULT 'left',
    color_scheme JSONB,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 7. Email Template Table
CREATE TABLE email_template (
    template_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    template_name VARCHAR(100),
    template_type VARCHAR(50), -- 'invoice', 'reminder', 'quotation', 'welcome', etc.
    subject VARCHAR(255),
    body_html TEXT,
    variables JSONB, -- Available placeholders
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 8. Notification Table
CREATE TABLE notification (
    notification_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    user_id UUID REFERENCES users(user_id),
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50), -- 'info', 'warning', 'error', 'success'
    category VARCHAR(50), -- 'stock', 'payment', 'order', 'system'
    reference_type VARCHAR(50),
    reference_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP
);

-- 9. Discount Rule Table
CREATE TABLE discount_rule (
    rule_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    rule_name VARCHAR(100),
    rule_type VARCHAR(50), -- 'quantity', 'amount', 'customer', 'product', 'coupon'
    discount_type VARCHAR(20), -- 'percentage', 'fixed'
    discount_value NUMERIC(10,2),
    min_quantity INTEGER,
    min_amount NUMERIC(12,2),
    max_discount NUMERIC(12,2),
    applicable_products JSONB, -- Product IDs or categories
    applicable_customers JSONB, -- Customer IDs or types
    coupon_code VARCHAR(50),
    valid_from DATE,
    valid_until DATE,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 10. Backup Log Table
CREATE TABLE backup_log (
    backup_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    backup_type VARCHAR(20), -- 'auto', 'manual'
    backup_path VARCHAR(500),
    file_size BIGINT,
    status VARCHAR(20), -- 'completed', 'failed', 'in_progress'
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by UUID REFERENCES users(user_id)
);

-- 11. Two-Factor Auth Table
CREATE TABLE user_2fa (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) UNIQUE,
    secret_key VARCHAR(100),
    is_enabled BOOLEAN DEFAULT FALSE,
    backup_codes JSONB,
    enabled_at TIMESTAMP,
    last_used_at TIMESTAMP
);

-- 12. Customer Credit Table
CREATE TABLE customer_credit (
    credit_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    customer_id UUID REFERENCES customer(customer_id),
    credit_limit NUMERIC(12,2) DEFAULT 0,
    current_balance NUMERIC(12,2) DEFAULT 0, -- Outstanding amount
    payment_terms INTEGER DEFAULT 30, -- Days
    last_payment_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    blocked_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- 13. Scheduled Report Table
CREATE TABLE scheduled_report (
    schedule_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    report_name VARCHAR(100),
    report_type VARCHAR(50), -- 'sales', 'stock', 'expense', 'customer', 'gst'
    frequency VARCHAR(20), -- 'daily', 'weekly', 'monthly'
    day_of_week INTEGER, -- 0-6 for weekly
    day_of_month INTEGER, -- 1-31 for monthly
    time_of_day TIME,
    recipients JSONB, -- Array of email addresses
    format VARCHAR(20) DEFAULT 'pdf', -- 'pdf', 'excel', 'csv'
    filters JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 14. Currency Table (for future multi-currency)
CREATE TABLE currency (
    currency_id UUID PRIMARY KEY,
    currency_code VARCHAR(3) UNIQUE, -- 'INR', 'USD', 'EUR'
    currency_name VARCHAR(50),
    symbol VARCHAR(10),
    exchange_rate NUMERIC(10,4), -- Rate against base currency
    is_base BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 15. Tax Configuration Table
CREATE TABLE tax_config (
    config_id UUID PRIMARY KEY,
    client_id UUID REFERENCES client_entry(client_id),
    tax_name VARCHAR(50), -- 'CGST', 'SGST', 'IGST', 'CESS'
    tax_percentage NUMERIC(5,2),
    hsn_code VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Indexes to Add

```sql
-- Payment transactions
CREATE INDEX idx_payment_transaction_client ON payment_transaction(client_id);
CREATE INDEX idx_payment_transaction_customer ON payment_transaction(customer_id);
CREATE INDEX idx_payment_transaction_date ON payment_transaction(transaction_date);
CREATE INDEX idx_payment_transaction_bill ON payment_transaction(bill_id, bill_type);

-- Credit notes
CREATE INDEX idx_credit_note_client ON credit_note(client_id);
CREATE INDEX idx_credit_note_customer ON credit_note(customer_id);
CREATE INDEX idx_credit_note_original ON credit_note(original_bill_id, original_bill_type);

-- Quotations
CREATE INDEX idx_quotation_client ON quotation(client_id);
CREATE INDEX idx_quotation_customer ON quotation(customer_id);
CREATE INDEX idx_quotation_status ON quotation(status);
CREATE INDEX idx_quotation_valid_until ON quotation(valid_until);

-- Notifications
CREATE INDEX idx_notification_user ON notification(user_id);
CREATE INDEX idx_notification_unread ON notification(user_id, is_read) WHERE is_read = FALSE;

-- Customer credit
CREATE INDEX idx_customer_credit_client ON customer_credit(client_id);
CREATE INDEX idx_customer_credit_customer ON customer_credit(customer_id);
```

### Customer Table Modifications

```sql
-- Add credit-related fields to customer table
ALTER TABLE customer ADD COLUMN credit_limit NUMERIC(12,2) DEFAULT 0;
ALTER TABLE customer ADD COLUMN current_outstanding NUMERIC(12,2) DEFAULT 0;
ALTER TABLE customer ADD COLUMN payment_terms INTEGER DEFAULT 0; -- Days
ALTER TABLE customer ADD COLUMN credit_blocked BOOLEAN DEFAULT FALSE;
```

### Billing Table Modifications

```sql
-- Add payment status tracking
ALTER TABLE gst_billing ADD COLUMN payment_status VARCHAR(20) DEFAULT 'paid';
-- Values: 'paid', 'partial', 'unpaid', 'overdue'
ALTER TABLE gst_billing ADD COLUMN due_date DATE;
ALTER TABLE gst_billing ADD COLUMN amount_pending NUMERIC(12,2) DEFAULT 0;

ALTER TABLE non_gst_billing ADD COLUMN payment_status VARCHAR(20) DEFAULT 'paid';
ALTER TABLE non_gst_billing ADD COLUMN due_date DATE;
ALTER TABLE non_gst_billing ADD COLUMN amount_pending NUMERIC(12,2) DEFAULT 0;
```

---

## UI/UX Improvements

### Dashboard Enhancements

- [ ] Quick action cards (New Bill, Add Stock, View Reports)
- [ ] Real-time revenue ticker with animation
- [ ] Visual goal progress bars (daily/monthly targets)
- [ ] Recent activities feed with timestamps
- [ ] Pending actions widget (low stock, unpaid bills)
- [ ] Today's summary card (bills, revenue, new customers)

### Billing Screen Improvements

- [ ] Voice search for products
- [ ] Camera barcode scanning on mobile
- [ ] Recently billed items quick-add section
- [ ] Customer auto-complete with purchase history
- [ ] Quick customer add modal without leaving screen
- [ ] Bill templates/favorites for frequent orders
- [ ] Split screen for customer info and items
- [ ] Keyboard shortcuts for power users
- [ ] Bill hold and recall feature

### Stock Management Improvements

- [ ] Visual stock level indicators (color-coded bars)
- [ ] Automated reorder suggestions
- [ ] Cost vs selling price comparison
- [ ] Profit margin display per product
- [ ] Stock history graph per product
- [ ] Bulk price update feature
- [ ] Category-wise stock summary view
- [ ] Image upload for products

### Reports Improvements

- [ ] One-click PDF/Excel export buttons
- [ ] Email report directly from screen
- [ ] Comparison charts (this month vs last month)
- [ ] Drill-down from summary to transaction details
- [ ] Custom report builder interface
- [ ] Saved report filters
- [ ] Report scheduling UI
- [ ] Interactive charts with filtering

### Customer Management Improvements

- [ ] Customer 360-degree view
- [ ] Purchase timeline visualization
- [ ] Credit status indicator
- [ ] Quick statement of accounts
- [ ] Customer tags/categories
- [ ] Bulk SMS/email to customers
- [ ] Customer merge for duplicates

### General UX Improvements

- [ ] Keyboard shortcuts guide (? key)
- [ ] Onboarding tour for new users
- [ ] Help tooltips on complex features
- [ ] Undo/Redo for bill edits
- [ ] Breadcrumb navigation
- [ ] Global search across all modules
- [ ] Recent items quick access
- [ ] Customizable dashboard widgets
- [ ] Print preview improvements
- [ ] Better error messages with solutions

### Mobile-Specific Improvements

- [ ] Bottom navigation for key actions
- [ ] Swipe gestures for common actions
- [ ] Pull-to-refresh on all lists
- [ ] Offline mode indicator
- [ ] Touch-friendly form inputs
- [ ] Mobile-optimized reports
- [ ] Quick actions from notification

---

## Security Enhancements

### Authentication

| Feature | Current | V2 Target |
|---------|---------|-----------|
| Password Policy | Basic | Strong (min 8 chars, mixed case, numbers, symbols) |
| Password History | None | Remember last 5 passwords |
| Account Lockout | None | Lock after 5 failed attempts |
| Session Management | 24h token | Refresh tokens + device tracking |
| 2FA | Not implemented | TOTP + SMS + Email options |
| Login Alerts | None | Email on new device login |

### Authorization

| Feature | Current | V2 Target |
|---------|---------|-----------|
| Permission Granularity | Module level | Action level |
| IP Restrictions | None | Whitelist by user/role |
| Time-based Access | None | Allow access only during hours |
| Approval Workflows | None | Discount/refund approvals |

### Data Security

| Feature | Current | V2 Target |
|---------|---------|-----------|
| Data Encryption | Transit (HTTPS) | At-rest for sensitive fields |
| PII Masking | None | Mask in logs and exports |
| Audit Detail | Basic | Detailed with before/after diff |
| Data Retention | None | Configurable retention policies |

### API Security

| Feature | Current | V2 Target |
|---------|---------|-----------|
| Rate Limiting | Configured, not active | Active per user/endpoint |
| API Keys | None | For third-party integrations |
| Request Signing | None | HMAC for critical endpoints |
| CORS | Permissive | Strict origin validation |

### Implementation Checklist

- [ ] Implement password strength validation
- [ ] Add password history tracking
- [ ] Implement account lockout mechanism
- [ ] Add refresh token rotation
- [ ] Implement TOTP 2FA
- [ ] Add SMS OTP option
- [ ] Create device management UI
- [ ] Add login notification emails
- [ ] Implement IP whitelisting
- [ ] Add API rate limiting middleware
- [ ] Create API key management
- [ ] Add sensitive data encryption
- [ ] Implement PII masking in exports
- [ ] Enhanced audit logging
- [ ] Data retention automation

---

## Performance Optimizations

### Frontend Optimizations

- [ ] **List Virtualization**: Implement virtual scrolling for large lists (customers, stock, audit logs)
- [ ] **Image Lazy Loading**: Product images should load on viewport entry
- [ ] **Code Splitting**: Further split by feature modules
- [ ] **Memoization**: Add React.memo to list item components
- [ ] **Bundle Analysis**: Remove unused dependencies (Three.js if not needed)
- [ ] **Service Worker**: Enhanced caching strategy
- [ ] **Prefetching**: Prefetch likely navigation targets

### Backend Optimizations

- [ ] **Query Caching**: Redis cache for frequently accessed data
- [ ] **Connection Pooling**: Optimize pool size based on load
- [ ] **Pagination**: Cursor-based pagination for large datasets
- [ ] **Async Processing**: Move heavy operations to background
- [ ] **Response Compression**: Ensure gzip for all responses
- [ ] **Database Indexes**: Add missing composite indexes
- [ ] **Query Optimization**: Analyze and optimize slow queries

### Database Optimizations

- [ ] **Partitioning**: Partition billing tables by date
- [ ] **Archiving**: Move old data to archive tables
- [ ] **Vacuuming**: Schedule regular VACUUM ANALYZE
- [ ] **Index Maintenance**: Remove unused indexes
- [ ] **Query Plans**: Monitor and optimize execution plans

### Monitoring & Observability

- [ ] **Error Tracking**: Integrate Sentry
- [ ] **APM**: Application performance monitoring
- [ ] **Logging**: Structured logging with log levels
- [ ] **Metrics**: Key business and technical metrics
- [ ] **Alerting**: Alerts for errors, slow queries, downtime

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Focus: Critical user-facing features**

| Task | Priority | Effort |
|------|----------|--------|
| PDF Invoice Generation | P0 | 3 days |
| Email Integration (SMTP) | P0 | 2 days |
| Invoice Email to Customer | P0 | 2 days |
| Invoice Template Basic Customization | P0 | 2 days |
| Download Invoice Button | P0 | 1 day |

**Deliverables:**
- Customers can download PDF invoices
- Invoices can be emailed to customers
- Basic logo and footer customization

### Phase 2: Financial Features (Weeks 3-4)
**Focus: Payment and credit management**

| Task | Priority | Effort |
|------|----------|--------|
| Credit Note System | P0 | 4 days |
| Payment Transaction Tracking | P0 | 3 days |
| Customer Credit Limits | P0 | 2 days |
| Outstanding/Aging Report | P0 | 3 days |
| Payment Status on Bills | P0 | 2 days |

**Deliverables:**
- Credit notes for returns
- Track pending payments
- Customer credit management
- Aging analysis report

### Phase 3: Communication (Weeks 5-6)
**Focus: Notifications and automation**

| Task | Priority | Effort |
|------|----------|--------|
| SMS Integration | P1 | 3 days |
| WhatsApp Integration | P1 | 3 days |
| Payment Reminder Automation | P1 | 2 days |
| Low Stock Alerts | P1 | 1 day |
| Email Templates Management | P1 | 2 days |

**Deliverables:**
- SMS/WhatsApp bill delivery
- Automated payment reminders
- Configurable notification templates

### Phase 4: Advanced Features (Weeks 7-8)
**Focus: Business functionality**

| Task | Priority | Effort |
|------|----------|--------|
| Quotation System | P1 | 4 days |
| Quote to Invoice Conversion | P1 | 2 days |
| Advanced Discount Rules | P1 | 3 days |
| Coupon Code System | P1 | 2 days |
| Background Job Processing | P1 | 3 days |

**Deliverables:**
- Full quotation workflow
- Flexible discount system
- Async job processing

### Phase 5: Compliance & Reporting (Weeks 9-10)
**Focus: GST and reports**

| Task | Priority | Effort |
|------|----------|--------|
| GST Return Reports (GSTR-1) | P1 | 4 days |
| HSN Summary Report | P1 | 2 days |
| Scheduled Reports | P1 | 3 days |
| Report Email Automation | P1 | 2 days |
| Custom Report Builder | P2 | 4 days |

**Deliverables:**
- GST-compliant reports
- Automated report delivery
- Custom report creation

### Phase 6: Security & Polish (Weeks 11-12)
**Focus: Security and UX**

| Task | Priority | Effort |
|------|----------|--------|
| Two-Factor Authentication | P0 | 4 days |
| Data Backup System | P0 | 3 days |
| API Rate Limiting | P1 | 2 days |
| UI/UX Improvements | P1 | 4 days |
| Performance Optimization | P1 | 3 days |

**Deliverables:**
- 2FA enabled
- Automated backups
- Improved security
- Better user experience

---

## API Endpoints Reference

### Current Endpoints (V1)

<details>
<summary>Authentication Routes</summary>

```
POST   /api/auth/login              - User login
POST   /api/auth/register           - Register new user
POST   /api/auth/logout             - User logout
GET    /api/auth/verify             - Verify JWT token
```
</details>

<details>
<summary>Billing Routes</summary>

```
POST   /api/billing/gst             - Create GST bill
POST   /api/billing/non-gst         - Create Non-GST bill
GET    /api/billing/list            - List all bills
GET    /api/billing/<bill_id>       - Get bill details
PUT    /api/billing/<bill_id>       - Update bill
POST   /api/billing/exchange/<bill_id> - Exchange/return bill
POST   /api/billing/print           - Print bill
GET    /api/billing/printers        - Get available printers
```
</details>

<details>
<summary>Stock Routes</summary>

```
POST   /api/stock                   - Add stock entry
GET    /api/stock                   - List stock items
GET    /api/stock/alerts            - Get low stock alerts
PUT    /api/stock/<product_id>      - Update stock
DELETE /api/stock/<product_id>      - Delete stock
POST   /api/stock/bulk-import       - Bulk import
POST   /api/stock/download-template - Download template
POST   /api/stock/bulk-export       - Export to Excel
GET    /api/stock/lookup/<code>     - Lookup by item code
```
</details>

<details>
<summary>Customer Routes</summary>

```
GET    /api/customer/list           - List customers
GET    /api/customer/<phone>        - Get customer by phone
GET    /api/customer/next-code      - Get next customer code
POST   /api/customer/create         - Create customer
```
</details>

<details>
<summary>Reports Routes</summary>

```
POST   /api/report/generate         - Generate report
GET    /api/report/list             - List reports
GET    /api/report/<report_id>      - Get report details
POST   /api/report/export-pdf       - Export to PDF
```
</details>

<details>
<summary>Admin Routes</summary>

```
GET    /api/admin/users             - List users
POST   /api/admin/users             - Create user
PUT    /api/admin/users/<user_id>   - Update user
GET    /api/admin/clients           - List clients
POST   /api/admin/clients           - Create client
GET    /api/admin/dashboard         - Admin dashboard
```
</details>

### New Endpoints for V2

<details>
<summary>Credit Note Routes (NEW)</summary>

```
POST   /api/credit-note             - Create credit note
GET    /api/credit-note/list        - List credit notes
GET    /api/credit-note/<id>        - Get credit note details
PUT    /api/credit-note/<id>        - Update credit note
POST   /api/credit-note/<id>/pdf    - Generate PDF
POST   /api/credit-note/<id>/email  - Email to customer
```
</details>

<details>
<summary>Quotation Routes (NEW)</summary>

```
POST   /api/quotation               - Create quotation
GET    /api/quotation/list          - List quotations
GET    /api/quotation/<id>          - Get quotation details
PUT    /api/quotation/<id>          - Update quotation
POST   /api/quotation/<id>/send     - Send to customer
POST   /api/quotation/<id>/convert  - Convert to invoice
POST   /api/quotation/<id>/pdf      - Generate PDF
```
</details>

<details>
<summary>Payment Routes (NEW)</summary>

```
POST   /api/payment/record          - Record payment
GET    /api/payment/transactions    - List transactions
GET    /api/payment/pending         - List pending payments
GET    /api/payment/customer/<id>   - Customer payment history
POST   /api/payment/reminder        - Send payment reminder
```
</details>

<details>
<summary>Notification Routes (NEW)</summary>

```
GET    /api/notification/list       - List notifications
GET    /api/notification/unread     - Get unread count
POST   /api/notification/mark-read  - Mark as read
POST   /api/notification/mark-all   - Mark all as read
DELETE /api/notification/<id>       - Delete notification
```
</details>

<details>
<summary>Template Routes (NEW)</summary>

```
GET    /api/template/invoice        - List invoice templates
POST   /api/template/invoice        - Create template
PUT    /api/template/invoice/<id>   - Update template
GET    /api/template/email          - List email templates
POST   /api/template/email          - Create email template
PUT    /api/template/email/<id>     - Update email template
```
</details>

<details>
<summary>Discount Routes (NEW)</summary>

```
POST   /api/discount/rule           - Create discount rule
GET    /api/discount/rules          - List discount rules
PUT    /api/discount/rule/<id>      - Update rule
DELETE /api/discount/rule/<id>      - Delete rule
POST   /api/discount/validate       - Validate coupon code
GET    /api/discount/applicable     - Get applicable discounts
```
</details>

<details>
<summary>Supplier Routes (NEW)</summary>

```
POST   /api/supplier                - Create supplier
GET    /api/supplier/list           - List suppliers
GET    /api/supplier/<id>           - Get supplier details
PUT    /api/supplier/<id>           - Update supplier
DELETE /api/supplier/<id>           - Delete supplier
GET    /api/supplier/<id>/orders    - Supplier order history
```
</details>

<details>
<summary>2FA Routes (NEW)</summary>

```
POST   /api/auth/2fa/setup          - Setup 2FA
POST   /api/auth/2fa/verify         - Verify 2FA code
POST   /api/auth/2fa/disable        - Disable 2FA
GET    /api/auth/2fa/backup-codes   - Get backup codes
POST   /api/auth/2fa/regenerate     - Regenerate backup codes
```
</details>

<details>
<summary>Backup Routes (NEW)</summary>

```
POST   /api/backup/create           - Create backup
GET    /api/backup/list             - List backups
GET    /api/backup/<id>/download    - Download backup
POST   /api/backup/restore          - Restore from backup
DELETE /api/backup/<id>             - Delete backup
```
</details>

---

## Database Schema Reference

### Current Tables (V1)

| Table | Description | Records |
|-------|-------------|---------|
| client_entry | Multi-tenant clients | Master |
| users | User accounts | Per client |
| gst_billing | GST invoices | Per client |
| non_gst_billing | Non-GST invoices | Per client |
| stock_entry | Product inventory | Per client |
| customer | Customer master | Per client |
| payment_type | Payment methods | Per client |
| expense | Daily expenses | Per client |
| expense_summary | Expense aggregates | Per client |
| report | Generated reports | Per client |
| audit_log | Audit trail | Per client |
| bulk_stock_order | Purchase orders | Per client |
| bulk_stock_order_item | Order line items | Per order |
| permission_sections | Permission groups | Global |
| permissions | Permission definitions | Global |
| user_permissions | User-permission links | Per user |
| notes | User notes | Per user |

### New Tables for V2

| Table | Description | Priority |
|-------|-------------|----------|
| credit_note | Return credit notes | P0 |
| debit_note | Additional charges | P0 |
| payment_transaction | Payment tracking | P0 |
| quotation | Sales quotations | P1 |
| supplier | Vendor master | P1 |
| invoice_template | Invoice templates | P1 |
| email_template | Email templates | P1 |
| notification | User notifications | P1 |
| discount_rule | Discount policies | P1 |
| customer_credit | Credit management | P0 |
| scheduled_report | Report automation | P1 |
| backup_log | Backup history | P0 |
| user_2fa | 2FA settings | P0 |
| currency | Multi-currency | P2 |
| tax_config | Tax settings | P2 |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Current | Initial release |
| 2.0 | Planned | This roadmap |

---

## Contributors

- Development Team
- Product Team

---

## Notes

- All timelines are estimates and subject to change
- Priorities may be adjusted based on user feedback
- Security features should not be compromised for speed
- Testing is critical for financial features

---

*Last Updated: November 27, 2025*

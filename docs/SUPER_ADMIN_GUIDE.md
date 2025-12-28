# RYX Billing Software - Super Admin Guide

**Version:** 1.0
**Last Updated:** December 2025
**Access Level:** Super Admin Only (Internal Reference)

---

## Table of Contents

1. [Super Admin Overview](#1-super-admin-overview)
2. [Admin Dashboard](#2-admin-dashboard)
3. [User Management](#3-user-management)
4. [Client Management](#4-client-management)
5. [Role & Permission Management](#5-role--permission-management)
6. [Analytics & Business Intelligence](#6-analytics--business-intelligence)
7. [Audit Logs](#7-audit-logs)
8. [System Health Monitoring](#8-system-health-monitoring)
9. [Backup & Data Management](#9-backup--data-management)
10. [Security Settings](#10-security-settings)
11. [Notifications & Alerts](#11-notifications--alerts)
12. [Integrations](#12-integrations)
13. [System Configuration](#13-system-configuration)

---

## 1. Super Admin Overview

### 1.1 What is Super Admin?

Super Admin is the highest level of access in RYX Billing Software. Super Admin has complete control over the entire system including all clients, users, and configurations.

### 1.2 Super Admin Capabilities

| Capability | Description |
|------------|-------------|
| **Full System Access** | Access all features without restrictions |
| **Multi-Client Management** | Manage all client accounts |
| **User Management** | Create, edit, deactivate any user |
| **Permission Bypass** | All permission checks are bypassed |
| **System Configuration** | Access to all system settings |
| **Audit Access** | View all activity logs across clients |
| **Security Settings** | Configure security policies |

### 1.3 Super Admin vs Other Roles

| Feature | Staff | Manager | Admin | Super Admin |
|---------|-------|---------|-------|-------------|
| Create Bills | Yes | Yes | Yes | Yes |
| Edit/Cancel Bills | No | Yes | Yes | Yes |
| Manage Stock | No | Yes | Yes | Yes |
| View Reports | No | Yes | Yes | Yes |
| Manage Users (own client) | No | No | Yes | Yes |
| Manage Users (all clients) | No | No | No | Yes |
| Create/Manage Clients | No | No | No | Yes |
| System Settings | No | No | No | Yes |
| View All Audit Logs | No | No | No | Yes |
| Security Configuration | No | No | No | Yes |

### 1.4 Identifying Super Admin

Super Admin is identified by the `is_super_admin` flag in the user record:
- `is_super_admin: true` = Full access
- `is_super_admin: false` = Normal role-based access

---

## 2. Admin Dashboard

**[SCREENSHOT: Admin Dashboard]**

### 2.1 Accessing Admin Panel

1. Login with Super Admin credentials
2. Click **Admin** in the sidebar (gear icon)
3. Admin Dashboard opens

### 2.2 Dashboard Widgets

| Widget | Description |
|--------|-------------|
| **Total Users** | Count of all active users in system |
| **Total Clients** | Number of registered businesses |
| **Today's Activity** | Login count, bills created today |
| **System Status** | Database, API, Cache health |
| **Recent Activity** | Latest user actions |
| **Alerts** | System warnings and notifications |

### 2.3 Admin Menu Items

| Menu Item | Function |
|-----------|----------|
| **Dashboard** | Admin overview and stats |
| **Users** | User management |
| **Clients** | Client/business management |
| **Analytics** | System-wide analytics |
| **Audit Logs** | Activity tracking |
| **Health** | System health monitoring |
| **Settings** | System configuration |
| **Security** | Security settings |
| **Notifications** | Notification management |
| **Backup** | Backup management |
| **Storage** | File storage management |
| **Webhooks** | Webhook configuration |
| **Integrations** | Third-party integrations |
| **Subscriptions** | Subscription management |

---

## 3. User Management

**[SCREENSHOT: User Management Page]**

### 3.1 Viewing All Users

The user list displays:
- User Name
- Email
- Client (business they belong to)
- Role
- Status (Active/Inactive)
- Last Login
- Created Date

### 3.2 Creating New User

**[SCREENSHOT: Create User Form]**

| Field | Description | Required |
|-------|-------------|----------|
| Full Name | User's full name | Yes |
| Email | Login email (unique) | Yes |
| Password | Initial password | Yes |
| Client | Which business they belong to | Yes |
| Role | User role (Staff, Manager, Admin, etc.) | Yes |
| Phone | Contact number | Optional |
| Department | Department within company | Optional |

**Steps:**
1. Go to **Admin** > **Users**
2. Click **Create New User**
3. Fill in the form
4. Assign role and permissions
5. Click **Create**

### 3.3 Editing User

- Click on any user to view details
- Click **Edit** to modify
- Can change: name, role, permissions, status
- Cannot change: email (security reason)

### 3.4 Deactivating User

Users are deactivated, not deleted (for audit trail):

1. Open user details
2. Click **Deactivate**
3. Confirm action

Deactivated users:
- Cannot login
- Data is preserved
- Can be reactivated later

### 3.5 Resetting Password

1. Open user details
2. Click **Reset Password**
3. New temporary password is generated
4. User must change on next login

### 3.6 User Activity Tracking

For each user, you can view:
- Login history
- Actions performed
- Bills created
- Last active time

---

## 4. Client Management

**[SCREENSHOT: Client Management Page]**

### 4.1 What is a Client?

A "Client" is a separate business account with:
- Separate data (products, bills, customers)
- Separate users
- Own settings and configuration
- Complete data isolation from other clients

### 4.2 Viewing All Clients

Client list shows:
- Client Name
- Email
- GST Number
- Status (Active/Inactive)
- User Count
- Created Date

### 4.3 Creating New Client

**[SCREENSHOT: Create Client Form]**

| Field | Description | Required |
|-------|-------------|----------|
| Client Name | Business name | Yes |
| Email | Primary contact email | Yes |
| Phone | Contact number | Yes |
| Address | Business address | Yes |
| GST Number | GSTIN | Optional |
| Logo | Business logo | Optional |

**Steps:**
1. Go to **Admin** > **Clients**
2. Click **Create New Client**
3. Fill in business details
4. Click **Create**
5. Create first admin user for this client

### 4.4 Editing Client Details

- Click on client to view
- Click **Edit** to modify
- Update business information
- Upload/change logo

### 4.5 Client Settings

Each client can have:
- Bill number format
- Receipt footer message
- Default payment type
- GST settings

### 4.6 Deactivating Client

When you deactivate a client:
- All users of that client cannot login
- All data is preserved
- Can be reactivated later

---

## 5. Role & Permission Management

**[SCREENSHOT: Permission Management]**

### 5.1 Default Roles

| Role | Description |
|------|-------------|
| Staff | Basic operations - create bills, view stock |
| Manager | Staff + Edit/Cancel bills, manage stock |
| Admin | Manager + User management, all reports |
| Finance | Financial reports and payment management |
| Super Admin | Everything - all permissions bypassed |

### 5.2 Permission Sections

| Section | Permissions |
|---------|-------------|
| **Billing** | Create, Read, Update, Delete bills |
| **Inventory** | Add products, update stock, delete, bulk import |
| **Customers** | Add, edit, delete, view history |
| **Reports** | View reports, export, analytics |
| **Admin** | User management, client settings |
| **Audit** | View activity logs |
| **Expenses** | Add, view, edit expenses |

### 5.3 Permission Matrix

| Permission | Staff | Manager | Admin | Finance |
|------------|-------|---------|-------|---------|
| billing.create | Yes | Yes | Yes | Yes |
| billing.read | Yes | Yes | Yes | Yes |
| billing.update | No | Yes | Yes | No |
| billing.delete | No | Yes | Yes | No |
| inventory.create | No | Yes | Yes | No |
| inventory.read | Yes | Yes | Yes | Yes |
| inventory.update | No | Yes | Yes | No |
| inventory.delete | No | Yes | Yes | No |
| customers.create | Yes | Yes | Yes | Yes |
| customers.read | Yes | Yes | Yes | Yes |
| customers.update | No | Yes | Yes | No |
| reports.read | No | Yes | Yes | Yes |
| reports.export | No | Yes | Yes | Yes |
| admin.users | No | No | Yes | No |
| admin.settings | No | No | Yes | No |
| audit.read | No | No | Yes | No |

### 5.4 Custom Permissions

You can create custom permission sets:
1. Go to **Admin** > **Permissions**
2. Select a user
3. Toggle individual permissions ON/OFF
4. Save changes

---

## 6. Analytics & Business Intelligence

**[SCREENSHOT: Admin Analytics]**

### 6.1 System-Wide Analytics

| Metric | Description |
|--------|-------------|
| Total Revenue | All sales across all clients |
| Total Bills | All bills created |
| Active Users | Users logged in today |
| System Load | API requests per minute |

### 6.2 Client Comparison

- Revenue by client
- Bills by client
- User activity by client
- Growth trends

### 6.3 User Analytics

- Active users by day/week/month
- Login frequency
- Most active users
- User productivity metrics

### 6.4 Product Analytics

- Top selling products (all clients)
- Category-wise performance
- Stock turnover rate

### 6.5 Financial Overview

- Total revenue
- GST collected
- Payment method breakdown
- Outstanding payments

---

## 7. Audit Logs

**[SCREENSHOT: Audit Logs]**

### 7.1 What is Logged?

Every action is recorded:
- User logins/logouts
- Bill creation, editing, cancellation
- Stock changes
- User management actions
- Settings changes
- Permission changes

### 7.2 Log Entry Details

| Field | Description |
|-------|-------------|
| Timestamp | When action occurred |
| User | Who performed the action |
| Client | Which client's data |
| Action | What was done (Create, Update, Delete) |
| Table | Which data was affected |
| Old Data | Previous values (JSON) |
| New Data | New values (JSON) |

### 7.3 Searching Logs

Filter by:
- Date range
- User
- Client
- Action type
- Table/Section

### 7.4 Exporting Logs

- Export to Excel for analysis
- Download specific date range
- Required for audits and compliance

### 7.5 Log Retention

- Logs are stored permanently
- Cannot be deleted
- Part of compliance requirements

---

## 8. System Health Monitoring

**[SCREENSHOT: System Health]**

### 8.1 Health Dashboard

| Component | Status | Metrics |
|-----------|--------|---------|
| **Database** | Connected/Disconnected | Response time, connections |
| **API Server** | Running/Down | Request count, errors |
| **Cache** | Active/Inactive | Hit rate, memory usage |
| **Storage** | Available/Full | Space used, remaining |

### 8.2 Database Health

- Connection status
- Active connections count
- Query performance
- Storage usage
- Pool statistics (50 base + 100 overflow)

### 8.3 API Health

- Endpoint: `/api/health`
- Response time
- Error rate
- Request volume
- Worker processes (8 workers x 4 threads)

### 8.4 Cache Status

- Redis/SimpleCache status
- Cache hit/miss ratio
- Memory usage
- Cache TTLs

### 8.5 Automatic Alerts

System alerts when:
- Database connection issues
- High error rate (>5%)
- Storage running low (<10%)
- Unusual activity detected
- High response times (>2s)

---

## 9. Backup & Data Management

**[SCREENSHOT: Backup Management]**

### 9.1 Database Backup

- Database hosted on Supabase (PostgreSQL)
- Automatic daily backups
- Point-in-time recovery available
- Secure cloud storage

### 9.2 Manual Backup

To create a manual backup:
1. Go to **Admin** > **Backup**
2. Click **Create Backup Now**
3. Backup is created and stored

### 9.3 Data Export

Export all data for a client:
- Bills (Excel/CSV)
- Products (Excel/CSV)
- Customers (Excel/CSV)
- Reports (PDF)

### 9.4 Data Retention

| Data Type | Retention |
|-----------|-----------|
| Active data | Always available |
| Deleted data | Soft deleted, recoverable |
| Audit logs | Permanent storage |
| Session data | 24 hours |

### 9.5 Storage Management

**[SCREENSHOT: Storage Usage]**

- View storage used by each client
- File uploads (logos, documents)
- Clean up unused files
- Supabase Storage integration

---

## 10. Security Settings

**[SCREENSHOT: Security Settings]**

### 10.1 Authentication

| Setting | Default | Description |
|---------|---------|-------------|
| JWT Expiration | 24 hours | Token validity period |
| Password Min Length | 8 | Minimum password characters |
| Password Hashing | bcrypt (cost 12) | Password encryption |

### 10.2 Session Management

- Session timeout duration
- Maximum concurrent sessions
- Force logout all sessions

### 10.3 Login Security

- Failed login attempt tracking
- Account lockout (after 5 failed attempts)
- Login activity logging

### 10.4 API Security

| Feature | Status |
|---------|--------|
| CORS | Configured |
| Rate Limiting | Available |
| Token Validation | Enabled |
| Statement Timeout | 10 seconds |

### 10.5 Data Security

| Feature | Implementation |
|---------|----------------|
| Client Isolation | Mandatory client_id filtering |
| Row Level Security | PostgreSQL RLS enabled |
| Data Encryption | HTTPS/SSL in transit |
| Connection Pooling | 50 base + 100 overflow |

---

## 11. Notifications & Alerts

**[SCREENSHOT: Notification Center]**

### 11.1 Notification Types

| Type | Description |
|------|-------------|
| **System** | Server issues, updates |
| **Security** | Failed logins, suspicious activity |
| **Business** | Low stock, pending payments |
| **User** | Account changes, password resets |

### 11.2 Notification Settings

Configure what notifications are sent:
- Email notifications
- In-app notifications
- Admin alerts

### 11.3 Sending Announcements

Send message to all users:
1. Go to **Admin** > **Notifications**
2. Click **New Announcement**
3. Write message
4. Select recipients (all, specific clients, specific roles)
5. Send

---

## 12. Integrations

**[SCREENSHOT: Integrations Page]**

### 12.1 Current Integrations

| Integration | Status | Description |
|-------------|--------|-------------|
| Thermal Printers | Active | Receipt printing via Windows API |
| Supabase Storage | Active | Cloud file storage |
| Supabase Database | Active | PostgreSQL database |
| Excel Import/Export | Active | Data import/export |
| Redis Cache | Optional | High-performance caching |

### 12.2 Printer Integration

- Windows printer detection via PowerShell/WMI
- Silent printing support
- 5-minute printer cache
- Fallback to browser printing

### 12.3 Database Configuration

| Setting | Value |
|---------|-------|
| Database | PostgreSQL (Supabase) |
| Connection Pool | 50 base, 100 max overflow |
| Recycle Time | 1 hour |
| Pre-ping | Enabled |
| Statement Timeout | 10 seconds |

### 12.4 Webhook Configuration

Set up webhooks for:
- Bill created
- Stock low alert
- User actions

---

## 13. System Configuration

**[SCREENSHOT: System Settings]**

### 13.1 General Settings

| Setting | Description |
|---------|-------------|
| Application Name | RYX Billing |
| Default Timezone | Asia/Kolkata |
| Date Format | DD/MM/YYYY |
| Currency | INR (Indian Rupees) |

### 13.2 Server Configuration

| Setting | Value |
|---------|-------|
| Server | Gunicorn |
| Workers | 8 |
| Threads per Worker | 4 |
| Max Concurrent | 32 requests |
| Port | 5000 (configurable) |

### 13.3 Frontend Configuration

| Setting | Value |
|---------|-------|
| Framework | Next.js 15 |
| Port | 3000 |
| PWA | Enabled |
| Dark Mode | Supported |

### 13.4 Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | Secret key for JWT tokens |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_KEY | Supabase API key |
| CORS_ORIGINS | Allowed origins |
| PORT | Server port |

### 13.5 Maintenance Mode

When needed:
1. Enable maintenance mode
2. Users see "Under Maintenance" message
3. Only Super Admin can access
4. Disable when done

---

## Super Admin Checklist

### Daily Tasks
- [ ] Check system health dashboard
- [ ] Review security alerts
- [ ] Check failed login attempts

### Weekly Tasks
- [ ] Review audit logs
- [ ] Check storage usage
- [ ] Review user activity

### Monthly Tasks
- [ ] Review user accounts (deactivate unused)
- [ ] Verify backup integrity
- [ ] Security audit review
- [ ] Performance review

---

## Security Best Practices

1. **Never share** Super Admin credentials
2. **Use strong passwords** - minimum 12 characters
3. **Log out** when not using the system
4. **Review audit logs** regularly
5. **Deactivate** users who leave immediately
6. **Keep backups** and verify they work
7. **Monitor** failed login attempts
8. **Document** all major changes

---

## Technical Reference

### API Endpoints (Admin)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users` | GET | List all users |
| `/api/admin/users` | POST | Create user |
| `/api/admin/users/<id>` | PUT | Update user |
| `/api/admin/users/<id>` | DELETE | Deactivate user |
| `/api/admin/clients` | GET | List clients |
| `/api/admin/clients` | POST | Create client |
| `/api/admin/health` | GET | System health |
| `/api/admin/permissions` | GET | Permission matrix |
| `/api/audit/logs` | GET | Audit logs |

### Database Tables

| Table | Description |
|-------|-------------|
| client_entry | Client/business data |
| users | User accounts |
| stock_entry | Product inventory |
| gst_billing | GST bills |
| non_gst_billing | Non-GST bills |
| payment_type | Payment methods |
| audit_log | Activity logs |
| permission_sections | Permission groups |
| permissions | Individual permissions |
| user_permissions | User-permission mapping |

---

## Document Information

| Property | Value |
|----------|-------|
| Document | Super Admin Guide |
| Version | 1.0 |
| Access Level | Internal Reference Only |
| Created | December 2025 |
| For | RYX Billing Software v1.0 |

---

**CONFIDENTIAL: This document is for internal reference only. Contains system administration details.**

---

**End of Document**

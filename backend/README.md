# Valoryx Software - Backend API

Flask-based REST API with Supabase PostgreSQL and client_id isolation.

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

The `.env` file is already configured with your Supabase credentials.

### 3. Run Database Migrations

Connect to your Supabase PostgreSQL database and run migrations:

```bash
# Using psql
psql "postgresql://postgres:Ryx%402025@db.habjhxjutlgnjwjbpkvl.supabase.co:5432/postgres"

# Then run each migration file in order:
\i migration/001_create_client_entry.sql
\i migration/002_create_users.sql
\i migration/003_create_payment_type.sql
\i migration/004_create_stock_entry.sql
\i migration/005_create_gst_billing.sql
\i migration/006_create_non_gst_billing.sql
\i migration/007_create_report.sql
\i migration/008_create_audit_log.sql
\i migration/009_create_stock_reduction_trigger.sql
```

Alternatively, use Supabase Dashboard SQL Editor to run each file.

### 4. Run the Application

```bash
python app.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/login` - User login (returns JWT with client_id)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify JWT token

### Billing (`/api/billing`)
- `POST /api/billing/gst` - Create GST bill
- `POST /api/billing/non-gst` - Create Non-GST bill
- `GET /api/billing/list` - List bills (filtered by client_id)
- `GET /api/billing/<bill_id>` - Get bill details

### Stock (`/api/stock`)
- `POST /api/stock` - Add stock (auto-sum if exists)
- `GET /api/stock` - List stock (filtered by client_id)
- `GET /api/stock/alerts` - Get low stock alerts
- `PUT /api/stock/<product_id>` - Update stock
- `DELETE /api/stock/<product_id>` - Delete stock

### Reports (`/api/report`)
- `POST /api/report/generate` - Generate report
- `GET /api/report/list` - List reports
- `GET /api/report/<report_id>` - Get report details

### Audit (`/api/audit`)
- `GET /api/audit/logs` - Get audit logs (filtered by client_id)
- `GET /api/audit/export` - Export audit trail

### Client (`/api/client`)
- `POST /api/client` - Register new client
- `GET /api/client/<client_id>` - Get client details
- `PUT /api/client/<client_id>` - Update client

## Project Structure

```
backend/
├── app.py                 # Flask application factory
├── config.py              # Configuration from environment variables
├── requirements.txt       # Python dependencies
├── models/               # SQLAlchemy models
│   ├── __init__.py
│   ├── client_model.py
│   ├── user_model.py
│   ├── billing_model.py
│   ├── stock_model.py
│   ├── payment_model.py
│   ├── report_model.py
│   └── audit_model.py
├── routes/               # API route handlers
│   ├── __init__.py
│   ├── auth.py
│   ├── billing.py
│   ├── stock.py
│   ├── report.py
│   ├── audit.py
│   └── client.py
└── utils/                # Helper functions
    ├── __init__.py
    ├── auth_middleware.py   # JWT authentication & client_id extraction
    ├── audit_logger.py      # Audit log helper
    └── helpers.py           # Utility functions
```

## Key Features

### 1. Client ID Isolation
Every API endpoint validates `client_id` from JWT token:
- Extracted from Authorization header
- Validated against database
- Stored in `g.user` for route access
- **ALL queries filtered by client_id**

### 2. Authentication Flow
```python
# Login returns JWT with client_id
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# Response includes client_id
{
  "token": "eyJ...",
  "client_id": "uuid",
  "client_name": "Company Name",
  "client_logo": "url"
}

# All subsequent requests include token
Authorization: Bearer eyJ...
```

### 3. Automatic Stock Reduction
Database trigger automatically reduces stock when billing is created:
- Triggers on `gst_billing` and `non_gst_billing` INSERT
- Validates product belongs to same client_id
- Prevents negative stock

### 4. Audit Logging
All CREATE, UPDATE, DELETE operations logged automatically:
- Captures user_id and client_id
- Stores old and new data (JSON)
- Includes IP address and user agent

## Testing the API

### 1. Create a Client
```bash
curl -X POST http://localhost:5000/api/client \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test Company","email":"test@company.com","phone":"1234567890"}'
```

### 2. Register a User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123","client_id":"<client_id_from_step_1>"}'
```

### 3. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123"}'
```

### 4. Add Stock (with token)
```bash
curl -X POST http://localhost:5000/api/stock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"product_name":"Pen","quantity":100,"rate":10,"category":"Stationery"}'
```

### 5. Create GST Bill
```bash
curl -X POST http://localhost:5000/api/billing/gst \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "customer_name":"John Doe",
    "customer_phone":"9876543210",
    "items":[{"product_id":"<product_id>","product_name":"Pen","quantity":10,"rate":10,"amount":100}],
    "subtotal":100,
    "gst_percentage":18,
    "payment_type":"<payment_type_id>"
  }'
```

## Security

- **Row Level Security (RLS)** enabled on all tables
- **JWT authentication** with 24-hour expiration
- **bcrypt password hashing**
- **Client ID validation** on every request
- **Audit logging** for all actions

## Important Reminders

- ✅ Every query MUST filter by client_id
- ✅ Always use `@authenticate` decorator on protected routes
- ✅ Log all CREATE/UPDATE/DELETE operations
- ✅ Validate product ownership before billing
- ✅ Use environment variables for configuration
- ❌ Never hardcode client_id
- ❌ Never bypass authentication
- ❌ Never expose other clients' data

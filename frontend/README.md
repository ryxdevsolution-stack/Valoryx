# Valoryx Software - Frontend

Next.js 14 frontend with TypeScript, Tailwind CSS, and Framer Motion.

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Environment Variables

The `.env.local` file is already configured with your API URL and Supabase credentials.

### 3. Run Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

### 4. Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── auth/              # Authentication pages
│   │   │   ├── login/         # Login page
│   │   │   └── register/      # Registration page
│   │   ├── dashboard/         # Dashboard page
│   │   ├── billing/           # Billing pages (GST/Non-GST)
│   │   ├── stock/             # Stock management
│   │   ├── reports/           # Reports generation
│   │   ├── audit/             # Audit logs
│   │   ├── payment-types/     # Payment type management
│   │   ├── layout.tsx         # Root layout with ClientProvider
│   │   └── page.tsx           # Home page with RYX logo animation
│   ├── components/            # Reusable components
│   │   ├── LogoAnimation.tsx  # RYX logo 2s fade animation
│   │   ├── ProtectedRoute.tsx # Auth protection wrapper
│   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   └── DashboardLayout.tsx # Dashboard layout wrapper
│   ├── contexts/              # React contexts
│   │   └── ClientContext.tsx  # Global client_id and auth state
│   └── lib/                   # Utilities
│       └── api.ts             # Axios client with interceptors
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## Features Implemented

### ✅ Authentication Flow
1. **RYX Logo Animation** - 2-second fade using Framer Motion
2. **Login Page** - Email/password authentication with JWT
3. **Register Page** - New user registration with client_id
4. **Protected Routes** - Automatic redirect if not authenticated
5. **Token Management** - Stored in localStorage with axios interceptors

### ✅ Client Context
- Global state management for user and client data
- Automatic token injection in API calls
- Persistent auth across page refreshes
- Logout functionality

### ✅ Dashboard
- Today's sales summary
- GST and Non-GST bill counts
- Low stock alerts
- Quick action buttons
- Client-specific data display

### ✅ Layout Components
- **Sidebar Navigation** - All main routes with active state
- **Dashboard Layout** - Protected layout wrapper
- **Responsive Design** - Mobile-first approach

### 🔄 Pages to Implement
1. **Billing Pages**
   - GST Bill Creation Form
   - Non-GST Bill Creation Form
   - Bill List View
   - Bill Details View

2. **Stock Management**
   - Stock List with search/filter
   - Add Stock Form (with auto-sum)
   - Edit Stock Form
   - Low Stock Alerts View

3. **Reports**
   - Date Range Selection
   - Report Generation
   - Report List
   - Download/Export

4. **Audit Logs**
   - Log List with pagination
   - Filter by action type/date
   - User details

5. **Payment Types**
   - Payment type list
   - Add/Edit payment types

## Key Files

### ClientContext ([src/contexts/ClientContext.tsx](src/contexts/ClientContext.tsx))
Manages global authentication and client state:
- `user` - Current user data (user_id, email, role)
- `client` - Client data (client_id, client_name, logo_url)
- `token` - JWT authentication token
- `isAuthenticated` - Boolean auth status
- `login(email, password)` - Login function
- `logout()` - Logout function

### API Client ([src/lib/api.ts](src/lib/api.ts))
Axios instance with:
- Base URL from environment variable
- Automatic token injection from localStorage
- Response interceptor for 401 errors
- Automatic redirect to login on token expiration

### Logo Animation ([src/components/LogoAnimation.tsx](src/components/LogoAnimation.tsx))
Framer Motion component:
- 2-second fade out animation
- Calls `onComplete` callback when done
- Used on home page to redirect to login/dashboard

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SUPABASE_URL=https://habjhxjutlgnjwjbpkvl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Development Guidelines

### 1. NO HARDCODING
- Always use `process.env.NEXT_PUBLIC_API_URL` for API calls
- Never hardcode URLs, IPs, or localhost
- Use environment variables for all configuration

### 2. CLIENT ID FILTERING
- All data is automatically scoped to the authenticated client
- Client ID is extracted from JWT token by backend
- Frontend never needs to manually send client_id

### 3. CLEAN CODE
- Reuse components whenever possible
- No duplicate code
- Delete unused imports
- No console.logs in production

### 4. RESPONSIVE DESIGN
- Mobile-first approach
- Use Tailwind responsive classes (sm:, md:, lg:)
- Test on all screen sizes
- No fixed pixel values

### 5. ERROR HANDLING
- Display user-friendly error messages
- Handle loading states
- Handle empty states
- Handle network errors

## API Integration Examples

### Login
```typescript
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'

const { login } = useClient()
await login(email, password)
// Automatically stores token and redirects to dashboard
```

### Fetch Bills
```typescript
const response = await api.get('/billing/list')
const bills = response.data.bills
```

### Create GST Bill
```typescript
await api.post('/billing/gst', {
  customer_name: 'John Doe',
  customer_phone: '9876543210',
  items: [
    {
      product_id: 'uuid',
      product_name: 'Pen',
      quantity: 10,
      rate: 10,
      amount: 100
    }
  ],
  subtotal: 100,
  gst_percentage: 18,
  payment_type: 'payment_type_uuid'
})
```

### Add Stock
```typescript
await api.post('/stock', {
  product_name: 'Notebook',
  quantity: 50,
  rate: 25,
  category: 'Stationery',
  unit: 'pcs',
  low_stock_alert: 10
})
```

## Testing

1. **Start Backend**
   ```bash
   cd ../backend
   python app.py
   ```

2. **Start Frontend**
   ```bash
   npm run dev
   ```

3. **Test Flow**
   - Visit http://localhost:3000
   - Watch RYX logo animation (2 seconds)
   - Redirected to login page
   - Login with test credentials
   - Redirected to dashboard
   - Navigate through sidebar

## Current Status

✅ **Completed**
- Next.js 14 setup with TypeScript
- Tailwind CSS configuration
- Framer Motion for animations
- RYX logo animation (2s fade)
- Authentication pages (login, register)
- Client Context with JWT management
- API client with interceptors
- Protected route wrapper
- Dashboard with statistics
- Sidebar navigation
- Responsive layout

🔄 **To Implement**
- Billing pages (GST/Non-GST forms)
- Stock management pages
- Reports page
- Audit logs page
- Payment types page
- Additional UI components (tables, modals, forms)

## Notes

- All pages use the `DashboardLayout` component for consistent layout
- All protected pages use the `ProtectedRoute` wrapper
- Authentication token is automatically injected in all API calls
- Client ID is automatically filtered by backend (no need to send manually)
- Mobile responsive design with Tailwind breakpoints

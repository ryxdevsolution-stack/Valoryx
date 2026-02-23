import React, { Suspense } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
import AdminLayout from '@/components/AdminLayout'

// Lazy load all pages for automatic code splitting
const Home = React.lazy(() => import('@/pages/Home'))
const Landing = React.lazy(() => import('@/pages/Landing'))
const Login = React.lazy(() => import('@/pages/auth/Login'))
const Register = React.lazy(() => import('@/pages/auth/Register'))
const Dashboard = React.lazy(() => import('@/pages/Dashboard'))
const BillingList = React.lazy(() => import('@/pages/billing/BillingList'))
const CreateBill = React.lazy(() => import('@/pages/billing/CreateBill'))
const Exchange = React.lazy(() => import('@/pages/billing/Exchange'))
const Stock = React.lazy(() => import('@/pages/Stock'))
const Customers = React.lazy(() => import('@/pages/Customers'))
const Reports = React.lazy(() => import('@/pages/Reports'))
const Audit = React.lazy(() => import('@/pages/Audit'))
const Profile = React.lazy(() => import('@/pages/Profile'))
const PaymentTypes = React.lazy(() => import('@/pages/PaymentTypes'))
const Docs = React.lazy(() => import('@/pages/Docs'))
const TrialExpired = React.lazy(() => import('@/pages/TrialExpired'))
const Pricing = React.lazy(() => import('@/pages/Pricing'))

const StockTransfer = React.lazy(() => import('@/pages/stock-transfer/StockTransfer'))
const BranchManagement = React.lazy(() => import('@/pages/stock-transfer/BranchManagement'))

// Admin pages
const AdminDashboard = React.lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers = React.lazy(() => import('@/pages/admin/Users'))
const AdminCreateUser = React.lazy(() => import('@/pages/admin/CreateUser'))
const AdminEditUser = React.lazy(() => import('@/pages/admin/EditUser'))
const AdminClients = React.lazy(() => import('@/pages/admin/Clients'))
const AdminCreateClient = React.lazy(() => import('@/pages/admin/CreateClient'))
const AdminEditClient = React.lazy(() => import('@/pages/admin/EditClient'))
const AdminAnalytics = React.lazy(() => import('@/pages/admin/Analytics'))
const AdminAudit = React.lazy(() => import('@/pages/admin/AdminAudit'))
const AdminBackup = React.lazy(() => import('@/pages/admin/Backup'))
const AdminHealth = React.lazy(() => import('@/pages/admin/Health'))
const AdminIntegrations = React.lazy(() => import('@/pages/admin/Integrations'))
const AdminNotifications = React.lazy(() => import('@/pages/admin/Notifications'))
const AdminSecurity = React.lazy(() => import('@/pages/admin/Security'))
const AdminSettings = React.lazy(() => import('@/pages/admin/Settings'))
const AdminStorage = React.lazy(() => import('@/pages/admin/Storage'))
const AdminSubscriptions = React.lazy(() => import('@/pages/admin/Subscriptions'))
const AdminWebhooks = React.lazy(() => import('@/pages/admin/Webhooks'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin"></div>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/landing" element={<Landing />} />

        {/* Auth routes */}
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />

        {/* Upgrade / Trial expired / Pricing */}
        <Route path="/upgrade" element={<TrialExpired />} />
        <Route path="/pricing" element={<Pricing />} />

        {/* Main app routes */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/billing" element={<BillingList />} />
        <Route path="/billing/create" element={<CreateBill />} />
        <Route path="/billing/exchange/:billId" element={<Exchange />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/stock-transfer" element={<StockTransfer />} />
        <Route path="/stock-transfer/branches" element={<BranchManagement />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/payment-types" element={<PaymentTypes />} />
        <Route path="/docs" element={<Docs />} />

        {/* Admin routes - wrapped in AdminLayout */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/create" element={<AdminCreateUser />} />
          <Route path="users/:id" element={<AdminEditUser />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="clients/create" element={<AdminCreateClient />} />
          <Route path="clients/:clientId" element={<AdminEditClient />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="backup" element={<AdminBackup />} />
          <Route path="health" element={<AdminHealth />} />
          <Route path="integrations" element={<AdminIntegrations />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="storage" element={<AdminStorage />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="webhooks" element={<AdminWebhooks />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

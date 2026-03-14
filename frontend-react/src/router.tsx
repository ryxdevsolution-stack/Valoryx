import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminLayout from '@/components/AdminLayout'
import ProtectedRoute from '@/components/ProtectedRoute'

// Lazy load all pages for automatic code splitting
const Home = React.lazy(() => import('@/pages/Home'))
const Landing = React.lazy(() => import('@/pages/Landing'))
const Login = React.lazy(() => import('@/pages/auth/Login'))
const Register = React.lazy(() => import('@/pages/auth/Register'))
const ForgotPassword = React.lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = React.lazy(() => import('@/pages/auth/ResetPassword'))
const AcceptInvite = React.lazy(() => import('@/pages/auth/AcceptInvite'))
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
const ForcePasswordChange = React.lazy(() => import('@/pages/auth/ForcePasswordChange'))
const OAuthCallbackPage = React.lazy(() => import('@/pages/auth/OAuthCallback'))
const VerifyEmailPending = React.lazy(() => import('@/pages/auth/VerifyEmailPending'))
const VerifyEmailSuccess = React.lazy(() => import('@/pages/auth/VerifyEmailSuccess'))
const AccountPendingDeletion = React.lazy(() => import('@/pages/auth/AccountPendingDeletion'))
const TwoFactorRecover = React.lazy(() => import('@/pages/auth/TwoFactorRecover'))

// Admin pages
const AdminDashboard = React.lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers = React.lazy(() => import('@/pages/admin/Users'))
const AdminCreateUser = React.lazy(() => import('@/pages/admin/CreateUser'))
const AdminEditUser = React.lazy(() => import('@/pages/admin/EditUser'))
const AdminClients = React.lazy(() => import('@/pages/admin/Clients'))
const AdminCreateClient = React.lazy(() => import('@/pages/admin/CreateClient'))
const AdminEditClient = React.lazy(() => import('@/pages/admin/EditClient'))
const AdminAudit = React.lazy(() => import('@/pages/admin/AdminAudit'))
const AdminSettings = React.lazy(() => import('@/pages/admin/Settings'))
const AdminSubscriptions = React.lazy(() => import('@/pages/admin/Subscriptions'))
const AdminImpersonate = React.lazy(() => import('@/pages/admin/ImpersonateClient'))

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded bg-gray-200 ${className}`}>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" />
    </div>
  )
}

function PageFallback() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex flex-col gap-3 w-56 shrink-0 bg-white border-r border-gray-200 p-4">
        <SkeletonBlock className="h-8 w-32 mb-4" />
        {[...Array(6)].map((_, i) => (
          <SkeletonBlock key={i} className="h-7 w-full" />
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 flex flex-col gap-5">
        {/* Page title */}
        <SkeletonBlock className="h-8 w-48" />

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonBlock key={i} className="h-24 w-full" />
          ))}
        </div>

        {/* Table rows */}
        <div className="flex flex-col gap-2 mt-2">
          <SkeletonBlock className="h-10 w-full" />
          {[...Array(6)].map((_, i) => (
            <SkeletonBlock key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

function AuthFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#271E37]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[#5227FF] border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-500 text-sm tracking-wide">Loading…</span>
      </div>
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

        {/* Auth routes — use dark fallback so no white flash on lazy load */}
        <Route
          path="/auth/login"
          element={<Suspense fallback={<AuthFallback />}><Login /></Suspense>}
        />
        <Route
          path="/auth/register"
          element={<Suspense fallback={<AuthFallback />}><Register /></Suspense>}
        />
        <Route
          path="/auth/forgot-password"
          element={<Suspense fallback={<AuthFallback />}><ForgotPassword /></Suspense>}
        />
        <Route
          path="/reset-password"
          element={<Suspense fallback={<AuthFallback />}><ResetPassword /></Suspense>}
        />
        <Route
          path="/accept-invite"
          element={<Suspense fallback={<AuthFallback />}><AcceptInvite /></Suspense>}
        />
        <Route
          path="/oauth/callback"
          element={<Suspense fallback={<AuthFallback />}><OAuthCallbackPage /></Suspense>}
        />
        <Route
          path="/verify-email-pending"
          element={<Suspense fallback={<AuthFallback />}><VerifyEmailPending /></Suspense>}
        />
        <Route
          path="/verify-email"
          element={<Suspense fallback={<AuthFallback />}><VerifyEmailSuccess /></Suspense>}
        />
        <Route
          path="/account-pending-deletion"
          element={<Suspense fallback={<AuthFallback />}><AccountPendingDeletion /></Suspense>}
        />
        <Route
          path="/2fa-recover"
          element={<Suspense fallback={<AuthFallback />}><TwoFactorRecover /></Suspense>}
        />
        <Route
          path="/reactivate-account"
          element={<Suspense fallback={<AuthFallback />}><AccountPendingDeletion /></Suspense>}
        />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AuthFallback />}><ForcePasswordChange /></Suspense>
            </ProtectedRoute>
          }
        />

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
          <Route path="audit" element={<AdminAudit />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="impersonate" element={<AdminImpersonate />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

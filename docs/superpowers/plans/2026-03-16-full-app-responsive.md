# Full App Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page and component in `frontend-react/` fully responsive from 320px to desktop, replacing the mobile hamburger drawer with a bottom navigation bar.

**Architecture:** Replace the mobile top-header + slide-in drawer in `Sidebar.tsx` with a new `BottomNav.tsx` component that renders a fixed bottom bar (5 slots + "More" sheet). `DashboardLayout.tsx` switches from top padding to bottom padding. Every page with a table gets a companion mobile card list. Modals become bottom sheets on small screens.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (no new dependencies), Vite, lucide-react icons, `usePermissions` + `useClient` hooks for permission filtering.

---

## Chunk 1: Foundation — viewport fix + bottom nav component

### Task 1: Fix `index.html` viewport meta tag

**Files:**
- Modify: `frontend-react/index.html:6`

- [ ] Open `frontend-react/index.html` and change line 6:

```html
<!-- Before -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- After -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] Commit:
```bash
git add frontend-react/index.html
git commit -m "fix: add viewport-fit=cover for iPhone safe-area support"
```

---

### Task 2: Create `BottomNav.tsx`

**Files:**
- Create: `frontend-react/src/components/BottomNav.tsx`

- [ ] Create the file with the following content:

```tsx
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import { useTheme } from '@/contexts/ThemeContext'
import { usePermissions } from '@/hooks/usePermissions'
import {
  LayoutDashboard,
  FileText,
  PlusSquare,
  Package,
  Menu,
  Users,
  TrendingUp,
  Search,
  ArrowLeftRight,
  Building2,
  User,
  LogOut,
  Sun,
  Moon,
  X,
  CreditCard,
} from 'lucide-react'

export default function BottomNav() {
  const { pathname } = useLocation()
  const { client, user, logout } = useClient()
  const { isDarkMode, toggleTheme } = useTheme()
  const { hasPermission, isSuperAdmin } = usePermissions()
  const [showMore, setShowMore] = useState(false)

  if (!user) return null

  // ── Permission-filtered primary slots ─────────────────────────
  const primarySlots = [
    hasPermission('view_dashboard') && {
      name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard,
    },
    (hasPermission('gst_billing') || hasPermission('non_gst_billing')) && {
      name: 'Create Bill', href: '/billing/create', icon: PlusSquare,
    },
    (hasPermission('view_all_bills') || hasPermission('view_own_bills')) && {
      name: 'Bills', href: '/billing', icon: FileText,
    },
    hasPermission('view_stock') && {
      name: 'Stock', href: '/stock', icon: Package,
    },
  ].filter(Boolean) as { name: string; href: string; icon: typeof LayoutDashboard }[]

  // Active check: /billing must NOT match /billing/create (Create Bill has its own slot)
  const isSlotActive = (href: string) => {
    if (href === '/billing') return pathname === '/billing' || (pathname.startsWith('/billing/') && !pathname.startsWith('/billing/create'))
    return pathname === href || pathname.startsWith(href + '/')
  }

  // ── Permission-filtered "More" sheet items ─────────────────────
  const moreItems = [
    hasPermission('view_customers') && {
      name: 'Customers', href: '/customers', icon: Users,
    },
    hasPermission('view_sales_reports') && {
      name: 'Reports', href: '/reports', icon: TrendingUp,
    },
    (user.role === 'owner' || user.role === 'admin') && {
      name: 'Stock Transfer', href: '/stock-transfer', icon: ArrowLeftRight,
    },
    hasPermission('view_audit_logs') && {
      name: 'Audit Logs', href: '/audit', icon: Search,
    },
    {
      name: 'Payment Types', href: '/payment-types', icon: CreditCard,
    },
    isSuperAdmin() && {
      name: 'Admin', href: '/admin/clients', icon: Building2,
    },
    {
      name: 'My Profile', href: '/profile', icon: User,
    },
  ].filter(Boolean) as { name: string; href: string; icon: typeof LayoutDashboard }[]

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-700/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16">
          {primarySlots.map((item) => {
            const isActive = isSlotActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 transition-colors ${
                  isActive
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-gray-500 active:text-gray-600 dark:active:text-gray-300'
                }`}
                aria-label={item.name}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium leading-none">{item.name}</span>
              </Link>
            )
          })}

          {/* More Button */}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 text-gray-400 dark:text-gray-500 active:text-gray-600 transition-colors"
            aria-label="More"
          >
            <Menu className="w-5 h-5" strokeWidth={2} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* More Sheet Overlay */}
      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More Sheet */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl transition-transform duration-300 max-h-[85vh] overflow-y-auto ${
          showMore ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Close button + title */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">More</span>
          <button
            type="button"
            onClick={() => setShowMore(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="p-3 space-y-1">
          {moreItems.map((item) => {
            const isActive = isSlotActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setShowMore(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            )
          })}
        </div>

        {/* Theme + Logout */}
        <div className="px-3 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800 mt-1 space-y-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isDarkMode
              ? <Sun className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
              : <Moon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            }
            <span className="text-sm font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <button
            type="button"
            onClick={() => { logout(); setShowMore(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] Commit:
```bash
git add frontend-react/src/components/BottomNav.tsx
git commit -m "feat: add BottomNav component with bottom sheet for mobile navigation"
```

---

### Task 3: Update `DashboardLayout.tsx` — swap padding, add BottomNav

**Files:**
- Modify: `frontend-react/src/components/DashboardLayout.tsx`

- [ ] Replace the full file content:

```tsx
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import ProtectedRoute from './ProtectedRoute'
import TrialBanner from './TrialBanner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
        <TrialBanner />
        <Sidebar />
        <BottomNav />
        {/* Mobile: pb-16 clears bottom nav. Desktop: pl-20 clears left pill sidebar */}
        <div className="pb-16 md:pb-0 md:pl-20 flex flex-col flex-1 transition-all duration-300">
          <main className="flex-1 min-h-screen overflow-y-auto">
            <div className="h-full py-3 md:py-4 lg:py-6 px-3 md:px-6 lg:px-8">
              <div className="max-w-full mx-auto h-full">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
```

- [ ] Commit:
```bash
git add frontend-react/src/components/DashboardLayout.tsx
git commit -m "feat: switch mobile layout from top-header to bottom-nav padding"
```

---

### Task 4: Strip mobile drawer from `Sidebar.tsx`

**Files:**
- Modify: `frontend-react/src/components/Sidebar.tsx`

Remove the three mobile-only blocks identified by their JSX comment anchors. Search for these exact strings:
- Start of block 1: `{/* Mobile Header - Glassmorphism Design */}` (the `<div className="md:hidden fixed top-0...">` at line 107)
- End of block 1: the closing `</div>` of that block (line 136)
- Block 2 (overlay): `{/* Mobile Menu Overlay with Animation */}` through its closing `</div>` (lines 139–144)
- Block 3 (drawer): `{/* Mobile Sidebar Drawer - Glassy Design */}` through its closing outer `</div>` at line 306

Keep only the desktop block starting at `{/* Desktop Sidebar - Modern Compact Pill Navigation */}` (line 308 onward) and the `<style>` block.

Also remove the no-longer-needed state and effects:
- Remove `const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)`
- Remove `const closeMobileMenu` and `openMobileMenu` functions
- Remove the two `useEffect` blocks for body scroll lock and route change close
- Remove unused imports: nothing new needed, but check if `useState`, `useEffect` are still needed after removal

The final `Sidebar.tsx` should contain only:
- Imports
- `allNavigation` + `adminNavigation` arrays
- The `Sidebar()` component with only the desktop pill nav JSX
- The `<style>` animation block

- [ ] Make the changes described above to `Sidebar.tsx`

- [ ] Verify the desktop sidebar still renders correctly by checking `hidden md:flex` is on the outer wrapper div.

- [ ] Commit:
```bash
git add frontend-react/src/components/Sidebar.tsx
git commit -m "refactor: remove mobile hamburger drawer from Sidebar, desktop pill nav only"
```

---

## Chunk 2: Profile page + modals

### Task 5: Fix Profile page height + activity accordion

**Files:**
- Modify: `frontend-react/src/pages/Profile.tsx`

- [ ] Fix the height calculation at line 408. Change:
```tsx
<div className="h-[calc(100vh-80px)] md:h-screen flex flex-col overflow-hidden">
```
to:
```tsx
<div className="h-[calc(100dvh-4rem)] md:h-screen flex flex-col overflow-hidden">
```
(`dvh` = dynamic viewport height, avoids mobile browser address bar issues. `4rem` = 64px bottom nav.)

- [ ] Find the right column block at line 583:
```tsx
{/* Right Column - Recent Activity (hidden on mobile/tablet) */}
<div className="hidden lg:flex lg:col-span-1 flex-col min-h-0">
```
Replace with a mobile-accessible accordion version:
```tsx
{/* Right Column - Recent Activity */}
{/* Desktop: sidebar panel. Mobile/Tablet: collapsible accordion at bottom of left col */}
<div className="lg:col-span-1 flex flex-col min-h-0">
  {/* Mobile/Tablet accordion toggle (hidden on desktop) */}
  <button
    type="button"
    className="lg:hidden flex items-center justify-between w-full px-4 py-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-2"
    onClick={() => setActivityOpen((v) => !v)}
    aria-expanded={activityOpen}
  >
    <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
      <Activity className="w-4 h-4" /> Recent Activity
    </span>
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${activityOpen ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {/* Panel — always visible on desktop, toggled on mobile */}
  <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col flex-1 min-h-0 overflow-hidden ${
    activityOpen ? 'flex' : 'hidden lg:flex'
  }`}>
    {/* ... keep existing panel content unchanged ... */}
  </div>
</div>
```

- [ ] Add the `activityOpen` state near the top of the component (after existing state declarations):
```tsx
const [activityOpen, setActivityOpen] = useState(false)
```

- [ ] Commit:
```bash
git add frontend-react/src/pages/Profile.tsx
git commit -m "fix: profile page height for bottom nav, add mobile activity accordion"
```

---

### Task 6: ProfileTabs — ensure active tab scrolls into view

**Files:**
- Modify: `frontend-react/src/components/profile/ProfileTabs.tsx`

The current file has NO React import at all (only lucide-react imports on line 1).

- [ ] Add a new import line at the top of the file:
```tsx
import { useEffect, useRef } from 'react'
```

- [ ] Add inside the component, before the `return`:
```tsx
const activeRef = useRef<HTMLButtonElement>(null)

useEffect(() => {
  activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}, [activeTab])
```

- [ ] Pass `ref={isActive ? activeRef : undefined}` to each tab `<button>` element.

- [ ] Commit:
```bash
git add frontend-react/src/components/profile/ProfileTabs.tsx
git commit -m "fix: scroll active profile tab into view on mobile"
```

---

### Task 7: TeamMemberModal — bottom sheet on mobile

**Files:**
- Modify: `frontend-react/src/components/profile/TeamMemberModal.tsx`

The actual structure (line 538–552) is a **right-side panel/drawer**, not a centered modal:
```tsx
// CURRENT (line 538):
<div className="fixed inset-0 z-50 flex justify-end">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/50" onClick={onClose} />
  {/* Panel */}
  <div className="relative w-full sm:max-w-lg bg-white dark:bg-gray-800 h-full flex flex-col shadow-xl">
```

On desktop it slides in from the right (full height). On mobile it is already full-width but still full-height from the right.

Convert to: **right panel on desktop, bottom sheet on mobile**.

- [ ] Change line 538:
```tsx
// Before:
<div className="fixed inset-0 z-50 flex justify-end">

// After:
<div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
```

- [ ] Change the panel div (line 550):
```tsx
// Before:
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="team-modal-title"
  className="relative w-full sm:max-w-lg bg-white dark:bg-gray-800 h-full flex flex-col shadow-xl"

// After:
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="team-modal-title"
  className="relative w-full sm:max-w-lg bg-white dark:bg-gray-800 sm:h-full max-h-[85vh] flex flex-col shadow-xl rounded-t-2xl sm:rounded-none overflow-hidden"
```

- [ ] Add drag handle inside the panel, right before the existing `{/* Header */}` section:
```tsx
{/* Drag handle — bottom sheet indicator on mobile only */}
<div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
  <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
</div>
```

- [ ] The existing scrollable content area inside the panel already uses `overflow-y-auto flex-1` — keep it. The panel now needs `overflow-hidden` on the outer container (already added above) so the `rounded-t-2xl` clips correctly.

- [ ] Commit:
```bash
git add frontend-react/src/components/profile/TeamMemberModal.tsx
git commit -m "fix: TeamMemberModal becomes bottom sheet on mobile"
```

---

### Task 8: TotpActionModal — small screen padding

**Files:**
- Modify: `frontend-react/src/components/TotpActionModal.tsx`

- [ ] Read the full file and find the modal wrapper. Apply the same bottom-sheet pattern:
```tsx
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
  <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-6">
```

- [ ] Commit:
```bash
git add frontend-react/src/components/TotpActionModal.tsx
git commit -m "fix: TotpActionModal bottom sheet on mobile"
```

---

## Chunk 3: Core pages — BillingList, Stock, Customers

### Task 9: BillingList — table → card on mobile

**Files:**
- Modify: `frontend-react/src/pages/billing/BillingList.tsx`

The page has a table rendering bills. Add a mobile card list below the desktop table.

- [ ] Wrap the existing `<table>` in:
```tsx
<div className="hidden md:block overflow-x-auto">
  {/* existing table */}
</div>
```

- [ ] Add a mobile card list immediately after:
```tsx
{/* Mobile Card List — filter to isFirstPayment to avoid duplicate cards for split-payment bills */}
<div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
  {paginatedBills.filter(bill => bill.isFirstPayment).map((bill) => (
    <div
      key={bill.bill_id}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
      onClick={() => setSelectedBill(bill)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              #{bill.bill_number}
            </span>
            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
              bill.type === 'gst'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {bill.type === 'gst' ? 'GST' : 'Non-GST'}
            </span>
            {bill.status && (
              <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                bill.status === 'cancelled'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {bill.status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 truncate">
            {bill.customer_name || 'Walk-in'}
            {bill.customer_phone ? ` · ${bill.customer_phone}` : ''}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {new Date(bill.created_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            ₹{((bill.final_amount ?? bill.total_amount) || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{bill.displayPaymentType ?? bill.payment_type}</p>
        </div>
      </div>
    </div>
  ))}
</div>
```

- [ ] Find the date filter bar. Wrap inputs in `flex flex-wrap gap-2` so they stack on small screens.

- [ ] Make the page header responsive:
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Bills</h1>
  {/* action buttons */}
</div>
```

- [ ] Commit:
```bash
git add frontend-react/src/pages/billing/BillingList.tsx
git commit -m "fix: BillingList mobile card list and responsive header/filters"
```

---

### Task 10: Stock — table → card on mobile

**Files:**
- Modify: `frontend-react/src/pages/Stock.tsx`

- [ ] Wrap the existing `<table>` in `<div className="hidden md:block overflow-x-auto">`.

- [ ] Add mobile card list after:
```tsx
{/* Mobile Card List */}
<div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
  {filteredStocks.map((stock) => (
    <div key={stock.product_id} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {stock.product_name}
            </p>
            {stock.is_low_stock && (
              <span className="inline-flex px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Low Stock
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {stock.category} · {stock.unit}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-600 dark:text-gray-300">
              Qty: <span className="font-medium">{stock.quantity}</span>
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              Rate: <span className="font-medium">₹{Number(stock.rate).toFixed(2)}</span>
            </span>
            {stock.item_code && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Code: {stock.item_code}
              </span>
            )}
          </div>
        </div>
        {/* Edit/Delete action buttons — same as desktop */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => setEditingId(stock.product_id)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  ))}
</div>
```

- [ ] Make the page header + action buttons responsive with `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.

- [ ] Wrap the search + filter row in `flex flex-wrap gap-2`. Make search input `flex-1 min-w-[200px]`.

- [ ] Commit:
```bash
git add frontend-react/src/pages/Stock.tsx
git commit -m "fix: Stock page mobile card list and responsive header/filters"
```

---

### Task 11: Customers — responsive stat grid + header (mobile card already exists)

**Files:**
- Modify: `frontend-react/src/pages/Customers.tsx`

**Important:** `Customers.tsx` already has a mobile card view at approximately line 295 (`<div className="md:hidden space-y-3">`). Do NOT add another mobile card block. The existing mobile cards call `setSelectedCustomer(customer)` correctly.

Only make these targeted changes:

- [ ] Find the stat cards grid (total customers, active, inactive, revenue). Change to `grid-cols-2 lg:grid-cols-4`:
```tsx
// Find a line like: className="grid grid-cols-1 md:grid-cols-4 ..."
// Change to:
className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
```

- [ ] Make the page header responsive:
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
  {/* action buttons */}
</div>
```

- [ ] Wrap the search + filter row in `flex flex-wrap gap-2` so inputs stack on small screens.

- [ ] Stat cards grid (total customers, active, inactive, revenue): change to `grid-cols-2 lg:grid-cols-4`.

- [ ] Make page header responsive.

- [ ] Commit:
```bash
git add frontend-react/src/pages/Customers.tsx
git commit -m "fix: Customers mobile card list, responsive stat grid and header"
```

---

## Chunk 4: Dashboard + Reports + Audit

### Task 12: Dashboard — responsive stats grid + chart overflow

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.tsx`

- [ ] Read lines 120–300 of `Dashboard.tsx` to find the stat cards grid and chart sections.

- [ ] Find the stats grid (likely `grid grid-cols-*`). Change to:
```tsx
className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
```

- [ ] For each chart section wrapper, add overflow protection:
```tsx
<div className="overflow-x-auto">
  <div className="min-w-[320px]">
    {/* chart component */}
  </div>
</div>
```

- [ ] Make the time range filter buttons wrap:
```tsx
<div className="flex flex-wrap gap-2">
  {['today', 'week', 'month'].map(...)}
</div>
```

- [ ] Make the page header responsive (`flex flex-col sm:flex-row sm:items-center sm:justify-between`).

- [ ] Commit:
```bash
git add frontend-react/src/pages/Dashboard.tsx
git commit -m "fix: Dashboard responsive stat grid, chart overflow, header"
```

---

### Task 13: Reports — filter wrap + chart overflow

**Files:**
- Modify: `frontend-react/src/pages/Reports.tsx`

- [ ] Read lines 80–200 of `Reports.tsx` to find filter bar and chart areas.

- [ ] Find the date range filter bar. Wrap inputs with `flex flex-wrap gap-2` and make date inputs `flex-1 min-w-[140px]`.

- [ ] For the bills summary stats row: change to `grid-cols-2 sm:grid-cols-4`.

- [ ] For any chart containers: add `overflow-x-auto` wrapper with `min-w-[400px]` inner div.

- [ ] Make page header responsive.

- [ ] Commit:
```bash
git add frontend-react/src/pages/Reports.tsx
git commit -m "fix: Reports responsive filter bar, stat grid, chart overflow"
```

---

### Task 14: Audit — table → card on mobile

**Files:**
- Modify: `frontend-react/src/pages/Audit.tsx`

- [ ] Read the full render section of `Audit.tsx` to find the table.

- [ ] The table and card list sit inside a conditional render block: `{!loading && showPreview && gstBills.length > 0 && (`. Place both the desktop table wrapper AND the mobile card list inside this same conditional. Do not add the card list outside the conditional.

- [ ] Wrap the existing `<table>` in `<div className="hidden md:block overflow-x-auto">`.

- [ ] Add mobile card list immediately after the table wrapper, still inside the conditional:
```tsx
{/* Mobile Card List */}
<div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
  {gstBills.map((bill) => (
    <div key={bill.bill_id} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            #{bill.bill_number}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {bill.customer_name || 'Walk-in'}
            {bill.customer_phone ? ` · ${bill.customer_phone}` : ''}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {new Date(bill.created_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            ₹{bill.final_amount.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            GST: ₹{bill.gst_amount.toLocaleString('en-IN')}
          </p>
        </div>
      </div>
    </div>
  ))}
</div>
```

- [ ] Date range filter: `flex flex-wrap gap-2`, date inputs `flex-1 min-w-[140px]`.

- [ ] Commit:
```bash
git add frontend-react/src/pages/Audit.tsx
git commit -m "fix: Audit page mobile card list and responsive date filter"
```

---

## Chunk 5: Secondary pages + admin pages

### Task 15: PaymentTypes — card list on mobile

**Files:**
- Modify: `frontend-react/src/pages/PaymentTypes.tsx`

- [ ] Read the full render section of `PaymentTypes.tsx`.

- [ ] If there is a `<table>`, wrap it in `<div className="hidden md:block">` and add a mobile card list:
```tsx
{/* Mobile Card List */}
<div className="md:hidden space-y-2 p-3">
  {paymentTypes.map((pt) => (
    <div
      key={pt.payment_type_id}
      className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
    >
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{pt.type_name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {new Date(pt.created_at).toLocaleDateString('en-IN')}
        </p>
      </div>
      {/* delete button if present */}
    </div>
  ))}
</div>
```

- [ ] If there's no table (just a list/grid), verify it already adapts to mobile.

- [ ] Commit:
```bash
git add frontend-react/src/pages/PaymentTypes.tsx
git commit -m "fix: PaymentTypes mobile card list"
```

---

### Task 16: Exchange.tsx — mobile layout audit

**Files:**
- Modify: `frontend-react/src/pages/billing/Exchange.tsx`

- [ ] Read the full render section of `Exchange.tsx`.

- [ ] Apply standard patterns: responsive page header, flex-wrap filter bars, table → card if a table exists, `grid-cols-1 sm:grid-cols-2` for any side-by-side columns.

- [ ] Commit:
```bash
git add frontend-react/src/pages/billing/Exchange.tsx
git commit -m "fix: Exchange page mobile responsive layout"
```

---

### Task 17: Admin pages — tables → cards

**Files:**
- Modify: `frontend-react/src/pages/admin/Users.tsx`
- Modify: `frontend-react/src/pages/admin/Clients.tsx`
- Modify: `frontend-react/src/pages/admin/Subscriptions.tsx`
- Modify: `frontend-react/src/pages/admin/Analytics.tsx`

For each admin page:

- [ ] Wrap each `<table>` in `<div className="hidden md:block overflow-x-auto">`.

- [ ] Add a mobile card list that shows the key columns as stacked rows. Use the same pattern as Task 9 (BillingList). Each card: title/name on the left, key metric on the right, metadata below.

**Admin/Users.tsx card example:**
```tsx
{/* Mobile Card List */}
<div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
  {users.map((u) => (
    <div key={u.user_id} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {u.full_name || u.email}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex px-2 py-0.5 text-xs rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 capitalize">
              {u.role}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {u.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* edit/delete icon buttons */}
        </div>
      </div>
    </div>
  ))}
</div>
```

- [ ] For `admin/Analytics.tsx`: add `overflow-x-auto` wrappers around charts, change stats grid to `grid-cols-2 lg:grid-cols-4`.

- [ ] Commit all admin pages together:
```bash
git add frontend-react/src/pages/admin/
git commit -m "fix: admin pages mobile card lists and chart overflow"
```

---

### Task 18: CreateBill — mobile sticky summary footer

**Files:**
- Modify: `frontend-react/src/pages/billing/CreateBill.tsx`

This file is 2700+ lines. Make targeted changes only.

Key facts about CreateBill:
- The primary action is `handleSubmit(e)` — it is triggered via `type="submit"` on the main form
- Loading state is `loading` (not `saving`)
- Grand total is `getRoundedGrandTotal()` (a function call, not a state variable)
- The primary button label is **"Print Bill"**, not "Save Bill"

- [ ] Search for the bill summary/footer section (look for "Print Bill" button and `getRoundedGrandTotal` in JSX). Find the wrapper div of this section and add `sticky bottom-16 md:static` to make it stick above the bottom nav on mobile.

- [ ] On the summary grid (multi-column), add `hidden md:grid` to hide on mobile and add a mobile single-row version:
```tsx
{/* Mobile summary strip */}
<div className="md:hidden flex items-center justify-between py-3 px-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
  <div>
    <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
    <p className="text-lg font-bold text-gray-900 dark:text-white">
      ₹{getRoundedGrandTotal().toLocaleString('en-IN')}
    </p>
  </div>
  <button
    type="submit"
    disabled={loading}
    className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold disabled:opacity-50"
  >
    {loading ? 'Processing...' : 'Print Bill'}
  </button>
</div>
```

- [ ] Commit:
```bash
git add frontend-react/src/pages/billing/CreateBill.tsx
git commit -m "fix: CreateBill sticky mobile summary footer above bottom nav"
```

---

## Chunk 6: Auth pages + final verification

### Task 19: Auth pages — verify 320px minimum

**Files:**
- Modify: `frontend-react/src/pages/auth/Login.tsx`
- Modify: `frontend-react/src/pages/auth/Register.tsx`
- Modify: `frontend-react/src/pages/auth/ForgotPassword.tsx`
- Modify: `frontend-react/src/pages/auth/ResetPassword.tsx`

These are already mostly responsive. Make targeted fixes only.

- [ ] For each auth page, verify the card container has `w-full max-w-md px-4` (not just `max-w-md` without horizontal padding). If padding is missing at the card level, add `px-4` to the outer wrapper.

- [ ] On `Login.tsx` line 250, the outer wrapper `<div className="w-full max-w-md relative z-10">` has no horizontal padding. Add `px-4`:
```tsx
// Before:
<div className="w-full max-w-md relative z-10">
// After:
<div className="w-full max-w-md px-4 relative z-10">
```
This ensures the card never touches screen edges at 320px.

- [ ] Commit:
```bash
git add frontend-react/src/pages/auth/
git commit -m "fix: auth pages 320px minimum padding verified"
```

---

### Task 20: Final smoke test

- [ ] Run the dev server:
```bash
cd /home/development1/Desktop/Valoryx/frontend-react && npm run dev
```

- [ ] Open browser DevTools → Toggle device toolbar → test these sizes:
  - 320px wide (iPhone SE)
  - 375px wide (iPhone 14)
  - 768px wide (iPad)
  - 1024px wide (desktop)

- [ ] Verify for each:
  - [ ] Bottom nav visible on 320/375, hidden on 1024
  - [ ] Desktop pill sidebar visible on 1024, hidden on 320/375
  - [ ] "More" sheet opens and closes on mobile
  - [ ] No content hidden behind bottom nav (scroll to bottom of longest page)
  - [ ] CreateBill: sticky summary strip visible at 320px, "Print Bill" button tappable
  - [ ] All tables show as cards on 320/375
  - [ ] Dashboard stat cards are 2-column on 320px
  - [ ] Profile activity accordion toggles on mobile
  - [ ] TeamMemberModal opens as bottom sheet on mobile
  - [ ] Dark mode works at all breakpoints

- [ ] Run lint:
```bash
cd /home/development1/Desktop/Valoryx/frontend-react && npm run lint
```

- [ ] Fix any lint errors, then commit:
```bash
git add -A
git commit -m "fix: lint cleanup after responsive pass"
```

---

## File Map Summary

| File | Chunk | Action |
|------|-------|--------|
| `frontend-react/index.html` | 1 | Add `viewport-fit=cover` |
| `frontend-react/src/components/BottomNav.tsx` | 1 | Create |
| `frontend-react/src/components/DashboardLayout.tsx` | 1 | pb-16 + BottomNav |
| `frontend-react/src/components/Sidebar.tsx` | 1 | Remove mobile drawer |
| `frontend-react/src/pages/Profile.tsx` | 2 | Height fix + activity accordion |
| `frontend-react/src/components/profile/ProfileTabs.tsx` | 2 | Scroll active tab into view |
| `frontend-react/src/components/profile/TeamMemberModal.tsx` | 2 | Bottom sheet |
| `frontend-react/src/components/TotpActionModal.tsx` | 2 | Bottom sheet |
| `frontend-react/src/pages/billing/BillingList.tsx` | 3 | Table → card |
| `frontend-react/src/pages/Stock.tsx` | 3 | Table → card |
| `frontend-react/src/pages/Customers.tsx` | 3 | Table → card + stat grid |
| `frontend-react/src/pages/Dashboard.tsx` | 4 | Stat grid + chart overflow |
| `frontend-react/src/pages/Reports.tsx` | 4 | Filter wrap + chart overflow |
| `frontend-react/src/pages/Audit.tsx` | 4 | Table → card |
| `frontend-react/src/pages/PaymentTypes.tsx` | 5 | Card list |
| `frontend-react/src/pages/billing/Exchange.tsx` | 5 | Mobile audit |
| `frontend-react/src/pages/admin/Users.tsx` | 5 | Table → card |
| `frontend-react/src/pages/admin/Clients.tsx` | 5 | Table → card |
| `frontend-react/src/pages/admin/Subscriptions.tsx` | 5 | Table → card |
| `frontend-react/src/pages/admin/Analytics.tsx` | 5 | Chart overflow + grid |
| `frontend-react/src/pages/billing/CreateBill.tsx` | 5 | Sticky mobile summary |
| `frontend-react/src/pages/auth/*.tsx` | 6 | 320px padding verify |

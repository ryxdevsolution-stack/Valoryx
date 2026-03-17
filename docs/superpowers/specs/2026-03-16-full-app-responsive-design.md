# Full App Responsive Design — Spec
**Date:** 2026-03-16
**Scope:** All routes across the Valoryx frontend
**Target:** Fluid layout from 320px to any desktop width — no cutoffs, proper view at every size

---

## 1. Goal

Make every page and component in `frontend-react/` fully responsive across mobile (320px+), tablet (768px), and desktop (1024px+). Replace the mobile hamburger+drawer navigation with a bottom navigation bar (mobile app pattern).

---

## 2. Navigation Overhaul

### 2.1 Remove
- Mobile top header bar (`md:hidden fixed top-0...` in `Sidebar.tsx`)
- Mobile slide-in drawer and hamburger button
- `pt-14 sm:pt-16` top padding in `DashboardLayout.tsx`

### 2.2 Add — `BottomNav.tsx` (new component)
Fixed bottom bar, visible only on mobile (`md:hidden`).

**Layout:** `fixed bottom-0 inset-x-0 h-16 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-700/60`

**Safe area:** Add `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` (inline style) for iPhone notch/home indicator. Requires `viewport-fit=cover` in `index.html` meta viewport tag — without it `env()` resolves to 0 on iPhone.

**5 slots (permission-filtered):**

| Slot | Item | Icon | Condition |
|------|------|------|-----------|
| 1 | Dashboard | LayoutDashboard | `view_dashboard` |
| 2 | Create Bill | PlusSquare | `gst_billing` OR `non_gst_billing` |
| 3 | Bills | FileText | `view_all_bills` OR `view_own_bills` |
| 4 | Stock | Package | `view_stock` |
| 5 | More | Menu | always |

Each slot: icon centered + label below in `text-[10px]`. Active state: icon + label in `gray-900 dark:white`, inactive: `gray-400 dark:gray-500`.

**"More" bottom sheet:**
Tapping "More" opens a sheet that slides up from the bottom (`translate-y-full` → `translate-y-0`). Contains all remaining permission-filtered items: Customers, Reports, Stock Transfer, Audit, PaymentTypes, Profile, Logout, Theme toggle, and admin items (super-admin only). Overlay backdrop closes it. Sheet has rounded top corners (`rounded-t-2xl`), drag handle indicator, max-height `max-h-[85vh]` with `overflow-y-auto` so it adapts to landscape mode.

### 2.3 DashboardLayout changes
```
Before: pt-14 sm:pt-16 md:pt-0 md:pl-20
After:  pb-16 md:pb-0 md:pl-20
```
Mobile page content now flows from the top of the viewport, with 64px bottom clearance for the nav bar.

**Note:** `Profile.tsx` line 408 uses `h-[calc(100vh-80px)]` derived from the old 56/64px top header. After this change update it to `h-[calc(100vh-4rem)] md:h-screen` to match the 64px bottom nav height.

---

## 3. Responsive Page Patterns

### 3.1 Tables → Cards (mobile)
Every page with a `<table>` uses the pattern already established in `TeamTab.tsx`:
- `hidden md:block` on the `<table>` wrapper
- `md:hidden` on a card-list wrapper
- Card shows all columns as stacked label+value rows
- Action buttons remain as icon buttons in the card header

### 3.2 Grid Columns
Standard responsive grid applied everywhere:
```
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```
Stat cards: `grid-cols-2 lg:grid-cols-4` (2 columns even on smallest phones)

### 3.3 Page Headers
All page headers follow:
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <h1>Title</h1>
  <button>Primary Action</button>
</div>
```

### 3.4 Modals
- Base: `w-full mx-4 max-w-lg` (never touches screen edge)
- Tall modals (TeamMemberModal, any form modal): bottom sheet on mobile
  ```
  sm:rounded-2xl rounded-t-2xl sm:max-h-auto max-h-[85vh] sm:mt-0 mt-auto overflow-y-auto
  ```
  Using `max-h-[85vh]` (not fixed `h-[90vh]`) so it adapts correctly in both portrait and landscape.
- Always: `fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4`

### 3.5 Filter / Search Bars
Wrap with `flex flex-wrap gap-2`. On mobile, search takes full width (`w-full`), filter selects wrap below.

### 3.6 Typography
- Page titles: `text-xl sm:text-2xl`
- Section headers: `text-base sm:text-lg`
- Body: `text-sm` (stays consistent)

---

## 4. Page-by-Page Changes

### 4.1 Dashboard (`Dashboard.tsx`)
- Stat cards: `grid-cols-2 lg:grid-cols-4`
- Charts: `overflow-x-auto` wrapper, min-width on chart canvas
- Quick action buttons: wrap on mobile

### 4.2 CreateBill (`billing/CreateBill.tsx`)
- Product search bar: full width on mobile
- Cart/product panel: already has card mode toggle — verify mobile layout works end-to-end
- Bill summary footer: use `sticky bottom-16` (not `fixed`) so it stays within the page scroll container and doesn't conflict with inner scroll areas. The sticky bar should show only the total amount + "Save Bill" button (collapsed view). The full multi-column summary grid is desktop-only; on mobile it collapses to a single row.

### 4.3 BillingList (`billing/BillingList.tsx`)
- Table → card list on mobile
- Date range filter: stack vertically on mobile
- Status badge + amount in card header

### 4.4 Stock (`Stock.tsx`)
- Table → card list on mobile
- Low-stock badge visible in card
- Add/edit action buttons in card

### 4.5 Reports (`Reports.tsx`)
- Date filter bar: wrap on mobile
- Charts: `overflow-x-auto`, `min-w-[500px]` on chart containers
- Summary stat cards: `grid-cols-2`

### 4.6 Customers (`Customers.tsx`)
- Table → card list
- Customer detail row: name + phone + total in card

### 4.7 Audit (`Audit.tsx`)
- Table → card list
- Timestamp + action + table in card row

### 4.8 Profile (`Profile.tsx`)
- Right "Recent Activity" panel: currently `hidden lg:flex` — show as collapsible accordion section at the bottom of the left column on mobile/tablet. The accordion is **closed by default** on mobile. `fetchActivity()` is already called on mount unconditionally — keep this behaviour (data is small, 10 rows), but the panel only renders visually on accordion open.
- Tab bar (`ProfileTabs.tsx`): already has `overflow-x-auto` with inline `scrollbarWidth: 'none'` — sufficient. Do NOT add `scrollbar-hide` (requires a Tailwind plugin not in the project). Confirm touch-scroll works and active tab is scrolled into view.

### 4.9 TeamMemberModal (`components/profile/TeamMemberModal.tsx`)
- Full-screen sheet on mobile (90vh, scrollable)
- Permissions grid: single column on mobile, 2 columns on tablet

### 4.10 Auth Pages (Login, Register, ForgotPassword, ResetPassword)
- Already centered with `max-w-md w-full` — mostly fine
- Verify padding is adequate on 320px (min `px-4`)

### 4.11 Admin Pages (Users, Clients, Analytics, Subscriptions, etc.)
- All tables → card lists on mobile
- Admin-only pages less critical for mobile but must not break

---

## 5. Files to Create / Modify

| File | Action |
|------|--------|
| `components/BottomNav.tsx` | **Create** — new bottom nav component |
| `components/Sidebar.tsx` | **Modify** — remove mobile header + drawer, keep desktop pill nav |
| `components/DashboardLayout.tsx` | **Modify** — swap `pt-*` for `pb-16 md:pb-0`, add `<BottomNav />` |
| `pages/Dashboard.tsx` | **Modify** — grid + chart responsiveness |
| `pages/billing/CreateBill.tsx` | **Modify** — mobile layout audit |
| `pages/billing/BillingList.tsx` | **Modify** — table → card |
| `pages/Stock.tsx` | **Modify** — table → card |
| `pages/Reports.tsx` | **Modify** — chart overflow + grid |
| `pages/Customers.tsx` | **Modify** — table → card |
| `pages/Audit.tsx` | **Modify** — table → card |
| `pages/Profile.tsx` | **Modify** — activity panel accessible on mobile |
| `components/profile/ProfileTabs.tsx` | **Modify** — horizontal scroll |
| `components/profile/TeamMemberModal.tsx` | **Modify** — full-screen sheet on mobile |
| `components/TotpActionModal.tsx` | **Modify** — modal padding on small screens |
| `pages/admin/*.tsx` (Users, Clients, etc.) | **Modify** — table → card |
| `pages/PaymentTypes.tsx` | **Modify** — table → card; add to "More" sheet in BottomNav |
| `pages/billing/Exchange.tsx` | **Modify** — mobile layout audit |
| `pages/admin/Analytics.tsx` | **Modify** — chart overflow + grid (same as Reports.tsx) |
| `index.html` | **Modify** — add `viewport-fit=cover` to meta viewport tag |

---

## 6. Constraints

- No new dependencies — Tailwind only
- Dark mode must work at every breakpoint (all existing dark: classes preserved)
- Permission filtering in BottomNav must match Sidebar logic exactly
- Bottom nav must not overlap page content — `pb-16` on DashboardLayout handles this
- CreateBill (2700+ lines) — targeted changes only, no refactor

---

## 7. Out of Scope

- Landing page (`Landing.tsx`) — marketing page, separate concern
- Pricing page (`Pricing.tsx`) — separate concern
- Electron splash screen — desktop only

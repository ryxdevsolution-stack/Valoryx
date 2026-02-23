# POS Card Mode for CreateBill Page

**Date:** 2026-02-23
**Status:** Approved
**Scope:** Add toggle-based POS card product selection to existing billing page

---

## Problem

The current CreateBill page uses a search-bar + dropdown product selection flow. This works for invoice-style billing but is slow for high-volume POS sales where staff need to quickly tap products and checkout. We need a card-based product selection mode with category filtering and profit visibility.

## Decision

Add a **List View / Card View toggle** to the existing CreateBill page. Card View replaces the product search area with a category tab bar + product card grid. All billing logic (items table, calculations, payments, print) stays untouched.

## Architecture

### What Changes

1. **ViewToggle** - Small toggle component (List/Card) in product selection header
2. **ProductCardGrid** - New component with category tabs + product cards
3. **ProfitSummaryBar** - New component showing cost/revenue/profit/margin
4. **Responsive layout** - Items table becomes stacked cards on mobile

### What Stays the Same (Zero Changes)

- Items table columns and logic
- All calculation logic (subtotal, GST, discount, grand total)
- Customer fields
- Payment methods and splits
- Print flow (Electron + web)
- Tab/draft system
- Barcode scanner
- Bill number auto-increment
- Stock reduction on bill creation
- Permission-based GST/Non-GST modes

### Component Structure

```
CreateBill.tsx (existing - minor additions)
  +-- ViewToggle (new - List/Card switch)
  +-- [List View] existing search + manual input (unchanged)
  +-- [Card View]:
  |   +-- ProductCardGrid.tsx (new ~300 lines)
  |       +-- CategoryTabs (horizontal scrollable tabs)
  |       +-- SearchBar (quick text filter within card view)
  |       +-- ProductCard (individual product card)
  +-- Items Table / MobileCartList (responsive)
  +-- ProfitSummaryBar.tsx (new ~60 lines, owner/manager only)
  +-- Payment/Print section (unchanged)
```

## Card View Design

### Category Tabs
- Auto-generated from `DISTINCT category` of loaded products
- "All" tab always first
- Scrollable when too many categories
- Count badge per tab
- Active tab has colored underline

### Product Cards
- Show: Product Name, Rate, Unit, Stock count
- Single tap adds 1 unit to bill (calls existing `addProductToItems()`)
- If product already in bill, shows quantity badge (blue circle with count)
- Out of stock: grayed out, red badge, tap disabled
- Search within card view filters cards by name

### Profit Summary Bar
- Visible to owner/manager only, hidden from staff
- Shows: Total Cost, Total Revenue, Profit, Margin %
- Calculates from cost_price field on products
- Updates in real-time
- Green/red color coding

## Responsive Breakpoints

| Screen | Cards/Row | Category Tabs | Items Display |
|--------|-----------|---------------|---------------|
| Desktop (1400px+) | 5-6 | Horizontal scroll | Table |
| Laptop (1024-1399px) | 4 | Horizontal scroll | Table |
| Tablet (768-1023px) | 3 | Scroll with arrows | Table (compact) |
| Mobile (< 768px) | 2 | Swipeable pills | Stacked cards |

### Mobile Layout
- Card View becomes default
- Category tabs = swipeable horizontal pills
- Product cards = 2-column grid with larger tap targets
- Items table = stacked card list with +/- and remove
- Profit bar stacks vertically
- Payment section full-width below

## Data Flow

1. Products loaded via existing `useData().products` (cached 5 min)
2. Categories extracted: `[...new Set(products.map(p => p.category))]`
3. Card tap calls `addProductToItems(product)` (existing function)
4. Items table renders as-is (desktop) or stacked cards (mobile)
5. Profit calculated: `items.reduce(sum cost_price * qty)` vs `items.reduce(sum rate * qty)`
6. Bill submission unchanged: existing `handleSubmit()` flow

## State Additions

```typescript
// In CreateBill.tsx
const [viewMode, setViewMode] = useState<'list' | 'card'>(
  localStorage.getItem('billing_view_mode') as 'list' | 'card' || 'list'
)
const [selectedCategory, setSelectedCategory] = useState('All')
const [cardSearchQuery, setCardSearchQuery] = useState('')
```

## Keyboard Shortcuts

- F2: Focus search (existing)
- F3: Toggle List/Card view (new)

## Permissions

- Card View: Available to all users with billing permission
- Profit Bar: Only visible to users with role === 'owner' or role === 'manager'
- Cost price data: Never sent to staff-level API responses (backend check)

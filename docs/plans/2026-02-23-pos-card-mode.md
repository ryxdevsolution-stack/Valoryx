# POS Card Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggle-based POS card product selection mode with category filtering, profit bar, and full responsiveness to the existing CreateBill page.

**Architecture:** Three new components (ProductCardGrid, ProfitSummaryBar, MobileCartList) added to the existing CreateBill.tsx via a view mode toggle. All existing billing logic stays untouched. Cards call the existing `addProductToItems()` function.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, existing DataContext/ClientContext

---

## Task 1: Create ProductCardGrid Component

**Files:**
- Create: `frontend-react/src/components/billing/ProductCardGrid.tsx`

**Step 1: Create the component file**

```tsx
// frontend-react/src/components/billing/ProductCardGrid.tsx
import { useState, useMemo, useRef, useEffect } from 'react'

interface Product {
  product_id: string
  product_name: string
  rate: number | string
  quantity: number
  item_code: string
  barcode: string
  gst_percentage: number | string
  hsn_code: string
  unit: string
  available_quantity: number
  cost_price?: number | string
  mrp?: number | string
  category?: string
}

interface BillItem {
  product_id: string
  product_name: string
  item_code: string
  quantity: number
  rate: number
  [key: string]: any
}

interface ProductCardGridProps {
  products: Product[]
  billItems: BillItem[]
  onProductTap: (product: Product) => void
  isLoading: boolean
}

export default function ProductCardGrid({ products, billItems, onProductTap, isLoading }: ProductCardGridProps) {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const tabsRef = useRef<HTMLDivElement>(null)

  // Extract unique categories from products
  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category || 'Uncategorized').filter(Boolean))]
    cats.sort()
    return ['All', ...cats]
  }, [products])

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    let filtered = products

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => (p.category || 'Uncategorized') === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(p =>
        p.product_name.toLowerCase().includes(query) ||
        (p.item_code && p.item_code.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [products, selectedCategory, searchQuery])

  // Get quantity of a product already in the bill
  const getItemQuantity = (product: Product): number => {
    const item = billItems.find(i =>
      String(i.product_id) === String(product.product_id) ||
      (i.item_code && i.item_code === product.item_code)
    )
    return item?.quantity || 0
  }

  // Count products per category
  const getCategoryCount = (cat: string): number => {
    if (cat === 'All') return products.length
    return products.filter(p => (p.category || 'Uncategorized') === cat).length
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading products...</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      {/* Category Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div
          ref={tabsRef}
          className="flex gap-1 px-2 py-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300"
          style={{ scrollbarWidth: 'thin' }}
        >
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat}
              <span className={`ml-1 text-[10px] ${
                selectedCategory === cat ? 'text-blue-200' : 'text-gray-400'
              }`}>
                {getCategoryCount(cat)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search within cards */}
      <div className="px-2 pt-2">
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* Product Cards Grid */}
      <div className="p-2 max-h-64 overflow-y-auto">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No products found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-blue-500 mt-1 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {filteredProducts.map(product => {
              const inStock = Number(product.quantity) > 0
              const qtyInBill = getItemQuantity(product)

              return (
                <button
                  key={product.product_id}
                  onClick={() => inStock && onProductTap(product)}
                  disabled={!inStock}
                  className={`relative p-2.5 rounded-lg border-2 text-left transition-all ${
                    inStock
                      ? 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md bg-white dark:bg-gray-800 cursor-pointer active:scale-95'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  {/* Quantity badge */}
                  {qtyInBill > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                      {qtyInBill}
                    </span>
                  )}

                  {/* Out of stock badge */}
                  {!inStock && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                      OUT
                    </span>
                  )}

                  {/* Product name */}
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate capitalize leading-tight">
                    {product.product_name}
                  </p>

                  {/* Rate */}
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">
                    ₹{Number(product.rate).toFixed(2)}
                  </p>

                  {/* Unit + Stock */}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {product.unit || 'pcs'}
                    </span>
                    <span className={`text-[10px] font-medium ${
                      Number(product.quantity) <= 5
                        ? 'text-orange-500'
                        : 'text-gray-400'
                    }`}>
                      {Number(product.quantity) > 999 ? '999+' : product.quantity}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify the file compiles**

Run: `cd /home/development1/Desktop/Valoryx/frontend-react && npx tsc --noEmit src/components/billing/ProductCardGrid.tsx 2>&1 | head -20`

Note: Minor TS errors are OK at this point since we haven't integrated yet. The important thing is no syntax errors.

**Step 3: Commit**

```bash
git add frontend-react/src/components/billing/ProductCardGrid.tsx
git commit -m "feat(billing): add ProductCardGrid component for POS card mode"
```

---

## Task 2: Create ProfitSummaryBar Component

**Files:**
- Create: `frontend-react/src/components/billing/ProfitSummaryBar.tsx`

**Step 1: Create the component file**

```tsx
// frontend-react/src/components/billing/ProfitSummaryBar.tsx

interface BillItem {
  product_id: string
  quantity: number
  rate: number
  cost_price?: number
  [key: string]: any
}

interface ProfitSummaryBarProps {
  items: BillItem[]
  userRole: string
}

export default function ProfitSummaryBar({ items, userRole }: ProfitSummaryBarProps) {
  // Only show for owner/manager/admin
  if (!['owner', 'manager', 'admin'].includes(userRole)) return null
  if (items.length === 0) return null

  const totalCost = items.reduce((sum, item) => {
    const cost = Number(item.cost_price || 0)
    return sum + cost * item.quantity
  }, 0)

  const totalRevenue = items.reduce((sum, item) => {
    return sum + item.rate * item.quantity
  }, 0)

  const profit = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
  const hasCostData = items.some(item => item.cost_price && Number(item.cost_price) > 0)

  if (!hasCostData) return null

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Cost:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            ₹{totalCost.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Revenue:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            ₹{totalRevenue.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Profit:</span>
          <span className={`font-bold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            ₹{profit.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Margin:</span>
          <span className={`font-bold ${margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend-react/src/components/billing/ProfitSummaryBar.tsx
git commit -m "feat(billing): add ProfitSummaryBar component for cost/revenue/profit display"
```

---

## Task 3: Create MobileCartList Component

**Files:**
- Create: `frontend-react/src/components/billing/MobileCartList.tsx`

**Step 1: Create the component file**

This replaces the items table on mobile (< 768px) with stacked cards that have +/- buttons.

```tsx
// frontend-react/src/components/billing/MobileCartList.tsx

interface BillItem {
  product_id: string
  product_name: string
  item_code: string
  hsn_code: string
  unit: string
  quantity: number
  rate: number
  gst_percentage: number
  gst_amount: number
  amount: number
  cost_price?: number
  mrp?: number
}

interface MobileCartListProps {
  items: BillItem[]
  showGst: boolean
  onUpdateQuantity: (index: number, newQuantity: number) => void
  onRemoveItem: (index: number) => void
}

export default function MobileCartList({ items, showGst, onUpdateQuantity, onRemoveItem }: MobileCartListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
        <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-sm font-medium">No items added</p>
        <p className="text-xs">Tap a product to add</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate capitalize">
                {item.product_name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                ₹{item.rate.toFixed(2)} × {item.quantity} {item.unit}
                {showGst && item.gst_percentage > 0 && (
                  <span className="ml-1">+ {item.gst_percentage}% GST</span>
                )}
              </p>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white ml-2">
              ₹{item.amount.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (item.quantity > 1) onUpdateQuantity(index, item.quantity - 1)
                  else onRemoveItem(index)
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
              >
                {item.quantity === 1 ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                ) : (
                  <span className="text-sm font-bold">−</span>
                )}
              </button>
              <span className="text-sm font-bold text-gray-900 dark:text-white w-8 text-center">
                {item.quantity}
              </span>
              <button
                onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 transition-colors"
              >
                <span className="text-sm font-bold">+</span>
              </button>
            </div>
            <button
              onClick={() => onRemoveItem(index)}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend-react/src/components/billing/MobileCartList.tsx
git commit -m "feat(billing): add MobileCartList component for responsive cart on mobile"
```

---

## Task 4: Integrate Components into CreateBill.tsx

**Files:**
- Modify: `frontend-react/src/pages/billing/CreateBill.tsx`

This is the critical integration task. We make minimal changes to CreateBill.tsx:

**Step 1: Add imports and state at the top of the component**

After the existing imports (line ~9), add:

```tsx
import ProductCardGrid from '@/components/billing/ProductCardGrid'
import ProfitSummaryBar from '@/components/billing/ProfitSummaryBar'
import MobileCartList from '@/components/billing/MobileCartList'
```

Inside the `UnifiedBillingPage` function body, after the existing state declarations, add:

```tsx
// POS Card View state
const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
  return (localStorage.getItem('billing_view_mode') as 'list' | 'card') || 'list'
})

// Persist view mode
useEffect(() => {
  localStorage.setItem('billing_view_mode', viewMode)
}, [viewMode])

// F3 keyboard shortcut to toggle view mode
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F3') {
      e.preventDefault()
      setViewMode(prev => prev === 'list' ? 'card' : 'list')
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

**Step 2: Add helper functions for MobileCartList**

After the existing `removeItem` function, add:

```tsx
// Update item quantity (for mobile cart +/- buttons)
const updateItemQuantity = (index: number, newQuantity: number) => {
  if (newQuantity < 1) return
  const updatedItems = [...activeTab.items]
  const item = updatedItems[index]
  const subtotal = newQuantity * item.rate
  const gstAmt = (subtotal * item.gst_percentage) / 100
  updatedItems[index] = {
    ...item,
    quantity: newQuantity,
    gst_amount: Number(gstAmt.toFixed(2)),
    amount: Number((subtotal + gstAmt).toFixed(2)),
  }
  updateActiveTab({ items: updatedItems })
}
```

**Step 3: Add view toggle UI**

Find the "Manual Product Selection Row" comment (around line 1661). BEFORE that div, add the view toggle:

```tsx
{/* View Mode Toggle */}
<div className="flex items-center justify-between px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
    <button
      onClick={() => setViewMode('list')}
      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
        viewMode === 'list'
          ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
      }`}
    >
      <span className="hidden sm:inline">List</span>
      <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <button
      onClick={() => setViewMode('card')}
      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
        viewMode === 'card'
          ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
      }`}
    >
      <span className="hidden sm:inline">Cards</span>
      <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    </button>
  </div>
  <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden sm:block">F3 to toggle</span>
</div>
```

**Step 4: Wrap existing product selection in viewMode conditional**

Wrap the existing "Manual Product Selection Row" div with a condition:

```tsx
{viewMode === 'list' ? (
  // ... existing Manual Product Selection Row div (unchanged) ...
) : (
  <ProductCardGrid
    products={products}
    billItems={activeTab.items}
    onProductTap={addProductToItems}
    isLoading={productsLoading}
  />
)}
```

**Step 5: Add responsive items display**

Find the "Items Table" div (around line 1902). Wrap it with responsive conditional:

```tsx
{/* Items Display - Table on desktop, Cards on mobile */}
<div className="hidden md:block">
  {/* ... existing items table (unchanged) ... */}
</div>
<div className="block md:hidden">
  <MobileCartList
    items={activeTab.items}
    showGst={showGstColumns()}
    onUpdateQuantity={updateItemQuantity}
    onRemoveItem={(index) => removeItem(index)}
  />
</div>
```

**Step 6: Add ProfitSummaryBar after items table**

Right after the items table/mobile cart, before the payment section:

```tsx
{/* Profit Summary - Owner/Manager only */}
<ProfitSummaryBar
  items={activeTab.items}
  userRole={client?.role || user?.role || 'staff'}
/>
```

Note: Check how `user` is accessed. From the existing code, `useClient()` provides `client` (Client object) and via `user` from the hook. The role field is on the `user` object. Look at existing code to confirm. The component itself handles the permission check internally.

**Step 7: Run the dev server and verify**

Run: `cd /home/development1/Desktop/Valoryx/frontend-react && npm run dev`

Test checklist:
- [ ] Toggle appears between customer fields and product area
- [ ] List View shows existing search bar (unchanged behavior)
- [ ] Card View shows category tabs + product grid
- [ ] Tapping a card adds product to items table
- [ ] Tapping same card increments quantity
- [ ] Out of stock cards are grayed out
- [ ] Quantity badge shows on cards in bill
- [ ] Category tabs filter correctly
- [ ] Search within card view works
- [ ] F3 toggles between views
- [ ] Profit bar shows for owner/manager
- [ ] Profit bar hidden for staff
- [ ] Mobile view shows MobileCartList instead of table
- [ ] Mobile +/- buttons work
- [ ] Print Bill still works (unchanged)
- [ ] Payment splits still work (unchanged)
- [ ] Draft persistence still works (unchanged)
- [ ] Barcode scanner still works in both views

**Step 8: Commit**

```bash
git add frontend-react/src/pages/billing/CreateBill.tsx
git commit -m "feat(billing): integrate POS card mode toggle, profit bar, and mobile cart into CreateBill"
```

---

## Task 5: Polish and Responsive Refinements

**Files:**
- Modify: `frontend-react/src/pages/billing/CreateBill.tsx`
- Modify: `frontend-react/src/components/billing/ProductCardGrid.tsx`

**Step 1: Make customer fields responsive**

In CreateBill.tsx, find the customer info grid (Customer No, Name, Phone, GSTIN). Update the grid class to stack on mobile:

```tsx
// Change from fixed 4-column grid to responsive
className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2"
```

**Step 2: Make payment section responsive**

Find the payment section and ensure it stacks properly:

```tsx
// Ensure payment splits stack on mobile
className="grid grid-cols-1 sm:grid-cols-2 gap-2"
```

**Step 3: Make bill summary responsive**

The totals section (Subtotal, GST, Discount, Grand Total) should stack on mobile:

```tsx
// Change to responsive layout
className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
```

**Step 4: Test all breakpoints**

Open browser DevTools and test at:
- 1440px (desktop)
- 1024px (laptop)
- 768px (tablet)
- 375px (mobile)

Verify:
- [ ] Cards: 6 cols → 4 cols → 3 cols → 2 cols
- [ ] Category tabs scroll horizontally on all sizes
- [ ] Customer fields: 4 cols on desktop → 2 cols on mobile
- [ ] Items: table on desktop → stacked cards on mobile
- [ ] Profit bar: horizontal on desktop → wraps on mobile
- [ ] Buttons: full width on mobile
- [ ] No horizontal scrollbar on any size

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(billing): responsive polish for POS card mode across all breakpoints"
```

---

## Task 6: Final Verification

**Step 1: Full end-to-end test**

1. Open the app at `http://localhost:5173`
2. Login as owner
3. Navigate to billing/create
4. Test List View (existing flow - should be unchanged)
5. Toggle to Card View
6. Click a category tab
7. Tap 3 different products
8. Verify items appear in table/cart
9. Verify profit bar shows correct numbers
10. Toggle back to List View - items should persist
11. Complete the bill (Print Bill)
12. Verify bill prints correctly
13. Resize browser to mobile width
14. Verify mobile cart with +/- buttons
15. Complete a bill on mobile

**Step 2: Commit all changes**

```bash
git add -A
git commit -m "feat(billing): complete POS card mode with responsive design

- Toggle between List View (existing) and Card View (POS cards)
- Category tabs for quick product filtering
- Tap-to-add product cards with quantity badges
- Profit summary bar (owner/manager only)
- Mobile-responsive cart with +/- controls
- F3 keyboard shortcut to toggle views
- View mode persisted in localStorage"
```

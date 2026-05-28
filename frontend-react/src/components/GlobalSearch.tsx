import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { LucideProps } from 'lucide-react'
import {
  Search,
  X,
  LayoutDashboard,
  PlusSquare,
  FileText,
  RotateCcw,
  Package,
  Truck,
  Users,
  ArrowLeftRight,
  TrendingUp,
  Store,
  User,
  Users2,
  ChevronRight,
  Loader2,
  History,
  ShoppingCart,
  PackageOpen,
} from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import api from '@/lib/api'

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

// ── Static page list ──────────────────────────────────────────────────────────

interface SearchItem {
  id: string
  name: string
  href: string
  iconName: string
  description: string
  category: 'page'
}

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  PlusSquare,
  FileText,
  RotateCcw,
  Package,
  Truck,
  Users,
  ArrowLeftRight,
  TrendingUp,
  Search,
  Users2,
  Store,
  User,
  History,
}

const SEARCH_ITEMS: SearchItem[] = [
  { id: 'pg-dashboard',     name: 'Dashboard',           href: '/dashboard',        iconName: 'LayoutDashboard', description: 'Overview & analytics',                  category: 'page' },
  { id: 'pg-create-bill',   name: 'Create Bill',         href: '/billing/create',   iconName: 'PlusSquare',      description: 'Create new GST/Non-GST bill',           category: 'page' },
  { id: 'pg-bills',         name: 'Bills',               href: '/billing',          iconName: 'FileText',        description: 'View all bills',                        category: 'page' },
  { id: 'pg-cancelled',     name: 'Cancelled Bills',     href: '/billing/restore',  iconName: 'RotateCcw',       description: 'View and restore cancelled bills',      category: 'page' },
  { id: 'pg-stock',         name: 'Stock',               href: '/stock',            iconName: 'Package',         description: 'Stock management',                      category: 'page' },
  { id: 'pg-suppliers',     name: 'Suppliers',           href: '/suppliers',        iconName: 'Truck',           description: 'Supplier management & deliveries',      category: 'page' },
  { id: 'pg-customers',     name: 'Customers',           href: '/customers',        iconName: 'Users',           description: 'Customer database',                     category: 'page' },
  { id: 'pg-transfer',      name: 'Stock Transfer',      href: '/stock-transfer',   iconName: 'ArrowLeftRight',  description: 'Transfer between branches',             category: 'page' },
  { id: 'pg-reports',       name: 'Reports',             href: '/reports',          iconName: 'TrendingUp',      description: 'Sales & profit reports',                category: 'page' },
  { id: 'pg-audit',         name: 'Auditor Reports',     href: '/audit',            iconName: 'History',         description: 'Export GST bills data for auditors',    category: 'page' },
  { id: 'pg-salary',        name: 'Salary & Attendance', href: '/salary',           iconName: 'Users2',          description: 'Employee payroll & attendance',         category: 'page' },
  { id: 'pg-settings',      name: 'Shop Settings',       href: '/shop-settings',    iconName: 'Store',           description: 'Configure shop details',                category: 'page' },
  { id: 'pg-profile',       name: 'My Profile',          href: '/profile',          iconName: 'User',            description: 'Account settings',                      category: 'page' },
]

// ── Dynamic results types ─────────────────────────────────────────────────────

interface DynamicHit {
  id: string
  name: string
  subtitle?: string
  href: string
  /** For bill results — reserved for future deep-link use */
  bill_id?: string
}

interface DynamicResults {
  products: DynamicHit[]
  customers: DynamicHit[]
  suppliers: DynamicHit[]
  bulk_orders: DynamicHit[]
  deliveries: DynamicHit[]
  bills: DynamicHit[]
  employees: DynamicHit[]
}

const EMPTY_RESULTS: DynamicResults = {
  products: [],
  customers: [],
  suppliers: [],
  bulk_orders: [],
  deliveries: [],
  bills: [],
  employees: [],
}

// ── Flat item type used for keyboard navigation ───────────────────────────────

type FlatCategory = 'page' | 'product' | 'customer' | 'supplier' | 'bulk_order' | 'delivery' | 'bill' | 'employee'

interface FlatItem {
  id: string
  name: string
  subtitle?: string
  href: string
  category: FlatCategory
  iconName?: string   // pages only
}

const CATEGORY_ICON: Record<FlatCategory, LucideIcon> = {
  page:       Search,       // overridden per item via iconName
  product:    Package,
  customer:   Users,
  supplier:   Truck,
  bulk_order: ShoppingCart,
  delivery:   PackageOpen,
  bill:       FileText,
  employee:   Users2,
}

const CATEGORY_LABEL: Record<FlatCategory, string> = {
  page:       'Pages',
  product:    'Products',
  customer:   'Customers',
  supplier:   'Suppliers',
  bulk_order: 'Bulk Orders',
  delivery:   'Deliveries',
  bill:       'Bills',
  employee:   'Employees',
}

// ── Global Ctrl+K handler ─────────────────────────────────────────────────────

let _openGlobalSearch: (() => void) | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      _openGlobalSearch?.()
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [dynamicResults, setDynamicResults] = useState<DynamicResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const fetchControllerRef = useRef<AbortController | null>(null)

  // Register the open callback for the global Ctrl+K handler
  useEffect(() => {
    _openGlobalSearch = () => setOpen(true)
    return () => {
      _openGlobalSearch = null
    }
  }, [])

  // ── Static page filter (instant) ──────────────────────────────────────────
  const filteredPages: FlatItem[] = (
    query.trim() === ''
      ? SEARCH_ITEMS.slice(0, 8)
      : SEARCH_ITEMS.filter(item =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.href.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5)
  ).map(item => ({
    id: item.id,
    name: item.name,
    subtitle: item.description,
    href: item.href,
    category: 'page' as FlatCategory,
    iconName: item.iconName,
  }))

  // ── Debounced backend fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (query.trim().length < 2) {
      setDynamicResults(EMPTY_RESULTS)
      return
    }
    const handle = setTimeout(async () => {
      // Abort any previous in-flight request
      fetchControllerRef.current?.abort()
      const ctrl = new AbortController()
      fetchControllerRef.current = ctrl
      try {
        setLoading(true)
        const resp = await api.get('/search', {
          params: { q: query.trim() },
          signal: ctrl.signal,
        })
        setDynamicResults(resp.data as DynamicResults)
      } catch (e: any) {
        // Ignore aborts; only log real errors in dev
        if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') {
          if (import.meta.env.DEV) {
            console.warn('[GlobalSearch] Universal search failed:', e?.message)
          }
        }
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, open])

  // Abort in-flight fetch when modal closes
  useEffect(() => {
    if (!open) {
      fetchControllerRef.current?.abort()
      fetchControllerRef.current = null
      setDynamicResults(EMPTY_RESULTS)
      setLoading(false)
    }
  }, [open])

  // ── Flatten all results into one array for keyboard navigation ─────────────
  const flatItems: FlatItem[] = [
    ...filteredPages,
    ...dynamicResults.products.map(h => ({ ...h, category: 'product' as FlatCategory })),
    ...dynamicResults.customers.map(h => ({ ...h, category: 'customer' as FlatCategory })),
    ...dynamicResults.suppliers.map(h => ({ ...h, category: 'supplier' as FlatCategory })),
    ...dynamicResults.bulk_orders.map(h => ({ ...h, category: 'bulk_order' as FlatCategory })),
    ...dynamicResults.deliveries.map(h => ({ ...h, category: 'delivery' as FlatCategory })),
    ...dynamicResults.bills.map(h => ({ ...h, category: 'bill' as FlatCategory })),
    ...dynamicResults.employees.map(h => ({ ...h, category: 'employee' as FlatCategory })),
  ]

  const hasDynamicResults =
    dynamicResults.products.length > 0 ||
    dynamicResults.customers.length > 0 ||
    dynamicResults.suppliers.length > 0 ||
    dynamicResults.bulk_orders.length > 0 ||
    dynamicResults.deliveries.length > 0 ||
    dynamicResults.bills.length > 0 ||
    dynamicResults.employees.length > 0

  const isEmpty = !loading && flatItems.length === 0 && query.trim().length >= 2

  const handleOpen = useCallback(() => {
    setOpen(true)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const handleNavigate = useCallback((href: string) => {
    navigate(href)
    handleClose()
  }, [navigate, handleClose])

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [open])

  // Reset active index when filtered items change
  useEffect(() => {
    setActiveIndex(0)
  }, [query, dynamicResults])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatItems[activeIndex]) {
      handleNavigate(flatItems[activeIndex].href)
    }
  }, [flatItems, activeIndex, handleClose, handleNavigate])

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderItem(item: FlatItem, index: number) {
    const Icon =
      item.category === 'page' && item.iconName
        ? (ICON_MAP[item.iconName] ?? Search)
        : CATEGORY_ICON[item.category]
    const isActive = index === activeIndex

    return (
      <li
        key={`${item.category}-${item.id}`}
        id={`search-item-${index}`}
        role="option"
        aria-selected={isActive}
      >
        <button
          type="button"
          onClick={() => handleNavigate(item.href)}
          onMouseEnter={() => setActiveIndex(index)}
          className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
            isActive
              ? 'bg-gray-100 dark:bg-gray-800'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isActive
              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}>
            <Icon className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {item.name}
            </div>
            {item.subtitle && (
              <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {item.subtitle}
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </button>
      </li>
    )
  }

  // Render items grouped by category, with section headers when category changes
  function renderGroupedItems() {
    if (flatItems.length === 0) return null

    const elements: React.ReactNode[] = []
    let prevCategory: FlatCategory | null = null
    let globalIndex = 0

    const sections: { category: FlatCategory; items: FlatItem[] }[] = []

    // Build section groups preserving flat index order
    for (const item of flatItems) {
      if (item.category !== prevCategory) {
        sections.push({ category: item.category, items: [] })
        prevCategory = item.category
      }
      sections[sections.length - 1].items.push(item)
    }

    for (const section of sections) {
      elements.push(
        <li
          key={`header-${section.category}`}
          role="presentation"
          className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none"
        >
          {CATEGORY_LABEL[section.category]}
        </li>
      )
      for (const item of section.items) {
        elements.push(renderItem(item, globalIndex))
        globalIndex++
      }
    }

    return elements
  }

  return (
    <>
      {/* Search trigger button inside sidebar pill */}
      <div className="relative group">
        <button
          type="button"
          onClick={handleOpen}
          className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
          <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg flex items-center gap-1.5">
            Search
            <kbd className="text-[10px] bg-gray-700 dark:bg-gray-600 px-1 rounded">Ctrl+K</kbd>
          </div>
        </div>
      </div>

      {/* Overlay — portalled to body because the sidebar has a CSS transform,
          which makes any `position: fixed` descendant fix to the sidebar
          (as a containing block) instead of the viewport. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              {loading ? (
                <Loader2 className="w-5 h-5 text-gray-400 flex-shrink-0 animate-spin" />
              ) : (
                <Search className="w-5 h-5 text-gray-400 flex-shrink-0" strokeWidth={2} />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, products, customers..."
                className="flex-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                aria-label="Search input"
                aria-autocomplete="list"
                aria-controls="global-search-results"
                aria-activedescendant={flatItems[activeIndex] ? `search-item-${activeIndex}` : undefined}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Results list */}
            <ul
              id="global-search-results"
              ref={listRef}
              role="listbox"
              aria-label="Search results"
              className="py-2 max-h-96 overflow-y-auto"
            >
              {isEmpty ? (
                <li className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No results for &ldquo;{query}&rdquo;
                </li>
              ) : (
                renderGroupedItems()
              )}
            </ul>

            {/* Footer: hint row + live result summary */}
            <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 text-[11px] text-gray-400 dark:text-gray-600">
              <div className="flex items-center gap-3">
                <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">↑↓</kbd> Navigate</span>
                <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">↵</kbd> Open</span>
                <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Esc</kbd> Close</span>
              </div>
              {hasDynamicResults && query.trim().length >= 2 && (
                <span className="text-[10px] text-gray-300 dark:text-gray-700">
                  live results
                </span>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

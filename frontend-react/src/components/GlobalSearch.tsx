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
} from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

interface SearchItem {
  name: string
  href: string
  iconName: string
  description: string
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
}

const SEARCH_ITEMS: SearchItem[] = [
  { name: 'Dashboard', href: '/dashboard', iconName: 'LayoutDashboard', description: 'Overview & analytics' },
  { name: 'Create Bill', href: '/billing/create', iconName: 'PlusSquare', description: 'Create new GST/Non-GST bill' },
  { name: 'Bills', href: '/billing', iconName: 'FileText', description: 'View all bills' },
  { name: 'Restore Bills', href: '/billing/restore', iconName: 'RotateCcw', description: 'Restore deleted bills' },
  { name: 'Stock', href: '/stock', iconName: 'Package', description: 'Stock management' },
  { name: 'Suppliers', href: '/suppliers', iconName: 'Truck', description: 'Supplier management & deliveries' },
  { name: 'Customers', href: '/customers', iconName: 'Users', description: 'Customer database' },
  { name: 'Stock Transfer', href: '/stock-transfer', iconName: 'ArrowLeftRight', description: 'Transfer between branches' },
  { name: 'Reports', href: '/reports', iconName: 'TrendingUp', description: 'Sales & profit reports' },
  { name: 'Audit Logs', href: '/audit', iconName: 'Search', description: 'System activity logs' },
  { name: 'Salary & Attendance', href: '/salary', iconName: 'Users2', description: 'Employee payroll & attendance' },
  { name: 'Shop Settings', href: '/shop-settings', iconName: 'Store', description: 'Configure shop details' },
  { name: 'My Profile', href: '/profile', iconName: 'User', description: 'Account settings' },
]

// Attach Ctrl+K / Cmd+K at module level so the listener is registered once
let _openGlobalSearch: (() => void) | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      _openGlobalSearch?.()
    }
  })
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Register the open callback for the global Ctrl+K handler
  useEffect(() => {
    _openGlobalSearch = () => setOpen(true)
    return () => {
      _openGlobalSearch = null
    }
  }, [])

  const filteredItems = query.trim() === ''
    ? SEARCH_ITEMS.slice(0, 8)
    : SEARCH_ITEMS.filter(item =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)

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
      // Small delay to let the DOM paint
      const id = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [open])

  // Reset active index when filtered items change
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

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
      setActiveIndex(i => Math.min(i + 1, filteredItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filteredItems[activeIndex]) {
      handleNavigate(filteredItems[activeIndex].href)
    }
  }, [filteredItems, activeIndex, handleClose, handleNavigate])

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
              <Search className="w-5 h-5 text-gray-400 flex-shrink-0" strokeWidth={2} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages..."
                className="flex-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                aria-label="Search input"
                aria-autocomplete="list"
                aria-controls="global-search-results"
                aria-activedescendant={filteredItems[activeIndex] ? `search-item-${activeIndex}` : undefined}
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
              className="py-2 max-h-80 overflow-y-auto"
            >
              {filteredItems.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No results for "{query}"
                </li>
              ) : (
                filteredItems.map((item, index) => {
                  const Icon = ICON_MAP[item.iconName] ?? Search
                  const isActive = index === activeIndex
                  return (
                    <li
                      key={item.href}
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
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {item.description}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            {/* Footer hint */}
            <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-600">
              <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">↑↓</kbd> Navigate</span>
              <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">↵</kbd> Open</span>
              <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Esc</kbd> Close</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

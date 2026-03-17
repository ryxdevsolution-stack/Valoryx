import { useState, useEffect } from 'react'
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
  const { user, logout } = useClient()
  const { isDarkMode, toggleTheme } = useTheme()
  const { hasPermission, isSuperAdmin } = usePermissions()
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    if (showMore) {
      document.body.style.overflow = 'hidden'
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setShowMore(false)
      }
      document.addEventListener('keydown', handleEsc)
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleEsc)
      }
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showMore])

  if (!user) return null

  // Active check: /billing/create is exact-match only; /billing excludes /billing/create
  const isSlotActive = (href: string) => {
    if (href === '/billing/create') return pathname === '/billing/create'
    if (href === '/billing') return pathname === '/billing' || (pathname.startsWith('/billing/') && !pathname.startsWith('/billing/create'))
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Permission-filtered primary slots
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

  // Permission-filtered "More" sheet items
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
        className="md:hidden fixed bottom-0 inset-x-0 h-16 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-700/60"
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
            aria-expanded={showMore}
            aria-controls="bottom-nav-more-sheet"
          >
            <Menu className="w-5 h-5" strokeWidth={2} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* More Sheet (overlay + panel, only rendered when open) */}
      {showMore && (
        <div
          id="bottom-nav-more-sheet"
          aria-hidden={!showMore}
          className="md:hidden fixed inset-0 z-50"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMore(false)}
          />
          {/* Sheet panel */}
          <div
            className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl translate-y-0 max-h-[85vh] overflow-y-auto"
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
        </div>
      )}
    </>
  )
}

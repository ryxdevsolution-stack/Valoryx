import { useMemo, useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import { AnimatedThemeToggler } from '@/components/AnimatedThemeToggler'
import { usePermissions } from '@/hooks/usePermissions'
import {
  LayoutDashboard,
  FileText,
  PlusSquare,
  Users,
  Package,
  TrendingUp,
  Search,
  LogOut,
  Building2,
  ArrowLeftRight,
  Store,
  Download,
  Truck,
  RotateCcw,
  Banknote,
  History,
  CreditCard,
} from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'
import GlobalSearch from '@/components/GlobalSearch'

type SubItem = { name: string; href: string; icon: typeof RotateCcw }
type NavItem = {
  name: string; href: string; icon: typeof LayoutDashboard
  permission?: string; permissions?: string[]; ownerOnly?: boolean; requireOwner?: boolean
  subItems?: SubItem[]
}

type TooltipState = { name: string; y: number; subItems?: SubItem[] } | null

const allNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { name: 'Create Bill', href: '/billing/create', icon: PlusSquare, permissions: ['gst_billing', 'non_gst_billing'] },
  {
    name: 'Bills', href: '/billing', icon: FileText, permissions: ['view_all_bills', 'view_own_bills'],
    subItems: [{ name: 'Cancelled Bills', href: '/billing/restore', icon: RotateCcw }],
  },
  { name: 'Customers', href: '/customers', icon: Users, permission: 'view_customers' },
  { name: 'Membership', href: '/membership', icon: CreditCard, requireOwner: true },
  { name: 'Stock Management', href: '/stock', icon: Package, permission: 'view_stock' },
  { name: 'Suppliers', href: '/suppliers', icon: Truck, permission: 'view_suppliers' },
  { name: 'Salary', href: '/salary', icon: Banknote, permission: 'view_employees' },
  { name: 'Stock Transfer', href: '/stock-transfer', icon: ArrowLeftRight, permission: 'view_stock_transfers' },
  { name: 'Reports', href: '/reports', icon: TrendingUp, permission: 'view_sales_reports' },
  { name: 'Auditor Reports', href: '/audit', icon: History, permission: 'view_audit_logs' },
]

const adminNavigation = [
  { name: 'Client Management', href: '/admin/clients', icon: Building2, requireSuperAdmin: true },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const { client, user, logout } = useClient()
  const { hasPermission, isSuperAdmin } = usePermissions()
  const { canInstall, install } = usePWA()

  // Fixed-position tooltip state — lifted out of the scroll container
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const showTooltip = useCallback((e: React.MouseEvent<HTMLElement>, name: string, subItems?: SubItem[]) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ name, y: rect.top + rect.height / 2, subItems })
  }, [])

  const hideTooltip = useCallback(() => setTooltip(null), [])

  const navigation = useMemo(() => {
    if (!user) return []
    return allNavigation.filter(item => {
      if ('requireOwner' in item && item.requireOwner) return user.role === 'owner' || !!user.is_super_admin
      if ('ownerOnly' in item && item.ownerOnly) return user.role === 'owner' || user.role === 'manager'
      if ('permissions' in item && item.permissions) return item.permissions.some(p => hasPermission(p))
      if (item.permission) return hasPermission(item.permission)
      return false
    })
  }, [user, hasPermission])

  const adminNav = useMemo(() => {
    if (!user) return []
    return adminNavigation.filter(item => !item.requireSuperAdmin || isSuperAdmin())
  }, [user, isSuperAdmin])

  const iconClass = (isActive: boolean) =>
    `w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md ${
      isActive
        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 scale-105'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
    }`

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:fixed left-4 top-1/2 -translate-y-1/2 z-30">
        <div className="flex flex-col items-center gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-gray-700/60 py-4 px-2">

          {/* Theme Toggle */}
          <div className="pb-2 border-b border-gray-200/60 dark:border-gray-700/60 flex-shrink-0">
            <div className="relative group">
              <AnimatedThemeToggler className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" />
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">Toggle Theme</div>
              </div>
            </div>
          </div>

          {/* Main Navigation — scrollable, tooltips rendered via fixed portal below */}
          <nav
            className="flex flex-col items-center gap-2 py-2 max-h-[364px] overflow-y-auto"
            style={{ scrollbarWidth: 'none' } as never}
          >
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.subItems?.some(s => pathname === s.href) ?? false)
              const Icon = item.icon
              return (
                <div
                  key={item.name}
                  className="flex-shrink-0"
                  onMouseEnter={(e) => showTooltip(e, item.name, item.subItems)}
                  onMouseLeave={hideTooltip}
                >
                  <Link to={item.href} className={iconClass(isActive)} aria-label={item.name}>
                    <Icon className="w-5 h-5" strokeWidth={2.5} />
                  </Link>
                </div>
              )
            })}
          </nav>

          {/* Admin Navigation */}
          {adminNav.length > 0 && (
            <div className="py-2 border-t border-gray-200/60 dark:border-gray-700/60 flex-shrink-0">
              <nav className="flex flex-col items-center gap-2">
                {adminNav.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <div key={item.name} className="relative group">
                      <Link
                        to={item.href}
                        className={`w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md ${
                          isActive
                            ? 'bg-purple-600 dark:bg-purple-500 text-white scale-105'
                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800/50 hover:scale-105'
                        }`}
                        aria-label={item.name}
                      >
                        <Icon className="w-5 h-5" strokeWidth={2.5} />
                      </Link>
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                        <div className="bg-purple-600 dark:bg-purple-700 text-white px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shadow-xl">{item.name}</div>
                      </div>
                    </div>
                  )
                })}
              </nav>
            </div>
          )}

          {/* Bottom — Install, Search, Shop Settings, Profile, Logout */}
          <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex flex-col items-center gap-2 flex-shrink-0">
            {canInstall && (
              <div className="relative group">
                <button type="button" onClick={install} className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800/50 hover:scale-105 animate-pulse hover:animate-none" aria-label="Install App">
                  <Download className="w-5 h-5" strokeWidth={2.5} />
                </button>
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                  <div className="bg-purple-600 dark:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">Install App</div>
                </div>
              </div>
            )}

            <GlobalSearch />

            <div className="relative group">
              <Link to="/shop-settings" className={iconClass(pathname === '/shop-settings')} aria-label="Shop Settings">
                <Store className="w-5 h-5" strokeWidth={2.5} />
              </Link>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">Shop Settings</div>
              </div>
            </div>

            <div className="relative group">
              <Link to="/profile" className={`${iconClass(pathname === '/profile')} relative`} aria-label="My Profile">
                <span className="text-sm font-bold uppercase">{user?.full_name?.[0] || user?.email?.[0] || 'U'}</span>
                {client?.subscription_status === 'active' && (
                  <span className="absolute -top-1 -right-1 text-[7px] font-bold bg-emerald-500 text-white px-1 rounded leading-tight">PRO</span>
                )}
              </Link>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">My Profile</div>
              </div>
            </div>

            <div className="relative group">
              <button type="button" onClick={logout} className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:scale-105" aria-label="Logout">
                <LogOut className="w-5 h-5" strokeWidth={2.5} />
              </button>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-red-600 dark:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">Logout</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed tooltip — rendered outside scroll container so overflow-y never clips it */}
      {tooltip && (
        <div
          className="fixed z-[60] md:block hidden"
          style={{ top: tooltip.y, left: 88, transform: 'translateY(-50%)' }}
          onMouseEnter={() => setTooltip(t => t)}
          onMouseLeave={hideTooltip}
        >
          {tooltip.subItems?.length ? (
            <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-xl shadow-xl overflow-hidden min-w-[148px]">
              <div className="px-3 py-2 text-xs font-semibold border-b border-gray-700/60">{tooltip.name}</div>
              {tooltip.subItems.map(sub => {
                const SubIcon = sub.icon
                return (
                  <Link
                    key={sub.href}
                    to={sub.href}
                    onClick={hideTooltip}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-gray-700/60 transition-colors"
                  >
                    <SubIcon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                    {sub.name}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="bg-gray-900 dark:bg-gray-700 text-white px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shadow-xl pointer-events-none">
              {tooltip.name}
            </div>
          )}
        </div>
      )}
    </>
  )
}

import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import { useTheme } from '@/contexts/ThemeContext'
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
  Sun,
  Moon,
  Building2,
  User,
  ArrowLeftRight
} from 'lucide-react'

// Define navigation items with new permission names
const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { name: 'Create Bill', href: '/billing/create', icon: PlusSquare, permissions: ['gst_billing', 'non_gst_billing'] }, // Need either GST or Non-GST
  { name: 'Bills', href: '/billing', icon: FileText, permissions: ['view_all_bills', 'view_own_bills'] },
  { name: 'Customers', href: '/customers', icon: Users, permission: 'view_customers' },
  { name: 'Stock Management', href: '/stock', icon: Package, permission: 'view_stock' },
  { name: 'Stock Transfer', href: '/stock-transfer', icon: ArrowLeftRight, ownerOnly: true },
  { name: 'Reports', href: '/reports', icon: TrendingUp, permission: 'view_sales_reports' },
  { name: 'Audit Logs', href: '/audit', icon: Search, permission: 'view_audit_logs' },
]

// Admin-only navigation items
const adminNavigation = [
  { name: 'Client Management', href: '/admin/clients', icon: Building2, requireSuperAdmin: true },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const { client, user, logout } = useClient()
  const { isDarkMode, toggleTheme } = useTheme()
  const { hasPermission, isSuperAdmin } = usePermissions()

  // Filter navigation items based on permissions
  const navigation = useMemo(() => {
    if (!user) return []
    return allNavigation.filter(item => {
      // Handle owner-only items (Stock Transfer)
      if ('ownerOnly' in item && item.ownerOnly) {
        return user.role === 'owner' || user.role === 'admin'
      }
      // Handle multiple permissions (any one of them grants access)
      if ('permissions' in item && item.permissions) {
        return item.permissions.some(p => hasPermission(p))
      }
      // Handle single permission
      if (item.permission) {
        return hasPermission(item.permission)
      }
      return false
    })
  }, [user, hasPermission])

  // Get admin navigation items based on permissions
  const adminNav = useMemo(() => {
    if (!user) return []
    return adminNavigation.filter(item => {
      return !item.requireSuperAdmin || isSuperAdmin()
    })
  }, [user, isSuperAdmin])

  return (
    <>
      {/* Desktop Sidebar - Modern Compact Pill Navigation */}
      <div className="hidden md:flex md:fixed left-4 top-1/2 -translate-y-1/2 z-30">
        <div className="flex flex-col items-center gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-gray-700/60 py-4 px-2">

          {/* Theme Toggle */}
          <div className="pb-2 border-b border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <button
                type="button"
                onClick={toggleTheme}
                className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun className="w-5 h-5" strokeWidth={2.5} /> : <Moon className="w-5 h-5" strokeWidth={2.5} />}
              </button>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                </div>
              </div>
            </div>
          </div>

          {/* Main Navigation */}
          <nav className="flex flex-col items-center gap-2 py-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <div key={item.name} className="relative group">
                  <Link
                    to={item.href}
                    className={`
                      w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md
                      ${
                        isActive
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      }
                    `}
                    aria-label={item.name}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2.5} />
                  </Link>

                  {/* Tooltip - only shows on hover */}
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                    <div className="bg-gray-900 dark:bg-gray-700 text-white px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shadow-xl">
                      {item.name}
                    </div>
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Admin Navigation Section */}
          {adminNav.length > 0 && (
            <>
              <div className="py-2 border-t border-gray-200/60 dark:border-gray-700/60">
                <nav className="flex flex-col items-center gap-2">
                  {adminNav.map((item) => {
                    const isActive = pathname === item.href
                    const Icon = item.icon
                    return (
                      <div key={item.name} className="relative group">
                        <Link
                          to={item.href}
                          className={`
                            w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md
                            ${
                              isActive
                                ? 'bg-purple-600 dark:bg-purple-500 text-white scale-105'
                                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800/50 hover:scale-105'
                            }
                          `}
                          aria-label={item.name}
                        >
                          <Icon className="w-5 h-5" strokeWidth={2.5} />
                        </Link>

                        {/* Tooltip */}
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                          <div className="bg-purple-600 dark:bg-purple-700 text-white px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shadow-xl">
                            {item.name}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </nav>
              </div>
            </>
          )}

          {/* Profile & Logout at Bottom */}
          <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex flex-col items-center gap-2">
            {/* My Profile */}
            <div className="relative group">
              <Link
                to="/profile"
                className={`w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md hover:scale-105 relative ${
                  pathname === '/profile'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 scale-105'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="My Profile"
              >
                <span className="text-sm font-bold uppercase">{user?.full_name?.[0] || user?.email?.[0] || 'U'}</span>
                {client?.subscription_status === 'active' && (
                  <span className="absolute -top-1 -right-1 text-[7px] font-bold bg-emerald-500 text-white px-1 rounded leading-tight">PRO</span>
                )}
              </Link>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  My Profile
                </div>
              </div>
            </div>

            {/* Logout */}
            <div className="relative group">
              <button
                type="button"
                onClick={logout}
                className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:scale-105"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5" strokeWidth={2.5} />
              </button>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-red-600 dark:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  Logout
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </>
  )
}

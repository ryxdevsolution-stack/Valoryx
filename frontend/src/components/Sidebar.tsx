'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClient } from '@/contexts/ClientContext'
import { useTheme } from '@/contexts/ThemeContext'
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
  Moon
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Create Bill', href: '/billing/create', icon: PlusSquare },
  { name: 'All Bills', href: '/billing', icon: FileText },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Stock Management', href: '/stock', icon: Package },
  { name: 'Reports', href: '/reports', icon: TrendingUp },
  { name: 'Audit Logs', href: '/audit', icon: Search },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { client, user, logout } = useClient()
  const { isDarkMode, toggleTheme } = useTheme()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const closeMobileMenu = () => {
    setIsAnimating(true)
    setTimeout(() => {
      setIsMobileMenuOpen(false)
      setIsAnimating(false)
    }, 300)
  }

  const openMobileMenu = () => {
    setIsMobileMenuOpen(true)
  }

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMobileMenuOpen])

  // Close menu on route change
  useEffect(() => {
    closeMobileMenu()
  }, [pathname])

  return (
    <>
      {/* Mobile Header - Glassmorphism Design */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-gray-700/50 shadow-lg">
        <div className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm sm:text-base">RB</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-gray-200 dark:via-gray-300 dark:to-gray-400 bg-clip-text text-transparent">
              RYX Billing
            </h1>
          </div>
          <button
            type="button"
            onClick={() => isMobileMenuOpen ? closeMobileMenu() : openMobileMenu()}
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100/80 dark:bg-gray-700/80 hover:bg-slate-200/80 dark:hover:bg-gray-600/80 text-slate-600 dark:text-gray-300 hover:text-slate-700 dark:hover:text-gray-200 transition-all duration-300 flex items-center justify-center shadow-md active:scale-95 touch-manipulation group"
            aria-label="Toggle menu"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center">
              <span className={`absolute w-5 sm:w-6 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45' : '-translate-y-1.5 sm:-translate-y-2'}`}></span>
              <span className={`absolute w-5 sm:w-6 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0 scale-0' : 'opacity-100'}`}></span>
              <span className={`absolute w-5 sm:w-6 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45' : 'translate-y-1.5 sm:translate-y-2'}`}></span>
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay with Animation */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-all duration-300 ${
          isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        onClick={closeMobileMenu}
      />

      {/* Mobile Sidebar Drawer - Glassy Design */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[280px] xs:w-[320px] sm:w-[360px] max-w-[90vw] transform transition-all duration-500 ease-out ${
          isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        }`}
      >
        <div className="flex flex-col h-full bg-gradient-to-br from-white/95 via-slate-50/95 to-white/95 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/95 shadow-2xl backdrop-blur-2xl border-r border-slate-200/50 dark:border-gray-700/50">
          {/* Header with Logo */}
          <div className="flex items-center h-16 xs:h-18 flex-shrink-0 px-4 xs:px-5 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 xs:w-10 xs:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md ring-2 ring-blue-500/20">
                <span className="text-white font-bold text-sm xs:text-base">RB</span>
              </div>
              <h1 className="text-lg xs:text-xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-gray-200 dark:via-gray-300 dark:to-gray-400 bg-clip-text text-transparent">
                RYX Billing
              </h1>
            </div>
          </div>

          {/* Client Info Card */}
          <div className="mx-3 xs:mx-4 my-3 xs:my-4 p-3 xs:p-4 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 xs:w-12 xs:h-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center flex-shrink-0 border border-slate-200/50 dark:border-gray-700/50">
                <span className="text-xl xs:text-2xl">👤</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] xs:text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Client Account</p>
                <p className="text-sm xs:text-base text-slate-800 dark:text-white font-bold truncate mt-0.5">{client?.client_name}</p>
                <p className="text-[10px] xs:text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 xs:px-4 pb-4">
            <nav className="space-y-1.5 xs:space-y-2">
              {navigation.map((item, index) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={closeMobileMenu}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className={`
                      group flex items-center gap-3 px-3 xs:px-4 py-2.5 xs:py-3 text-sm xs:text-base font-medium rounded-xl xs:rounded-2xl transition-all duration-300 touch-manipulation animate-[slideIn_0.3s_ease-out_forwards] opacity-0
                      ${
                        isActive
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg scale-[1.02]'
                          : 'text-slate-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60 hover:text-slate-800 dark:hover:text-white active:scale-95 backdrop-blur-sm'
                      }
                    `}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 xs:w-9 xs:h-9 rounded-lg xs:rounded-xl transition-all duration-300 ${
                      isActive ? 'bg-white/20 dark:bg-gray-900/20 scale-110' : 'bg-slate-200/50 dark:bg-gray-700/50 group-hover:bg-slate-300/50 dark:group-hover:bg-gray-600/50'
                    }`}>
                      <Icon className="w-4 h-4 xs:w-5 xs:h-5" strokeWidth={2.5} />
                    </div>
                    <span className="flex-1 font-semibold">{item.name}</span>
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Logout Button */}
          <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-gray-700/50 p-3 xs:p-4 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                logout()
                closeMobileMenu()
              }}
              className="w-full flex items-center gap-3 px-3 xs:px-4 py-2.5 xs:py-3 text-sm xs:text-base font-semibold text-slate-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-all duration-300 rounded-xl xs:rounded-2xl hover:bg-red-50/80 dark:hover:bg-red-900/30 active:scale-95 touch-manipulation group border border-transparent hover:border-red-200/50 dark:hover:border-red-800/50"
            >
              <div className="flex items-center justify-center w-8 h-8 xs:w-9 xs:h-9 rounded-lg xs:rounded-xl bg-slate-200/50 dark:bg-gray-700/50 group-hover:bg-red-100/80 dark:group-hover:bg-red-900/50 transition-all duration-300">
                <LogOut className="w-4 h-4 xs:w-5 xs:h-5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
              </div>
              <span className="flex-1 text-left">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar - Modern Compact Pill Navigation */}
      <div className="hidden md:flex md:fixed left-4 top-1/2 -translate-y-1/2 z-30">
        <div className="flex flex-col items-center gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-gray-700/60 py-4 px-2">

          {/* Theme Toggle Section */}
          <div className="flex flex-col items-center gap-2 pb-2 border-b border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <button
                type="button"
                onClick={toggleTheme}
                className={`
                  w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md
                  ${isDarkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-900 text-white hover:bg-gray-800'}
                `}
                aria-label="Toggle light mode"
              >
                <Sun className="w-5 h-5" strokeWidth={2.5} />
              </button>

              {/* Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  Light Mode
                </div>
              </div>
            </div>

            <div className="relative group">
              <button
                type="button"
                onClick={toggleTheme}
                className={`
                  w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md
                  ${!isDarkMode ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-gray-900 text-white hover:bg-gray-800'}
                `}
                aria-label="Toggle dark mode"
              >
                <Moon className="w-5 h-5" strokeWidth={2.5} />
              </button>

              {/* Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  Dark Mode
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
                    href={item.href}
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

          {/* Logout Button at Bottom */}
          <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <button
                type="button"
                onClick={logout}
                className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:scale-105"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5" strokeWidth={2.5} />
              </button>

              {/* Logout Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                <div className="bg-red-600 dark:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  Logout
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* CSS Animation for slide-in effect */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  )
}

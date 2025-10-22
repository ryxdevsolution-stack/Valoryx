'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClient } from '@/contexts/ClientContext'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊', color: 'from-blue-500 to-blue-600' },
  { name: 'Create Bill', href: '/billing/create', icon: '✨', color: 'from-purple-500 to-purple-600' },
  { name: 'All Bills', href: '/billing', icon: '📋', color: 'from-green-500 to-green-600' },
  { name: 'Customers', href: '/customers', icon: '👥', color: 'from-indigo-500 to-indigo-600' },
  { name: 'Stock Management', href: '/stock', icon: '📦', color: 'from-orange-500 to-orange-600' },
  { name: 'Reports', href: '/reports', icon: '📈', color: 'from-pink-500 to-pink-600' },
  { name: 'Audit Logs', href: '/audit', icon: '🔍', color: 'from-cyan-500 to-cyan-600' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { client, user, logout } = useClient()
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
      {/* Mobile Header - Light Glassmorphism Design */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-lg">
        <div className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm sm:text-base">RB</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent">
              RYX Billing
            </h1>
          </div>
          <button
            onClick={() => isMobileMenuOpen ? closeMobileMenu() : openMobileMenu()}
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 hover:text-slate-700 transition-all duration-300 flex items-center justify-center shadow-md active:scale-95 touch-manipulation group"
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

      {/* Mobile Sidebar Drawer - Light Glassy Design */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[280px] xs:w-[320px] sm:w-[360px] max-w-[90vw] transform transition-all duration-500 ease-out ${
          isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        }`}
      >
        <div className="flex flex-col h-full bg-gradient-to-br from-white/95 via-slate-50/95 to-white/95 shadow-2xl backdrop-blur-2xl border-r border-slate-200/50">
          {/* Header with Logo */}
          <div className="flex items-center h-16 xs:h-18 flex-shrink-0 px-4 xs:px-5 bg-white/60 backdrop-blur-xl border-b border-slate-200/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 xs:w-10 xs:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md ring-2 ring-blue-500/20">
                <span className="text-white font-bold text-sm xs:text-base">RB</span>
              </div>
              <h1 className="text-lg xs:text-xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent">
                RYX Billing
              </h1>
            </div>
          </div>

          {/* Client Info Card */}
          <div className="mx-3 xs:mx-4 my-3 xs:my-4 p-3 xs:p-4 bg-white/60 backdrop-blur-xl rounded-2xl border border-slate-200/50 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 xs:w-12 xs:h-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center flex-shrink-0 border border-slate-200/50">
                <span className="text-xl xs:text-2xl">👤</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] xs:text-xs font-semibold text-slate-500 uppercase tracking-wider">Client Account</p>
                <p className="text-sm xs:text-base text-slate-800 font-bold truncate mt-0.5">{client?.client_name}</p>
                <p className="text-[10px] xs:text-xs text-slate-500 mt-0.5 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 xs:px-4 pb-4">
            <nav className="space-y-1.5 xs:space-y-2">
              {navigation.map((item, index) => {
                const isActive = pathname === item.href
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
                          ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-lg scale-[1.02]'
                          : 'text-slate-600 hover:bg-white/60 hover:text-slate-800 active:scale-95 backdrop-blur-sm'
                      }
                    `}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 xs:w-9 xs:h-9 rounded-lg xs:rounded-xl transition-all duration-300 ${
                      isActive ? 'bg-white/20 scale-110' : 'bg-slate-200/50 group-hover:bg-slate-300/50'
                    }`}>
                      <span className="text-lg xs:text-xl">{item.icon}</span>
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
          <div className="flex-shrink-0 border-t border-slate-200/50 p-3 xs:p-4 bg-white/60 backdrop-blur-xl">
            <button
              onClick={() => {
                logout()
                closeMobileMenu()
              }}
              className="w-full flex items-center gap-3 px-3 xs:px-4 py-2.5 xs:py-3 text-sm xs:text-base font-semibold text-slate-600 hover:text-red-500 transition-all duration-300 rounded-xl xs:rounded-2xl hover:bg-red-50/80 active:scale-95 touch-manipulation group border border-transparent hover:border-red-200/50"
            >
              <div className="flex items-center justify-center w-8 h-8 xs:w-9 xs:h-9 rounded-lg xs:rounded-xl bg-slate-200/50 group-hover:bg-red-100/80 transition-all duration-300">
                <svg className="w-4 h-4 xs:w-5 xs:h-5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <span className="flex-1 text-left">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar - Light Glassy Design */}
      <div className="hidden md:flex md:w-64 lg:w-72 xl:w-80 2xl:w-[22rem] md:flex-col md:fixed md:inset-y-0 z-30">
        <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-white/95 via-slate-50/95 to-white/95 shadow-2xl backdrop-blur-2xl border-r border-slate-200/50">
          {/* Header with Logo */}
          <div className="flex items-center h-16 lg:h-20 flex-shrink-0 px-4 lg:px-6 bg-white/60 backdrop-blur-xl border-b border-slate-200/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md ring-2 ring-blue-500/20">
                <span className="text-white font-bold text-base lg:text-lg">RB</span>
              </div>
              <h1 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 bg-clip-text text-transparent">
                RYX Billing
              </h1>
            </div>
          </div>

          {/* Client Info Card */}
          <div className="mx-3 lg:mx-4 my-3 lg:my-4 p-3 lg:p-4 bg-white/60 backdrop-blur-xl rounded-2xl border border-slate-200/50 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center flex-shrink-0 border border-slate-200/50">
                <span className="text-2xl lg:text-3xl">👤</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] lg:text-xs font-semibold text-slate-500 uppercase tracking-wider">Client Account</p>
                <p className="text-base lg:text-lg text-slate-800 font-bold truncate mt-0.5">{client?.client_name}</p>
                <p className="text-xs lg:text-sm text-slate-500 mt-0.5 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 lg:px-4 pb-4">
            <nav className="space-y-1.5 lg:space-y-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 text-sm lg:text-base font-medium rounded-xl lg:rounded-2xl transition-all duration-300
                      ${
                        isActive
                          ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-lg scale-[1.02]'
                          : 'text-slate-600 hover:bg-white/60 hover:text-slate-800 hover:scale-[1.01] backdrop-blur-sm'
                      }
                    `}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl transition-all duration-300 ${
                      isActive ? 'bg-white/20 scale-110' : 'bg-slate-200/50 group-hover:bg-slate-300/50'
                    }`}>
                      <span className="text-xl lg:text-2xl">{item.icon}</span>
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
          <div className="flex-shrink-0 border-t border-slate-200/50 p-3 lg:p-4 bg-white/60 backdrop-blur-xl">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 text-sm lg:text-base font-semibold text-slate-600 hover:text-red-500 transition-all duration-300 rounded-xl lg:rounded-2xl hover:bg-red-50/80 hover:scale-[1.01] group border border-transparent hover:border-red-200/50"
            >
              <div className="flex items-center justify-center w-8 h-8 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl bg-slate-200/50 group-hover:bg-red-100/80 transition-all duration-300">
                <svg className="w-4 h-4 lg:w-5 lg:h-5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <span className="flex-1 text-left">Logout</span>
            </button>
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

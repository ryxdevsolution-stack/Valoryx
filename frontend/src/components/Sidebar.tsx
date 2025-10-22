'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClient } from '@/contexts/ClientContext'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Create Bill', href: '/billing/create', icon: '✨' },
  { name: 'All Bills', href: '/billing', icon: '📋' },
  { name: 'Stock Management', href: '/stock', icon: '📦' },
  { name: 'Reports', href: '/reports', icon: '📈' },
  { name: 'Audit Logs', href: '/audit', icon: '🔍' },
  { name: 'Payment Types', href: '/payment-types', icon: '💳' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { client, user, logout } = useClient()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-4">
          <h1 className="text-lg sm:text-xl font-bold text-white">RYX Billing</h1>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black bg-opacity-50 transition-opacity"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 sm:w-72 bg-gray-800 transform transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center h-14 sm:h-16 flex-shrink-0 px-4 bg-gray-900">
            <h1 className="text-lg sm:text-xl font-bold text-white">RYX Billing</h1>
          </div>

          {/* Client Info */}
          <div className="px-4 py-3 bg-gray-900 border-b border-gray-700">
            <p className="text-xs sm:text-sm font-medium text-gray-400">Client</p>
            <p className="text-sm sm:text-base text-white font-semibold truncate">{client?.client_name}</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{user?.email}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            <nav className="px-2 py-4 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className={`
                      group flex items-center px-3 py-3 text-sm sm:text-base font-medium rounded-md min-h-touch transition
                      ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }
                    `}
                  >
                    <span className="mr-3 text-xl sm:text-2xl">{item.icon}</span>
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex-shrink-0 border-t border-gray-700 p-4">
            <button
              onClick={() => {
                logout()
                closeMobileMenu()
              }}
              className="w-full flex items-center px-3 py-3 text-sm sm:text-base font-medium text-white hover:text-red-400 transition rounded-md hover:bg-gray-700 min-h-touch"
            >
              <svg className="mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 lg:w-72 md:flex-col md:fixed md:inset-y-0 z-30">
        <div className="flex-1 flex flex-col min-h-0 bg-gray-800">
          <div className="flex items-center h-16 lg:h-20 flex-shrink-0 px-4 bg-gray-900">
            <h1 className="text-xl lg:text-2xl font-bold text-white">RYX Billing</h1>
          </div>

          {/* Client Info */}
          <div className="px-4 py-3 lg:py-4 bg-gray-900 border-b border-gray-700">
            <p className="text-sm font-medium text-gray-400">Client</p>
            <p className="text-base lg:text-lg text-white font-semibold truncate">{client?.client_name}</p>
            <p className="text-xs lg:text-sm text-gray-400 mt-1 truncate">{user?.email}</p>
          </div>

          <div className="flex-1 flex flex-col overflow-y-auto">
            <nav className="flex-1 px-2 py-4 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center px-3 py-2.5 lg:py-3 text-sm lg:text-base font-medium rounded-md transition
                      ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }
                    `}
                  >
                    <span className="mr-3 text-xl lg:text-2xl">{item.icon}</span>
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex-shrink-0 flex border-t border-gray-700 p-4">
            <button
              onClick={logout}
              className="flex-shrink-0 w-full group block text-left px-3 py-2.5 rounded-md hover:bg-gray-700 transition"
            >
              <div className="flex items-center">
                <svg className="h-5 w-5 text-gray-400 group-hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm lg:text-base font-medium text-white group-hover:text-red-400 transition">
                    Logout
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

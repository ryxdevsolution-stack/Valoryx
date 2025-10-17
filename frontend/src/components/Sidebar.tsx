'use client'

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

  return (
    <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex-1 flex flex-col min-h-0 bg-gray-800">
        <div className="flex items-center h-16 flex-shrink-0 px-4 bg-gray-900">
          <h1 className="text-xl font-bold text-white">RYX Billing</h1>
        </div>

        {/* Client Info */}
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-700">
          <p className="text-sm font-medium text-gray-400">Client</p>
          <p className="text-white font-semibold">{client?.client_name}</p>
          <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
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
                    group flex items-center px-2 py-2 text-sm font-medium rounded-md
                    ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                >
                  <span className="mr-3 text-xl">{item.icon}</span>
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex-shrink-0 flex border-t border-gray-700 p-4">
          <button
            onClick={logout}
            className="flex-shrink-0 w-full group block text-left"
          >
            <div className="flex items-center">
              <div className="ml-3">
                <p className="text-sm font-medium text-white group-hover:text-red-400 transition">
                  Logout
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

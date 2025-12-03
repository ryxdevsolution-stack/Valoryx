'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  Shield,
  Bell,
  Database,
  CreditCard,
  Plug,
  Activity,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
  Home,
  Server,
  HardDrive,
  Zap,
  BarChart3,
  Lock,
  Globe,
  Webhook
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  badgeColor?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    ]
  },
  {
    title: 'Management',
    items: [
      { name: 'Clients', href: '/admin/clients', icon: Building2 },
      { name: 'Users', href: '/admin/users', icon: Users },
      { name: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
    ]
  },
  {
    title: 'System',
    items: [
      { name: 'Settings', href: '/admin/settings', icon: Settings },
      { name: 'Integrations', href: '/admin/integrations', icon: Plug },
      { name: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
    ]
  },
  {
    title: 'Security & Logs',
    items: [
      { name: 'Audit Logs', href: '/admin/audit', icon: FileText },
      { name: 'Security', href: '/admin/security', icon: Lock },
      { name: 'Notifications', href: '/admin/notifications', icon: Bell },
    ]
  },
  {
    title: 'Infrastructure',
    items: [
      { name: 'System Health', href: '/admin/health', icon: Activity },
      { name: 'Backup & Recovery', href: '/admin/backup', icon: Database },
      { name: 'Storage', href: '/admin/storage', icon: HardDrive },
    ]
  }
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useClient();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin' || pathname === '/admin/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <div
      className={`${isCollapsed ? 'w-20' : 'w-72'} h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out border-r border-slate-700/50`}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Super Admin</h1>
              <p className="text-xs text-slate-400">Control Panel</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-10 h-10 mx-auto rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 rounded-lg hover:bg-slate-700/50 transition-colors ${isCollapsed ? 'mx-auto mt-2' : ''}`}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          )}
        </button>
      </div>

      {/* Back to App */}
      <div className="px-3 py-3 border-b border-slate-700/50">
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
        >
          <Home className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm font-medium">Back to App</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {navigationGroups.map((group) => (
          <div key={group.title}>
            {!isCollapsed && (
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {group.title}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                      ${isCollapsed ? 'justify-center' : ''}
                      ${active
                        ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                      }
                    `}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                    {!isCollapsed && (
                      <>
                        <span className="text-sm font-medium flex-1">{item.name}</span>
                        {item.badge && (
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${item.badgeColor || 'bg-violet-500/20 text-violet-300'}`}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700/50 space-y-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-slate-400" />
          )}
          {!isCollapsed && <span className="text-sm font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* User Info & Logout */}
        {!isCollapsed && user && (
          <div className="px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-sm font-bold text-white">
                {user.full_name?.charAt(0) || user.email?.charAt(0) || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.full_name || 'Admin'}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Settings,
  Shield,
  Home,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';

const navigationGroups = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard',   href: '/admin',               icon: LayoutDashboard },
    ],
  },
  {
    title: 'Management',
    items: [
      { name: 'Clients',       href: '/admin/clients',       icon: Building2 },
      { name: 'Users',         href: '/admin/users',         icon: Users },
      { name: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
    ],
  },
  {
    title: 'System',
    items: [
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

const allItems = navigationGroups.flatMap(g => g.items);

export default function AdminSidebar() {
  const { pathname } = useLocation();
  const { user, logout } = useClient();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin' || pathname === '/admin/dashboard'
      : pathname.startsWith(href);

  // Stable close fn — cancels any pending timer, schedules a new one
  const closeMobileMenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setIsMobileMenuOpen(false), 300);
  }, []);

  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), []);

  // Cancel timer on unmount to avoid state update after unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Prevent body scroll when mobile menu open — use '' to remove inline style
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  // Close on route change
  useEffect(() => { closeMobileMenu(); }, [pathname, closeMobileMenu]);

  // Close on Escape key
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* ── Mobile Top Header ────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-gray-700/50 shadow-lg">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <Shield className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold bg-gradient-to-r from-slate-700 to-slate-500 dark:from-gray-200 dark:to-gray-400 bg-clip-text text-transparent leading-tight">
                Super Admin
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-gray-500 leading-tight">Control Panel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => isMobileMenuOpen ? closeMobileMenu() : openMobileMenu()}
            aria-expanded={isMobileMenuOpen}
            aria-controls="admin-mobile-drawer"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="w-10 h-10 rounded-xl bg-slate-100/80 dark:bg-gray-700/80 hover:bg-slate-200/80 dark:hover:bg-gray-600/80 text-slate-600 dark:text-gray-300 transition-all duration-300 flex items-center justify-center shadow-md active:scale-95 touch-manipulation"
          >
            <div className="relative w-5 h-5 flex items-center justify-center" aria-hidden="true">
              <span className={`absolute w-5 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45' : '-translate-y-1.5'}`} />
              <span className={`absolute w-5 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0 scale-0' : ''}`} />
              <span className={`absolute w-5 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45' : 'translate-y-1.5'}`} />
            </div>
          </button>
        </div>
      </div>

      {/* ── Mobile Backdrop ──────────────────────────────────────────── */}
      {/* z-[45] — above header (z-40) but below drawer (z-50) */}
      <div
        className={`md:hidden fixed inset-0 z-[45] bg-slate-900/30 backdrop-blur-sm transition-all duration-300 ${
          isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* ── Mobile Drawer ────────────────────────────────────────────── */}
      <div
        id="admin-mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[280px] sm:w-[320px] max-w-[90vw] transform transition-all duration-500 ease-out ${
          isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col h-full bg-gradient-to-br from-white/95 via-slate-50/95 to-white/95 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/95 shadow-2xl backdrop-blur-2xl border-r border-slate-200/50 dark:border-gray-700/50">

          {/* Drawer Header */}
          <div className="flex items-center h-16 flex-shrink-0 px-4 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Shield className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Super Admin</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">Control Panel</p>
              </div>
            </div>
          </div>

          {/* User Info Card */}
          {user && (
            <div className="mx-4 my-3 p-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-gray-700/50 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0" aria-hidden="true">
                  {user.full_name?.charAt(0) || user.email?.charAt(0) || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Super Admin</p>
                  <p className="text-sm text-slate-800 dark:text-white font-bold truncate mt-0.5">{user.full_name || 'Admin'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-gray-400 truncate">{user.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Back to App */}
          <div className="px-4 pb-2">
            <Link
              to="/dashboard"
              onClick={closeMobileMenu}
              className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white hover:bg-white/60 dark:hover:bg-gray-700/60 transition-all duration-200 text-sm font-medium"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-200/50 dark:bg-gray-700/50 flex items-center justify-center" aria-hidden="true">
                <Home className="w-4 h-4" />
              </div>
              <span>Back to App</span>
            </Link>
          </div>

          {/* Nav Groups */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {navigationGroups.map((group) => (
              <div key={group.title} className="mb-4">
                <p className="px-2 mb-2 text-[10px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.title}
                </p>
                <nav className="space-y-1" aria-label={group.title}>
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={closeMobileMenu}
                        aria-current={active ? 'page' : undefined}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
                          active
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg'
                            : 'text-slate-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60 hover:text-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          active ? 'bg-white/20 dark:bg-gray-900/20' : 'bg-slate-200/50 dark:bg-gray-700/50 group-hover:bg-slate-300/50 dark:group-hover:bg-gray-600/50'
                        }`} aria-hidden="true">
                          <Icon className="w-4 h-4" strokeWidth={2.5} />
                        </div>
                        <span className="flex-1 font-semibold">{item.name}</span>
                        {active && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-gray-900 animate-pulse" aria-hidden="true" />}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-gray-700/50 p-4 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl space-y-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60 hover:text-slate-800 dark:hover:text-white transition-all duration-200 text-sm font-semibold"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-200/50 dark:bg-gray-700/50 flex items-center justify-center" aria-hidden="true">
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
              </div>
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              type="button"
              onClick={() => { logout(); closeMobileMenu(); }}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50/80 dark:hover:bg-red-900/30 transition-all duration-200 text-sm font-semibold"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-200/50 dark:bg-gray-700/50 group-hover:bg-red-100/80 flex items-center justify-center transition-colors duration-200" aria-hidden="true">
                <LogOut className="w-4 h-4" />
              </div>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Desktop Pill Sidebar ─────────────────────────────────────── */}
      <div className="hidden md:flex md:fixed left-4 top-1/2 -translate-y-1/2 z-30" role="navigation" aria-label="Admin navigation">
        <div className="flex flex-col items-center gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-gray-700/60 py-4 px-2">

          {/* Brand icon */}
          <div className="pb-2 border-b border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <div
                className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20"
                aria-label="Super Admin panel"
                role="img"
              >
                <Shield className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50" aria-hidden="true">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  Super Admin
                </div>
              </div>
            </div>
          </div>

          {/* Back to App */}
          <div className="pb-2 border-b border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <Link
                to="/dashboard"
                className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105"
                aria-label="Back to App"
              >
                <Home className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
              </Link>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50" aria-hidden="true">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shadow-xl">
                  Back to App
                </div>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="pb-2 border-b border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <button
                type="button"
                onClick={toggleTheme}
                className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun className="w-5 h-5 text-amber-500" strokeWidth={2.5} aria-hidden="true" /> : <Moon className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />}
              </button>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50" aria-hidden="true">
                <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                </div>
              </div>
            </div>
          </div>

          {/* All Nav Items */}
          <nav className="flex flex-col items-center gap-2 py-2" aria-label="Main">
            {allItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <div key={item.name} className="relative group">
                  <Link
                    to={item.href}
                    aria-label={item.name}
                    aria-current={active ? 'page' : undefined}
                    className={`w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md ${
                      active
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 scale-105'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
                  </Link>
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50" aria-hidden="true">
                    <div className="bg-gray-900 dark:bg-gray-700 text-white px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shadow-xl">
                      {item.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60">
            <div className="relative group">
              <button
                type="button"
                onClick={logout}
                className="w-11 h-11 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:scale-105"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50" aria-hidden="true">
                <div className="bg-red-600 dark:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
                  Logout
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

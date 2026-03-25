import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt,
  Package,
  Users,
  Shield,
  BarChart3,
  Printer,
  Truck,
  ArrowLeftRight,
  Building2,
  ClipboardList,
  Lock,
  Send,
  RefreshCcw,
  ScanLine,
  UserPlus,
  CreditCard,
  ChevronRight,
  Play,
  Pause,
} from 'lucide-react'
import { viewportOnce } from '@/lib/landing/animations'

// ─── Module data ─────────────────────────────────────────────────────────────

const modules = [
  {
    id: 'billing',
    icon: Receipt,
    label: 'Billing',
    color: 'from-green-500 to-emerald-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    accent: 'text-green-600 dark:text-green-400',
    headline: 'Bill in seconds, not minutes',
    description:
      'Create GST and Non-GST invoices instantly. Product search, auto tax calculation, customer selection, and print — all in one screen.',
    points: [
      'GST (CGST/SGST/IGST) & Non-GST modes',
      'Barcode + name search for products',
      'Auto discount & tax calculation',
      'One-click thermal print & PDF export',
      'Draft bills — save and resume later',
      'Bill exchange and returns',
    ],
    preview: '/screenshots/bill.png',
  },
  {
    id: 'inventory',
    icon: Package,
    label: 'Inventory',
    color: 'from-orange-500 to-amber-600',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800',
    accent: 'text-orange-600 dark:text-orange-400',
    headline: 'Never run out of stock again',
    description:
      'Real-time inventory tracking with automatic deduction on every bill. Low-stock alerts keep you always stocked.',
    points: [
      'Real-time stock levels across all products',
      'Automatic stock deduction on billing',
      'Low-stock alerts on dashboard',
      'Bulk import from Excel',
      'Stock adjustment with reason tracking',
      'Category & HSN code management',
    ],
    preview: '/screenshots/stock.png',
  },
  {
    id: 'suppliers',
    icon: Truck,
    label: 'Suppliers',
    color: 'from-purple-500 to-violet-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    accent: 'text-purple-600 dark:text-purple-400',
    headline: 'Track every delivery, automatically',
    description:
      'Add suppliers, record deliveries with item-level details, and watch your stock update automatically when goods arrive.',
    points: [
      'Supplier directory with contact details',
      'Record deliveries with item quantities',
      'Auto stock addition on delivery completion',
      'Delivery note generation',
      'Full delivery history per supplier',
      'Pending & completed delivery tracking',
    ],
    preview: '/screenshots/suppliers.png',
  },
  {
    id: 'customers',
    icon: Users,
    label: 'Customers',
    color: 'from-pink-500 to-rose-600',
    bg: 'bg-pink-50 dark:bg-pink-950/30',
    border: 'border-pink-200 dark:border-pink-800',
    accent: 'text-pink-600 dark:text-pink-400',
    headline: 'Know your best customers',
    description:
      'A complete customer database with purchase history, contact information, and quick selection during billing.',
    points: [
      'Full customer directory with search',
      'Complete purchase history per customer',
      'Quick select during bill creation',
      'GSTIN support for B2B customers',
      'Import customers from Excel',
      'Customer export for marketing',
    ],
    preview: '/screenshots/cus.png',
  },
  {
    id: 'reports',
    icon: BarChart3,
    label: 'Reports',
    color: 'from-indigo-500 to-blue-600',
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    border: 'border-indigo-200 dark:border-indigo-800',
    accent: 'text-indigo-600 dark:text-indigo-400',
    headline: 'Data that drives decisions',
    description:
      'Sales, revenue, profit, and inventory reports with custom date ranges. Export to Excel or PDF with one click.',
    points: [
      'Daily, weekly & monthly sales reports',
      'GST-ready reports for tax filing',
      'Payment method breakdown',
      'Top selling products analysis',
      'Inventory valuation report',
      'Export to Excel & PDF',
    ],
    preview: '/screenshots/report.png',
  },
  {
    id: 'transfer',
    icon: ArrowLeftRight,
    label: 'Stock Transfer',
    color: 'from-cyan-500 to-teal-600',
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    border: 'border-cyan-200 dark:border-cyan-800',
    accent: 'text-cyan-600 dark:text-cyan-400',
    headline: 'Move stock between branches seamlessly',
    description:
      'Transfer inventory from one branch to another with full tracking. Branch-level stock visibility in real-time.',
    points: [
      'Transfer stock between any branches',
      'Real-time branch stock visibility',
      'Transfer history and audit log',
      'Partial & full transfers supported',
      'Branch-level analytics',
      'Manage branches from one dashboard',
    ],
    preview: '/screenshots/transfer.png',
  },
  {
    id: 'payments',
    icon: CreditCard,
    label: 'Payments',
    color: 'from-sky-500 to-blue-500',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-800',
    accent: 'text-sky-600 dark:text-sky-400',
    headline: 'Every payment method, one bill',
    description:
      'Accept Cash, UPI, Card, Bank Transfer, or Credit. Split a single bill across multiple payment methods.',
    points: [
      'Cash, UPI, Card, Bank Transfer',
      'Credit / Due payments with tracking',
      'Split payments across multiple methods',
      'Partial payment with due balance',
      'Payment type reports',
      'Custom payment type configuration',
    ],
    preview: '/screenshots/bill.png',
  },
  {
    id: 'audit',
    icon: ClipboardList,
    label: 'Audit Trail',
    color: 'from-red-500 to-rose-600',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    accent: 'text-red-600 dark:text-red-400',
    headline: 'Full accountability, zero gaps',
    description:
      'Every action logged with the user name, timestamp, and exact changes. Complete audit trail for compliance and security.',
    points: [
      'Who did what and when — every action',
      'Filter by user, date, or action type',
      'Bill creation, edit, and deletion tracking',
      'Stock change audit logs',
      'User login and session tracking',
      'Export audit logs for compliance',
    ],
    preview: '/screenshots/audit.png',
  },
  {
    id: 'security',
    icon: Lock,
    label: 'Security',
    color: 'from-gray-600 to-slate-700',
    bg: 'bg-gray-50 dark:bg-gray-900/50',
    border: 'border-gray-200 dark:border-gray-700',
    accent: 'text-gray-700 dark:text-gray-300',
    headline: 'Enterprise-grade security, out of the box',
    description:
      'Role-based access, two-factor authentication, session management, and granular permissions for every team member.',
    points: [
      'TOTP-based two-factor authentication',
      '5 role levels: Owner, Admin, Manager, Staff, Cashier',
      '50+ granular permission controls',
      'Session management and forced logout',
      'Force password change on first login',
      'Google OAuth integration',
    ],
    preview: '/screenshots/adduser.png',
  },
  {
    id: 'printing',
    icon: Printer,
    label: 'Printing',
    color: 'from-yellow-500 to-orange-500',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    accent: 'text-yellow-700 dark:text-yellow-400',
    headline: 'Print anything, anywhere',
    description:
      'Thermal printer support, Bluetooth printing, PDF generation, and email sending — all built in with no extra setup.',
    points: [
      '58mm & 80mm thermal printer support',
      'Bluetooth thermal printer (mobile)',
      'PDF bill generation and download',
      'Email bill directly to customer',
      'Customizable receipt header/footer',
      'Silent print (no dialog boxes)',
    ],
    preview: '/screenshots/bill.png',
  },
  {
    id: 'telegram',
    icon: Send,
    label: 'Telegram',
    color: 'from-blue-400 to-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    accent: 'text-blue-600 dark:text-blue-400',
    headline: 'Your daily report, delivered automatically',
    description:
      'Connect your Telegram account and receive automated daily sales summaries, revenue totals, and alerts every morning.',
    points: [
      'Daily sales summary to Telegram',
      'Total revenue and bill count',
      'GST and Non-GST breakdown',
      'Low stock alerts via Telegram',
      'Custom schedule configuration',
      'No extra app needed — just Telegram',
    ],
    preview: '/screenshots/das1.png',
  },
  {
    id: 'team',
    icon: UserPlus,
    label: 'Team',
    color: 'from-teal-500 to-green-600',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-800',
    accent: 'text-teal-600 dark:text-teal-400',
    headline: 'Build your team, define what they see',
    description:
      'Invite staff via email, assign precise roles, and control exactly what every team member can do inside the app.',
    points: [
      'Email-based team invitations',
      'Role assignment on invite',
      'Granular per-permission control',
      'Deactivate/remove team members',
      'Two-factor authentication per user',
      'Force password change for new users',
    ],
    preview: '/screenshots/adduser.png',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

const AUTO_INTERVAL = 5000

export default function ModuleShowcaseSection() {
  const [active, setActive] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startLoop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setActive((p) => (p + 1) % modules.length)
    }, AUTO_INTERVAL)
  }

  useEffect(() => {
    if (isPlaying) startLoop()
    else if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  const handleSelect = (idx: number) => {
    setActive(idx)
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      startLoop()
    }
  }

  const mod = modules[active]
  const Icon = mod.icon

  return (
    <section id="modules" className="py-20 lg:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-50 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

      {/* Animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 right-0 w-[400px] h-[400px] rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}
          animate={{ scale: [1, 1.15, 1], x: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }}
          animate={{ scale: [1, 1.2, 1], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-14"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-semibold mb-4 border border-indigo-200/50 dark:border-indigo-700/30">
            All Modules
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Every Feature You Need,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
              Built Right In
            </span>
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            No plugins, no add-ons. Everything from billing to security is included — just open and use.
          </p>
        </motion.div>

        {/* Main layout: left nav + right panel */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start max-w-7xl mx-auto">

          {/* Left: module pills */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.6 }}
            className="lg:w-64 flex-shrink-0 w-full"
          >
            {/* Play/pause */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                {isPlaying
                  ? <><Pause className="w-3 h-3" /> Auto-cycling</>
                  : <><Play className="w-3 h-3" /> Paused</>
                }
              </button>
            </div>

            <div className="flex flex-row lg:flex-col flex-wrap lg:flex-nowrap gap-1.5 max-h-[400px] overflow-y-auto pr-1">
              {modules.map((m, idx) => {
                const MIcon = m.icon
                const isActive = active === idx
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelect(idx)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left w-full ${
                      isActive
                        ? `bg-gradient-to-r ${m.color} text-white shadow-lg`
                        : 'bg-white dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <MIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{m.label}</span>
                    {isActive && <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </motion.div>

          {/* Right: detail panel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex-1 min-w-0"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={mod.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35 }}
                className={`rounded-2xl border ${mod.border} ${mod.bg} overflow-hidden`}
              >
                {/* Top: headline + points */}
                <div className="p-6 lg:p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${mod.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      <Icon className="w-7 h-7 text-white" strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                        {mod.headline}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {mod.points.map((point, i) => (
                      <motion.div
                        key={point}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-2.5"
                      >
                        <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-br ${mod.color}`} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{point}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Bottom: screenshot preview */}
                <div className="mx-4 lg:mx-6 mb-4 lg:mb-6 rounded-xl overflow-hidden border border-gray-200/60 dark:border-gray-700/60 shadow-md bg-white dark:bg-gray-900">
                  {/* Mini browser chrome */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-3 py-0.5 rounded bg-white/60 dark:bg-gray-700 text-[10px] text-gray-500 dark:text-gray-400 font-mono border border-gray-200 dark:border-gray-600">
                        app.valoryx.in / {mod.id}
                      </div>
                    </div>
                  </div>

                  <img
                    src={mod.preview}
                    alt={mod.label}
                    className="w-full object-cover object-top max-h-[280px]"
                    draggable={false}
                  />
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Progress dots */}
            <div className="flex gap-1.5 mt-4 justify-center lg:justify-start">
              {modules.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className={`rounded-full transition-all duration-300 ${
                    active === idx
                      ? 'w-6 h-2 bg-primary-500'
                      : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-primary-400'
                  }`}
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom: mobile-friendly module grid for at-a-glance */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-16 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
        >
          {modules.map((m, idx) => {
            const MIcon = m.icon
            return (
              <motion.button
                key={m.id}
                onClick={() => {
                  handleSelect(idx)
                  document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth' })
                }}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${
                  active === idx
                    ? `${m.border} ${m.bg} shadow-md`
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
                } transition-all duration-200`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center shadow`}>
                  <MIcon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">
                  {m.label}
                </span>
              </motion.button>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

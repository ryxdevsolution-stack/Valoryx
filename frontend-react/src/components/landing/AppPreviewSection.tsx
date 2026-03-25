import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Maximize2,
  LayoutDashboard,
  Receipt,
  Users,
  UserPlus,
  BarChart2,
  Package,
  Truck,
  ArrowLeftRight,
  ClipboardList,
  Building2,
  FileText,
} from 'lucide-react'
import { viewportOnce } from '@/lib/landing/animations'
import ImageLightboxModal from './ImageLightboxModal'

// ─── Feature card data ───────────────────────────────────────────────────────

const featureCards = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    subtitle: 'Your business at a glance',
    description: 'Real-time revenue, bill count, low-stock alerts, and daily charts — all on one screen.',
    highlights: ['Revenue tracking', 'GST/Non-GST split', 'Trend charts'],
    screenshot: '/screenshots/das1.png',
    color: 'from-sky-500 to-blue-600',
    lightColor: 'bg-sky-50 dark:bg-sky-950/20',
    borderColor: 'border-sky-200 dark:border-sky-800/50',
    span: 'lg:col-span-2', // wide card
  },
  {
    id: 'billing',
    icon: Receipt,
    title: 'GST Billing',
    subtitle: 'Create bills in seconds',
    description: 'Auto GST calculation, barcode scan, customer search, and one-click thermal print.',
    highlights: ['CGST/SGST/IGST', 'Draft & resume', 'Split payments'],
    screenshot: '/screenshots/bill.png',
    color: 'from-green-500 to-emerald-600',
    lightColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800/50',
    span: '',
  },
  {
    id: 'allbills',
    icon: FileText,
    title: 'Bill History',
    subtitle: 'Every invoice, searchable',
    description: 'Browse, filter, and manage all GST and Non-GST invoices. Export any bill to PDF.',
    highlights: ['Search & filter', 'PDF export', 'Bill exchange'],
    screenshot: '/screenshots/allbill.png',
    color: 'from-teal-500 to-cyan-600',
    lightColor: 'bg-teal-50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200 dark:border-teal-800/50',
    span: '',
  },
  {
    id: 'stock',
    icon: Package,
    title: 'Inventory',
    subtitle: 'Never run out of stock',
    description: 'Real-time stock levels with auto-deduction on billing. Low-stock alerts on your dashboard.',
    highlights: ['Auto deduction', 'Low-stock alerts', 'Bulk import'],
    screenshot: '/screenshots/stock.png',
    color: 'from-orange-500 to-amber-600',
    lightColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800/50',
    span: '',
  },
  {
    id: 'suppliers',
    icon: Truck,
    title: 'Suppliers',
    subtitle: 'Manage your supply chain',
    description: 'Add suppliers, record deliveries with item details, and auto-update stock on completion.',
    highlights: ['Supplier directory', 'Delivery tracking', 'Auto stock add'],
    screenshot: '/screenshots/supplier.png',
    color: 'from-purple-500 to-violet-600',
    lightColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800/50',
    span: '',
  },
  {
    id: 'delivery',
    icon: ClipboardList,
    title: 'Delivery Records',
    subtitle: 'Track every delivery',
    description: 'Item-level delivery tracking with notes, dates, and completion status for full accountability.',
    highlights: ['Item quantities', 'Delivery notes', 'Status tracking'],
    screenshot: '/screenshots/delivery record.png',
    color: 'from-rose-500 to-pink-600',
    lightColor: 'bg-rose-50 dark:bg-rose-950/20',
    borderColor: 'border-rose-200 dark:border-rose-800/50',
    span: '',
  },
  {
    id: 'transfer',
    icon: ArrowLeftRight,
    title: 'Stock Transfer',
    subtitle: 'Move stock between branches',
    description: 'Transfer inventory between locations with real-time tracking and branch-level visibility.',
    highlights: ['Branch-to-branch', 'Transfer history', 'Audit trail'],
    screenshot: '/screenshots/stock-transfer.png',
    color: 'from-cyan-500 to-teal-600',
    lightColor: 'bg-cyan-50 dark:bg-cyan-950/20',
    borderColor: 'border-cyan-200 dark:border-cyan-800/50',
    span: '',
  },
  {
    id: 'branches',
    icon: Building2,
    title: 'Branch Management',
    subtitle: 'All branches, one dashboard',
    description: 'Manage multiple store locations — staff, stock, and analytics per branch from one place.',
    highlights: ['Multi-branch', 'Per-branch staff', 'Branch analytics'],
    screenshot: '/screenshots/branch manage.png',
    color: 'from-indigo-500 to-blue-600',
    lightColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800/50',
    span: '',
  },
  {
    id: 'customers',
    icon: Users,
    title: 'Customers',
    subtitle: 'Know your buyers',
    description: 'Full customer directory with purchase history, GSTIN support, and quick selection during billing.',
    highlights: ['Purchase history', 'GSTIN support', 'Quick search'],
    screenshot: '/screenshots/cus.png',
    color: 'from-pink-500 to-rose-600',
    lightColor: 'bg-pink-50 dark:bg-pink-950/20',
    borderColor: 'border-pink-200 dark:border-pink-800/50',
    span: '',
  },
  {
    id: 'reports',
    icon: BarChart2,
    title: 'Reports',
    subtitle: 'Data-driven decisions',
    description: 'Sales, revenue, profit, and GST reports with custom date ranges. Export to Excel or PDF.',
    highlights: ['Custom ranges', 'GST summary', 'Excel export'],
    screenshot: '/screenshots/report.png',
    color: 'from-indigo-500 to-purple-600',
    lightColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800/50',
    span: 'lg:col-span-2', // wide card
  },
  {
    id: 'team',
    icon: UserPlus,
    title: 'Team & Roles',
    subtitle: 'Control who sees what',
    description: 'Invite staff, assign roles (Owner, Admin, Manager, Staff, Cashier) with 50+ granular permissions.',
    highlights: ['5 role levels', '50+ permissions', 'Email invites'],
    screenshot: '/screenshots/adduser.png',
    color: 'from-yellow-500 to-orange-500',
    lightColor: 'bg-yellow-50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800/50',
    span: '',
  },
  {
    id: 'analytics',
    icon: LayoutDashboard,
    title: 'Analytics View',
    subtitle: 'Trends at your fingertips',
    description: 'Daily and monthly trend charts with GST vs Non-GST breakdown and top-selling products.',
    highlights: ['Trend charts', 'Top products', 'Profit margins'],
    screenshot: '/screenshots/das2.png',
    color: 'from-emerald-500 to-green-600',
    lightColor: 'bg-emerald-50 dark:bg-emerald-950/20',
    borderColor: 'border-emerald-200 dark:border-emerald-800/50',
    span: '',
  },
]

const allScreenshots = featureCards.map((c) => ({
  src: c.screenshot,
  label: c.title,
  description: c.description,
}))

// ─── Component ───────────────────────────────────────────────────────────────

export default function AppPreviewSection() {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  return (
    <section id="preview" className="py-20 lg:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900" />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(rgba(14,165,233,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-semibold mb-4 border border-primary-200/50 dark:border-primary-700/30">
            App Screenshots
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            See What&apos;s{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-indigo-600 dark:from-primary-400 dark:to-cyan-400">
              Inside
            </span>
          </h2>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Every module your shop needs, in one clean interface. Click any card to explore.
          </p>
        </motion.div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-7xl mx-auto">
          {featureCards.map((card, index) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.4) }}
                className={`group relative rounded-2xl border ${card.borderColor} ${card.lightColor} overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer ${card.span}`}
                onClick={() => openLightbox(index)}
              >
                {/* Top: Screenshot in browser mockup */}
                <div className="relative">
                  {/* Mini browser chrome */}
                  <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r ${card.color}`}>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-white/30" />
                      <div className="w-2 h-2 rounded-full bg-white/30" />
                      <div className="w-2 h-2 rounded-full bg-white/30" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <span className="text-[10px] text-white/70 font-mono">
                        app.valoryx.in/{card.id}
                      </span>
                    </div>
                    <Maximize2 className="w-3 h-3 text-white/50 group-hover:text-white/90 transition-colors" />
                  </div>

                  {/* Screenshot */}
                  <div className="relative overflow-hidden bg-white dark:bg-gray-900">
                    <img
                      src={card.screenshot}
                      alt={`${card.title} — Valoryx billing software`}
                      className={`w-full object-cover object-top ${card.span ? 'max-h-[260px]' : 'max-h-[200px]'} group-hover:scale-[1.02] transition-transform duration-500`}
                      loading="lazy"
                      draggable={false}
                    />
                    {/* Hover zoom overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                        <Maximize2 className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom: Info */}
                <div className="p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                        {card.title}
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{card.subtitle}</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
                    {card.description}
                  </p>

                  {/* Highlight pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {card.highlights.map((h) => (
                      <span
                        key={h}
                        className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <ImageLightboxModal
          screenshots={allScreenshots}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onPrev={() => setLightboxIndex((i) => (i - 1 + allScreenshots.length) % allScreenshots.length)}
          onNext={() => setLightboxIndex((i) => (i + 1) % allScreenshots.length)}
        />
      )}
    </section>
  )
}

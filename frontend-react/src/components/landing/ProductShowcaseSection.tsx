import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Receipt,
  Package,
  Users,
  BarChart3,
  Truck,
  ArrowLeftRight,
  Building2,
  Lock,
  UserPlus,
  Maximize2,
  ChevronRight,
  Moon,
  Printer,
  Send,
  ScanLine,
  CreditCard,
  Upload,
  Smartphone,
  Wallet,
  Star,
  LogIn,
  Webhook,
  Settings,
  Download,
  RefreshCcw,
  ClipboardList,
  LucideIcon,
} from 'lucide-react'
import { viewportOnce } from '@/lib/landing/animations'
import ImageLightboxModal from './ImageLightboxModal'

// ─── Bento card data ────────────────────────────────────────────────────────

interface BentoCard {
  id: string
  icon: LucideIcon
  title: string
  subtitle: string
  description: string
  highlights: string[]
  screenshot: string
  gradient: string
  size: 'large' | 'medium'
}

const bentoCards: BentoCard[] = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    subtitle: 'Your entire business at a glance',
    description: 'Revenue, bill count, low-stock alerts, daily trend charts, and GST/Non-GST split — all in real time.',
    highlights: ['Revenue tracking', 'Trend charts', 'GST/Non-GST split'],
    screenshot: '/screenshots/das1.png',
    gradient: 'from-sky-500 to-blue-600',
    size: 'large',
  },
  {
    id: 'billing',
    icon: Receipt,
    title: 'GST Billing',
    subtitle: 'Create bills in seconds',
    description: 'Auto CGST/SGST/IGST calculation, barcode scan, split payments, draft bills, and one-click thermal print.',
    highlights: ['Auto tax calc', 'Split payments', 'Thermal print'],
    screenshot: '/screenshots/bill.png',
    gradient: 'from-green-500 to-emerald-600',
    size: 'medium',
  },
  {
    id: 'inventory',
    icon: Package,
    title: 'Inventory',
    subtitle: 'Never run out of stock',
    description: 'Real-time stock with auto-deduction on billing, low-stock alerts, bulk Excel import, and category management.',
    highlights: ['Auto deduction', 'Low-stock alerts', 'Bulk import'],
    screenshot: '/screenshots/stock.png',
    gradient: 'from-orange-500 to-amber-600',
    size: 'medium',
  },
  {
    id: 'reports',
    icon: BarChart3,
    title: 'Reports & Analytics',
    subtitle: 'Data that drives decisions',
    description: 'Daily/monthly reports, GST summaries, top products, payment breakdowns, and instant Excel/PDF export.',
    highlights: ['Custom date ranges', 'GST-ready', 'Excel export'],
    screenshot: '/screenshots/report.png',
    gradient: 'from-indigo-500 to-purple-600',
    size: 'large',
  },
  {
    id: 'suppliers',
    icon: Truck,
    title: 'Suppliers',
    subtitle: 'Track your supply chain',
    description: 'Supplier directory, item-level delivery recording, auto stock update on completion, and full delivery history.',
    highlights: ['Delivery tracking', 'Auto stock add', 'Supplier history'],
    screenshot: '/screenshots/supplier.png',
    gradient: 'from-purple-500 to-violet-600',
    size: 'medium',
  },
  {
    id: 'customers',
    icon: Users,
    title: 'Customers',
    subtitle: 'Know your best buyers',
    description: 'Full customer directory with purchase history, GSTIN support, quick search during billing, and Excel export.',
    highlights: ['Purchase history', 'GSTIN support', 'Quick search'],
    screenshot: '/screenshots/cus.png',
    gradient: 'from-pink-500 to-rose-600',
    size: 'medium',
  },
  {
    id: 'transfer',
    icon: ArrowLeftRight,
    title: 'Stock Transfer',
    subtitle: 'Move stock between branches',
    description: 'Branch-to-branch inventory transfer with real-time tracking, transfer history, and audit trail.',
    highlights: ['Branch-to-branch', 'Transfer history', 'Audit trail'],
    screenshot: '/screenshots/stock-transfer.png',
    gradient: 'from-cyan-500 to-teal-600',
    size: 'large',
  },
  {
    id: 'team',
    icon: UserPlus,
    title: 'Team & Security',
    subtitle: 'Control who sees what',
    description: 'Email invites, 5 role levels, 50+ granular permissions, TOTP 2FA, session management, and Google OAuth.',
    highlights: ['5 role levels', '50+ permissions', '2FA & OAuth'],
    screenshot: '/screenshots/adduser.png',
    gradient: 'from-teal-500 to-green-600',
    size: 'large',
  },
]

// ─── Extra features for the marquee ticker ──────────────────────────────────

interface ExtraFeature {
  icon: LucideIcon
  label: string
}

const extraFeatures: ExtraFeature[] = [
  { icon: Moon, label: 'Dark Mode' },
  { icon: Printer, label: 'Thermal Printing' },
  { icon: Send, label: 'Telegram Reports' },
  { icon: ScanLine, label: 'Barcode Scanner' },
  { icon: CreditCard, label: 'UPI / Card / Cash' },
  { icon: Upload, label: 'Bulk Import/Export' },
  { icon: Smartphone, label: 'Offline & PWA' },
  { icon: Wallet, label: 'Expense Tracking' },
  { icon: Star, label: 'Loyalty Points' },
  { icon: LogIn, label: 'Google OAuth' },
  { icon: Webhook, label: 'Webhooks' },
  { icon: Settings, label: 'Shop Customization' },
  { icon: Download, label: 'Data Export & GDPR' },
  { icon: RefreshCcw, label: 'Bill Exchange & Returns' },
  { icon: ClipboardList, label: 'Full Audit Trail' },
  { icon: Lock, label: 'Two-Factor Auth' },
  { icon: Building2, label: 'Multi-Branch' },
]

// ─── Screenshot data for lightbox ───────────────────────────────────────────

const allScreenshots = bentoCards.map((c) => ({
  src: c.screenshot,
  label: c.title,
  description: c.description,
}))

// ─── Marquee Component ──────────────────────────────────────────────────────

function Marquee({ children, reverse = false }: { children: React.ReactNode; reverse?: boolean }) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div
        className={`flex shrink-0 gap-4 py-2 ${
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        }`}
      >
        {children}
        {children}
      </div>
    </div>
  )
}

// ─── Bento Card Component ───────────────────────────────────────────────────

function BentoGridCard({
  card,
  index,
  onOpenLightbox,
}: {
  card: BentoCard
  index: number
  onOpenLightbox: (idx: number) => void
}) {
  const Icon = card.icon
  const isLarge = card.size === 'large'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.07, 0.35) }}
      onClick={() => onOpenLightbox(index)}
      className={`group relative rounded-2xl border border-gray-200/80 dark:border-gray-700/60 bg-white dark:bg-gray-800/90 overflow-hidden cursor-pointer hover:shadow-2xl hover:shadow-primary-500/10 hover:-translate-y-1 transition-all duration-300 ${
        isLarge ? 'md:col-span-2' : ''
      }`}
    >
      {/* Screenshot area */}
      <div className={`relative overflow-hidden ${isLarge ? 'h-56' : 'h-44'}`}>
        {/* Gradient overlay at top */}
        <div className={`absolute inset-x-0 top-0 h-12 bg-gradient-to-b ${card.gradient} opacity-90 z-10`}>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-white/30" />
              <div className="w-2 h-2 rounded-full bg-white/30" />
              <div className="w-2 h-2 rounded-full bg-white/30" />
            </div>
            <span className="flex-1 text-center text-[10px] text-white/60 font-mono">
              app.valoryx.in/{card.id}
            </span>
            <Maximize2 className="w-3 h-3 text-white/40 group-hover:text-white/80 transition-colors" />
          </div>
        </div>

        <img
          src={card.screenshot}
          alt={`${card.title} — Valoryx billing software for Indian businesses`}
          width={800}
          height={450}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
          draggable={false}
        />

        {/* Hover zoom indicator */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Maximize2 className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      {/* Info area */}
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/10`}>
            <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight truncate">
              {card.title}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{card.subtitle}</p>
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
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700/50 border border-gray-200/80 dark:border-gray-600/50 text-gray-600 dark:text-gray-300"
            >
              <ChevronRight className="w-2.5 h-2.5" />
              {h}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main Section ───────────────────────────────────────────────────────────

export default function ProductShowcaseSection() {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  return (
    <section id="features" className="py-20 lg:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(rgba(14,165,233,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-200/15 dark:bg-primary-500/5 rounded-full blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-200/15 dark:bg-purple-500/5 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
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
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-semibold mb-4 border border-primary-200/50 dark:border-primary-700/30">
            Everything You Need
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-5">
            One Platform,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-500 via-purple-500 to-indigo-600 dark:from-primary-400 dark:via-cyan-400 dark:to-purple-400">
              Every Module
            </span>
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            No plugins, no add-ons. Billing, inventory, suppliers, reports, and security — all built in. Click any card to explore.
          </p>
        </motion.div>

        {/* BentoGrid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 max-w-7xl mx-auto">
          {bentoCards.map((card, index) => (
            <BentoGridCard
              key={card.id}
              card={card}
              index={index}
              onOpenLightbox={openLightbox}
            />
          ))}
        </div>

        {/* Extra features marquee */}
        <div className="mt-14">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={viewportOnce}
            className="text-center text-sm text-gray-500 dark:text-gray-400 font-medium mb-5"
          >
            And {extraFeatures.length} more features built in
          </motion.p>

          <Marquee>
            {extraFeatures.map((feat) => {
              const FIcon = feat.icon
              return (
                <div
                  key={feat.label}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 whitespace-nowrap"
                >
                  <FIcon className="w-4 h-4 text-primary-500 dark:text-primary-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{feat.label}</span>
                </div>
              )
            })}
          </Marquee>

          <div className="mt-3">
            <Marquee reverse>
              {[...extraFeatures].reverse().map((feat) => {
                const FIcon = feat.icon
                return (
                  <div
                    key={feat.label}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 whitespace-nowrap"
                  >
                    <FIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{feat.label}</span>
                  </div>
                )
              })}
            </Marquee>
          </div>
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

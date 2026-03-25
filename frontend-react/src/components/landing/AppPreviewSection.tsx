import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Maximize2,
  LayoutDashboard,
  Receipt,
  Users,
  UserPlus,
  BarChart2,
  Package,
  Zap,
  ShieldCheck,
  Clock,
  Truck,
  ArrowLeftRight,
  ClipboardList,
  Pause,
  Play,
} from 'lucide-react'
import { fadeInUp, staggerContainer, viewportOnce } from '@/lib/landing/animations'
import ImageLightboxModal from './ImageLightboxModal'

// ─── Tab data ────────────────────────────────────────────────────────────────

const tabs = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    color: 'from-sky-500 to-blue-600',
    screenshots: [
      {
        src: '/screenshots/das1.png',
        label: 'Dashboard Overview',
        description: 'Real-time revenue, invoice count, and business KPIs at a glance.',
      },
      {
        src: '/screenshots/das2.png',
        label: 'Analytics View',
        description: 'Daily and monthly trend charts with GST & Non-GST breakdown.',
      },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: Receipt,
    color: 'from-green-500 to-emerald-600',
    screenshots: [
      {
        src: '/screenshots/bill.png',
        label: 'Create Bill',
        description: 'Fast bill creation with auto GST calculation and item search.',
      },
      {
        src: '/screenshots/allbill.png',
        label: 'All Bills',
        description: 'Browse, filter, and manage all your GST and Non-GST invoices.',
      },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icon: Package,
    color: 'from-orange-500 to-amber-600',
    screenshots: [
      {
        src: '/screenshots/stock.png',
        label: 'Stock Management',
        description: 'Track inventory levels, low-stock alerts, and product catalog.',
      },
    ],
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    icon: Truck,
    color: 'from-purple-500 to-violet-600',
    screenshots: [
      {
        src: '/screenshots/suppliers.png',
        label: 'Supplier List',
        description: 'Manage all your suppliers and track delivery history.',
      },
    ],
  },
  {
    id: 'transfer',
    label: 'Stock Transfer',
    icon: ArrowLeftRight,
    color: 'from-cyan-500 to-teal-600',
    screenshots: [
      {
        src: '/screenshots/transfer.png',
        label: 'Stock Transfer',
        description: 'Transfer stock between branches with real-time tracking.',
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    color: 'from-pink-500 to-rose-600',
    screenshots: [
      {
        src: '/screenshots/cus.png',
        label: 'Customer List',
        description: 'Manage your customer directory with contact and billing history.',
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart2,
    color: 'from-indigo-500 to-purple-600',
    screenshots: [
      {
        src: '/screenshots/report.png',
        label: 'Business Reports',
        description: 'Export daily, monthly, and custom-range reports with GST summary.',
      },
    ],
  },
  {
    id: 'audit',
    label: 'Audit',
    icon: ClipboardList,
    color: 'from-red-500 to-rose-600',
    screenshots: [
      {
        src: '/screenshots/audit.png',
        label: 'Audit Trail',
        description: 'Every action logged — who did what, when, and what changed.',
      },
    ],
  },
  {
    id: 'users',
    label: 'Team',
    icon: UserPlus,
    color: 'from-yellow-500 to-orange-500',
    screenshots: [
      {
        src: '/screenshots/adduser.png',
        label: 'Team Management',
        description: 'Create staff accounts with role-based access control.',
      },
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

const AUTO_PLAY_INTERVAL = 4000 // ms per tab

export default function AppPreviewSection() {
  const [activeTab, setActiveTab] = useState(0)
  const [activeScreenshot, setActiveScreenshot] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentTab = tabs[activeTab]
  const currentScreenshots = currentTab.screenshots
  const allScreenshots = tabs.flatMap((t) => t.screenshots)

  // Auto-play: cycle through tabs
  const startAutoPlay = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (progressRef.current) clearInterval(progressRef.current)

    setProgress(0)
    let elapsed = 0
    const TICK = 50

    progressRef.current = setInterval(() => {
      elapsed += TICK
      setProgress(Math.min((elapsed / AUTO_PLAY_INTERVAL) * 100, 100))
    }, TICK)

    intervalRef.current = setInterval(() => {
      elapsed = 0
      setProgress(0)
      setActiveTab((prev) => (prev + 1) % tabs.length)
      setActiveScreenshot(0)
    }, AUTO_PLAY_INTERVAL)
  }

  const stopAutoPlay = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    setProgress(0)
  }

  useEffect(() => {
    if (isPlaying) startAutoPlay()
    else stopAutoPlay()
    return () => { stopAutoPlay() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, activeTab])

  const handleTabChange = (idx: number) => {
    setActiveTab(idx)
    setActiveScreenshot(0)
    if (isPlaying) {
      stopAutoPlay()
      // restart timer from 0
      setTimeout(() => startAutoPlay(), 0)
    }
  }

  const openLightbox = (globalIndex: number) => {
    setLightboxIndex(globalIndex)
    setLightboxOpen(true)
  }

  const getGlobalIndex = (tabIdx: number, ssIdx: number) => {
    let count = 0
    for (let i = 0; i < tabIdx; i++) count += tabs[i].screenshots.length
    return count + ssIdx
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
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
          className="text-center mb-12"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-block px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-semibold mb-4 border border-primary-200/50 dark:border-primary-700/30"
          >
            Live App Preview
          </motion.span>

          <motion.h2
            variants={fadeInUp}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4"
          >
            See It{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-indigo-600 dark:from-primary-400 dark:to-cyan-400">
              In Action
            </span>
          </motion.h2>

          <motion.p
            variants={fadeInUp}
            className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto mb-8"
          >
            From billing to stock to reports — every module your shop needs, in one clean interface.
          </motion.p>

          {/* 3 value pills */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-wrap justify-center gap-3 mb-8"
          >
            {[
              { icon: Zap, text: 'Create a bill in under 30 seconds' },
              { icon: ShieldCheck, text: 'GST & Non-GST billing built-in' },
              { icon: Clock, text: 'Daily reports sent automatically' },
            ].map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 shadow-sm"
              >
                <Icon className="w-4 h-4 text-primary-500" />
                {text}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Tab bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-2 mb-6"
        >
          {tabs.map((tab, idx) => {
            const Icon = tab.icon
            const isActive = activeTab === idx
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(idx)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
                  isActive
                    ? 'bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20'
                    : 'bg-white dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:text-primary-600 dark:hover:text-primary-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </motion.div>

        {/* Auto-play controls */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportOnce}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause auto-play' : 'Resume auto-play'}
          </button>

          {/* Progress bar */}
          {isPlaying && (
            <div className="w-32 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Tab dots */}
          <div className="flex gap-1">
            {tabs.map((_, idx) => (
              <button
                key={idx}
                onClick={() => handleTabChange(idx)}
                className={`rounded-full transition-all duration-300 ${
                  activeTab === idx
                    ? 'w-4 h-2 bg-primary-500'
                    : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-primary-400'
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* Screenshot display */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-5xl mx-auto"
        >
          {/* Browser Chrome Frame */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden">
            {/* Browser header */}
            <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r ${currentTab.color} bg-opacity-10`}>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 rounded-lg bg-white/80 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 font-mono border border-gray-200 dark:border-gray-600 max-w-xs">
                  app.valoryx.in / {currentTab.id}
                </div>
              </div>
              <button
                onClick={() => openLightbox(getGlobalIndex(activeTab, activeScreenshot))}
                className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors"
                title="View full size"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Expand</span>
              </button>
            </div>

            {/* Screenshot image */}
            <div
              className="relative cursor-zoom-in group bg-gray-50 dark:bg-gray-950"
              onClick={() => openLightbox(getGlobalIndex(activeTab, activeScreenshot))}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={`${activeTab}-${activeScreenshot}`}
                  src={currentScreenshots[activeScreenshot].src}
                  alt={currentScreenshots[activeScreenshot].label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="w-full object-contain max-h-[520px]"
                  draggable={false}
                />
              </AnimatePresence>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <Maximize2 className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>

            {/* Caption + sub-tabs */}
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  {currentScreenshots[activeScreenshot].label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {currentScreenshots[activeScreenshot].description}
                </p>
              </div>

              {currentScreenshots.length > 1 && (
                <div className="flex gap-2">
                  {currentScreenshots.map((ss, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveScreenshot(i)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 ${
                        activeScreenshot === i
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500'
                      }`}
                    >
                      {ss.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Thumbnail strip */}
          <div className="flex gap-3 mt-4 overflow-x-auto pb-2 justify-center flex-wrap">
            {tabs.map((tab, tabIdx) =>
              tab.screenshots.map((ss, ssIdx) => {
                const isActive = tabIdx === activeTab && ssIdx === activeScreenshot
                return (
                  <button
                    key={`${tabIdx}-${ssIdx}`}
                    onClick={() => {
                      handleTabChange(tabIdx)
                      setActiveScreenshot(ssIdx)
                    }}
                    className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                      isActive
                        ? 'border-primary-500 shadow-md shadow-primary-500/20 scale-105'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 opacity-70 hover:opacity-100'
                    }`}
                    title={ss.label}
                  >
                    <img
                      src={ss.src}
                      alt={ss.label}
                      className="w-full h-full object-cover object-top"
                      draggable={false}
                    />
                  </button>
                )
              })
            )}
          </div>
        </motion.div>
      </div>

      {/* Modals */}
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

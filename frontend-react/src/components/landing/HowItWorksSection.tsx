import { motion } from 'framer-motion'
import { Download, Settings, ScanLine, LayoutGrid, TrendingUp, LucideIcon } from 'lucide-react'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'

interface Step {
  num: string
  icon: LucideIcon
  title: string
  description: string
}

const steps: Step[] = [
  {
    num: '01',
    icon: Download,
    title: 'Install',
    description: 'One desktop install — or just open it in a browser. Works instantly, online or offline.',
  },
  {
    num: '02',
    icon: Settings,
    title: 'Set up',
    description: 'Add products, customers and suppliers, or import your existing data from Excel.',
  },
  {
    num: '03',
    icon: ScanLine,
    title: 'Sell',
    description: 'Fast counter billing with barcode scanning, UPI QR and thermal printing.',
  },
  {
    num: '04',
    icon: LayoutGrid,
    title: 'Manage',
    description: 'Stock, suppliers, expenses, staff and payroll — all in one place.',
  },
  {
    num: '05',
    icon: TrendingUp,
    title: 'Grow',
    description: 'Real-time reports and dashboards turn daily data into better decisions.',
  },
]

/** "How it works" — five-step process cards with staggered scroll reveal. */
export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-white py-20 sm:py-28">
      {/* faint pastel wash */}
      <div
        aria-hidden="true"
        className="blob-gradient pointer-events-none absolute left-1/2 top-0 h-72 w-[110%] max-w-[1200px] -translate-x-1/2 opacity-30"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border border-ink/10 bg-canvas px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            How it works
          </motion.span>
          <motion.h2 variants={fadeInUp} className="heading-display mt-5 text-4xl sm:text-5xl">
            Live in <span className="text-gradient-accent">five simple steps</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="mx-auto mt-4 max-w-xl font-body text-base text-ink-soft">
            From install to insights — get your counter running today, online or off.
          </motion.p>
        </motion.div>

        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <motion.li
                key={step.num}
                variants={fadeInUp}
                className="group relative flex flex-col rounded-3xl border border-ink/8 bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
              >
                <span className="font-heading text-sm font-bold text-ink-faint/60">
                  {step.num}
                </span>
                <span className="mt-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue/12 to-accent-purple/12 text-accent-purple transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold text-ink">
                  {step.title}
                </h3>
                <p className="mt-1.5 font-body text-sm leading-relaxed text-ink-soft">
                  {step.description}
                </p>
              </motion.li>
            )
          })}
        </motion.ol>
      </div>
    </section>
  )
}

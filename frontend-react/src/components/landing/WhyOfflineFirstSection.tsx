import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { WifiOff, Gauge, ShieldCheck, ScrollText, LucideIcon } from 'lucide-react'
import { fadeInUp, fadeInLeft, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'

interface Value {
  icon: LucideIcon
  title: string
  description: string
}

const values: Value[] = [
  {
    icon: WifiOff,
    title: 'The counter never goes down',
    description: 'Competitors freeze when the internet drops. Valoryx keeps billing offline and syncs the moment you reconnect.',
  },
  {
    icon: ShieldCheck,
    title: 'Trustworthy month-end numbers',
    description: 'Returns, pending payments and expenses all flow into true profit — no Excel reconciliation, no guesswork.',
  },
  {
    icon: ScrollText,
    title: 'Full audit trail + role control',
    description: 'Every create, update and delete is logged per shop. Owner, manager, admin, staff and cashier roles, enforced server-side.',
  },
]

/**
 * "Why offline-first" — factual product value (replaces the old aspirational
 * milestones/stats). Left column lists the differentiators; the right column
 * animates a response-time comparison bar that fills when scrolled into view.
 */
export default function WhyOfflineFirstSection() {
  return (
    <section id="why-offline" className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        {/* Left: copy + values */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border border-ink/10 bg-canvas px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            Built for trust
          </motion.span>
          <motion.h2 variants={fadeInUp} className="heading-display mt-5 text-4xl sm:text-5xl">
            Offline-first is{' '}
            <span className="text-gradient-accent">our moat</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="mt-4 max-w-lg font-body text-base text-ink-soft">
            Desktop reliability and cloud sync in one product — not an either/or.
            That&apos;s why the counter keeps moving when the internet doesn&apos;t.
          </motion.p>

          <div className="mt-8 space-y-5">
            {values.map((value) => {
              const Icon = value.icon
              return (
                <motion.div key={value.title} variants={fadeInLeft} className="flex gap-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue/12 to-accent-purple/12 text-accent-purple">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-heading text-base font-semibold text-ink">
                      {value.title}
                    </h3>
                    <p className="mt-1 font-body text-sm leading-relaxed text-ink-soft">
                      {value.description}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Right: speed comparison */}
        <SpeedComparison />
      </div>
    </section>
  )
}

/** Animated response-time comparison: Valoryx vs always-online apps. */
function SpeedComparison() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  const rows = [
    { label: 'Valoryx (offline-first)', value: '1–20ms', width: '6%', tone: 'from-accent-blue to-accent-purple' },
    { label: 'Always-online apps', value: '3–9s', width: '100%', tone: 'from-ink-faint/60 to-ink-faint/40' },
  ]

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="rounded-3xl border border-ink/8 bg-canvas p-8 shadow-card"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-accent-blue shadow-card">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-heading text-lg font-semibold text-ink">Counter response time</h3>
          <p className="font-body text-sm text-ink-faint">Local SQLite vs always-online round-trips</p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {rows.map((row, i) => (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between font-body text-sm">
              <span className="text-ink-soft">{row.label}</span>
              <span className="font-heading font-semibold text-ink">{row.value}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink/5">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${row.tone}`}
                initial={{ width: 0 }}
                animate={inView ? { width: row.width } : undefined}
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 + i * 0.15 }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-7 rounded-2xl bg-white p-4 text-center font-body text-sm text-ink-soft shadow-card">
        Up to <span className="font-heading font-semibold text-ink">450× faster</span> at
        the counter — bills save in <span className="font-heading font-semibold text-ink">~0.7ms</span> locally.
      </p>
    </motion.div>
  )
}

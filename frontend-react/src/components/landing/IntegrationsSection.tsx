import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { integrations } from '@/config/landing.config'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'

/**
 * Integrations grid — light Rescale-style cards, one per connected service.
 * Cards stagger in on scroll and lift on hover.
 */
export default function IntegrationsSection() {
  return (
    <section id="integrations" className="relative bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="mx-auto mb-12 max-w-2xl text-center"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            Integrations
          </motion.span>
          <motion.h2 variants={fadeInUp} className="heading-display mt-5 text-4xl sm:text-5xl">
            Works with the tools{' '}
            <span className="text-gradient-accent">you already use</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="mx-auto mt-4 max-w-xl font-body text-base text-ink-soft">
            Valoryx connects with popular services out of the box — no extra setup needed.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {integrations.map((item) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.name}
                variants={fadeInUp}
                className="group flex items-start gap-4 rounded-3xl border border-ink/8 bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue/12 to-accent-purple/12 text-accent-purple transition-transform group-hover:scale-110">
                  <Icon className="h-6 w-6" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-base font-semibold text-ink">
                      {item.name}
                    </h3>
                    <ArrowUpRight className="h-4 w-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-1 font-body text-sm leading-relaxed text-ink-soft">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

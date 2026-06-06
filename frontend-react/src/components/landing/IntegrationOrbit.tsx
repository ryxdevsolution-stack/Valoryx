import { motion, useReducedMotion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { integrations } from '@/config/landing.config'

interface IntegrationOrbitProps {
  size?: number
}

/**
 * A slowly rotating orbit of integration icons around a central badge — the
 * Rescale "integration" bento cell. The ring spins; each icon counter-rotates
 * so it stays upright. Reduced-motion users get a static ring.
 */
export default function IntegrationOrbit({ size = 230 }: IntegrationOrbitProps) {
  const reduce = useReducedMotion()
  const items = integrations.slice(0, 6)
  const radius = size / 2 - 26
  const center = size / 2

  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Concentric guide rings */}
      <div className="absolute inset-0 rounded-full border border-dashed border-ink/10" />
      <div className="absolute inset-[18%] rounded-full border border-dashed border-ink/10" />

      {/* Rotating ring of icons */}
      <motion.div
        className="absolute inset-0"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 26, ease: 'linear', repeat: Infinity }}
      >
        {items.map((item, i) => {
          const angle = (i / items.length) * 2 * Math.PI - Math.PI / 2
          const x = center + radius * Math.cos(angle) - 22
          const y = center + radius * Math.sin(angle) - 22
          const Icon = item.icon
          return (
            <motion.div
              key={item.name}
              className="absolute flex h-11 w-11 items-center justify-center rounded-xl border border-ink/8 bg-white shadow-card"
              style={{ left: x, top: y }}
              animate={reduce ? undefined : { rotate: -360 }}
              transition={{ duration: 26, ease: 'linear', repeat: Infinity }}
            >
              <Icon className="h-5 w-5 text-accent-purple" />
            </motion.div>
          )
        })}
      </motion.div>

      {/* Center badge */}
      <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue to-accent-purple text-white shadow-pill">
        <Zap className="h-7 w-7" />
      </div>
    </div>
  )
}

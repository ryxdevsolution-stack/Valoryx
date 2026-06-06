import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

interface CircularProgressProps {
  /** Target fill, 0–100 */
  value: number
  /** Diameter in px */
  size?: number
  /** Ring thickness in px */
  stroke?: number
  /** Big label rendered in the centre (defaults to `{value}%`) */
  centerLabel?: string
  /** Small caption under the centre label */
  caption?: string
  gradientId?: string
}

/**
 * Animated circular progress ring (Rescale bento "stats" cell). The arc draws
 * itself via stroke-dashoffset when scrolled into view; honours reduced motion.
 */
export default function CircularProgress({
  value,
  size = 150,
  stroke = 14,
  centerLabel,
  caption,
  gradientId = 'cp-grad',
}: CircularProgressProps) {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()

  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const target = circumference * (1 - Math.min(Math.max(value, 0), 100) / 100)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5B8DEF" />
            <stop offset="55%" stopColor="#8B7CF6" />
            <stop offset="100%" stopColor="#EC8FC0" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E9ECF4"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={inView ? { strokeDashoffset: target } : undefined}
          // reduced motion: snap to the target instantly instead of drawing
          transition={{ duration: reduce ? 0 : 1.4, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-heading text-2xl font-bold text-ink">
          {centerLabel ?? `${value}%`}
        </span>
        {caption && (
          <span className="mt-0.5 font-body text-[0.7rem] font-medium text-ink-faint">
            {caption}
          </span>
        )}
      </div>
    </div>
  )
}

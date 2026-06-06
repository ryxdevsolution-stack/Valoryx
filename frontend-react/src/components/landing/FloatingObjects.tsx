import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'

/**
 * Decorative pastel "flying objects" that float around the hero — a CSS/gradient
 * recreation of the Rescale template's 3D blobs (the originals are Framer-hosted
 * assets and can't be reused). Each blob floats in place and drifts subtly on
 * scroll for depth. Purely decorative, so the layer is aria-hidden and ignores
 * pointer events.
 */

interface Blob {
  /** Tailwind positioning classes */
  className: string
  size: number
  gradient: string
  /** Parallax strength (px of vertical drift across the scroll range) */
  depth: number
  /** Float loop duration (s) */
  duration: number
  /** Soft rounded-organic shape via border-radius */
  radius: string
  rotate?: number
}

const BLOBS: Blob[] = [
  {
    className: 'left-[4%] top-[58%]',
    size: 150,
    gradient: 'linear-gradient(150deg, #BFD4FF 0%, #9DB8FF 45%, #C9B8FF 100%)',
    depth: 60,
    duration: 7,
    radius: '60% 40% 55% 45% / 55% 50% 50% 45%',
    rotate: -12,
  },
  {
    className: 'left-[9%] top-[30%]',
    size: 84,
    gradient: 'linear-gradient(150deg, #A9C7FF 0%, #C9B8FF 100%)',
    depth: 100,
    duration: 9,
    radius: '52% 48% 42% 58% / 50% 45% 55% 50%',
    rotate: 8,
  },
  {
    className: 'right-[5%] top-[52%]',
    size: 132,
    gradient: 'linear-gradient(150deg, #C9B8FF 0%, #B7A6FF 50%, #F5B9D6 100%)',
    depth: 80,
    duration: 8,
    radius: '46% 54% 60% 40% / 52% 44% 56% 48%',
    rotate: 14,
  },
  {
    className: 'right-[10%] top-[28%]',
    size: 70,
    gradient: 'linear-gradient(150deg, #F5C7DE 0%, #C9B8FF 100%)',
    depth: 130,
    duration: 6.5,
    radius: '50%',
    rotate: 0,
  },
  {
    className: 'right-[18%] top-[68%]',
    size: 54,
    gradient: 'linear-gradient(150deg, #A9C7FF 0%, #8FB3FF 100%)',
    depth: 160,
    duration: 10,
    radius: '54% 46% 48% 52% / 46% 54% 46% 54%',
    rotate: -6,
  },
]

export default function FloatingObjects() {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {BLOBS.map((blob, i) => (
        <ParallaxBlob
          key={i}
          blob={blob}
          progress={scrollYProgress}
          reduceMotion={!!reduceMotion}
        />
      ))}
    </div>
  )
}

function ParallaxBlob({
  blob,
  progress,
  reduceMotion,
}: {
  blob: Blob
  progress: ReturnType<typeof useScroll>['scrollYProgress']
  reduceMotion: boolean
}) {
  // Drift downward as the hero scrolls away — creates depth/parallax.
  const y = useTransform(progress, [0, 1], [0, blob.depth])

  return (
    <motion.div
      className={`absolute ${blob.className}`}
      style={{ y: reduceMotion ? 0 : y }}
    >
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -16, 0] }}
        transition={{
          duration: blob.duration,
          ease: 'easeInOut',
          repeat: Infinity,
        }}
        style={{
          width: blob.size,
          height: blob.size,
          background: blob.gradient,
          borderRadius: blob.radius,
          transform: `rotate(${blob.rotate ?? 0}deg)`,
          boxShadow:
            '0 24px 60px -18px rgba(123, 116, 246, 0.5), inset 0 -10px 24px rgba(255,255,255,0.45), inset 0 10px 20px rgba(123,116,246,0.25)',
        }}
      />
    </motion.div>
  )
}

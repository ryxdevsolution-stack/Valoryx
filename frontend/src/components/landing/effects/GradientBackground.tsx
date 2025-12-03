'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface GradientOrbProps {
  color: string
  size: string
  position: { x: string; y: string }
  blur?: string
  animate?: boolean
  delay?: number
}

function GradientOrb({ color, size, position, blur = '100px', animate = true, delay = 0 }: GradientOrbProps) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: position.x,
        top: position.y,
        background: color,
        filter: `blur(${blur})`,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={
        animate
          ? {
              opacity: [0.4, 0.6, 0.4],
              scale: [1, 1.1, 1],
              x: [0, 20, -20, 0],
              y: [0, -20, 20, 0],
            }
          : { opacity: 0.5, scale: 1 }
      }
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
    />
  )
}

// Figma-style mesh gradient background
export function MeshGradientBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />

      {/* Mesh gradient orbs */}
      <GradientOrb
        color="radial-gradient(circle, rgba(14, 165, 233, 0.4) 0%, transparent 70%)"
        size="800px"
        position={{ x: '-10%', y: '-20%' }}
        blur="120px"
        delay={0}
      />
      <GradientOrb
        color="radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, transparent 70%)"
        size="600px"
        position={{ x: '60%', y: '10%' }}
        blur="100px"
        delay={2}
      />
      <GradientOrb
        color="radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)"
        size="500px"
        position={{ x: '20%', y: '60%' }}
        blur="80px"
        delay={4}
      />
      <GradientOrb
        color="radial-gradient(circle, rgba(236, 72, 153, 0.25) 0%, transparent 70%)"
        size="400px"
        position={{ x: '80%', y: '70%' }}
        blur="90px"
        delay={1}
      />

      {/* Noise overlay for texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  )
}

// Aurora/Northern lights effect
export function AuroraBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-slate-950" />

      {/* Aurora waves */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(14, 165, 233, 0.1) 20%, rgba(139, 92, 246, 0.15) 40%, rgba(6, 182, 212, 0.1) 60%, transparent 80%)',
        }}
        animate={{
          opacity: [0.5, 0.8, 0.5],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Animated aurora strips */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-full h-1/3"
          style={{
            top: `${10 + i * 15}%`,
            background: `linear-gradient(90deg,
              transparent 0%,
              rgba(14, 165, 233, ${0.1 + i * 0.02}) ${20 + i * 5}%,
              rgba(139, 92, 246, ${0.15 + i * 0.02}) 50%,
              rgba(6, 182, 212, ${0.1 + i * 0.02}) ${70 - i * 5}%,
              transparent 100%
            )`,
            filter: 'blur(40px)',
          }}
          animate={{
            x: ['-10%', '10%', '-10%'],
            opacity: [0.3, 0.6, 0.3],
            scaleY: [1, 1.5, 1],
          }}
          transition={{
            duration: 8 + i * 2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.5,
          }}
        />
      ))}

      {/* Stars - using deterministic positions to avoid hydration mismatch */}
      <div className="absolute inset-0">
        {[...Array(50)].map((_, i) => {
          // Deterministic pseudo-random positions based on index
          const left = ((i * 17 + 23) % 100)
          const top = ((i * 31 + 7) % 100)
          const duration = 2 + (i % 5) * 0.5
          const delay = (i % 8) * 0.25
          return (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{
                left: `${left}%`,
                top: `${top}%`,
              }}
              animate={{
                opacity: [0.2, 0.8, 0.2],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration,
                repeat: Infinity,
                delay,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// Gradient grid pattern (like Linear.app)
export function GridBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* Base */}
      <div className="absolute inset-0 bg-white dark:bg-slate-950" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.15]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(14, 165, 233, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14, 165, 233, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 dark:via-slate-950/50 to-white dark:to-slate-950" />

      {/* Radial fade */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 0%, white 70%)',
        }}
      />
    </div>
  )
}

// Dot pattern background
export function DotPatternBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-white dark:bg-slate-950" />

      {/* Dot pattern */}
      <div
        className="absolute inset-0 opacity-20 dark:opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle, #0ea5e9 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Center glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(14, 165, 233, 0.15) 0%, transparent 50%)',
        }}
      />
    </div>
  )
}

// Animated gradient border (like Stripe)
export function GradientBorderCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className={`relative p-[1px] rounded-2xl overflow-hidden ${className}`}>
      {/* Animated gradient border */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, #0ea5e9, #8b5cf6, #06b6d4, #0ea5e9)',
          backgroundSize: '300% 100%',
        }}
        animate={
          mounted
            ? {
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }
            : {}
        }
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Inner content */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl">{children}</div>
    </div>
  )
}

// Spotlight effect (follows cursor on hover)
export function SpotlightCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Spotlight */}
      <motion.div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(14, 165, 233, 0.15), transparent 40%)`,
        }}
        animate={{ opacity: isHovered ? 1 : 0 }}
      />

      {children}
    </div>
  )
}

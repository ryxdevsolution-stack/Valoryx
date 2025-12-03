'use client'

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'
import {
  Receipt,
  CreditCard,
  Package,
  TrendingUp,
  Shield,
  Zap,
  Star,
  Check,
  ArrowRight,
} from 'lucide-react'

// 3D Floating card that responds to mouse
export function Floating3DCard({
  children,
  className = '',
  intensity = 10,
}: {
  children: React.ReactNode
  className?: string
  intensity?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [intensity, -intensity]), {
    stiffness: 150,
    damping: 20,
  })
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-intensity, intensity]), {
    stiffness: 150,
    damping: 20,
  })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    mouseX.set(x)
    mouseY.set(y)
  }

  const handleMouseLeave = () => {
    mouseX.set(0)
    mouseY.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={`${className}`}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.div>
  )
}

// Floating icons background
export function FloatingIcons({ className = '' }: { className?: string }) {
  const icons = [
    { Icon: Receipt, color: 'text-primary-500', size: 32 },
    { Icon: CreditCard, color: 'text-purple-500', size: 28 },
    { Icon: Package, color: 'text-cyan-500', size: 36 },
    { Icon: TrendingUp, color: 'text-green-500', size: 30 },
    { Icon: Shield, color: 'text-indigo-500', size: 34 },
    { Icon: Zap, color: 'text-yellow-500', size: 26 },
    { Icon: Star, color: 'text-orange-500', size: 24 },
    { Icon: Check, color: 'text-emerald-500', size: 28 },
  ]

  const positions = [
    { x: '10%', y: '15%' },
    { x: '85%', y: '20%' },
    { x: '15%', y: '75%' },
    { x: '90%', y: '70%' },
    { x: '5%', y: '45%' },
    { x: '95%', y: '45%' },
    { x: '25%', y: '10%' },
    { x: '75%', y: '85%' },
  ]

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {icons.map((item, index) => (
        <motion.div
          key={index}
          className={`absolute ${item.color} opacity-20 dark:opacity-10`}
          style={{
            left: positions[index].x,
            top: positions[index].y,
          }}
          animate={{
            y: [0, -20, 0],
            rotate: [0, 10, -10, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 5 + index,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.3,
          }}
        >
          <item.Icon size={item.size} />
        </motion.div>
      ))}
    </div>
  )
}

// Animated geometric shapes
export function GeometricShapes({ className = '' }: { className?: string }) {
  const shapes = [
    {
      type: 'circle',
      size: 100,
      x: '10%',
      y: '20%',
      color: 'rgba(14, 165, 233, 0.1)',
      duration: 8,
    },
    {
      type: 'square',
      size: 80,
      x: '80%',
      y: '15%',
      color: 'rgba(139, 92, 246, 0.1)',
      duration: 10,
    },
    {
      type: 'triangle',
      size: 60,
      x: '85%',
      y: '70%',
      color: 'rgba(6, 182, 212, 0.1)',
      duration: 7,
    },
    {
      type: 'circle',
      size: 120,
      x: '15%',
      y: '75%',
      color: 'rgba(236, 72, 153, 0.08)',
      duration: 9,
    },
    {
      type: 'hexagon',
      size: 70,
      x: '50%',
      y: '10%',
      color: 'rgba(34, 197, 94, 0.1)',
      duration: 11,
    },
  ]

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {shapes.map((shape, index) => (
        <motion.div
          key={index}
          className="absolute"
          style={{
            left: shape.x,
            top: shape.y,
            width: shape.size,
            height: shape.size,
          }}
          animate={{
            y: [0, -30, 0],
            rotate: [0, 180, 360],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: shape.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.5,
          }}
        >
          {shape.type === 'circle' && (
            <div
              className="w-full h-full rounded-full"
              style={{ backgroundColor: shape.color }}
            />
          )}
          {shape.type === 'square' && (
            <div
              className="w-full h-full rounded-lg"
              style={{ backgroundColor: shape.color }}
            />
          )}
          {shape.type === 'triangle' && (
            <div
              className="w-0 h-0"
              style={{
                borderLeft: `${shape.size / 2}px solid transparent`,
                borderRight: `${shape.size / 2}px solid transparent`,
                borderBottom: `${shape.size}px solid ${shape.color}`,
              }}
            />
          )}
          {shape.type === 'hexagon' && (
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <polygon
                points="50,3 95,25 95,75 50,97 5,75 5,25"
                fill={shape.color}
              />
            </svg>
          )}
        </motion.div>
      ))}
    </div>
  )
}

// Floating glassmorphic cards (Figma-style)
export function FloatingCards({ className = '' }: { className?: string }) {
  const cards = [
    {
      x: '5%',
      y: '20%',
      rotate: -12,
      content: { icon: Receipt, label: 'Invoice Created', value: '₹12,450' },
    },
    {
      x: '80%',
      y: '25%',
      rotate: 8,
      content: { icon: TrendingUp, label: 'Sales Up', value: '+24%' },
    },
    {
      x: '8%',
      y: '65%',
      rotate: 15,
      content: { icon: Package, label: 'Stock Alert', value: '5 items' },
    },
    {
      x: '75%',
      y: '70%',
      rotate: -8,
      content: { icon: Check, label: 'GST Filed', value: 'Success' },
    },
  ]

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {cards.map((card, index) => (
        <motion.div
          key={index}
          className="absolute"
          style={{ left: card.x, top: card.y }}
          initial={{ opacity: 0, y: 50 }}
          animate={{
            opacity: [0.6, 0.8, 0.6],
            y: [0, -15, 0],
            rotate: [card.rotate, card.rotate + 3, card.rotate],
          }}
          transition={{
            duration: 5 + index,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.7,
          }}
        >
          <div className="px-4 py-3 rounded-xl bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/20 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary-500/20 to-purple-500/20">
                <card.content.icon className="w-4 h-4 text-primary-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">{card.content.label}</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {card.content.value}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Orbit animation (like a solar system)
export function OrbitRings({ className = '' }: { className?: string }) {
  const orbits = [
    { radius: 150, duration: 20, items: 3, color: 'rgba(14, 165, 233, 0.3)' },
    { radius: 250, duration: 30, items: 4, color: 'rgba(139, 92, 246, 0.2)' },
    { radius: 350, duration: 40, items: 5, color: 'rgba(6, 182, 212, 0.15)' },
  ]

  return (
    <div className={`absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none ${className}`}>
      {/* Center glow */}
      <div className="absolute w-32 h-32 rounded-full bg-gradient-to-r from-primary-500/30 to-purple-500/30 blur-2xl" />

      {orbits.map((orbit, orbitIndex) => (
        <motion.div
          key={orbitIndex}
          className="absolute rounded-full border border-dashed"
          style={{
            width: orbit.radius * 2,
            height: orbit.radius * 2,
            borderColor: orbit.color,
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: orbit.duration,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {[...Array(orbit.items)].map((_, itemIndex) => (
            <motion.div
              key={itemIndex}
              className="absolute w-3 h-3 rounded-full"
              style={{
                left: '50%',
                top: 0,
                marginLeft: -6,
                marginTop: -6,
                background: `linear-gradient(135deg, ${orbit.color.replace('0.', '0.8')}, ${orbit.color})`,
                transform: `rotate(${(360 / orbit.items) * itemIndex}deg) translateY(${orbit.radius}px)`,
                transformOrigin: 'center center',
              }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: itemIndex * 0.3,
              }}
            />
          ))}
        </motion.div>
      ))}
    </div>
  )
}

// Animated arrow/flow lines
export function FlowLines({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(14, 165, 233, 0)" />
            <stop offset="50%" stopColor="rgba(14, 165, 233, 0.5)" />
            <stop offset="100%" stopColor="rgba(14, 165, 233, 0)" />
          </linearGradient>
        </defs>

        {/* Animated paths */}
        {[...Array(3)].map((_, i) => (
          <motion.path
            key={i}
            d={`M0,${100 + i * 150} Q${300 + i * 100},${50 + i * 100} ${600 + i * 50},${150 + i * 100} T1200,${100 + i * 150}`}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.3 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              repeatType: 'loop',
              ease: 'easeInOut',
              delay: i * 1,
            }}
          />
        ))}
      </svg>
    </div>
  )
}

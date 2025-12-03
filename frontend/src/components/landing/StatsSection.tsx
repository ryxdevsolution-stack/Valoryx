'use client'

import { motion } from 'framer-motion'
import { stats } from '@/config/landing.config'
import { viewportOnce, getStaggerDelay } from '@/lib/landing/animations'
import AnimatedCounter from './AnimatedCounter'

export default function StatsSection() {
  return (
    <section className="py-20 lg:py-28 relative overflow-hidden">
      {/* Gradient Background with Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary-600 via-primary-500 to-indigo-600" />

      {/* Aurora Effect */}
      <div className="absolute inset-0">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-full h-1/2"
            style={{
              top: `${20 + i * 20}%`,
              background: `linear-gradient(90deg,
                transparent 0%,
                rgba(255,255,255,${0.05 + i * 0.02}) 30%,
                rgba(139,92,246,${0.1 + i * 0.03}) 50%,
                rgba(6,182,212,${0.08 + i * 0.02}) 70%,
                transparent 100%
              )`,
              filter: 'blur(60px)',
            }}
            animate={{
              x: ['-20%', '20%', '-20%'],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 10 + i * 3,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 2,
            }}
          />
        ))}
      </div>

      {/* Orbit Rings */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        {[300, 450, 600].map((radius, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-dashed border-white/10"
            style={{
              width: radius,
              height: radius,
            }}
            animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
            transition={{
              duration: 30 + i * 10,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            {/* Orbit dots */}
            {[...Array(3 + i)].map((_, j) => (
              <div
                key={j}
                className="absolute w-2 h-2 bg-white/30 rounded-full"
                style={{
                  left: '50%',
                  top: 0,
                  transform: `rotate(${(360 / (3 + i)) * j}deg) translateY(${radius / 2}px)`,
                  transformOrigin: `center ${radius / 2}px`,
                }}
              />
            ))}
          </motion.div>
        ))}
      </div>

      {/* Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Glowing orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-64 h-64 bg-white/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.6, delay: getStaggerDelay(index, 0.15) }}
              whileHover={{ scale: 1.05 }}
              className="text-center group cursor-pointer"
            >
              {/* Glass card effect */}
              <div className="relative p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 group-hover:bg-white/10 group-hover:border-white/20 transition-all duration-300">
                {/* Glow effect on hover */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative">
                  <motion.div
                    className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-2"
                    whileHover={{ scale: 1.02 }}
                  >
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} duration={2000} />
                  </motion.div>
                  <div className="text-lg sm:text-xl font-semibold text-white/90 mb-1">
                    {stat.label}
                  </div>
                  <div className="text-sm text-white/60">{stat.description}</div>
                </div>

                {/* Bottom accent */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-cyan-400 to-purple-400 group-hover:w-3/4 transition-all duration-500" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

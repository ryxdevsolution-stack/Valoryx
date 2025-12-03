'use client'

import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'
import { siteConfig, trustItems, stats } from '@/config/landing.config'
import { viewportOnce } from '@/lib/landing/animations'

export default function CTASection() {
  const businessCount = stats[0].value

  return (
    <section className="py-24 lg:py-36 relative overflow-hidden">
      {/* Dark Base */}
      <div className="absolute inset-0 bg-slate-950" />

      {/* Aurora Background Effect */}
      <div className="absolute inset-0">
        {/* Aurora Waves */}
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

        {/* Animated Aurora Strips */}
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
        {[...Array(30)].map((_, i) => {
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

      {/* Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-[100px]"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/20 rounded-full blur-[80px]"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge with Animation */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, type: 'spring' }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10 text-white text-sm font-medium mb-8"
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
            </motion.div>
            Join {businessCount}+ businesses already using {siteConfig.name}
          </motion.div>

          {/* Headline with Gradient */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-6 leading-tight"
          >
            Ready to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 via-cyan-400 to-purple-400">
              Transform
            </span>
            <br />
            Your Business?
          </motion.h2>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-white/70 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            Start your free trial today and see why Indian businesses choose {siteConfig.name}{' '}
            for their invoicing and inventory needs.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
          >
            {/* Primary CTA with Glow */}
            <Link
              href={siteConfig.routes.register}
              className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold shadow-2xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
            >
              {/* Gradient Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500 via-cyan-500 to-purple-500" />

              {/* Shimmer */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent" />

              {/* Glow Effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-primary-400/50 via-cyan-400/50 to-purple-400/50 blur-xl" />

              <span className="relative text-white flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Start Your Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            {/* Secondary CTA */}
            <Link
              href={siteConfig.routes.login}
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 hover:border-white/40 text-white font-semibold backdrop-blur-sm transition-all duration-300 hover:bg-white/5"
            >
              Sign In
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Link>
          </motion.div>

          {/* Trust Items */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
          >
            {trustItems.map((item, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={viewportOnce}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                {item}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

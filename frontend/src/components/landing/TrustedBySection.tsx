'use client'

import { motion } from 'framer-motion'
import { industries, trustBadges, stats } from '@/config/landing.config'
import { viewportOnce, getStaggerDelay } from '@/lib/landing/animations'

export default function TrustedBySection() {
  const businessCount = stats[0].value // Get from stats config

  return (
    <section className="py-16 lg:py-20 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gray-50 dark:bg-gray-900/50" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
            Trusted by{' '}
            <span className="text-primary-600 dark:text-primary-400 font-bold">{businessCount}+</span>{' '}
            businesses across India
          </p>
        </motion.div>

        {/* Industry Icons */}
        <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-16">
          {industries.map((industry, index) => (
            <motion.div
              key={industry.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ duration: 0.5, delay: getStaggerDelay(index) }}
              className="group flex flex-col items-center gap-3"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center group-hover:scale-110 group-hover:shadow-xl transition-all duration-300">
                <industry.icon className="w-8 h-8 text-gray-400 dark:text-gray-500 group-hover:text-primary-500 transition-colors" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                {industry.name}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="mt-12 pt-12 border-t border-gray-200 dark:border-gray-700/50">
          <div className="flex flex-wrap justify-center items-center gap-6 lg:gap-12 text-sm text-gray-500 dark:text-gray-400">
            {trustBadges.map((badge, index) => (
              <span key={badge.label} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full bg-${badge.color}-500`} />
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

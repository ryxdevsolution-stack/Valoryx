import { motion } from 'framer-motion'
import { integrations } from '@/config/landing.config'
import { viewportOnce, getStaggerDelay } from '@/lib/landing/animations'

export default function IntegrationsSection() {
  return (
    <section id="integrations" className="py-16 lg:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gray-50 dark:bg-gray-900/50" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-semibold mb-4 border border-primary-200/50 dark:border-primary-700/30">
            Integrations
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Works With the Tools You Already Use
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Valoryx connects with popular services out of the box — no extra setup needed.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
          {integrations.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ duration: 0.4, delay: getStaggerDelay(index) }}
                className="group flex flex-col items-center gap-3 p-5 rounded-2xl bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-center">
                  {item.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 text-center leading-tight">
                  {item.description}
                </span>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

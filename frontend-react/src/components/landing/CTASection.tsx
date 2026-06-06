import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { siteConfig, trustItems } from '@/config/landing.config'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'
import DownloadButton from './DownloadButton'

/**
 * Closing CTA — a soft pastel band ("Ready? Let's talk") with pill buttons.
 * No fabricated adoption counts; trust line is factual.
 */
export default function CTASection() {
  return (
    <section className="relative overflow-hidden bg-canvas py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="relative overflow-hidden rounded-[2.5rem] border border-ink/8 bg-white px-6 py-16 text-center shadow-soft sm:px-12 sm:py-20"
        >
          {/* Pastel wash */}
          <div
            aria-hidden="true"
            className="blob-gradient pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[120%] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 opacity-60"
          />

          <div className="relative">
            <motion.h2 variants={fadeInUp} className="heading-display mx-auto max-w-2xl text-4xl sm:text-5xl lg:text-6xl">
              Ready to <span className="text-gradient-accent">transform</span> your shop?
            </motion.h2>
            <motion.p variants={fadeInUp} className="mx-auto mt-5 max-w-xl font-body text-base text-ink-soft sm:text-lg">
              Start your free trial today and run your entire counter — online or
              offline — from one app built for Indian retail.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                to={siteConfig.routes.register}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-3.5 font-body text-sm font-semibold text-white shadow-pill transition-all hover:scale-[1.03] hover:bg-[#3a4666]"
              >
                Start Your Free Trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <DownloadButton className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-white/70 px-7 py-3.5 font-body text-sm font-semibold text-ink backdrop-blur-sm transition-all hover:border-ink/30 hover:bg-white">
                <Download className="h-4 w-4" />
                Download for Windows
              </DownloadButton>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-body text-sm text-ink-faint"
            >
              {trustItems.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-accent-blue" />
                  {item}
                </span>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

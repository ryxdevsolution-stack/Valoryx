import { motion } from 'framer-motion'
import { ArrowRight, Play, CheckCircle2, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import { siteConfig, trustItems } from '@/config/landing.config'
import { fadeInUp, staggerContainer } from '@/lib/landing/animations'
import FloatingObjects from './FloatingObjects'
import PlasmaWave from '@/components/effects/PlasmaWave'

/**
 * Centered Rescale-style hero: oversized Manrope headline with a gradient
 * highlight, pill CTAs, factual trust line (no fabricated social proof), and a
 * framed product screenshot surrounded by floating pastel objects.
 */
export default function HeroSection({ onWatchDemo }: { onWatchDemo?: () => void }) {
  return (
    <section className="relative overflow-hidden bg-canvas pb-10 pt-32 sm:pt-36 lg:pb-16">
      {/* Animated plasma background (kept subtle so the light theme stays readable) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_100%)]"
      >
        <PlasmaWave colors={['#5227FF', '#9b4fa8']} speed1={0.05} speed2={0.05} />
      </div>

      {/* Soft pastel wash behind the hero */}
      <div
        aria-hidden="true"
        className="blob-gradient pointer-events-none absolute left-1/2 top-[-6rem] h-[640px] w-[120%] max-w-[1400px] -translate-x-1/2 opacity-70"
      />

      {/* Floating decorative objects (parallax) */}
      <FloatingObjects />

      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
          {/* Eyebrow badge */}
          <motion.div variants={fadeInUp}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-4 py-1.5 text-xs font-semibold text-ink-soft backdrop-blur-sm sm:text-sm">
              <Wifi className="h-3.5 w-3.5 text-accent-blue" />
              Offline-first POS & billing for Indian retail
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeInUp}
            className="heading-display mx-auto max-w-4xl text-[2.75rem] leading-[1.04] sm:text-6xl lg:text-7xl"
          >
            Run your entire shop —{' '}
            <span className="text-gradient-accent">online or offline</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-6 max-w-2xl font-body text-base text-ink-soft sm:text-lg"
          >
            Billing, stock, suppliers, staff and reports in one app that keeps
            working even when the internet doesn&apos;t. Bills save locally in
            milliseconds, then sync to the cloud automatically.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={fadeInUp}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              to={siteConfig.routes.register}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-3.5 font-body text-sm font-semibold text-white shadow-pill transition-all hover:scale-[1.03] hover:bg-[#3a4666]"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={onWatchDemo}
              className="group inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-white/70 px-7 py-3.5 font-body text-sm font-semibold text-ink backdrop-blur-sm transition-all hover:border-ink/30 hover:bg-white"
            >
              <Play className="h-4 w-4 text-accent-purple" />
              Watch Demo
            </button>
          </motion.div>

          {/* Factual trust line (no avatars / ratings) */}
          <motion.div
            variants={fadeInUp}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-body text-sm text-ink-faint"
          >
            {trustItems.slice(0, 3).map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent-blue" />
                {item}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Product screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 26, stiffness: 70, delay: 0.35 }}
          className="relative z-10 mx-auto mt-14 max-w-4xl"
        >
          <div className="overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white p-2 shadow-soft sm:p-3">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF6058]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              <span className="mx-auto rounded-full bg-canvas px-4 py-1 font-body text-[0.7rem] text-ink-faint">
                {siteConfig.appUrl}
              </span>
            </div>
            <img
              src={`${import.meta.env.BASE_URL}screenshots/das1.png`}
              alt="Valoryx dashboard — sales, profit and inventory at a glance"
              className="w-full rounded-2xl border border-ink/5"
              loading="eager"
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

import { motion } from 'framer-motion'
import { Receipt, FileText, WifiOff, RefreshCw, Check } from 'lucide-react'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'
import CircularProgress from './CircularProgress'
import IntegrationOrbit from './IntegrationOrbit'

/**
 * Feature bento grid — the Rescale "Powerful, simple" section, mapped to real
 * Valoryx capabilities. A tall billing cell anchors the left; the remaining
 * cells showcase speed (animated ring), integrations (orbit), GST reports and
 * offline-first sync. Cards reveal on scroll.
 */
export default function FeatureBentoSection() {
  return (
    <section id="features" className="relative bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <SectionHeader />

        {/* Bento */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="grid auto-rows-[minmax(210px,auto)] grid-cols-1 gap-4 md:grid-cols-3"
        >
          {/* Billing — tall anchor cell */}
          <motion.article
            variants={fadeInUp}
            className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-ink/8 bg-white p-7 shadow-card transition-shadow hover:shadow-card-hover md:row-span-2"
          >
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-blue/10 text-accent-blue">
                <Receipt className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-heading text-2xl font-semibold tracking-tight text-ink">
                Bill in seconds
              </h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink-soft">
                GST &amp; non-GST invoices, split payments, thermal printing and a
                UPI QR with the amount pre-filled — all from one fast counter
                screen.
              </p>
              <ul className="mt-5 space-y-2">
                {['Auto CGST / SGST / IGST', 'Card · list product view', '80mm thermal receipts'].map(
                  (point) => (
                    <li key={point} className="flex items-center gap-2 font-body text-sm text-ink-soft">
                      <Check className="h-4 w-4 text-accent-blue" />
                      {point}
                    </li>
                  )
                )}
              </ul>
            </div>
            {/* Framed mini screenshot */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-ink/8 bg-canvas">
              <img
                src={`${import.meta.env.BASE_URL}screenshots/bill.png`}
                alt="Valoryx billing screen"
                className="w-full object-cover"
                loading="lazy"
              />
            </div>
          </motion.article>

          {/* Speed — circular progress */}
          <motion.article
            variants={fadeInUp}
            className="flex flex-col items-center justify-center rounded-3xl border border-ink/8 bg-white p-7 text-center shadow-card transition-shadow hover:shadow-card-hover"
          >
            <CircularProgress value={70} centerLabel="70%" caption="faster" />
            <h3 className="mt-4 font-heading text-lg font-semibold text-ink">
              Built for the counter
            </h3>
            <div className="mt-3 flex items-center gap-5 font-body text-xs text-ink-faint">
              <span><b className="font-heading text-ink">0.7ms</b> bill save</span>
              <span><b className="font-heading text-ink">1–20ms</b> response</span>
            </div>
          </motion.article>

          {/* GST reports */}
          <motion.article
            variants={fadeInUp}
            className="flex flex-col justify-between rounded-3xl border border-ink/8 bg-white p-7 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <ReportIllustration />
            <div className="mt-5">
              <h3 className="font-heading text-lg font-semibold text-ink">
                GST-ready reports
              </h3>
              <p className="mt-1.5 font-body text-sm text-ink-soft">
                Sales, profit and tax reports with custom ranges — export to Excel
                or PDF in one click.
              </p>
            </div>
          </motion.article>

          {/* Integrations orbit */}
          <motion.article
            variants={fadeInUp}
            className="flex flex-col items-center justify-center rounded-3xl border border-ink/8 bg-white p-6 text-center shadow-card transition-shadow hover:shadow-card-hover"
          >
            <IntegrationOrbit size={200} />
            <h3 className="mt-3 font-heading text-lg font-semibold text-ink">
              Connects to your tools
            </h3>
            <p className="mt-1 font-body text-sm text-ink-soft">
              Telegram, Razorpay, Google, barcode &amp; thermal printers.
            </p>
          </motion.article>

          {/* Offline-first */}
          <motion.article
            variants={fadeInUp}
            className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-ink/8 bg-gradient-to-br from-accent-blue/8 to-accent-purple/8 p-7 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-accent-purple shadow-card">
                <WifiOff className="h-5 w-5" />
              </span>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
                className="text-accent-blue"
              >
                <RefreshCw className="h-5 w-5" />
              </motion.span>
            </div>
            <div className="mt-6">
              <h3 className="font-heading text-lg font-semibold text-ink">
                Works fully offline
              </h3>
              <p className="mt-1.5 font-body text-sm text-ink-soft">
                The counter never stops during an outage. Bills queue locally and
                sync automatically the moment you&apos;re back online.
              </p>
            </div>
          </motion.article>
        </motion.div>
      </div>
    </section>
  )
}

function SectionHeader() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportWithMargin}
      className="mx-auto mb-12 max-w-2xl text-center"
    >
      <motion.span
        variants={fadeInUp}
        className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
      >
        Everything you need
      </motion.span>
      <motion.h2
        variants={fadeInUp}
        className="heading-display mt-5 text-4xl sm:text-5xl"
      >
        One platform, <span className="text-gradient-accent">every module</span>
      </motion.h2>
      <motion.p
        variants={fadeInUp}
        className="mx-auto mt-4 max-w-xl font-body text-base text-ink-soft"
      >
        Take a sale, receive a delivery, transfer stock between branches, run
        payroll and read a clean audit trail — without ever opening Excel.
      </motion.p>
    </motion.div>
  )
}

/** Lightweight "report file" illustration for the GST reports cell. */
function ReportIllustration() {
  return (
    <div className="relative h-28">
      <div className="absolute left-4 top-2 h-24 w-40 rotate-[-6deg] rounded-xl border border-ink/8 bg-canvas" />
      <div className="absolute left-2 top-0 flex h-24 w-44 flex-col gap-2 rounded-xl border border-ink/8 bg-white p-3 shadow-card">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent-blue" />
          <span className="font-heading text-xs font-semibold text-ink">Revenue analysis</span>
        </div>
        <div className="h-2 w-3/4 rounded-full bg-ink/10" />
        <div className="h-2 w-1/2 rounded-full bg-ink/10" />
        <div className="mt-1 flex items-end gap-1.5">
          {[40, 70, 50, 90, 60].map((h, i) => (
            <div
              key={i}
              className="w-3 rounded-t bg-gradient-to-t from-accent-blue to-accent-purple"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

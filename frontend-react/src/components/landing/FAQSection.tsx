import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { faqs, siteConfig, FAQ } from '@/config/landing.config'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'

/** FAQ accordion — Rescale "Burning questions" section, light theme. */
export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="relative bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="mb-12 text-center"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            FAQ
          </motion.span>
          <motion.h2 variants={fadeInUp} className="heading-display mt-5 text-4xl sm:text-5xl">
            Burning <span className="text-gradient-accent">questions</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="mx-auto mt-4 max-w-xl font-body text-base text-ink-soft">
            Can&apos;t find what you&apos;re looking for? Our India-based support team is here to help.
          </motion.p>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <FAQItem
              key={faq.question}
              faq={faq}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>

        <div className="mt-10 text-center font-body text-sm text-ink-soft">
          Still have questions?{' '}
          <a
            href={`mailto:${siteConfig.contact.email}`}
            className="font-medium text-accent-blue hover:text-accent-purple"
          >
            Contact our support team &rarr;
          </a>
        </div>
      </div>
    </section>
  )
}

interface FAQItemProps {
  faq: FAQ
  isOpen: boolean
  onToggle: () => void
}

function FAQItem({ faq, isOpen, onToggle }: FAQItemProps) {
  return (
    <div
      className={`rounded-2xl border bg-white transition-colors ${
        isOpen ? 'border-ink/15 shadow-card' : 'border-ink/8'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={isOpen}
      >
        <span className="font-heading text-base font-semibold text-ink">
          {faq.question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-ink-faint"
        >
          <ChevronDown className="h-5 w-5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 font-body text-sm leading-relaxed text-ink-soft">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

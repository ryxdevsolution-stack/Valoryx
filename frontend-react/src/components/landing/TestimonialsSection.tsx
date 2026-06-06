import { motion } from 'framer-motion'
import { Star, Quote } from 'lucide-react'
import { testimonials } from '@/config/landing.config'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'
import TestimonialMarquee from './TestimonialMarquee'

/**
 * "What our clients say" — a featured testimonial alongside vertically-scrolling
 * marquee columns of the remaining quotes (Rescale testimonials section).
 */
export default function TestimonialsSection() {
  const featured = testimonials[0]
  const rest = testimonials.slice(1)

  return (
    <section id="testimonials" className="relative overflow-hidden bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            Customer stories
          </motion.span>
          <motion.h2 variants={fadeInUp} className="heading-display mt-5 text-4xl sm:text-5xl">
            Loved by <span className="text-gradient-accent">business owners</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="mx-auto mt-4 max-w-xl font-body text-base text-ink-soft">
            Real shopkeepers across India, running their counters on Valoryx.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Featured */}
          <motion.figure
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6 }}
            className="relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-ink/8 bg-gradient-to-br from-accent-blue/8 to-accent-purple/8 p-8 shadow-card"
          >
            <Quote className="h-10 w-10 text-accent-purple/40" fill="currentColor" />
            <blockquote className="mt-4 font-heading text-2xl font-medium leading-snug tracking-tight text-ink">
              &ldquo;{featured.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-8 flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent-blue to-accent-purple font-heading text-lg font-bold text-white">
                {featured.name.charAt(0)}
              </span>
              <div>
                <div className="flex gap-0.5">
                  {Array.from({ length: featured.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-[#FFB23E]" fill="currentColor" />
                  ))}
                </div>
                <p className="mt-1 font-heading text-base font-semibold text-ink">
                  {featured.name}
                </p>
                <p className="font-body text-sm text-ink-faint">
                  {featured.business}, {featured.location}
                </p>
              </div>
            </figcaption>
          </motion.figure>

          {/* Marquee */}
          <TestimonialMarquee items={rest} />
        </div>
      </div>
    </section>
  )
}

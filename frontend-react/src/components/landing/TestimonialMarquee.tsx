import { Star } from 'lucide-react'
import { Testimonial } from '@/config/landing.config'

/** Small testimonial card used inside the marquee columns. */
export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="rounded-3xl border border-ink/8 bg-white p-6 shadow-card">
      <div className="mb-3 flex gap-0.5">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star key={i} className="h-4 w-4 text-[#FFB23E]" fill="currentColor" />
        ))}
      </div>
      <blockquote className="font-body text-sm leading-relaxed text-ink-soft">
        &ldquo;{testimonial.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-blue to-accent-purple font-heading text-sm font-bold text-white">
          {testimonial.name.charAt(0)}
        </span>
        <span className="leading-tight">
          <span className="block font-heading text-sm font-semibold text-ink">
            {testimonial.name}
          </span>
          <span className="block font-body text-xs text-ink-faint">
            {testimonial.business}, {testimonial.location}
          </span>
        </span>
      </figcaption>
    </figure>
  )
}

interface MarqueeColumnProps {
  items: Testimonial[]
  durationSec: number
  reverse?: boolean
}

/** One vertically-scrolling column; content is duplicated for a seamless loop. */
function MarqueeColumn({ items, durationSec, reverse }: MarqueeColumnProps) {
  return (
    <div className="flex flex-col gap-4 pause-on-hover" /* hover-pause on the moving track */>
      <div
        className={`flex flex-col gap-4 ${
          reverse ? 'animate-marquee-vertical-reverse' : 'animate-marquee-vertical'
        } pause-on-hover`}
        style={{ ['--marquee-duration' as string]: `${durationSec}s` }}
      >
        {[...items, ...items].map((t, i) => (
          <TestimonialCard key={`${t.name}-${i}`} testimonial={t} />
        ))}
      </div>
    </div>
  )
}

/**
 * Two/three vertically-scrolling columns of testimonials with a top/bottom fade
 * mask. Columns alternate direction and speed; pauses on hover. The fixed height
 * crops the loop so the duplicated content scrolls seamlessly.
 */
export default function TestimonialMarquee({ items }: { items: Testimonial[] }) {
  // Distribute testimonials across columns round-robin.
  const colA = items.filter((_, i) => i % 3 === 0)
  const colB = items.filter((_, i) => i % 3 === 1)
  const colC = items.filter((_, i) => i % 3 === 2)

  return (
    <div className="mask-fade-y grid h-[460px] grid-cols-1 gap-4 overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
      <MarqueeColumn items={colA} durationSec={26} />
      <MarqueeColumn items={colB} durationSec={32} reverse />
      <div className="hidden lg:block">
        <MarqueeColumn items={colC} durationSec={29} />
      </div>
    </div>
  )
}

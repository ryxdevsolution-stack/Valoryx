import { Variants } from 'framer-motion'

// =============================================================================
// ANIMATION VARIANTS
// =============================================================================

/**
 * Fade in from bottom animation
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 100,
    },
  },
}

/**
 * Fade in with scale animation
 */
export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
}

/**
 * Slide in from right animation
 */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 100 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 80,
    },
  },
}

/**
 * Staggered container for children animations
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
}

/**
 * Quick stagger for list items
 */
export const quickStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

// =============================================================================
// VIEWPORT OPTIONS
// =============================================================================

export const viewportOnce = { once: true }
export const viewportWithMargin = { once: true, margin: '-50px' as const }

// =============================================================================
// TRANSITION PRESETS
// =============================================================================

export const springTransition = {
  type: 'spring' as const,
  damping: 20,
  stiffness: 100,
}

export const smoothTransition = {
  duration: 0.5,
  ease: 'easeOut' as const,
}

export const delayedTransition = (delay: number) => ({
  duration: 0.5,
  delay,
})

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Scroll smoothly to a section by selector
 */
export const scrollToSection = (href: string): void => {
  if (!href.startsWith('#')) return

  const element = document.querySelector(href)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
  }
}

/**
 * Get staggered delay for list items
 */
export const getStaggerDelay = (index: number, baseDelay = 0.1): number => {
  return index * baseDelay
}

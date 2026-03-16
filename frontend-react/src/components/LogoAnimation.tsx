

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface LogoAnimationProps {
  onComplete: () => void
  logoUrl?: string
  duration?: number
}

export default function LogoAnimation({
  onComplete,
  logoUrl,
  duration = 3000
}: LogoAnimationProps) {
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    const timer = setTimeout(onComplete, duration)
    return () => clearTimeout(timer)
  }, [onComplete, duration])

  // Determine which logo to show
  const showCustomLogo = logoUrl && !imageError
  const animationDuration = duration / 1000

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: [0, 1, 1, 1, 1, 0],
        scale: [0.5, 1.08, 1.02, 1, 1, 0.95]
      }}
      transition={{
        duration: animationDuration,
        times: [0, 0.3, 0.45, 0.5, 0.85, 1], // slower, more elegant timing
        ease: [0.25, 0.46, 0.45, 0.94] // smooth cubic-bezier easing
      }}
      className="flex items-center justify-center w-full h-full p-4"
    >
      <div className="w-full max-w-[95vw] max-h-[95vh] flex items-center justify-center">
        {showCustomLogo ? (
          <div className="relative w-full max-w-[85vw] max-h-[85vh] aspect-video">
            <img
              src={logoUrl!}
              alt="Client Logo"
              className="object-contain drop-shadow-2xl w-full h-full"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className="relative w-full max-w-[600px] aspect-square">
            <img
              src={`${import.meta.env.BASE_URL}valoryx-logo.png`}
              alt="Valoryx"
              className="object-contain drop-shadow-2xl w-full h-full"
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

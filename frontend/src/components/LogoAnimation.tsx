'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import Image from 'next/image'

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
    // Ensure minimum 5 seconds duration for slower, more elegant animation
    const animDuration = Math.max(duration, 5000)
    const timer = setTimeout(onComplete, animDuration)
    return () => clearTimeout(timer)
  }, [onComplete, duration])

  // Determine which logo to show
  const showCustomLogo = logoUrl && !imageError
  const animationDuration = Math.max(duration, 5000) / 1000 // Minimum 5 seconds for slower animation

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
            <Image
              src={logoUrl!}
              alt="Client Logo"
              fill
              className="object-contain drop-shadow-2xl"
              onError={() => setImageError(true)}
              unoptimized
            />
          </div>
        ) : (
          <div className="relative w-full max-w-[600px] aspect-square">
            <Image
              src="/RYX_Logo.png"
              alt="RYX"
              fill
              className="object-contain drop-shadow-2xl"
              priority
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

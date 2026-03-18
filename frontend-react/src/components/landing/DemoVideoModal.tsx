import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play } from 'lucide-react'

interface DemoVideoModalProps {
  onClose: () => void
  /** Path to video file (e.g. /videos/demo.mp4) or YouTube embed URL */
  videoSrc?: string
}

export default function DemoVideoModal({ onClose, videoSrc }: DemoVideoModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const isYoutube = videoSrc?.includes('youtube.com') || videoSrc?.includes('youtu.be')

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-4xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Browser Chrome Frame */}
          <div className="bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-700/50">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
              <div className="flex gap-1.5">
                <button
                  onClick={onClose}
                  className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors"
                />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 flex justify-center">
                <span className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                  <Play className="w-3 h-3" />
                  MJ Billing — Product Demo
                </span>
              </div>
            </div>

            {/* Video area */}
            <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
              {videoSrc ? (
                isYoutube ? (
                  <iframe
                    src={videoSrc}
                    className="w-full h-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    title="MJ Billing Demo"
                  />
                ) : (
                  <video
                    src={videoSrc}
                    controls
                    autoPlay
                    className="w-full h-full"
                    controlsList="nodownload"
                  >
                    Your browser does not support the video tag.
                  </video>
                )
              ) : (
                /* Placeholder — shown until video is added */
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-primary-500/20 border-2 border-primary-500/40 flex items-center justify-center">
                    <Play className="w-8 h-8 text-primary-400 ml-1" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">Demo Video Coming Soon</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Drop your <span className="text-primary-400 font-mono">demo.mp4</span> in{' '}
                      <span className="text-primary-400 font-mono">public/videos/</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

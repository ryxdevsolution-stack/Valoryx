'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface NotificationProps {
  type: NotificationType
  title: string
  message: string
  onClose: () => void
  duration?: number
}

export default function Notification({
  type,
  title,
  message,
  onClose,
  duration = 3000
}: NotificationProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'error':
        return <XCircle className="w-6 h-6 text-red-500" />
      case 'warning':
        return <AlertCircle className="w-6 h-6 text-yellow-500" />
      case 'info':
        return <Info className="w-6 h-6 text-blue-500" />
    }
  }

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    }
  }

  const getTitleColor = () => {
    switch (type) {
      case 'success':
        return 'text-green-800 dark:text-green-300'
      case 'error':
        return 'text-red-800 dark:text-red-300'
      case 'warning':
        return 'text-yellow-800 dark:text-yellow-300'
      case 'info':
        return 'text-blue-800 dark:text-blue-300'
    }
  }

  const getMessageColor = () => {
    switch (type) {
      case 'success':
        return 'text-green-700 dark:text-green-400'
      case 'error':
        return 'text-red-700 dark:text-red-400'
      case 'warning':
        return 'text-yellow-700 dark:text-yellow-400'
      case 'info':
        return 'text-blue-700 dark:text-blue-400'
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div
        className={`max-w-md rounded-lg border-2 shadow-xl p-4 ${getStyles()}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-semibold ${getTitleColor()}`}>
              {title}
            </h3>
            <p className={`text-sm mt-1 whitespace-pre-line ${getMessageColor()}`}>
              {message}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

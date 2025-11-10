'use client'

import { useEffect, useState } from 'react'
import { Save, Check, Clock } from 'lucide-react'

interface DraftIndicatorProps {
  lastSaved: string | null
  isSaving?: boolean
}

export default function DraftIndicator({ lastSaved, isSaving = false }: DraftIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState('')

  useEffect(() => {
    if (!lastSaved) {
      setTimeAgo('')
      return
    }

    const updateTimeAgo = () => {
      const savedDate = new Date(lastSaved)
      const now = new Date()
      const seconds = Math.floor((now.getTime() - savedDate.getTime()) / 1000)

      if (seconds < 5) {
        setTimeAgo('Just now')
      } else if (seconds < 60) {
        setTimeAgo(`${seconds}s ago`)
      } else {
        const minutes = Math.floor(seconds / 60)
        setTimeAgo(`${minutes}m ago`)
      }
    }

    updateTimeAgo()
    const interval = setInterval(updateTimeAgo, 1000)

    return () => clearInterval(interval)
  }, [lastSaved])

  if (!lastSaved && !isSaving) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm border border-gray-200 dark:border-gray-700">
      {isSaving ? (
        <>
          <Save className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
          <span className="text-gray-700 dark:text-gray-300 font-medium">Saving draft...</span>
        </>
      ) : (
        <>
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-600 dark:text-gray-400">Draft saved</span>
            <span className="text-gray-500 dark:text-gray-500 text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

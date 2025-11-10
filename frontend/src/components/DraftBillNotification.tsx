'use client'

import { useState, useEffect } from 'react'
import { FileText, X, RotateCcw, Trash2, Clock } from 'lucide-react'

interface DraftBillNotificationProps {
  onRestore: () => void
  onDiscard: () => void
  draftAge: number | null // in minutes
}

export default function DraftBillNotification({
  onRestore,
  onDiscard,
  draftAge,
}: DraftBillNotificationProps) {
  const [show, setShow] = useState(true)

  if (!show) return null

  const formatDraftAge = (minutes: number | null): string => {
    if (minutes === null) return 'Unknown'
    if (minutes < 1) return 'Just now'
    if (minutes === 1) return '1 minute ago'
    if (minutes < 60) return `${minutes} minutes ago`
    const hours = Math.floor(minutes / 60)
    if (hours === 1) return '1 hour ago'
    if (hours < 24) return `${hours} hours ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  }

  return (
    <div className="fixed top-20 right-4 z-50 max-w-md animate-slideIn">
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-lg shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-300" />
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                Draft Bill Found
              </h3>
              <button
                onClick={() => setShow(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Last saved {formatDraftAge(draftAge)}
              </p>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              You have an unsaved bill. Would you like to continue working on it?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  onRestore()
                  setShow(false)
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Restore Draft
              </button>

              <button
                onClick={() => {
                  if (
                    confirm(
                      'Are you sure you want to discard this draft? This action cannot be undone.'
                    )
                  ) {
                    onDiscard()
                    setShow(false)
                  }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-medium rounded-lg transition-all duration-200 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

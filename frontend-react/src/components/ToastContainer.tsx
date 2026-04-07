import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { type ToastMessage, subscribe, dismiss } from '@/utils/toast'

const icons = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error:   <XCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
  info:    <Info className="w-5 h-5 text-blue-500" />,
}

const bgStyles = {
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  error:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  info:    'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
}

const textStyles = {
  success: 'text-green-800 dark:text-green-300',
  error:   'text-red-800 dark:text-red-300',
  warning: 'text-yellow-800 dark:text-yellow-300',
  info:    'text-blue-800 dark:text-blue-300',
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => subscribe(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-sm rounded-lg border-2 shadow-xl p-3 flex items-start gap-2 animate-slide-in-right ${bgStyles[t.type]}`}
        >
          <div className="flex-shrink-0 mt-0.5">{icons[t.type]}</div>
          <p className={`text-sm flex-1 ${textStyles[t.type]}`}>{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

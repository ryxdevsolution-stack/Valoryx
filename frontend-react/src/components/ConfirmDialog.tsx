import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'

/**
 * Promise-based replacement for window.confirm().
 *
 * The Electron renderer has no native confirm() — calling it throws, which took
 * down whole handlers (delete product, remove payment, process exchange…) in the
 * packaged desktop app while working fine in the browser. Every call site now
 * awaits confirmDialog() instead, which renders an in-app modal and resolves to
 * the same boolean window.confirm() used to return.
 *
 *   if (!(await confirmDialog({ message: 'Delete this?' }))) return
 */

export type ConfirmTone = 'default' | 'danger'

export interface ConfirmOptions {
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
  tone?: ConfirmTone
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

// Single mounted host registers itself here. Keeping the channel at module
// scope is what lets plain (non-component) call sites just import and await,
// rather than threading a context hook through every handler.
let publish: ((pending: PendingConfirm | null) => void) | null = null

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options

  if (!publish) {
    // Resolving false is the safe default: the destructive action is skipped
    // rather than performed without the user ever being asked.
    console.error('[ConfirmDialog] confirmDialog() called with no <ConfirmHost /> mounted.')
    return Promise.resolve(false)
  }

  return new Promise<boolean>(resolve => {
    publish!({ ...opts, resolve })
  })
}

/** Mount exactly once, near the top of the tree. */
export function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    publish = setPending
    return () => {
      publish = null
      // Unmounting with a question on screen would leave the caller awaiting a
      // promise that can never settle, hanging its handler forever.
      setPending(prev => {
        prev?.resolve(false)
        return null
      })
    }
  }, [])

  const settle = useCallback((value: boolean) => {
    setPending(prev => {
      prev?.resolve(value)
      return null
    })
  }, [])

  // Listen on the document: the dialog is dismissable by Escape even if focus
  // has drifted outside it.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, settle])

  useEffect(() => {
    if (pending) confirmRef.current?.focus()
  }, [pending])

  if (!pending) return null

  const danger = pending.tone === 'danger'
  const Icon = danger ? AlertTriangle : AlertCircle

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onClick={() => settle(false)}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              danger
                ? 'bg-red-100 dark:bg-red-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
            }`}
          >
            <Icon
              className={`w-5 h-5 ${
                danger
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`}
              aria-hidden="true"
            />
          </div>
          <h3
            id="confirm-dialog-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {pending.title ?? (danger ? 'Are you sure?' : 'Please confirm')}
          </h3>
        </div>

        <p
          id="confirm-dialog-message"
          className="text-sm text-gray-600 dark:text-gray-300 mb-5"
        >
          {pending.message}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => settle(false)}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer"
          >
            {pending.cancelText ?? 'Cancel'}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={() => settle(true)}
            className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500'
            }`}
          >
            {pending.confirmText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

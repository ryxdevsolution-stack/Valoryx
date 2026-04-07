/**
 * Lightweight imperative toast system — replaces window.alert() to avoid
 * Electron focus-stealing bugs where inputs become unclickable after
 * dismissing a native alert dialog.
 *
 * Usage:
 *   import { toast } from '@/utils/toast'
 *   toast.error('Something went wrong')
 *   toast.warning('Stock limit reached!')
 *   toast.success('Bill created')
 *   toast.info('Processing...')
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: number
  type: ToastType
  message: string
}

type ToastListener = (toasts: ToastMessage[]) => void

let nextId = 1
let toasts: ToastMessage[] = []
let listener: ToastListener | null = null

function notify() {
  listener?.([...toasts])
}

function add(type: ToastType, message: string, duration = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, type, message }]
  notify()
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
}

export function dismiss(id: number) {
  toasts = toasts.filter(t => t.id !== id)
  notify()
}

/** Subscribe — only one listener (the ToastContainer) at a time */
export function subscribe(fn: ToastListener) {
  listener = fn
  fn([...toasts])
  return () => { listener = null }
}

export const toast = {
  success: (msg: string) => add('success', msg),
  error:   (msg: string) => add('error', msg, 6000),
  warning: (msg: string) => add('warning', msg, 5000),
  info:    (msg: string) => add('info', msg),
}

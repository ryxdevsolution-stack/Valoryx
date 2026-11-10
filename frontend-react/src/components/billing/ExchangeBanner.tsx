/**
 * ExchangeBanner — summary strip for an exchange tab in Create Bill.
 *
 * Shows which bill is being exchanged, what the customer already paid, the new
 * total and what happens to the difference: collect more (via the normal payment
 * splits below) or refund (method picked here).
 */
import { ArrowLeftRight, X } from 'lucide-react'
import type { ExchangeInfo } from '@/lib/billExchange'
import { exchangeDifference } from '@/lib/billExchange'

interface ExchangeBannerProps {
  exchange: ExchangeInfo
  newTotal: number
  /** Sum of the payment splits entered on this tab (counts only when collecting). */
  paymentsTotal: number
  paymentTypes: string[]
  currency: string
  onRefundMethodChange: (method: string) => void
  onCancel: () => void
}

const money = (cur: string, n: number) =>
  `${cur}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ExchangeBanner({
  exchange, newTotal, paymentsTotal, paymentTypes, currency, onRefundMethodChange, onCancel,
}: ExchangeBannerProps) {
  const diff = exchangeDifference(newTotal, exchange.alreadyPaid)
  const stillDue = Math.max(Math.round((diff - paymentsTotal) * 100) / 100, 0)

  return (
    <section
      aria-label={`Exchange for bill ${exchange.billLabel}`}
      className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2 border-b border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"
    >
      <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
        <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
        Exchange · Bill #{exchange.billLabel}
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300">
        Already paid <span className="font-semibold">{money(currency, exchange.alreadyPaid)}</span>
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300">
        New total <span className="font-semibold">{money(currency, newTotal)}</span>
      </div>

      <div className="text-sm font-semibold" role="status">
        {diff > 0 && (
          <span className="text-blue-700 dark:text-blue-300">
            Customer pays {money(currency, diff)}
            {stillDue > 0 && paymentsTotal > 0 && (
              <span className="font-normal text-gray-600 dark:text-gray-400"> · {money(currency, stillDue)} left unpaid</span>
            )}
          </span>
        )}
        {diff < 0 && (
          <span className="inline-flex items-center gap-2 text-green-700 dark:text-green-300">
            Refund {money(currency, -diff)} by
            <select
              aria-label="Refund method"
              value={exchange.refundMethod}
              onChange={(e) => onRefundMethodChange(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {paymentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </span>
        )}
        {diff === 0 && <span className="text-gray-600 dark:text-gray-400">No difference to pay</span>}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 rounded"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" /> Cancel exchange
      </button>
    </section>
  )
}

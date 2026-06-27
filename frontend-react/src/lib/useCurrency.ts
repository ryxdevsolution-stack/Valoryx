// Currency formatting driven by the logged-in client's regional settings.
// Replaces the previously hardcoded `₹` / 'en-IN' scattered across the app.
//
// Usage:
//   const { format, symbol } = useCurrency()
//   format(1234.5)   // "₹1,234.50" for India, "$1,234.50" for a USD client
//
// For modules outside React (PDF/print services that receive a bill), use
// formatCurrencyWith(amount, symbol, locale) with the bill's frozen currency.

import { useMemo } from 'react'
import { useClient } from '@/contexts/ClientContext'
import { CURRENCY_SYMBOLS } from '@/lib/regions'

export function formatCurrencyWith(
  amount: number | string | null | undefined,
  symbol: string,
  locale: string,
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  const safe = Number.isFinite(n) ? n : 0
  const formatted = safe.toLocaleString(locale || 'en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol}${formatted}`
}

export function useCurrency() {
  const { client } = useClient()
  const symbol = client?.currency_symbol
    || (client?.currency_code ? CURRENCY_SYMBOLS[client.currency_code] : undefined)
    || '₹'
  const locale = client?.locale || 'en-IN'
  const code = client?.currency_code || 'INR'
  // Tax display label from the client's tax_config (e.g. "GST", "VAT", "Sales Tax").
  const taxLabel = client?.tax_config?.name || 'GST'

  return useMemo(() => ({
    symbol,
    locale,
    code,
    taxLabel,
    /** Format a money amount with the client's symbol + locale, e.g. "₹1,234.50". */
    format: (amount: number | string | null | undefined) => formatCurrencyWith(amount, symbol, locale),
  }), [symbol, locale, code, taxLabel])
}

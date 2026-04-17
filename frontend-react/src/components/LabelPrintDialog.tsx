import { useEffect, useState } from 'react'
import api from '@/lib/api'

export type LabelTemplate = 'default' | 'apparel_50x100'

export interface LabelFields {
  brand_name?: string
  size_variant?: string
  colour?: string
  country_of_origin?: string
  manufacture_date?: string
  importer_name?: string
  importer_address?: string
  consumer_care_phone?: string
  consumer_care_email?: string
}

// Minimum shape the dialog needs. Callers can pass any richer Stock type;
// the generic preserves the caller's full type across the onPrint callback.
export interface StockForLabel {
  product_id: string
  product_name: string
  item_code: string
  rate: number | string
  mrp?: number | string | null
  quantity: number
  brand_name?: string
  size_variant?: string
  colour?: string
  country_of_origin?: string
  manufacture_date?: string
  importer_name?: string
  importer_address?: string
  consumer_care_phone?: string
  consumer_care_email?: string
}

interface Props<S extends StockForLabel> {
  stock: S
  onClose: () => void
  onPrint: (stock: S, template: LabelTemplate, copies: number, fieldsPatch: LabelFields) => Promise<void>
}

// Keys that are nice-to-have for an apparel hang-tag but not legally blocking.
// We WARN if empty, but still allow print — label defaults / placeholders fill gaps.
const APPAREL_FIELDS: Array<{ key: keyof LabelFields; label: string; placeholder: string; hint?: string }> = [
  { key: 'brand_name', label: 'Brand', placeholder: 'e.g. VALORYX' },
  { key: 'size_variant', label: 'Size', placeholder: 'S / M / L / XL / 38 ...' },
  { key: 'colour', label: 'Colour', placeholder: 'Red' },
  { key: 'manufacture_date', label: 'Mfg (YYYY-MM)', placeholder: '2026-03', hint: 'Legal: month/year of manufacture' },
  { key: 'country_of_origin', label: 'Origin', placeholder: 'India' },
  { key: 'importer_name', label: 'Mkt / Importer', placeholder: 'Shop name (falls back to defaults)' },
  { key: 'importer_address', label: 'Mkt Address', placeholder: 'City, PIN (falls back to defaults)' },
  { key: 'consumer_care_phone', label: 'Care Phone', placeholder: '1800-xxx-xxxx' },
  { key: 'consumer_care_email', label: 'Care Email', placeholder: 'care@shop.in' },
]

export default function LabelPrintDialog<S extends StockForLabel>({ stock, onClose, onPrint }: Props<S>) {
  const [template, setTemplate] = useState<LabelTemplate>('apparel_50x100')
  const [copies, setCopies] = useState<number>(stock.quantity || 1)
  const [fields, setFields] = useState<LabelFields>({
    brand_name: stock.brand_name || '',
    size_variant: stock.size_variant || '',
    colour: stock.colour || '',
    country_of_origin: stock.country_of_origin || '',
    manufacture_date: stock.manufacture_date || '',
    importer_name: stock.importer_name || '',
    importer_address: stock.importer_address || '',
    consumer_care_phone: stock.consumer_care_phone || '',
    consumer_care_email: stock.consumer_care_email || '',
  })
  const [busy, setBusy] = useState(false)
  const [saveToStock, setSaveToStock] = useState(true)

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const handlePrint = async () => {
    if (busy) return
    if (copies < 1) return
    setBusy(true)
    try {
      // Only send fields the user actually filled in
      const patch: LabelFields = {}
      for (const { key } of APPAREL_FIELDS) {
        const v = (fields[key] || '').trim()
        if (v) (patch as any)[key] = v
      }

      // Persist fields back to the product if requested — keeps metadata so next print is friction-free
      if (template === 'apparel_50x100' && saveToStock && Object.keys(patch).length > 0) {
        try {
          await api.put(`/stock/${stock.product_id}`, {
            product_name: stock.product_name,
            quantity: stock.quantity,
            rate: stock.rate,
            mrp: stock.mrp,
            ...patch,
          })
        } catch {
          // Non-blocking — we still print. Persisting is a convenience, not a requirement.
        }
      }

      await onPrint(stock, template, copies, patch)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const missingRequired = template === 'apparel_50x100'
    ? APPAREL_FIELDS
        .filter(f => ['brand_name', 'size_variant', 'manufacture_date'].includes(f.key as string))
        .filter(f => !(fields[f.key] || '').trim())
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Print Label — {stock.product_name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50"
            aria-label="Close"
          >✕</button>
        </div>

        <div className="p-4 flex-1 overflow-auto space-y-4">
          {/* Template picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Label Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTemplate('default')}
                className={`p-3 rounded border text-left transition ${
                  template === 'default'
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  Price Sticker
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  50×25mm · Shelf / barcode only
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTemplate('apparel_50x100')}
                className={`p-3 rounded border text-left transition ${
                  template === 'apparel_50x100'
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  Apparel Hang Tag
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  50×100mm · Brand + size + QR
                </div>
              </button>
            </div>
          </div>

          {/* Apparel-only fields */}
          {template === 'apparel_50x100' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {APPAREL_FIELDS.map(f => (
                  <div key={f.key as string} className={f.key === 'importer_address' ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {f.label}
                      {f.hint && <span className="ml-1 text-gray-400 font-normal">· {f.hint}</span>}
                    </label>
                    <input
                      type="text"
                      value={fields[f.key] || ''}
                      onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                ))}
              </div>

              {missingRequired.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded p-2">
                  Missing: {missingRequired.map(f => f.label).join(', ')} — tag will print with blanks for these.
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={saveToStock}
                  onChange={e => setSaveToStock(e.target.checked)}
                  className="rounded"
                />
                Save these fields back to the product (skip re-entry next time)
              </label>
            </>
          )}

          {/* Copies */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Copies
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={copies}
              onChange={e => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-32 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Current stock quantity: {stock.quantity}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={busy || copies < 1}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Printing…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  )
}

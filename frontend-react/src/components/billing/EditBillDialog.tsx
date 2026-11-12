/**
 * EditBillDialog — Bills → Edit. Customer details + the payment TYPE of earlier payments.
 * Items, quantities, prices, totals and stock are not editable here (use Exchange).
 */
import { useEffect, useState } from 'react'
import { Loader2, Pencil, X } from 'lucide-react'
import {
  PAYMENT_METHODS, loadBillForEdit, saveBillDetails, type EditableBill,
} from '@/lib/billEdit'

interface EditBillDialogProps {
  billId: string
  currency: string
  onClose: () => void
  /** Called after a successful save so the list can refresh. */
  onSaved: (message: string) => void
}

const INPUT =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'

const apiError = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
  || (err as { message?: string })?.message || fallback

export default function EditBillDialog({ billId, currency, onClose, onSaved }: EditBillDialogProps) {
  const [original, setOriginal] = useState<EditableBill | null>(null)
  const [form, setForm] = useState<EditableBill | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadBillForEdit(billId)
      .then((b) => { if (!cancelled) { setOriginal(b); setForm(b) } })
      .catch((err) => { if (!cancelled) setError(apiError(err, 'Could not load the bill')) })
    return () => { cancelled = true }
  }, [billId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const money = (n: number) => `${currency}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const save = async () => {
    if (!original || !form) return
    if (form.customer_name.trim() && !form.customer_phone.trim()) {
      setError('Phone number is required when a customer name is entered')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await saveBillDetails(original, form)
      onSaved(res ? `Bill #${original.billLabel} updated` : 'No changes to save')
    } catch (err) {
      setError(apiError(err, 'Failed to update the bill'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog"
      aria-modal="true" aria-labelledby="edit-bill-title" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="edit-bill-title" className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Pencil className="w-4 h-4" aria-hidden="true" />
            Edit Bill{original ? ` #${original.billLabel}` : ''}
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
            className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!form ? (
          <div className="p-8 flex justify-center">
            {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
              : <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" />}
          </div>
        ) : (
          <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
            <div>
              <label htmlFor="edit-cust-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer name</label>
              <input id="edit-cust-name" className={INPUT} value={form.customer_name} placeholder="Walk-in Customer"
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-cust-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input id="edit-cust-phone" className={INPUT} inputMode="tel" value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 20) })} />
              </div>
              <div>
                <label htmlFor="edit-cust-gstin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GSTIN</label>
                <input id="edit-cust-gstin" className={`${INPUT} uppercase`} value={form.customer_gstin}
                  onChange={(e) => setForm({ ...form, customer_gstin: e.target.value.slice(0, 20) })} />
              </div>
            </div>

            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payments</legend>
              {form.paidSplits.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">This older bill has no itemised payments to change.</p>
              ) : (
                <div className="space-y-2">
                  {form.paidSplits.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-24 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{money(p.amount)}</span>
                      <select aria-label={`Payment type for ${money(p.amount)}`} className={INPUT} value={p.payment_type}
                        onChange={(e) => setForm({
                          ...form,
                          paidSplits: form.paidSplits.map((s, j) => (j === i ? { ...s, payment_type: e.target.value } : s)),
                        })}>
                        {[...new Set([p.payment_type, ...PAYMENT_METHODS])].map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Amounts, items and prices can't change here — use <strong>Exchange</strong> for returns or swaps.
              </p>
            </fieldset>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Update Bill
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

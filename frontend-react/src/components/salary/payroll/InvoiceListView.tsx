import { useCallback, useEffect, useState } from 'react'
import { Download, Eye, Loader2, Trash2, Wallet, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/lib/useCurrency'
import {
  apiError,
  deleteInvoice,
  downloadInvoicePdf,
  fetchInvoicePdfUrl,
  getInvoice,
  invoicePdfName,
  listInvoices,
  recordInvoicePayment,
  saveObjectUrl,
  type PayrollInvoice,
} from './payrollApi'

/**
 * Issued invoices: outstanding balance, PDF download, and the payment ledger.
 *
 * Balance is always the backend's computed (grand_total − received_amount) —
 * never stored, never recomputed here, so it can't drift from the ledger.
 */

interface Props {
  canManage: boolean
  onToast: (msg: string, kind?: 'success' | 'error') => void
  /** Bumped by the parent after a new invoice is saved. */
  refreshSignal: number
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white ' +
  'dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300'

export default function InvoiceListView({ canManage, onToast, refreshSignal }: Props) {
  const { symbol: cur } = useCurrency()
  const [invoices, setInvoices] = useState<PayrollInvoice[]>([])
  const [total, setTotal] = useState(0)
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PayrollInvoice | null>(null)
  const [payFor, setPayFor] = useState<PayrollInvoice | null>(null)
  const [previewFor, setPreviewFor] = useState<PayrollInvoice | null>(null)

  const money = (n: number) => `${cur}${Number(n || 0).toFixed(2)}`

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listInvoices(page, status)
      setInvoices(res.invoices)
      setTotal(res.total)
      setPerPage(res.perPage)
    } catch (err) {
      onToast(apiError(err, 'Failed to load invoices'), 'error')
    } finally {
      setLoading(false)
    }
  }, [page, status, onToast])

  useEffect(() => { refresh() }, [refresh, refreshSignal])

  async function handleDownload(inv: PayrollInvoice) {
    setBusyId(inv.invoice_id)
    try {
      await downloadInvoicePdf(inv)
    } catch (err) {
      onToast(apiError(err, 'Failed to download the invoice PDF'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(inv: PayrollInvoice) {
    const ok = await confirmDialog({
      title: 'Delete invoice?',
      message: `Delete ${inv.invoice_number}? This cannot be undone.`,
      confirmText: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteInvoice(inv.invoice_id)
      onToast('Invoice deleted')
      refresh()
    } catch (err) {
      // The backend refuses (409) once any payment is recorded — surface its reason.
      onToast(apiError(err, 'Failed to delete invoice'), 'error')
    }
  }

  async function openDetail(inv: PayrollInvoice) {
    setBusyId(inv.invoice_id)
    try {
      setDetail(await getInvoice(inv.invoice_id))
    } catch (err) {
      onToast(apiError(err, 'Failed to load invoice'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Payroll invoices {total > 0 && <span className="text-gray-400 font-normal">({total})</span>}
          </h3>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="issued">Issued</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No invoices yet. Build one from the “New invoice” tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 font-medium">Invoice</th>
                  <th className="px-4 py-2 font-medium">Billed to</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium text-right">Received</th>
                  <th className="px-4 py-2 font-medium text-right">Balance</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.invoice_id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => openDetail(inv)}
                        className="font-medium text-gray-900 dark:text-white hover:underline cursor-pointer"
                      >
                        {inv.invoice_number}
                      </button>
                      <div className="text-xs text-gray-500">{inv.invoice_date}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{inv.customer_name}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {inv.period_start} → {inv.period_end}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-white">
                      {money(inv.grand_total)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">
                      {money(inv.received_amount)}
                    </td>
                    {/* A negative balance means the client overpaid (rounding up
                        is common) — label it rather than showing a bare minus. */}
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                      inv.balance > 0.005
                        ? 'text-red-600 dark:text-red-400'
                        : inv.balance < -0.005
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-400'
                    }`}>
                      {inv.balance < -0.005
                        ? `${money(Math.abs(inv.balance))} over`
                        : money(inv.balance)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && inv.balance > 0 && (
                          <button
                            type="button" title="Record payment"
                            onClick={() => setPayFor(inv)}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button" title="Preview invoice"
                          onClick={() => setPreviewFor(inv)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button" title="Download PDF"
                          onClick={() => handleDownload(inv)}
                          disabled={busyId === inv.invoice_id}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50"
                        >
                          {busyId === inv.invoice_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                        </button>
                        {canManage && (
                          <button
                            type="button" title="Delete invoice"
                            onClick={() => handleDelete(inv)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <span className="text-xs text-gray-500">Page {page} of {pageCount}</span>
            <button
              type="button" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-40"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {previewFor && (
        <PdfPreviewModal
          invoice={previewFor}
          onClose={() => setPreviewFor(null)}
          onToast={onToast}
        />
      )}

      {detail && <DetailModal invoice={detail} money={money} onClose={() => setDetail(null)} />}

      {payFor && (
        <PaymentModal
          invoice={payFor}
          money={money}
          onClose={() => setPayFor(null)}
          onDone={() => { setPayFor(null); refresh() }}
          onToast={onToast}
        />
      )}
    </div>
  )
}

// ── PDF preview ──────────────────────────────────────────────────────────────

/**
 * Renders the invoice PDF inline so it can be checked without downloading a
 * file every time.
 *
 * The blob is fetched once and shown in an <iframe>; the same object URL backs
 * the Download button, so opening the preview and then saving costs one request
 * rather than two. The URL is revoked on close — object URLs leak the whole blob
 * until they are.
 */
function PdfPreviewModal({
  invoice, onClose, onToast,
}: {
  invoice: PayrollInvoice
  onClose: () => void
  onToast: (msg: string, kind?: 'success' | 'error') => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let revoked = false
    let created: string | null = null
    fetchInvoicePdfUrl(invoice.invoice_id)
      .then(u => {
        // Closing before the fetch lands would otherwise leave the blob alive.
        if (revoked) { window.URL.revokeObjectURL(u); return }
        created = u
        setUrl(u)
      })
      .catch(err => {
        setFailed(true)
        onToast(apiError(err, 'Failed to load the invoice PDF'), 'error')
      })
    return () => {
      revoked = true
      if (created) window.URL.revokeObjectURL(created)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.invoice_id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[min(96vw,880px)] h-[92vh] flex flex-col border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {invoice.invoice_number}
            </h3>
            <p className="text-xs text-gray-500 truncate">{invoice.customer_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={!url}
              onClick={() => url && saveObjectUrl(url, invoicePdfName(invoice))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-gray-100 dark:bg-gray-900 rounded-b-xl overflow-hidden">
          {failed ? (
            <div className="h-full flex items-center justify-center px-6 text-center text-sm text-gray-500">
              Could not load the PDF. Use Download to open it in your PDF reader.
            </div>
          ) : url ? (
            <iframe
              src={url}
              title={`Invoice ${invoice.invoice_number}`}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Detail ───────────────────────────────────────────────────────────────────

function DetailModal({
  invoice, money, onClose,
}: { invoice: PayrollInvoice; money: (n: number) => string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 border border-gray-200 dark:border-gray-700 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</h3>
            <p className="text-xs text-gray-500">{invoice.customer_name} · {invoice.period_start} → {invoice.period_end}</p>
          </div>
          <button type="button" onClick={onClose}
                  className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Lines</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 font-medium">Description</th>
                    <th className="py-1.5 font-medium text-right">Workers</th>
                    <th className="py-1.5 font-medium text-right">Salary</th>
                    <th className="py-1.5 font-medium text-right">Svc %</th>
                    <th className="py-1.5 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.lines ?? []).map(l => (
                    <tr key={l.line_id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                      <td className="py-1.5 text-gray-900 dark:text-white">
                        {l.description}
                        {l.hsn_code && <span className="ml-2 text-xs text-gray-400">HSN {l.hsn_code}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{l.headcount}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{money(l.salary_amount)}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{l.service_charge_percent}%</td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-gray-900 dark:text-white">{money(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>Taxable</span><span>{money(invoice.taxable_total)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>Tax</span><span>{money(invoice.tax_total)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
              <span>Grand total</span><span>{money(invoice.grand_total)}</span>
            </div>
            <div className="flex justify-between text-green-700 dark:text-green-400">
              <span>Received</span><span>{money(invoice.received_amount)}</span>
            </div>
            <div className="flex justify-between font-semibold text-red-600 dark:text-red-400">
              <span>Balance</span><span>{money(invoice.balance)}</span>
            </div>
          </div>

          {(invoice.payments ?? []).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Payments</h4>
              {(invoice.payments ?? []).map(p => (
                <div key={p.payment_id} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                  <span className="text-gray-600 dark:text-gray-300">
                    {p.payment_date?.slice(0, 10) || '—'}
                    {p.payment_method && <span className="ml-2 text-xs text-gray-400">{p.payment_method}</span>}
                    {p.reference_no && <span className="ml-2 text-xs text-gray-400">#{p.reference_no}</span>}
                  </span>
                  <span className="tabular-nums text-gray-900 dark:text-white">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Record payment ───────────────────────────────────────────────────────────

function PaymentModal({
  invoice, money, onClose, onDone, onToast,
}: {
  invoice: PayrollInvoice
  money: (n: number) => string
  onClose: () => void
  onDone: () => void
  onToast: (msg: string, kind?: 'success' | 'error') => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [ref, setRef] = useState('')
  const [saving, setSaving] = useState(false)

  const parsed = Number(amount)
  const excess = Number.isFinite(parsed) ? parsed - invoice.balance : 0

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      onToast('Enter an amount greater than zero', 'error')
      return
    }
    // Overpayment is intentionally allowed — rounding up (31001 against a
    // 31000.65 balance) is normal. The excess is shown as a hint below the
    // field rather than blocked.
    setSaving(true)
    try {
      await recordInvoicePayment(invoice.invoice_id, {
        amount: value,
        payment_method: method.trim() || undefined,
        reference_no: ref.trim() || undefined,
      })
      onToast('Payment recorded')
      onDone()
    } catch (err) {
      onToast(apiError(err, 'Failed to record payment'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" role="dialog" aria-modal="true"
         onClick={() => !saving && onClose()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Record payment</h3>
        <p className="text-xs text-gray-500 mb-4">
          {invoice.invoice_number} · outstanding <strong>{money(invoice.balance)}</strong>
        </p>

        <div className="space-y-3">
          <div>
            <input
              className={inputCls} type="number" min="0" step="0.01" autoFocus
              value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount received"
            />
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setAmount(String(invoice.balance))}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Pay full {money(invoice.balance)}
              </button>
              {excess > 0.005 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 text-right">
                  {money(excess)} over the outstanding
                </span>
              )}
            </div>
          </div>
          <input className={inputCls} value={method} onChange={e => setMethod(e.target.value)}
                 placeholder="Method (e.g. NEFT, cheque)" />
          <input className={inputCls} value={ref} onChange={e => setRef(e.target.value)}
                 placeholder="Reference no. (optional)" />
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 cursor-pointer disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Record
          </button>
        </div>
      </div>
    </div>
  )
}

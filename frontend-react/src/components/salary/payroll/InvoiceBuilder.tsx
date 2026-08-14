import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Save, Search, Users } from 'lucide-react'
import api from '@/lib/api'
import { useCurrency } from '@/lib/useCurrency'
import type { Employee } from '@/pages/Salary'
import {
  apiError,
  createInvoice,
  overrideKey,
  previewInvoice,
  type BuildInvoiceBody,
  type InvoicePreview,
  type LineOverride,
  type TaxMode,
} from './payrollApi'

/**
 * Build one GST invoice on the principal company for a pay period.
 *
 * Flow: pick period + company → preview (nothing is saved) → tweak the lines →
 * save. Every amount shown comes from the backend preview so the numbers on
 * screen are the numbers that get stored; the UI never computes its own totals.
 */

interface CustomerOption {
  customer_id: string
  customer_name: string
  customer_gstin?: string | null
  customer_state?: string | null
  customer_address?: string | null
  customer_phone?: string | null
}

interface Props {
  employees: Employee[]
  canManage: boolean
  onToast: (msg: string, kind?: 'success' | 'error') => void
  onSaved: (invoiceId: string) => void
}

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white ' +
  'dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300'

const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

/** First and last day of the month `d` falls in, as YYYY-MM-DD. */
function monthBounds(d = new Date()) {
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return {
    start: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}

export default function InvoiceBuilder({ employees, canManage, onToast, onSaved }: Props) {
  const { symbol: cur } = useCurrency()
  const bounds = useMemo(() => monthBounds(), [])

  const [periodStart, setPeriodStart] = useState(bounds.start)
  const [periodEnd, setPeriodEnd] = useState(bounds.end)
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Bill To — a searchable picker over saved customers, with free text as the
  // fallback so a one-off company doesn't have to be saved first.
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [customer, setCustomer] = useState<CustomerOption | null>(null)
  const [manualName, setManualName] = useState('')
  const [customerState, setCustomerState] = useState('')

  const [taxMode, setTaxMode] = useState<TaxMode | ''>('')
  const [notes, setNotes] = useState('')

  // Employee subset. Empty = everyone with a cycle in the period (the default).
  const [pickSubset, setPickSubset] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [overrides, setOverrides] = useState<Record<string, LineOverride>>({})
  const [preview, setPreview] = useState<InvoicePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/customer/list')
      .then(res => setCustomers(res.data?.customers ?? []))
      .catch(() => { /* picker degrades to free-text entry */ })
  }, [])

  const billToName = customer?.customer_name || manualName.trim()

  const body = useCallback((): BuildInvoiceBody => ({
    period_start: periodStart,
    period_end: periodEnd,
    invoice_date: invoiceDate,
    customer_id: customer?.customer_id ?? null,
    customer_name: billToName,
    customer_address: customer?.customer_address ?? null,
    customer_gstin: customer?.customer_gstin ?? null,
    customer_state: customerState.trim() || customer?.customer_state || null,
    customer_phone: customer?.customer_phone ?? null,
    tax_mode: taxMode || undefined,
    notes: notes.trim() || null,
    employee_ids: pickSubset ? selectedIds : [],
    line_overrides: overrides,
  }), [periodStart, periodEnd, invoiceDate, customer, billToName, customerState,
       taxMode, notes, pickSubset, selectedIds, overrides])

  async function runPreview() {
    if (periodEnd < periodStart) {
      onToast('Period end cannot be before period start', 'error')
      return
    }
    if (pickSubset && selectedIds.length === 0) {
      onToast('Pick at least one worker, or switch back to “everyone”', 'error')
      return
    }
    setLoading(true)
    try {
      const data = await previewInvoice(body())
      setPreview(data)
      if (data.lines.length === 0) {
        onToast('No salary cycles overlap that period — nothing to bill', 'error')
      }
    } catch (err) {
      onToast(apiError(err, 'Failed to build preview'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!billToName) {
      onToast('Choose or type the company to bill', 'error')
      return
    }
    if (!preview || preview.lines.length === 0) {
      onToast('Preview the invoice first', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await createInvoice(body())
      onToast(`Invoice ${res.invoice_number} created`)
      setPreview(null)
      setOverrides({})
      onSaved(res.invoice_id)
    } catch (err) {
      onToast(apiError(err, 'Failed to create invoice'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /** Record an edit, then re-preview so totals stay backend-authoritative. */
  function setOverride(groupId: string | null, patch: LineOverride) {
    setOverrides(prev => {
      const key = overrideKey(groupId)
      return { ...prev, [key]: { ...prev[key], ...patch } }
    })
  }

  const money = (n: number) => `${cur}${Number(n || 0).toFixed(2)}`

  const filteredCustomers = customerQuery.trim()
    ? customers.filter(c =>
        c.customer_name?.toLowerCase().includes(customerQuery.trim().toLowerCase()))
    : customers

  const activeEmployees = employees.filter(e => e.is_active !== false)

  return (
    <div className="space-y-4">
      {/* ── Period + company ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Invoice details</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className={labelCls}>Period start *</label>
            <input type="date" className={inputCls} value={periodStart}
                   onChange={e => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Period end *</label>
            <input type="date" className={inputCls} value={periodEnd}
                   onChange={e => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Invoice date</label>
            <input type="date" className={inputCls} value={invoiceDate}
                   onChange={e => setInvoiceDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Bill to (saved customer)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                className={`${inputCls} pl-8`}
                value={customerQuery}
                onChange={e => setCustomerQuery(e.target.value)}
                placeholder="Search saved companies…"
              />
            </div>
            {customerQuery.trim() && (
              <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                {filteredCustomers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500">No match — type the name below instead.</p>
                ) : filteredCustomers.slice(0, 25).map(c => (
                  <button
                    key={c.customer_id}
                    type="button"
                    onClick={() => {
                      setCustomer(c)
                      setCustomerQuery('')
                      setCustomerState(c.customer_state || '')
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-white"
                  >
                    {c.customer_name}
                    {c.customer_gstin && (
                      <span className="ml-2 text-xs text-gray-400">{c.customer_gstin}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {customer && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                Billing <strong>{customer.customer_name}</strong>
                <button type="button" onClick={() => { setCustomer(null); setCustomerState('') }}
                        className="ml-2 text-red-500 hover:underline cursor-pointer">clear</button>
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>…or type the company name</label>
            <input
              className={inputCls}
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              disabled={!!customer}
              placeholder="e.g. PROPEL INDUSTRIES PVT LTD"
            />
          </div>

          <div>
            <label className={labelCls}>Their state</label>
            <input
              className={inputCls}
              value={customerState}
              onChange={e => setCustomerState(e.target.value)}
              placeholder="e.g. Tamil Nadu"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Decides CGST+SGST vs IGST automatically.
            </p>
          </div>

          <div>
            <label className={labelCls}>Tax mode</label>
            <select className={inputCls} value={taxMode}
                    onChange={e => setTaxMode(e.target.value as TaxMode | '')}>
              <option value="">Automatic (from states)</option>
              <option value="intra">Force CGST + SGST</option>
              <option value="inter">Force IGST</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Which workers ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Users className="w-4 h-4" /> Workers to bill
          </h3>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={pickSubset}
                   onChange={e => { setPickSubset(e.target.checked); setSelectedIds([]) }}
                   className="cursor-pointer" />
            Pick a subset
          </label>
        </div>

        {!pickSubset ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Everyone with a salary cycle overlapping the period will be included.
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            {activeEmployees.map(emp => (
              <label
                key={emp.employee_id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border-b border-gray-100 dark:border-gray-700/50 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(emp.employee_id)}
                  onChange={e => setSelectedIds(prev =>
                    e.target.checked
                      ? [...prev, emp.employee_id]
                      : prev.filter(id => id !== emp.employee_id))}
                  className="cursor-pointer"
                />
                <span className="text-gray-900 dark:text-white">{emp.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={runPreview}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition cursor-pointer disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {preview ? 'Rebuild preview' : 'Build preview'}
      </button>

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      {preview && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Preview · {preview.invoice_number_preview}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {preview.period_start} → {preview.period_end} ·{' '}
                {preview.tax_mode === 'inter' ? 'IGST (inter-state)' : 'CGST + SGST (intra-state)'} ·{' '}
                {preview.totals.headcount} worker{preview.totals.headcount === 1 ? '' : 's'}
              </p>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Nothing is saved yet.</span>
          </div>

          {preview.lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No salary cycles overlap this period.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">HSN/SAC</th>
                      <th className="px-3 py-2 font-medium text-right">Workers</th>
                      <th className="px-3 py-2 font-medium text-right">Salary</th>
                      <th className="px-3 py-2 font-medium text-right">Svc&nbsp;%</th>
                      <th className="px-3 py-2 font-medium text-right">Service</th>
                      <th className="px-3 py-2 font-medium text-right">Taxable</th>
                      <th className="px-3 py-2 font-medium text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map(line => {
                      const key = overrideKey(line.group_id)
                      return (
                        <tr key={key} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                          <td className="px-3 py-2">
                            <input
                              className={`${inputCls} min-w-[180px]`}
                              value={overrides[key]?.description ?? line.description}
                              onChange={e => setOverride(line.group_id, { description: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className={`${inputCls} w-24`}
                              value={overrides[key]?.hsn_code ?? line.hsn_code ?? ''}
                              onChange={e => setOverride(line.group_id, { hsn_code: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                            {line.headcount}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                            {money(line.salary_amount)}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number" min={0} max={100} step="0.01"
                              className={`${inputCls} w-20 text-right`}
                              value={overrides[key]?.service_charge_percent ?? line.service_charge_percent}
                              onChange={e => setOverride(line.group_id, {
                                service_charge_percent: Number(e.target.value),
                              })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                            {money(line.service_charge_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                            {money(line.taxable_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                            {money(line.line_total)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                Edited a description, HSN or %? Press <strong>Rebuild preview</strong> to recalculate.
              </p>

              {/* Totals */}
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 tabular-nums">
                <div className="ml-auto max-w-xs space-y-1 text-sm">
                  <Row label="Salary" value={money(preview.totals.salary_total)} />
                  <Row label="Service charges" value={money(preview.totals.service_total)} />
                  <Row label="Taxable" value={money(preview.totals.taxable_total)} />
                  {preview.tax_mode === 'inter' ? (
                    <Row label="IGST" value={money(preview.totals.igst_total)} />
                  ) : (
                    <>
                      <Row label="CGST" value={money(preview.totals.cgst_total)} />
                      <Row label="SGST" value={money(preview.totals.sgst_total)} />
                    </>
                  )}
                  <div className="flex justify-between pt-1.5 mt-1 border-t border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white">
                    <span>Grand total</span>
                    <span>{money(preview.totals.grand_total)}</span>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4">
                <label className={labelCls}>Notes (optional)</label>
                <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)}
                       placeholder="Shown on the invoice" />
              </div>

              {canManage && (
                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !billToName}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save invoice
                  </button>
                  {!billToName && (
                    <p className="mt-1.5 text-xs text-center text-amber-600 dark:text-amber-400">
                      Choose or type the company to bill first.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-gray-600 dark:text-gray-300">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

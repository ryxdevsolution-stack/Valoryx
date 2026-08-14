import { useEffect, useRef, useState } from 'react'
import { Loader2, Save, Upload } from 'lucide-react'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import { apiError } from './payrollApi'

/**
 * The business details a GST invoice needs and the app never stored.
 *
 * Without these the invoice PDF footer renders mostly empty — and, more
 * importantly, without `state_code` the tax split silently falls back to
 * intra-state (CGST+SGST) on every invoice, including genuinely inter-state
 * ones. That is the one field here with a wrong-numbers consequence.
 */

interface Props {
  canManage: boolean
  onToast: (msg: string, kind?: 'success' | 'error') => void
}

interface Form {
  state_code: string
  website: string
  bank_name: string
  bank_account_no: string
  bank_ifsc: string
  bank_account_holder: string
  invoice_terms: string
  service_charge_percent: string
  signature_url: string
}

const EMPTY: Form = {
  state_code: '', website: '', bank_name: '', bank_account_no: '', bank_ifsc: '',
  bank_account_holder: '', invoice_terms: '', service_charge_percent: '', signature_url: '',
}

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white ' +
  'dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 disabled:opacity-60'

const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

/** Map a `/clients/:id` payload onto the form. */
function toForm(c: Record<string, unknown> | null | undefined): Form {
  if (!c) return EMPTY
  const str = (v: unknown) => (v == null ? '' : String(v))
  return {
    state_code: str(c.state_code),
    website: str(c.website),
    bank_name: str(c.bank_name),
    bank_account_no: str(c.bank_account_no),
    bank_ifsc: str(c.bank_ifsc),
    bank_account_holder: str(c.bank_account_holder),
    invoice_terms: str(c.invoice_terms),
    service_charge_percent: str(c.service_charge_percent),
    signature_url: str(c.signature_url),
  }
}

export default function InvoiceSettingsView({ canManage, onToast }: Props) {
  const { client, refreshClientData } = useClient() as unknown as {
    client: { client_id?: string } | null
    refreshClientData: () => Promise<unknown>
  }
  const clientId = client?.client_id
  const [form, setForm] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // These fields are read straight from the API, not from ClientContext: the
  // context's Client object only carries a fixed whitelist (name, logo,
  // address, currency, subscription…) and drops every invoice-settings field,
  // so reading them from there gave a blank form on every mount — the values
  // were saved server-side but never came back.
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    setLoading(true)
    api.get(`/clients/${clientId}`)
      .then(res => { if (!cancelled) setForm(toForm(res.data?.client)) })
      .catch(err => { if (!cancelled) onToast(apiError(err, 'Failed to load invoice settings'), 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    // Fetch once per client. Re-running on every `onToast` identity change
    // would refetch mid-edit and overwrite what the user is typing.
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function save() {
    if (!clientId) return
    const pct = form.service_charge_percent.trim()
    if (pct !== '') {
      const n = Number(pct)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        onToast('Default service charge % must be between 0 and 100', 'error')
        return
      }
    }
    setSaving(true)
    try {
      // signature_url is deliberately NOT sent: it is owned by the upload
      // endpoint, and posting a stale copy from this form would undo an upload
      // made after the form was last loaded.
      const { signature_url: _managed, ...editable } = form
      const res = await api.put(`/clients/${clientId}`, {
        ...editable,
        service_charge_percent: pct === '' ? null : Number(pct),
      })
      // Refill from what the server actually stored, so the form shows the
      // persisted values (blanks normalised to NULL, % coerced to a number)
      // rather than the draft that was typed.
      if (res.data?.client) setForm(toForm(res.data.client))
      onToast('Invoice settings saved')
      await refreshClientData()
    } catch (err) {
      onToast(apiError(err, 'Failed to save invoice settings'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /**
   * The signature saves on its own, not with the rest of the form — the image
   * goes to storage and the URL is written server-side, so making it wait for
   * "Save settings" would show a preview that isn't actually persisted yet.
   */
  async function uploadSignature(file: File) {
    if (!clientId) return
    if (file.size > 2 * 1024 * 1024) {
      onToast('Signature must be 2 MB or smaller', 'error')
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await api.post(`/clients/${clientId}/signature`, body)
      const url = res.data?.signature_url
      setForm(f => ({ ...f, signature_url: url || '' }))
      onToast('Signature uploaded')
      await refreshClientData()
    } catch (err) {
      onToast(apiError(err, 'Failed to upload the signature'), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function removeSignature() {
    if (!clientId) return
    setUploading(true)
    try {
      await api.delete(`/clients/${clientId}/signature`)
      setForm(f => ({ ...f, signature_url: '' }))
      onToast('Signature removed')
      await refreshClientData()
    } catch (err) {
      onToast(apiError(err, 'Failed to remove the signature'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const field = (key: keyof Form) => ({
    value: form[key],
    // Locked until the saved values arrive — editing an empty field that is
    // about to be overwritten by the fetch loses whatever was typed.
    disabled: !canManage || loading,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  })

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          Invoice settings
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Used on every payroll invoice you raise. Your business name, address, GSTIN and logo come
          from your profile.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Your state *</label>
            <input className={inputCls} {...field('state_code')} placeholder="e.g. Tamil Nadu or 33" />
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Required — decides CGST+SGST vs IGST. Blank means every invoice is treated as intra-state.
            </p>
          </div>
          <div>
            <label className={labelCls}>Default service charge %</label>
            <input className={inputCls} type="number" min={0} max={100} step="0.01"
                   {...field('service_charge_percent')} placeholder="e.g. 8" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Fallback for groups that don’t set their own.
            </p>
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} {...field('website')} placeholder="Optional" />
          </div>
          <div>
            <label className={labelCls}>Account holder name</label>
            <input className={inputCls} {...field('bank_account_holder')} placeholder="As per bank records" />
          </div>
          <div>
            <label className={labelCls}>Bank name</label>
            <input className={inputCls} {...field('bank_name')} placeholder="e.g. HDFC Bank" />
          </div>
          <div>
            <label className={labelCls}>Account number</label>
            <input className={inputCls} {...field('bank_account_no')} placeholder="Shown on the invoice footer" />
          </div>
          <div>
            <label className={labelCls}>IFSC</label>
            <input className={inputCls} {...field('bank_ifsc')} placeholder="e.g. HDFC0001234" />
          </div>
          <div>
            <label className={labelCls}>Authorised signature</label>
            <div className="flex items-center gap-3">
              {form.signature_url ? (
                <img
                  src={form.signature_url}
                  alt="Authorised signature"
                  className="h-12 w-auto max-w-[8rem] object-contain border border-gray-200 dark:border-gray-700 rounded bg-white p-1"
                />
              ) : (
                <div className="h-12 w-32 flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded">
                  No signature
                </div>
              )}
              <div className="flex flex-col gap-1">
                {canManage && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        // Reset immediately so re-picking the same file still fires.
                        e.target.value = ''
                        if (f) uploadSignature(f)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50"
                    >
                      {uploading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Upload className="w-3.5 h-3.5" />}
                      {form.signature_url ? 'Replace' : 'Upload'}
                    </button>
                    {form.signature_url && (
                      <button
                        type="button"
                        onClick={removeSignature}
                        disabled={uploading}
                        className="text-xs text-red-500 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              PNG, JPG or WEBP up to 2 MB. Saves immediately — a transparent PNG of a
              signed-and-scanned signature looks best on the invoice.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <label className={labelCls}>Terms &amp; conditions</label>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            {...field('invoice_terms')}
            placeholder="Printed at the bottom of every invoice"
          />
        </div>

        {canManage && (
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save settings
          </button>
        )}
      </div>
    </div>
  )
}

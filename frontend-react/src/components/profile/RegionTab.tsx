import { useMemo, useState, type ReactNode } from 'react'
import { Loader2, Globe, Lock } from 'lucide-react'
import api from '@/lib/api'
import { useClient, type TaxConfig } from '@/contexts/ClientContext'
import { COUNTRY_PRESETS, presetForCountry } from '@/lib/regions'

type TaxMode = 'split' | 'single' | 'none'

// Format a rate for display without trailing zeros (9 not 9.00, 2.5 stays 2.5).
const fmtRate = (n: number) => String(Number(n.toFixed(2)))

/**
 * Region & Tax.
 * Region (country/currency/locale) is chosen once in the setup wizard.
 *  - Regular users: region is READ-ONLY; only tax is editable, and saving sends
 *    only `tax_config` so the region is never touched.
 *  - Super admin: NOT restricted — can change region + currency too.
 *
 * Tax split components are entered as ACTUAL rates (e.g. CGST 9%, SGST 9%). The
 * total = their sum; on save we store `default_rate = sum` and each component's
 * `ratio = rate/sum`, which keeps the bill engine (uses default_rate) correct.
 */
export default function RegionTab() {
  const { client, user, refreshClientData } = useClient()
  const isSuperAdmin = !!user?.is_super_admin
  const tc = client?.tax_config

  // ── Region state (editable only for super admin) ──────────────────
  const [country, setCountry] = useState(client?.country || 'IN')
  const [currencyCode, setCurrencyCode] = useState(client?.currency_code || 'INR')
  const [currencySymbol, setCurrencySymbol] = useState(client?.currency_symbol || '₹')
  const [locale, setLocale] = useState(client?.locale || 'en-IN')

  // ── Tax state (editable for everyone) ─────────────────────────────
  const [taxName, setTaxName] = useState(tc?.name || 'GST')
  const [taxMode, setTaxMode] = useState<TaxMode>(tc?.mode || 'split')
  // Single-mode rate.
  const [taxRate, setTaxRate] = useState(String(tc?.default_rate ?? 18))
  // Split-mode components hold ACTUAL rates (ratio × total), not ratios.
  const [components, setComponents] = useState<{ name: string; ratePct: string }[]>(
    tc?.components?.length
      ? tc.components.map(c => ({ name: c.name, ratePct: fmtRate(c.ratio * (tc.default_rate ?? 0)) }))
      : [{ name: 'CGST', ratePct: '9' }, { name: 'SGST', ratePct: '9' }],
  )
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Super admin picking a country pre-fills currency + tax preset (as rates).
  const applyCountry = (code: string) => {
    setCountry(code)
    const p = presetForCountry(code)
    setCurrencyCode(p.currency_code)
    setCurrencySymbol(p.currency_symbol)
    setLocale(p.locale)
    setTaxName(p.tax.name)
    setTaxMode(p.tax.mode)
    setTaxRate(String(p.tax.default_rate))
    if (p.tax.mode === 'split') setComponents(p.tax.components.map(c => ({ name: c.name, ratePct: fmtRate(c.ratio * p.tax.default_rate) })))
    else if (p.tax.mode === 'single') setComponents([{ name: p.tax.name, ratePct: String(p.tax.default_rate) }])
    else setComponents([])
  }

  // Split total = sum of the component rates.
  const splitTotal = useMemo(
    () => components.reduce((s, c) => s + (parseFloat(c.ratePct) || 0), 0),
    [components],
  )

  const buildTaxConfig = (): TaxConfig => {
    if (taxMode === 'none') return { name: 'None', mode: 'none', default_rate: 0, inclusive: false, components: [] }
    if (taxMode === 'single') {
      const n = taxName.trim() || 'Tax'
      return { name: n, mode: 'single', default_rate: parseFloat(taxRate) || 0, inclusive: false, components: [{ name: n, ratio: 1 }] }
    }
    // Split: total is the sum of the entered rates; ratio = rate / total.
    const total = splitTotal
    return {
      name: taxName.trim() || 'Tax',
      mode: 'split',
      default_rate: Number(total.toFixed(2)),
      inclusive: false,
      components: components.map(c => ({
        name: c.name.trim() || 'Tax',
        ratio: total > 0 ? (parseFloat(c.ratePct) || 0) / total : 0,
      })),
    }
  }

  const validate = (): string | null => {
    if (taxMode === 'none') return null
    if (!taxName.trim()) return 'Tax name is required'
    if (taxMode === 'single') {
      const r = parseFloat(taxRate)
      if (!Number.isFinite(r) || r < 0 || r > 100) return 'Tax rate must be between 0 and 100'
      return null
    }
    // split
    if (!components.length) return 'Add at least one tax component'
    if (components.some(c => !c.name.trim())) return 'Each component needs a name'
    if (components.some(c => { const v = parseFloat(c.ratePct); return !Number.isFinite(v) || v < 0 })) return 'Each rate must be 0 or more'
    if (splitTotal <= 0) return 'Total tax must be greater than 0% — pick “No tax” instead'
    if (splitTotal > 100) return `Total tax can’t exceed 100% (currently ${fmtRate(splitTotal)}%)`
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) { setMsg({ type: 'error', text: err }); return }
    if (!client?.client_id) return
    setSaving(true)
    setMsg(null)
    try {
      // Regular users send only tax_config (region stays immutable — backend
      // applies partially). Super admin also sends the region fields.
      const payload: Record<string, unknown> = { tax_config: buildTaxConfig() }
      if (isSuperAdmin) {
        payload.country = country === 'OTHER' ? 'XX' : country
        payload.currency_code = currencyCode.trim().toUpperCase()
        payload.currency_symbol = currencySymbol.trim() || '₹'
        payload.locale = locale.trim() || 'en-IN'
      }
      await api.put(`/clients/${client.client_id}`, payload)
      await refreshClientData()
      setMsg({ type: 'success', text: isSuperAdmin ? 'Region & tax updated.' : 'Tax settings updated.' })
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none'
  const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  // Read-only display values (regular user)
  const roCountryName =
    client?.country === 'XX'
      ? 'Other / Not listed'
      : COUNTRY_PRESETS.find(c => c.code === client?.country)?.name || client?.country || '—'
  const previewSymbol = isSuperAdmin ? currencySymbol : (client?.currency_symbol || '₹')
  const previewLocale = isSuperAdmin ? locale : (client?.locale || 'en-IN')
  const preview = `${previewSymbol}${(1234.5).toLocaleString(previewLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div id="panel-region" role="tabpanel" className="p-4 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Region &amp; Tax</h2>
      </div>

      {msg && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {isSuperAdmin ? (
        /* Super admin — region is EDITABLE */
        <div className="space-y-4 mb-6">
          <div>
            <label className={label}>Country</label>
            <select className={input} value={country} onChange={e => applyCountry(e.target.value)}>
              {COUNTRY_PRESETS.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Currency code</label>
              <input className={input} maxLength={3} value={currencyCode} onChange={e => setCurrencyCode(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className={label}>Symbol</label>
              <input className={input} maxLength={8} value={currencySymbol} onChange={e => setCurrencySymbol(e.target.value)} />
            </div>
            <div>
              <label className={label}>Locale</label>
              <input className={input} maxLength={10} value={locale} onChange={e => setLocale(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-gray-500">Preview: <span className="font-medium text-gray-800 dark:text-gray-200">{preview}</span></div>
        </div>
      ) : (
        /* Regular user — region is READ-ONLY */
        <>
          <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
            <Lock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Region &amp; currency are set when your account is created and can’t be changed. Tax below is editable.
            </p>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mb-6">
            <ReadOnlyField label="Country" value={roCountryName} />
            <ReadOnlyField label="Currency" value={`${previewSymbol} ${client?.currency_code || 'INR'}`} />
            <ReadOnlyField label="Format" value={previewLocale} />
            <ReadOnlyField label="Preview" value={preview} />
          </dl>
        </>
      )}

      {/* Tax — editable for everyone */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <label className={label}>Tax structure</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {([['split', 'Split (CGST/SGST)'], ['single', 'Single (VAT)'], ['none', 'No tax']] as [TaxMode, string][]).map(([m, lbl]) => (
            <button key={m} type="button" onClick={() => setTaxMode(m)}
              className={`px-2 py-2 text-xs rounded-lg border ${taxMode === m ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Single mode — one rate */}
        {taxMode === 'single' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Tax name</label>
              <input className={input} value={taxName} onChange={e => setTaxName(e.target.value)} />
            </div>
            <div>
              <label className={label}>Rate (%)</label>
              <input className={input} type="number" min={0} max={100} value={taxRate} onChange={e => setTaxRate(e.target.value)} />
            </div>
          </div>
        )}

        {/* Split mode — each component's ACTUAL rate; total = their sum */}
        {taxMode === 'split' && (
          <>
            <div className="mb-3">
              <label className={label}>Tax name</label>
              <input className={input} value={taxName} onChange={e => setTaxName(e.target.value)} />
            </div>
            <label className={label}>Components &amp; their rates</label>
            <div className="space-y-2">
              {components.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={input} value={c.name} placeholder="CGST"
                    onChange={e => setComponents(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <div className="relative w-24 shrink-0">
                    <input className={`${input} pr-6`} type="number" min={0} max={100} value={c.ratePct} placeholder="9"
                      onChange={e => setComponents(prev => prev.map((x, j) => j === i ? { ...x, ratePct: e.target.value } : x))} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                  </div>
                  <button type="button" onClick={() => setComponents(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 px-1" aria-label="Remove">✕</button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <button type="button" onClick={() => setComponents(prev => [...prev, { name: '', ratePct: '' }])}
                className="text-xs text-indigo-600 hover:text-indigo-700">+ Add component</button>
              <span className={`text-xs font-medium ${splitTotal > 100 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>Total tax: {fmtRate(splitTotal)}%</span>
            </div>
          </>
        )}

        <div className="pt-4">
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSuperAdmin ? 'Save region & tax' : 'Save tax settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  )
}

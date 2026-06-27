import { useMemo, useState } from 'react'
import { Loader2, Globe } from 'lucide-react'
import api from '@/lib/api'
import { useClient, type TaxConfig } from '@/contexts/ClientContext'
import { COUNTRY_PRESETS, presetForCountry } from '@/lib/regions'

type TaxMode = 'split' | 'single' | 'none'

/**
 * Region & Tax settings — lets a client change the country/currency/tax they
 * first picked in the setup wizard. Saves via PUT /api/clients/:id.
 * Changes apply to NEW bills; existing bills keep their frozen currency/tax.
 */
export default function RegionTab() {
  const { client, refreshClientData } = useClient()

  const tc = client?.tax_config
  const [country, setCountry] = useState(client?.country || 'IN')
  const [currencyCode, setCurrencyCode] = useState(client?.currency_code || 'INR')
  const [currencySymbol, setCurrencySymbol] = useState(client?.currency_symbol || '₹')
  const [locale, setLocale] = useState(client?.locale || 'en-IN')
  const [taxName, setTaxName] = useState(tc?.name || 'GST')
  const [taxMode, setTaxMode] = useState<TaxMode>(tc?.mode || 'split')
  const [taxRate, setTaxRate] = useState(String(tc?.default_rate ?? 18))
  const [components, setComponents] = useState<{ name: string; ratioPct: string }[]>(
    tc?.components?.length
      ? tc.components.map(c => ({ name: c.name, ratioPct: String(Math.round(c.ratio * 100)) }))
      : [{ name: 'CGST', ratioPct: '50' }, { name: 'SGST', ratioPct: '50' }],
  )

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const applyCountry = (code: string) => {
    setCountry(code)
    const p = presetForCountry(code)
    setCurrencyCode(p.currency_code)
    setCurrencySymbol(p.currency_symbol)
    setLocale(p.locale)
    setTaxName(p.tax.name)
    setTaxMode(p.tax.mode)
    setTaxRate(String(p.tax.default_rate))
    if (p.tax.mode === 'split') setComponents(p.tax.components.map(c => ({ name: c.name, ratioPct: String(Math.round(c.ratio * 100)) })))
    else if (p.tax.mode === 'single') setComponents([{ name: p.tax.name, ratioPct: '100' }])
    else setComponents([])
  }

  const ratioSum = useMemo(() => components.reduce((s, c) => s + (parseFloat(c.ratioPct) || 0), 0), [components])

  const buildTaxConfig = (): TaxConfig => {
    if (taxMode === 'none') return { name: 'None', mode: 'none', default_rate: 0, inclusive: false, components: [] }
    if (taxMode === 'single') {
      const n = taxName.trim() || 'Tax'
      return { name: n, mode: 'single', default_rate: parseFloat(taxRate) || 0, inclusive: false, components: [{ name: n, ratio: 1 }] }
    }
    return {
      name: taxName.trim() || 'Tax',
      mode: 'split',
      default_rate: parseFloat(taxRate) || 0,
      inclusive: false,
      components: components.map(c => ({ name: c.name.trim() || 'Tax', ratio: (parseFloat(c.ratioPct) || 0) / 100 })),
    }
  }

  const validate = (): string | null => {
    if (taxMode === 'none') return null
    if (!taxName.trim()) return 'Tax name is required'
    const r = parseFloat(taxRate)
    if (!Number.isFinite(r) || r < 0 || r > 100) return 'Tax rate must be between 0 and 100'
    if (taxMode === 'split') {
      if (!components.length) return 'Add at least one tax component'
      if (components.some(c => !c.name.trim())) return 'Each component needs a name'
      if (Math.abs(ratioSum - 100) > 0.1) return 'Component percentages must add up to 100%'
    }
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) { setMsg({ type: 'error', text: err }); return }
    if (!client?.client_id) return
    setSaving(true)
    setMsg(null)
    try {
      await api.put(`/clients/${client.client_id}`, {
        country: country === 'OTHER' ? 'XX' : country,
        currency_code: currencyCode.trim().toUpperCase(),
        currency_symbol: currencySymbol.trim() || '₹',
        locale: locale.trim() || 'en-IN',
        tax_config: buildTaxConfig(),
      })
      await refreshClientData()
      setMsg({ type: 'success', text: 'Region & tax settings updated.' })
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none'
  const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div id="panel-region" role="tabpanel" className="p-4 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-5 h-5 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Region &amp; Tax</h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        Changes apply to new bills and receipts. Existing bills keep the currency and tax they were created with.
      </p>

      {msg && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-4">
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
        <div className="text-xs text-gray-500">
          Preview: <span className="font-medium text-gray-800 dark:text-gray-200">
            {`${currencySymbol}${(1234.5).toLocaleString(locale || 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>

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

          {taxMode !== 'none' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Tax name</label>
                  <input className={input} value={taxName} onChange={e => setTaxName(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Default rate (%)</label>
                  <input className={input} type="number" min={0} max={100} value={taxRate} onChange={e => setTaxRate(e.target.value)} />
                </div>
              </div>

              {taxMode === 'split' && (
                <div className="mt-3">
                  <label className={label}>Components</label>
                  <div className="space-y-2">
                    {components.map((c, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input className={input} value={c.name} placeholder="CGST"
                          onChange={e => setComponents(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                        <div className="relative w-24 shrink-0">
                          <input className={`${input} pr-6`} type="number" value={c.ratioPct} placeholder="50"
                            onChange={e => setComponents(prev => prev.map((x, j) => j === i ? { ...x, ratioPct: e.target.value } : x))} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                        </div>
                        <button type="button" onClick={() => setComponents(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500 px-1" aria-label="Remove">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <button type="button" onClick={() => setComponents(prev => [...prev, { name: '', ratioPct: '' }])}
                      className="text-xs text-indigo-600 hover:text-indigo-700">+ Add component</button>
                    <span className={`text-xs ${Math.abs(ratioSum - 100) > 0.1 ? 'text-red-500' : 'text-gray-400'}`}>Total: {ratioSum}%</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="pt-2">
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

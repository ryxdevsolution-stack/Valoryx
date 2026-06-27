import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useClient, type TaxConfig } from '@/contexts/ClientContext'
import { COUNTRY_PRESETS, presetForCountry } from '@/lib/regions'

type TaxMode = 'split' | 'single' | 'none'

/**
 * First-login setup wizard: collects country, currency and tax configuration.
 * Saved via POST /api/clients/:id/complete-setup, which also flips
 * setup_completed so the wizard no longer shows on subsequent logins.
 * Reachable later (read/edit) from Profile → Region & Tax.
 */
export default function SetupWizard() {
  const navigate = useNavigate()
  const { client, refreshClientData } = useClient()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Country / currency
  const [countryCode, setCountryCode] = useState('IN')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [locale, setLocale] = useState('en-IN')

  // Tax
  const [taxName, setTaxName] = useState('GST')
  const [taxMode, setTaxMode] = useState<TaxMode>('split')
  const [taxRate, setTaxRate] = useState('18')
  const [components, setComponents] = useState<{ name: string; ratioPct: string }[]>([
    { name: 'CGST', ratioPct: '50' },
    { name: 'SGST', ratioPct: '50' },
  ])

  // Already configured? Don't trap the user here.
  useEffect(() => {
    if (client?.setup_completed) navigate('/billing/create', { replace: true })
  }, [client?.setup_completed, navigate])

  // Applying a country preset pre-fills currency + tax (all still editable).
  const applyCountry = (code: string) => {
    setCountryCode(code)
    const p = presetForCountry(code)
    setCurrencyCode(p.currency_code)
    setCurrencySymbol(p.currency_symbol)
    setLocale(p.locale)
    setTaxName(p.tax.name)
    setTaxMode(p.tax.mode)
    setTaxRate(String(p.tax.default_rate))
    if (p.tax.mode === 'split') {
      setComponents(p.tax.components.map(c => ({ name: c.name, ratioPct: String(Math.round(c.ratio * 100)) })))
    } else if (p.tax.mode === 'single') {
      setComponents([{ name: p.tax.name, ratioPct: '100' }])
    } else {
      setComponents([])
    }
  }

  const ratioSum = useMemo(
    () => components.reduce((s, c) => s + (parseFloat(c.ratioPct) || 0), 0),
    [components],
  )

  const buildTaxConfig = (): TaxConfig => {
    if (taxMode === 'none') {
      return { name: 'None', mode: 'none', default_rate: 0, inclusive: false, components: [] }
    }
    if (taxMode === 'single') {
      return {
        name: taxName.trim() || 'Tax',
        mode: 'single',
        default_rate: parseFloat(taxRate) || 0,
        inclusive: false,
        components: [{ name: taxName.trim() || 'Tax', ratio: 1 }],
      }
    }
    return {
      name: taxName.trim() || 'Tax',
      mode: 'split',
      default_rate: parseFloat(taxRate) || 0,
      inclusive: false,
      components: components.map(c => ({
        name: c.name.trim() || 'Tax',
        ratio: (parseFloat(c.ratioPct) || 0) / 100,
      })),
    }
  }

  const validateTax = (): string | null => {
    if (taxMode === 'none') return null
    if (!taxName.trim()) return 'Tax name is required'
    const rate = parseFloat(taxRate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 'Tax rate must be between 0 and 100'
    if (taxMode === 'split') {
      if (components.length === 0) return 'Add at least one tax component'
      if (components.some(c => !c.name.trim())) return 'Each component needs a name'
      if (Math.abs(ratioSum - 100) > 0.1) return 'Component percentages must add up to 100%'
    }
    return null
  }

  const next = () => {
    setError('')
    if (step === 3) {
      const taxErr = validateTax()
      if (taxErr) { setError(taxErr); return }
    }
    setStep(s => Math.min(4, s + 1))
  }
  const back = () => { setError(''); setStep(s => Math.max(1, s - 1)) }

  const submit = async () => {
    const taxErr = validateTax()
    if (taxErr) { setError(taxErr); setStep(3); return }
    if (!client?.client_id) { setError('No client in session'); return }

    setSaving(true)
    setError('')
    try {
      await api.post(`/clients/${client.client_id}/complete-setup`, {
        country: countryCode === 'OTHER' ? 'XX' : countryCode,
        currency_code: currencyCode.trim().toUpperCase(),
        currency_symbol: currencySymbol.trim() || '₹',
        locale: locale.trim() || 'en-IN',
        tax_config: buildTaxConfig(),
      })
      await refreshClientData()
      navigate('/billing/create', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none'
  const label = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        {/* Header + progress */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Set up your business</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure your country, currency and tax. You can change these later in Settings.
          </p>
          <div className="flex gap-1.5 mt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Country */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={label}>Country</label>
              <select className={input} value={countryCode} onChange={e => applyCountry(e.target.value)}>
                {COUNTRY_PRESETS.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                We’ll pre-fill currency and tax based on your country — you can adjust everything.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Currency */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Currency code</label>
                <input className={input} value={currencyCode} maxLength={3}
                  onChange={e => setCurrencyCode(e.target.value.toUpperCase())} placeholder="INR" />
              </div>
              <div>
                <label className={label}>Symbol</label>
                <input className={input} value={currencySymbol} maxLength={8}
                  onChange={e => setCurrencySymbol(e.target.value)} placeholder="₹" />
              </div>
            </div>
            <div>
              <label className={label}>Locale (number/date format)</label>
              <input className={input} value={locale} maxLength={10}
                onChange={e => setLocale(e.target.value)} placeholder="en-IN" />
            </div>
            <div className="text-sm text-gray-500">
              Preview: <span className="font-medium text-gray-800">
                {`${currencySymbol}${(1234.5).toLocaleString(locale || 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>
        )}

        {/* Step 3: Tax */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className={label}>Tax structure</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['split', 'Split (e.g. CGST/SGST)'],
                  ['single', 'Single tax (VAT)'],
                  ['none', 'No tax'],
                ] as [TaxMode, string][]).map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => setTaxMode(m)}
                    className={`px-2 py-2 text-xs rounded-lg border ${taxMode === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {taxMode !== 'none' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Tax name</label>
                    <input className={input} value={taxName} onChange={e => setTaxName(e.target.value)} placeholder="GST / VAT" />
                  </div>
                  <div>
                    <label className={label}>Default rate (%)</label>
                    <input className={input} type="number" value={taxRate} min={0} max={100}
                      onChange={e => setTaxRate(e.target.value)} placeholder="18" />
                  </div>
                </div>

                {taxMode === 'split' && (
                  <div>
                    <label className={label}>Components</label>
                    <div className="space-y-2">
                      {components.map((c, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input className={input} value={c.name} placeholder="CGST"
                            onChange={e => setComponents(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                          <div className="relative w-28 shrink-0">
                            <input className={`${input} pr-7`} type="number" value={c.ratioPct} placeholder="50"
                              onChange={e => setComponents(prev => prev.map((x, j) => j === i ? { ...x, ratioPct: e.target.value } : x))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                          </div>
                          <button type="button" onClick={() => setComponents(prev => prev.filter((_, j) => j !== i))}
                            className="text-gray-400 hover:text-red-500 px-1" aria-label="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <button type="button" onClick={() => setComponents(prev => [...prev, { name: '', ratioPct: '' }])}
                        className="text-sm text-indigo-600 hover:text-indigo-700">+ Add component</button>
                      <span className={`text-xs ${Math.abs(ratioSum - 100) > 0.1 ? 'text-red-500' : 'text-gray-400'}`}>
                        Total: {ratioSum}% (must be 100%)
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-3 text-sm">
            <Row label="Country" value={presetForCountry(countryCode).name} />
            <Row label="Currency" value={`${currencyCode} (${currencySymbol})`} />
            <Row label="Locale" value={locale} />
            <Row label="Tax" value={
              taxMode === 'none' ? 'No tax'
                : taxMode === 'single' ? `${taxName} @ ${taxRate}%`
                : `${taxName} @ ${taxRate}% → ${components.map(c => `${c.name} ${c.ratioPct}%`).join(' + ')}`
            } />
            <p className="text-xs text-gray-400 pt-2">
              These settings apply to new bills and receipts. You can edit them anytime from
              Profile → Region &amp; Tax.
            </p>
          </div>
        )}

        {/* Nav */}
        <div className="flex justify-between items-center mt-8">
          <button type="button" onClick={back} disabled={step === 1 || saving}
            className="px-4 py-2 text-sm text-gray-600 disabled:opacity-40">Back</button>
          {step < 4 ? (
            <button type="button" onClick={next}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Continue</button>
          ) : (
            <button type="button" onClick={submit} disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  )
}

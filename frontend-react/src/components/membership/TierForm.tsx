/**
 * TierForm — owner-only tier builder.
 *
 * Each optional benefit is a toggle. When OFF the field is omitted (null in DB);
 * when ON its input is revealed. `name` is the only required field.
 */
import { useCallback, useMemo, useState } from 'react'
import { useCurrency } from '@/lib/useCurrency'
import type { MembershipTier, TierWritePayload } from '@/types/membership'

interface TierFormProps {
  /** Tier being edited, or null for create. */
  tier: MembershipTier | null
  /** Other tiers — used to populate the auto-upgrade target dropdown. */
  allTiers: MembershipTier[]
  saving: boolean
  onSubmit: (payload: TierWritePayload) => void
  onCancel: () => void
}

/** A single optional numeric benefit toggle + reveal. */
interface BenefitKey {
  key: keyof TierWritePayload
  label: string
  hint: string
  step?: string
  min?: string
}

function makeNumericBenefits(cur: string): BenefitKey[] {
  return [
    { key: 'discount_percentage', label: 'Auto-discount (%)', hint: 'Applied automatically at billing', step: '0.01', min: '0' },
    { key: 'points_per_100', label: `Points per ${cur}100`, hint: `Points earned per ${cur}100 spent`, step: '0.01', min: '0' },
    { key: 'redemption_rate', label: `Redemption rate (${cur}/point)`, hint: `e.g. 0.10 → 100 pts = ${cur}10`, step: '0.01', min: '0' },
    { key: 'monthly_negotiable_budget', label: `Negotiable budget (${cur})`, hint: 'Negotiation cap per calendar month or year', step: '0.01', min: '0' },
    { key: 'enrollment_fee', label: `Enrollment fee (${cur})`, hint: 'Leave off for free enrollment', step: '0.01', min: '0' },
    { key: 'validity_days', label: 'Validity (days)', hint: 'Off = never expires', step: '1', min: '1' },
  ]
}

type NumericState = Record<string, { enabled: boolean; value: string }>

function initNumeric(tier: MembershipTier | null, benefits: BenefitKey[]): NumericState {
  const state: NumericState = {}
  for (const b of benefits) {
    const raw = tier ? (tier[b.key as keyof MembershipTier] as number | null) : null
    state[b.key as string] = {
      enabled: raw !== null && raw !== undefined,
      value: raw !== null && raw !== undefined ? String(raw) : '',
    }
  }
  return state
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/** Preset card colours — classic loyalty-card metals + brand tones. */
const CARD_COLORS = [
  { name: 'Silver',   value: '#9ca3af', dark: '#6b7280' },
  { name: 'Gold',     value: '#d4a017', dark: '#a16207' },
  { name: 'Platinum', value: '#64748b', dark: '#334155' },
  { name: 'Black',    value: '#1f2937', dark: '#030712' },
  { name: 'Blue',     value: '#2563eb', dark: '#1e40af' },
  { name: 'Emerald',  value: '#059669', dark: '#065f46' },
  { name: 'Ruby',     value: '#dc2626', dark: '#991b1b' },
  { name: 'Purple',   value: '#7c3aed', dark: '#5b21b6' },
  { name: 'Rose',     value: '#e11d48', dark: '#9f1239' },
  { name: 'Teal',     value: '#0d9488', dark: '#115e59' },
]

export default function TierForm({ tier, allTiers, saving, onSubmit, onCancel }: TierFormProps) {
  const { symbol: cur } = useCurrency()
  const numericBenefits = useMemo(() => makeNumericBenefits(cur), [cur])
  const [name, setName] = useState(tier?.name ?? '')
  const [description, setDescription] = useState(tier?.description ?? '')
  const [color, setColor] = useState(tier?.color ?? '#2563eb')
  const [numeric, setNumeric] = useState<NumericState>(() => initNumeric(tier, makeNumericBenefits(cur)))
  // Negotiable budget window — monthly (default) or yearly, owner's choice.
  const [budgetPeriod, setBudgetPeriod] = useState<'monthly' | 'yearly'>(
    tier?.negotiable_budget_period === 'yearly' ? 'yearly' : 'monthly'
  )

  // Auto-upgrade is a paired toggle: threshold (number) + target tier (select).
  const [upgradeEnabled, setUpgradeEnabled] = useState(
    tier?.upgrade_threshold_points != null || tier?.upgrade_to_tier_id != null
  )
  const [threshold, setThreshold] = useState(
    tier?.upgrade_threshold_points != null ? String(tier.upgrade_threshold_points) : ''
  )
  const [upgradeTo, setUpgradeTo] = useState(tier?.upgrade_to_tier_id ?? '')

  const upgradeTargets = useMemo(
    () => allTiers.filter(t => t.tier_id !== tier?.tier_id),
    [allTiers, tier?.tier_id]
  )

  const toggleNumeric = useCallback((key: string) => {
    setNumeric(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }))
  }, [])

  const setNumericValue = useCallback((key: string, value: string) => {
    setNumeric(prev => ({ ...prev, [key]: { ...prev[key], value } }))
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const payload: TierWritePayload = {
      name: name.trim(),
      description: description.trim() || null,
      color: color || null,
      negotiable_budget_period: budgetPeriod,
    }

    for (const b of numericBenefits) {
      const entry = numeric[b.key as string]
      const num = entry.value === '' ? NaN : Number(entry.value)
      payload[b.key] = (entry.enabled && !Number.isNaN(num) ? num : null) as never
    }

    if (upgradeEnabled) {
      const thr = threshold === '' ? NaN : Number(threshold)
      payload.upgrade_threshold_points = (Number.isNaN(thr) ? null : thr) as never
      payload.upgrade_to_tier_id = upgradeTo || null
    } else {
      payload.upgrade_threshold_points = null
      payload.upgrade_to_tier_id = null
    }

    onSubmit(payload)
  }, [name, description, color, numeric, budgetPeriod, upgradeEnabled, threshold, upgradeTo, onSubmit, numericBenefits])

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Basic */}
      <div className="space-y-3">
        <div>
          <label htmlFor="tier-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tier Name <span className="text-red-400">*</span>
          </label>
          <input id="tier-name" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Gold" className={inputCls} required />
        </div>
        <div>
          <label htmlFor="tier-desc" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input id="tier-desc" value={description ?? ''} onChange={e => setDescription(e.target.value)}
            placeholder="Short summary of perks" className={inputCls} />
        </div>
        <div>
          <label htmlFor="tier-color" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Card Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {CARD_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={`${c.name} card color`}
                onClick={() => setColor(c.value)}
                className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === c.value ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                }`}
                style={{ background: `linear-gradient(135deg, ${c.value}, ${c.dark})` }}
              />
            ))}
            {/* Custom color — any colour the owner wants */}
            <input id="tier-color" type="color" value={color ?? '#2563eb'} onChange={e => setColor(e.target.value)}
              title="Custom color"
              className="h-7 w-10 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer" />
          </div>
          {/* Live mini-preview so the owner sees the card while designing the tier */}
          <div className="mt-3 w-56 rounded-xl p-3 text-white shadow"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            <p className="text-[10px] uppercase tracking-widest opacity-80">Card preview</p>
            <p className="text-sm font-bold truncate">{name || 'Tier name'}</p>
            <p className="font-mono text-[10px] opacity-90">
              {(() => {
                const letters = (name || '').replace(/[^A-Za-z]/g, '').toUpperCase()
                return `${letters.length >= 2 ? letters.slice(0, 3) : 'VLX'}-001`
              })()}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700" />

      {/* Optional benefits */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Benefits — toggle on to offer
        </p>
        <div className="space-y-3">
          {numericBenefits.map(b => {
            const entry = numeric[b.key as string]
            return (
              <div key={b.key as string} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={entry.enabled} onChange={() => toggleNumeric(b.key as string)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{b.label}</span>
                </label>
                {entry.enabled && (
                  <div className="mt-2">
                    {b.key === 'monthly_negotiable_budget' ? (
                      <div className="flex gap-2">
                        <input type="number" min={b.min} step={b.step} value={entry.value}
                          onChange={e => setNumericValue(b.key as string, e.target.value)}
                          placeholder="0" className={inputCls} />
                        <select value={budgetPeriod} aria-label="Budget period"
                          onChange={e => setBudgetPeriod(e.target.value === 'yearly' ? 'yearly' : 'monthly')}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="monthly">per month</option>
                          <option value="yearly">per year</option>
                        </select>
                      </div>
                    ) : (
                      <input type="number" min={b.min} step={b.step} value={entry.value}
                        onChange={e => setNumericValue(b.key as string, e.target.value)}
                        placeholder="0" className={inputCls} />
                    )}
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{b.hint}</p>
                  </div>
                )}
              </div>
            )
          })}

          {/* Auto-upgrade (paired) */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={upgradeEnabled} onChange={() => setUpgradeEnabled(v => !v)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Auto-upgrade</span>
            </label>
            {upgradeEnabled && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tier-threshold" className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1">Lifetime points to promote</label>
                  <input id="tier-threshold" type="number" min="1" step="1" value={threshold}
                    onChange={e => setThreshold(e.target.value)} placeholder="e.g. 5000" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="tier-upgrade-to" className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1">Promote to tier</label>
                  <select id="tier-upgrade-to" value={upgradeTo} onChange={e => setUpgradeTo(e.target.value)} className={inputCls}>
                    <option value="">Select tier…</option>
                    {upgradeTargets.map(t => <option key={t.tier_id} value={t.tier_id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
          {saving ? 'Saving…' : tier ? 'Update Tier' : 'Create Tier'}
        </button>
      </div>
    </form>
  )
}

import { useEffect, useState } from 'react'
import { CalendarOff, Loader2, Save } from 'lucide-react'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import { apiError } from './payrollApi'

/**
 * Recurring weekly off — e.g. every Sunday and every 2nd Saturday, paid.
 *
 * The rule doesn't create attendance rows. The salary calculation synthesises a
 * paid 'weekly_off' day for covered dates that have no row of their own, so an
 * explicit entry (someone genuinely worked that Sunday) always wins, and the
 * rule applies retroactively across every open cycle without a data migration.
 *
 * Ships disabled: switching it on immediately increases the gross of every open
 * cycle, which is the intent but must never be a surprise.
 */

interface Props {
  canManage: boolean
  onToast: (msg: string, kind?: 'success' | 'error') => void
}

const WEEKDAYS = [
  { value: 6, label: 'Sunday' },
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
]

const SATURDAYS = [1, 2, 3, 4, 5]

interface ClientRule {
  weekly_off_enabled?: boolean
  weekly_off_weekday?: number | null
  weekly_off_saturdays?: string | null
}

/** '2,4' -> [2, 4]; null/'' -> []. Junk ordinals are dropped. */
function parseSaturdays(raw: string | null | undefined): number[] {
  return String(raw ?? '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 5)
}

export default function WeeklyOffSettings({ canManage, onToast }: Props) {
  const { client, refreshClientData } = useClient() as unknown as {
    client: { client_id?: string } | null
    refreshClientData: () => Promise<unknown>
  }
  const clientId = client?.client_id

  // Sunday + 2nd Saturday is the suggested starting point, shown only until we
  // know what (if anything) was actually saved.
  const [enabled, setEnabled] = useState(false)
  const [weekday, setWeekday] = useState<number | ''>(6)
  const [saturdays, setSaturdays] = useState<number[]>([2])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  function applyRule(c: ClientRule | null | undefined) {
    if (!c) return
    // A rule counts as configured once any of the three columns is non-default.
    // Only then do we mirror it exactly — otherwise a saved "no Saturdays"
    // (NULL) would be redisplayed as the 2nd-Saturday suggestion and silently
    // reappear on the next save.
    const configured =
      !!c.weekly_off_enabled || c.weekly_off_weekday != null || c.weekly_off_saturdays != null
    if (!configured) return
    setEnabled(!!c.weekly_off_enabled)
    setWeekday(c.weekly_off_weekday ?? '')
    setSaturdays(parseSaturdays(c.weekly_off_saturdays))
  }

  // Fetched from the API rather than read off ClientContext: the context's
  // client object carries a fixed whitelist of fields and drops the weekly-off
  // columns, so reading them there showed the defaults on every mount no
  // matter what had been saved.
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    setLoading(true)
    api.get(`/clients/${clientId}`)
      .then(res => { if (!cancelled) applyRule(res.data?.client) })
      .catch(err => { if (!cancelled) onToast(apiError(err, 'Failed to load the weekly off rule'), 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    // Keyed on the client only — refetching on an `onToast` identity change
    // would reset the controls mid-edit.
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function save() {
    if (!clientId) return
    setSaving(true)
    try {
      const res = await api.put(`/clients/${clientId}`, {
        weekly_off_enabled: enabled,
        weekly_off_weekday: weekday === '' ? null : weekday,
        weekly_off_saturdays: saturdays.length
          ? [...saturdays].sort((a, b) => a - b).join(',')
          : null,
      })
      applyRule(res.data?.client)
      onToast(
        enabled
          ? 'Weekly off rule saved — open cycles now include these paid days'
          : 'Weekly off rule turned off',
      )
      await refreshClientData()
    } catch (err) {
      onToast(apiError(err, 'Failed to save the weekly off rule'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const selectedWeekdayLabel = WEEKDAYS.find(w => w.value === weekday)?.label ?? 'none'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-1">
        <CalendarOff className="w-4 h-4" /> Weekly off (paid)
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Days matching this rule are paid as a full day without anyone marking attendance. If someone
        actually works one of these days, marking their attendance overrides the rule for that date.
      </p>

      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage || loading}
          onChange={e => setEnabled(e.target.checked)}
          className="cursor-pointer"
        />
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          Enable the weekly off rule
        </span>
      </label>

      <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Weekly off day
          </label>
          <select
            value={weekday}
            disabled={!canManage || loading}
            onChange={e => setWeekday(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full sm:w-56 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer"
          >
            <option value="">No weekly day off</option>
            {WEEKDAYS.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Saturdays also off
          </label>
          <div className="flex flex-wrap gap-2">
            {SATURDAYS.map(n => {
              const on = saturdays.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!canManage || loading}
                  onClick={() => setSaturdays(prev =>
                    on ? prev.filter(x => x !== n) : [...prev, n])}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                    on
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {n}
                  {n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Currently: every <strong>{selectedWeekdayLabel}</strong>
            {saturdays.length > 0 && (
              <> and the <strong>{[...saturdays].sort((a, b) => a - b).join(', ')}</strong> Saturday
                {saturdays.length > 1 ? 's' : ''}</>
            )}{' '}
            of each month.
          </p>
        </div>
      </div>

      {enabled && (
        <p className="mt-4 px-3 py-2 rounded-lg text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
          Saving this recalculates every <strong>open</strong> salary cycle straight away, so gross pay
          will go up. Cycles already marked paid keep the figures they were paid with.
        </p>
      )}

      {canManage && (
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save weekly off rule
        </button>
      )}
    </div>
  )
}

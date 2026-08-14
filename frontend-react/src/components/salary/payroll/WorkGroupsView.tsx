import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users, Loader2, X } from 'lucide-react'
import { confirmDialog } from '@/components/ConfirmDialog'
import type { Employee } from '@/pages/Salary'
import {
  apiError,
  assignEmployees,
  createWorkGroup,
  deleteWorkGroup,
  listWorkGroups,
  updateWorkGroup,
  type WorkGroup,
} from './payrollApi'

/**
 * Work group setup: the groups that become invoice lines, and who is in them.
 *
 * Service charge % lives on the group rather than being a global constant
 * because the margin genuinely differs by kind of work (bay labour vs blasting
 * and painting). It is always user-entered — there is no hardcoded default.
 */

const UNGROUPED = '__ungrouped__'

interface Props {
  employees: Employee[]
  canManage: boolean
  onToast: (msg: string, kind?: 'success' | 'error') => void
  /** Employees' group assignment changed — the parent refetches its list. */
  onEmployeesChanged: () => void
}

interface DraftGroup {
  group_id?: string
  name: string
  description: string
  hsn_code: string
  service_charge_percent: string
  display_order: string
}

const emptyDraft = (): DraftGroup => ({
  name: '',
  description: '',
  hsn_code: '',
  service_charge_percent: '',
  display_order: '0',
})

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white ' +
  'dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300'

const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

export default function WorkGroupsView({ employees, canManage, onToast, onEmployeesChanged }: Props) {
  const [groups, setGroups] = useState<WorkGroup[]>([])
  const [ungroupedCount, setUngroupedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<DraftGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [assignTarget, setAssignTarget] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { groups: g, ungroupedCount: u } = await listWorkGroups()
      setGroups(g)
      setUngroupedCount(u)
    } catch (err) {
      onToast(apiError(err, 'Failed to load work groups'), 'error')
    } finally {
      setLoading(false)
    }
  }, [onToast])

  useEffect(() => { refresh() }, [refresh])

  async function saveDraft() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      onToast('Group name is required', 'error')
      return
    }
    // Empty means "no group-specific rate" — send null so the invoice falls back
    // to the business default rather than silently billing at 0%.
    const pctRaw = draft.service_charge_percent.trim()
    let pct: number | null = null
    if (pctRaw !== '') {
      pct = Number(pctRaw)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        onToast('Service charge % must be between 0 and 100', 'error')
        return
      }
    }

    setSaving(true)
    try {
      const body = {
        name,
        description: draft.description.trim() || null,
        hsn_code: draft.hsn_code.trim() || null,
        service_charge_percent: pct,
        display_order: Number(draft.display_order) || 0,
      }
      if (draft.group_id) {
        await updateWorkGroup(draft.group_id, body)
        onToast('Work group updated')
      } else {
        await createWorkGroup(body)
        onToast('Work group created')
      }
      setDraft(null)
      await refresh()
    } catch (err) {
      onToast(apiError(err, 'Failed to save work group'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removeGroup(group: WorkGroup) {
    const ok = await confirmDialog({
      title: 'Remove work group?',
      message:
        `Remove "${group.name}"? Its ${group.employee_count ?? 0} member(s) stay as employees — ` +
        'they simply become ungrouped and will bill under the "Ungrouped workers" line.',
      confirmText: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteWorkGroup(group.group_id)
      onToast('Work group removed')
      await refresh()
      onEmployeesChanged()
    } catch (err) {
      onToast(apiError(err, 'Failed to remove work group'), 'error')
    }
  }

  async function handleAssign(employeeId: string, groupId: string) {
    try {
      await assignEmployees(groupId === UNGROUPED ? null : groupId, [employeeId])
      await refresh()
      onEmployeesChanged()
    } catch (err) {
      onToast(apiError(err, 'Failed to assign employee'), 'error')
    }
  }

  const activeEmployees = employees.filter(e => e.is_active !== false)

  return (
    <div className="space-y-4">
      {/* ── Groups ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Work groups</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Each group becomes one line on the invoice, with its own HSN/SAC and service charge %.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New group
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No work groups yet. Create one (e.g. “Bay 1”) to start grouping workers onto invoice lines.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 font-medium">Group</th>
                  <th className="px-4 py-2 font-medium">HSN/SAC</th>
                  <th className="px-4 py-2 font-medium text-right">Service&nbsp;%</th>
                  <th className="px-4 py-2 font-medium text-right">Workers</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.group_id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 dark:text-white">{g.name}</div>
                      {g.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{g.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{g.hsn_code || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-white">
                      {g.service_charge_percent == null ? (
                        <span className="text-gray-400" title="Falls back to the business default">default</span>
                      ) : (
                        `${g.service_charge_percent}%`
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {g.employee_count ?? 0}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Edit group"
                            onClick={() => setDraft({
                              group_id: g.group_id,
                              name: g.name,
                              description: g.description ?? '',
                              hsn_code: g.hsn_code ?? '',
                              service_charge_percent:
                                g.service_charge_percent == null ? '' : String(g.service_charge_percent),
                              display_order: String(g.display_order ?? 0),
                            })}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Remove group"
                            onClick={() => removeGroup(g)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ungroupedCount > 0 && (
          <p className="px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-b-xl">
            {ungroupedCount} worker{ungroupedCount === 1 ? '' : 's'} not in any group. They are still
            billed — under an “Ungrouped workers” line.
          </p>
        )}
      </div>

      {/* ── Assignment ──────────────────────────────────────────────────── */}
      {canManage && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <button
            type="button"
            onClick={() => setAssignTarget(assignTarget === null ? 'open' : null)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Users className="w-4 h-4" /> Assign workers to groups
            </span>
            <span className="text-xs text-gray-500">{assignTarget ? 'Hide' : 'Show'}</span>
          </button>

          {assignTarget && (
            <div className="border-t border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto">
              {activeEmployees.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">No active employees.</p>
              ) : (
                activeEmployees.map(emp => (
                  <div
                    key={emp.employee_id}
                    className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                  >
                    <span className="text-sm text-gray-900 dark:text-white truncate">{emp.name}</span>
                    {/* Controlled, so the parent's refetch after an assignment is
                        what the row reflects — not a stale uncontrolled default. */}
                    <select
                      value={emp.work_group_id || UNGROUPED}
                      onChange={e => handleAssign(emp.employee_id, e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer"
                    >
                      <option value={UNGROUPED}>— Ungrouped —</option>
                      {groups.map(g => (
                        <option key={g.group_id} value={g.group_id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Create / edit modal ─────────────────────────────────────────── */}
      {draft && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setDraft(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {draft.group_id ? 'Edit work group' : 'New work group'}
              </h3>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Group name *</label>
                <input
                  className={inputCls}
                  autoFocus
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Bay 1"
                />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input
                  className={inputCls}
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>HSN / SAC</label>
                  <input
                    className={inputCls}
                    value={draft.hsn_code}
                    onChange={e => setDraft({ ...draft, hsn_code: e.target.value })}
                    placeholder="e.g. 998518"
                  />
                </div>
                <div>
                  <label className={labelCls}>Service charge %</label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={draft.service_charge_percent}
                    onChange={e => setDraft({ ...draft, service_charge_percent: e.target.value })}
                    placeholder="e.g. 8"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Display order</label>
                <input
                  className={inputCls}
                  type="number"
                  value={draft.display_order}
                  onChange={e => setDraft({ ...draft, display_order: e.target.value })}
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Lower numbers appear first on the invoice.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {draft.group_id ? 'Save changes' : 'Create group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

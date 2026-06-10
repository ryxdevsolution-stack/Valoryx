/**
 * Membership — single owner page for the loyalty card program.
 *
 * Internal tabs (no extra nav entries):
 *   • Tiers     — tier builder (create/edit/deactivate)
 *   • Members   — per-tier member list with enroll/move/cancel + manual adjust
 *   • Reporting — ledger-derived analytics
 *
 * Owner-only: gated on user.role === 'owner' (UI). Backend re-checks all writes.
 * A card-view drawer opens via ?card=<id> deep link (e.g. from Customers.tsx) or
 * from the Members tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import DashboardLayout from '@/components/DashboardLayout'
import { useClient } from '@/contexts/ClientContext'
import membershipService, { getMembershipError } from '@/services/membership'
import type { MembershipTier, TierWritePayload } from '@/types/membership'
import TierForm from '@/components/membership/TierForm'
import MembersList from '@/components/membership/MembersList'
import Reporting from '@/components/membership/Reporting'
import CardView from '@/components/membership/CardView'
import { QRCodeSVG } from 'qrcode.react'
import { Eye, Pencil, Ban } from 'lucide-react'

type Tab = 'tiers' | 'members' | 'reporting'
const TABS: { key: Tab; label: string }[] = [
  { key: 'tiers', label: 'Tiers' },
  { key: 'members', label: 'Members' },
  { key: 'reporting', label: 'Reporting' },
]

/** Mirror of the backend's tier prefix: first 3 letters of the tier name. */
function tierPrefix(name: string): string {
  const letters = (name || '').replace(/[^A-Za-z]/g, '').toUpperCase()
  return letters.length >= 2 ? letters.slice(0, 3) : 'VLX'
}

function benefitTags(t: MembershipTier): string[] {
  const tags: string[] = []
  if (t.discount_percentage != null) tags.push(`${t.discount_percentage}% off`)
  if (t.points_per_100 != null) tags.push(`${t.points_per_100} pts/₹100`)
  if (t.redemption_rate != null) tags.push(`₹${t.redemption_rate}/pt`)
  if (t.monthly_negotiable_budget != null) tags.push(`₹${t.monthly_negotiable_budget} negotiable/${t.negotiable_budget_period === 'yearly' ? 'yr' : 'mo'}`)
  if (t.enrollment_fee != null && t.enrollment_fee > 0) tags.push(`₹${t.enrollment_fee} fee`)
  if (t.validity_days != null) tags.push(`${t.validity_days}d validity`)
  if (t.upgrade_threshold_points != null) tags.push(`upgrade @ ${t.upgrade_threshold_points} pts`)
  return tags
}

export default function MembershipPage() {
  const { user, client } = useClient()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab, setTab] = useState<Tab>('tiers')
  const [tiers, setTiers] = useState<MembershipTier[]>([])
  const [tiersLoading, setTiersLoading] = useState(false)
  const [tiersError, setTiersError] = useState<string | null>(null)

  const [showTierModal, setShowTierModal] = useState(false)
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null)
  const [tierSaving, setTierSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [previewTier, setPreviewTier] = useState<MembershipTier | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Owner or super admin — mirrors the backend _is_owner() check.
  const isOwner = user?.role === 'owner' || !!user?.is_super_admin

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const fetchTiers = useCallback(async () => {
    setTiersLoading(true)
    setTiersError(null)
    try {
      const res = await membershipService.listTiers()
      setTiers(res.data.data || [])
    } catch (err) {
      setTiersError(getMembershipError(err, 'Failed to load tiers'))
    } finally {
      setTiersLoading(false)
    }
  }, [])

  useEffect(() => { fetchTiers() }, [fetchTiers])

  // Open a card via ?card=<id> deep link (e.g. from Customers), then clear it.
  useEffect(() => {
    const cardId = searchParams.get('card')
    if (cardId) {
      setActiveCardId(cardId)
      const next = new URLSearchParams(searchParams)
      next.delete('card')
      navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
    }
  }, [searchParams, navigate, location.pathname])

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [tiers]
  )

  const openCreateTier = useCallback(() => { setEditingTier(null); setShowTierModal(true) }, [])
  const openEditTier = useCallback((t: MembershipTier) => { setEditingTier(t); setShowTierModal(true) }, [])

  const submitTier = useCallback(async (payload: TierWritePayload) => {
    setTierSaving(true)
    try {
      if (editingTier) {
        await membershipService.updateTier(editingTier.tier_id, payload)
        showToast('Tier updated')
      } else {
        await membershipService.createTier(payload)
        showToast('Tier created')
      }
      setShowTierModal(false)
      fetchTiers()
    } catch (err) {
      showToast(getMembershipError(err, 'Failed to save tier'), 'error')
    } finally {
      setTierSaving(false)
    }
  }, [editingTier, showToast, fetchTiers])

  const deactivateTier = useCallback(async (tierId: string) => {
    try {
      await membershipService.deleteTier(tierId)
      showToast('Tier deactivated')
      setDeleteConfirm(null)
      fetchTiers()
    } catch (err) {
      showToast(getMembershipError(err, 'Failed to deactivate tier'), 'error')
    }
  }, [showToast, fetchTiers])

  // Owner-only page guard (UI; server re-checks all writes).
  if (!isOwner) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto text-center py-24">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Owner access only</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Membership program settings are managed by the shop owner.
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {toast && (
          <div role="status" className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Membership</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Loyalty card tiers, members and rewards reporting</p>
          </div>
          {tab === 'tiers' && (
            <button type="button" onClick={openCreateTier}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + New Tier
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* TIERS */}
        {tab === 'tiers' && (
          tiersLoading ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">Loading tiers…</div>
          ) : tiersError ? (
            <div className="text-center py-16">
              <p className="text-red-500 mb-3">{tiersError}</p>
              <button type="button" onClick={fetchTiers} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Retry</button>
            </div>
          ) : sortedTiers.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <p className="text-gray-700 dark:text-gray-300 font-medium">No tiers yet</p>
              <p className="text-sm mt-1">Create your first card tier to start enrolling members</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sortedTiers.map(t => {
                const accent = t.color || '#2563eb'
                const sampleNumber = `${tierPrefix(t.name)}-001`
                return (
                  <div key={t.tier_id} className={t.is_active ? '' : 'opacity-60'}>
                    {/* Card visual — what the member's printed card looks like; click for details */}
                    <div role="button" tabIndex={0} aria-label={`View ${t.name} card details`}
                      onClick={() => setPreviewTier(t)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewTier(t) } }}
                      className="relative rounded-2xl text-white shadow-lg overflow-hidden aspect-[1.586] cursor-pointer hover:shadow-xl transition-shadow"
                      style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99 55%, ${accent}dd)` }}>
                      <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-white/10" aria-hidden="true" />
                      <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-black/10" aria-hidden="true" />
                      <div className="relative h-full p-4 flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-extrabold tracking-wide uppercase truncate">
                            {client?.client_name || 'Your Shop'}
                          </p>
                          <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/25 backdrop-blur">
                            {t.name}{!t.is_active && ' · inactive'}
                          </span>
                        </div>
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-semibold truncate">Member Name</p>
                            <p className="font-mono text-sm tracking-[0.18em] opacity-95">{sampleNumber}</p>
                            {t.description && <p className="text-[10px] opacity-80 mt-0.5 truncate">{t.description}</p>}
                          </div>
                          <div className="bg-white p-1.5 rounded-lg shrink-0" aria-hidden="true">
                            <QRCodeSVG value={sampleNumber} size={52} level="M" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Icon actions — details live behind the eye */}
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setPreviewTier(t)}
                        title="View card details" aria-label={`View ${t.name} card details`}
                        className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => openEditTier(t)}
                        title="Edit tier" aria-label={`Edit ${t.name}`}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {t.is_active && (
                        <button type="button" onClick={() => setDeleteConfirm(t.tier_id)}
                          title="Deactivate tier" aria-label={`Deactivate ${t.name}`}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* MEMBERS */}
        {tab === 'members' && (
          <MembersList tiers={sortedTiers} onToast={showToast} onViewCard={setActiveCardId} />
        )}

        {/* REPORTING */}
        {tab === 'reporting' && <Reporting />}
      </div>

      {/* Tier modal */}
      {showTierModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editingTier ? 'Edit Tier' : 'New Tier'}</h2>
              <button type="button" onClick={() => setShowTierModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
            </div>
            <div className="p-6">
              <TierForm tier={editingTier} allTiers={sortedTiers} saving={tierSaving}
                onSubmit={submitTier} onCancel={() => setShowTierModal(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Deactivate tier?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Existing cards on this tier keep working. The tier just won't be offered for new enrollments.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button type="button" onClick={() => deactivateTier(deleteConfirm)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">Deactivate</button>
            </div>
          </div>
        </div>
      )}

      {/* Tier card details — full front/back preview behind the eye icon */}
      {previewTier && (() => {
        const accent = previewTier.color || '#2563eb'
        const sampleNumber = `${tierPrefix(previewTier.name)}-001`
        const shopName = client?.client_name || 'Your Shop'
        const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const from = new Date()
        const to = previewTier.validity_days != null
          ? new Date(from.getTime() + previewTier.validity_days * 86400000)
          : null
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewTier(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{previewTier.name} — card details</h2>
                <button type="button" onClick={() => setPreviewTier(null)} aria-label="Close"
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* FRONT */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Front</p>
                  <div className="relative rounded-2xl text-white shadow-lg overflow-hidden aspect-[1.586]"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99 55%, ${accent}dd)` }}>
                    <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-black/10" aria-hidden="true" />
                    <div className="relative h-full p-4 flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-extrabold tracking-wide uppercase truncate">{shopName}</p>
                        <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/25 backdrop-blur">
                          {previewTier.name}
                        </span>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold truncate">Member Name</p>
                          <p className="font-mono text-sm tracking-[0.18em] opacity-95">{sampleNumber}</p>
                          <p className="text-[10px] opacity-80 mt-0.5">
                            Valid: {fmt(from)}{to ? ` – ${fmt(to)}` : ' · No expiry'}
                          </p>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg shrink-0" aria-hidden="true">
                          <QRCodeSVG value={sampleNumber} size={64} level="M" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BACK */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Back</p>
                  <div className="relative rounded-2xl shadow-lg overflow-hidden aspect-[1.586] bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <div className="h-7 mt-3" style={{ background: accent }} aria-hidden="true" />
                    <div className="p-4 pt-2 flex flex-col justify-between h-[calc(100%-2.5rem)]">
                      <ul className="text-[10px] leading-relaxed text-gray-600 dark:text-gray-300 space-y-0.5 mt-1">
                        {previewTier.discount_percentage != null && <li>• {previewTier.discount_percentage}% member discount on every bill</li>}
                        {previewTier.points_per_100 != null && <li>• Earn {previewTier.points_per_100} point{Number(previewTier.points_per_100) === 1 ? '' : 's'} per ₹100 spent</li>}
                        {previewTier.redemption_rate != null && <li>• Redeem points as money off — 1 pt = ₹{previewTier.redemption_rate}</li>}
                        {previewTier.monthly_negotiable_budget != null && <li>• ₹{previewTier.monthly_negotiable_budget} negotiation allowance per {previewTier.negotiable_budget_period === 'yearly' ? 'year' : 'month'}</li>}
                      </ul>
                      <div className="border-t border-gray-300 dark:border-gray-600 pt-1.5">
                        <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-200">{shopName}{client?.phone ? ` · ${client.phone}` : ''}</p>
                        <p className="text-[9px] text-gray-400">
                          This card is the property of {shopName}. Present at billing to use benefits. Not transferable.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Full benefit details */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {benefitTags(previewTier).map((tag, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{tag}</span>
                ))}
              </div>
              {previewTier.description && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{previewTier.description}</p>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => { setPreviewTier(null); openEditTier(previewTier) }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Edit tier</button>
                <button type="button" onClick={() => setPreviewTier(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Card view drawer */}
      {activeCardId && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setActiveCardId(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10 print:hidden">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Membership Card</h2>
              <button type="button" onClick={() => setActiveCardId(null)}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              <CardView cardId={activeCardId} onError={msg => showToast(msg, 'error')} />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

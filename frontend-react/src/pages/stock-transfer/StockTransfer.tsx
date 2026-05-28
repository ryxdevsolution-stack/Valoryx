import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/DashboardLayout'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import {
  ArrowRight, ArrowLeftRight, Plus, Minus, X, Check, XCircle,
  Package, Building2, ClipboardList, Clock, History, ChevronDown,
  ChevronUp, Loader2, Send, ShoppingCart, Trash2, Settings,
  PackageCheck, PackageOpen, Bell, RefreshCw,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Branch {
  branch_id: string
  name: string
  location: string
}

interface InventoryItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit: string
  rate: number
  item_code: string
  barcode: string
  is_low_stock: boolean
}

interface CartItem {
  product_id: string
  product_name: string
  quantity: number
  unit: string
  item_code: string
  available_stock: number
}

interface TransferRecord {
  transfer_id: string
  from_branch_id: string
  to_branch_id: string
  from_branch_name: string
  to_branch_name: string
  transfer_type: 'send' | 'request'
  status: 'requested' | 'in_transit' | 'received' | 'rejected' | 'pending' | 'completed'
  notes: string | null
  requester_name: string
  approver_name: string | null
  receiver_name: string | null
  approved_at: string | null
  dispatched_at: string | null
  received_at: string | null
  completed_at: string | null
  created_at: string
  items: { product_id: string; product_name: string; quantity: number; unit: string; item_code: string }[]
}

interface Toast { show: boolean; message: string; type: 'success' | 'error' }

// ─── CartSection (module-scope + memo — was inside component = remount every render) ──

interface CartSectionProps {
  inv: InventoryItem[]; invLoading: boolean; selId: string
  setSelId: (v: string) => void; qty: number; setQty: (v: number) => void
  maxQ: number; cartItems: CartItem[]
  onAdd: () => void; onAdjust: (id: string, d: number) => void
  onRemove: (id: string) => void; disabled: boolean
  fromLabel: string
}

const CartSection = memo(function CartSection({
  inv, invLoading: loading, selId, setSelId, qty, setQty,
  maxQ, cartItems, onAdd, onAdjust, onRemove, disabled,
  fromLabel,
}: CartSectionProps) {
  return (
    <div className="space-y-4">
      {/* Product picker */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-500" /> Add Products from <span className="text-blue-600 dark:text-blue-400">{fromLabel}</span>
        </h3>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading inventory…
          </div>
        ) : inv.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No inventory found for this branch.</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selId}
              onChange={(e) => { setSelId(e.target.value); setQty(1) }}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">Select product…</option>
              {inv.map((p) => (
                <option key={p.product_id} value={p.product_id} disabled={p.quantity === 0}>
                  {p.product_name} ({p.quantity} {p.unit} available){p.is_low_stock ? ' ⚠' : ''}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="number" min={1} max={maxQ} value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxQ, Number(e.target.value))))}
                className="w-16 text-center px-2 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm"
              />
              <button type="button" onClick={() => setQty(Math.min(maxQ, qty + 1))} disabled={qty >= maxQ} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button" onClick={onAdd} disabled={!selId || qty < 1 || disabled}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cart */}
      {cartItems.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-green-500" /> Transfer List ({cartItems.length})
          </h3>
          <div className="space-y-2">
            {cartItems.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product_name}</p>
                  {item.item_code && <p className="text-xs text-gray-400">#{item.item_code}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => onAdjust(item.product_id, -1)} disabled={item.quantity <= 1} className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-40">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm font-semibold w-8 text-center text-gray-900 dark:text-white">{item.quantity}</span>
                  <button type="button" onClick={() => onAdjust(item.product_id, 1)} disabled={item.quantity >= item.available_stock} className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-40">
                    <Plus className="w-3 h-3" />
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">{item.unit}</span>
                  <button type="button" onClick={() => onRemove(item.product_id)} className="ml-2 text-red-400 hover:text-red-600 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// owner tabs
type OwnerTab = 'send' | 'requests' | 'in_transit' | 'history'
// manager tabs
type ManagerTab = 'incoming' | 'request' | 'my_requests' | 'history'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    requested:  { bg: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700', text: 'text-purple-800 dark:text-purple-300', label: 'Requested' },
    in_transit: { bg: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700',     text: 'text-blue-800 dark:text-blue-300',     label: 'In Transit' },
    received:   { bg: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700', text: 'text-green-800 dark:text-green-300',   label: 'Received' },
    rejected:   { bg: 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700',         text: 'text-red-800 dark:text-red-300',       label: 'Rejected' },
    // legacy
    pending:    { bg: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-300',   label: 'Pending' },
    completed:  { bg: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700', text: 'text-green-800 dark:text-green-300',   label: 'Completed' },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
          <div className="flex items-center gap-4 mb-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          </div>
          <div className="flex gap-4">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TransferCard ─────────────────────────────────────────────────────────────

function TransferCard({
  transfer,
  expanded,
  onToggle,
  actionLoading,
  onApprove,
  onReceive,
  onReject,
}: {
  transfer: TransferRecord
  expanded: boolean
  onToggle: () => void
  actionLoading: string | null
  onApprove?: (id: string) => void
  onReceive?: (id: string) => void
  onReject?: (id: string) => void
}) {
  const loading = actionLoading === transfer.transfer_id
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5">
        {/* Route row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="font-semibold text-gray-900 dark:text-white">{transfer.from_branch_name}</span>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-semibold text-gray-900 dark:text-white">{transfer.to_branch_name}</span>
          <StatusBadge status={transfer.status} />
          {transfer.transfer_type === 'request' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
              Request
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
          <span>{transfer.items.length} item{transfer.items.length !== 1 ? 's' : ''}</span>
          <span>By {transfer.requester_name}</span>
          <span>{fmtDate(transfer.created_at)}</span>
          {transfer.dispatched_at && <span>Sent {fmtDate(transfer.dispatched_at)}</span>}
          {transfer.received_at && <span>Received {fmtDate(transfer.received_at)}</span>}
        </div>

        {transfer.notes && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-3 line-clamp-2">{transfer.notes}</p>
        )}

        {/* Actions + expand toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {onApprove && (
            <button
              type="button"
              onClick={() => onApprove(transfer.transfer_id)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Approve & Dispatch
            </button>
          )}
          {onReceive && (
            <button
              type="button"
              onClick={() => onReceive(transfer.transfer_id)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
              Mark as Received
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={() => onReject(transfer.transfer_id)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? 'Hide' : 'Show'} items
          </button>
        </div>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-900/30">
          <div className="space-y-2">
            {transfer.items.map((item) => (
              <div key={item.product_id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{item.product_name}</span>
                  {item.item_code && <span className="ml-2 text-xs text-gray-400">#{item.item_code}</span>}
                </div>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{item.quantity} {item.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockTransfer() {
  const navigate = useNavigate()
  const { user } = useClient()

  // Role detection
  const isOwner = user?.role === 'owner' && !user?.branch_id
  const isBranchManager = user?.role === 'manager' && !!user?.branch_id
  const userBranchId = user?.branch_id ?? null

  // ── Common state ──
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectModalId, setRejectModalId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const hasInit = useRef(false)

  // ── Owner tabs ──
  const [ownerTab, setOwnerTab] = useState<OwnerTab>('send')

  // ── Manager tabs ──
  const [managerTab, setManagerTab] = useState<ManagerTab>('incoming')

  // ── Transfer lists ──
  const [sendResult, setSendResult]       = useState<TransferRecord[]>([])
  const [requests, setRequests]           = useState<TransferRecord[]>([])
  const [inTransit, setInTransit]         = useState<TransferRecord[]>([])
  const [incoming, setIncoming]           = useState<TransferRecord[]>([])
  const [myRequests, setMyRequests]       = useState<TransferRecord[]>([])
  const [history, setHistory]             = useState<TransferRecord[]>([])
  const [historyTotal, setHistoryTotal]   = useState(0)
  const [historyPage, setHistoryPage]     = useState(1)
  const [listLoading, setListLoading]     = useState(false)
  const HISTORY_PER_PAGE = 20

  // ── Create/send form (owner) ──
  const [fromBranchId, setFromBranchId]   = useState('')
  const [toBranchId, setToBranchId]       = useState('')
  const [inventory, setInventory]         = useState<InventoryItem[]>([])
  const [invLoading, setInvLoading]       = useState(false)
  const [selProductId, setSelProductId]   = useState('')
  const [transferQty, setTransferQty]     = useState(1)
  const [cart, setCart]                   = useState<CartItem[]>([])
  const [sendNotes, setSendNotes]         = useState('')
  const [submitting, setSubmitting]       = useState(false)

  // ── Request form (manager) ──
  const [reqFromBranchId, setReqFromBranchId] = useState('')
  const [reqInventory, setReqInventory]       = useState<InventoryItem[]>([])
  const [reqInvLoading, setReqInvLoading]     = useState(false)
  const [reqSelProductId, setReqSelProductId] = useState('')
  const [reqQty, setReqQty]                   = useState(1)
  const [reqCart, setReqCart]                 = useState<CartItem[]>([])
  const [reqNotes, setReqNotes]               = useState('')
  const [reqSubmitting, setReqSubmitting]     = useState(false)

  // ── Toast ──
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500)
  }, [])

  // ── Toggle expand ──
  const toggleExpand = useCallback((id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }), [])

  // ── Fetch branches ──
  useEffect(() => {
    if (hasInit.current) return
    hasInit.current = true
    setBranchesLoading(true)
    api.get('/branches')
      .then((r) => setBranches(r.data.data ?? []))
      .catch(() => showToast('Failed to load branches', 'error'))
      .finally(() => setBranchesLoading(false))
  }, [showToast])

  // ── Fetch inventory for send form ──
  useEffect(() => {
    if (!fromBranchId) { setInventory([]); setSelProductId(''); return }
    setInvLoading(true)
    api.get(`/stock-transfers/branches/${fromBranchId}/inventory`)
      .then((r) => setInventory(r.data.data ?? []))
      .catch(() => showToast('Failed to load inventory', 'error'))
      .finally(() => setInvLoading(false))
  }, [fromBranchId, showToast])

  // ── Fetch inventory for request form ──
  useEffect(() => {
    if (!reqFromBranchId) { setReqInventory([]); setReqSelProductId(''); return }
    setReqInvLoading(true)
    api.get(`/stock-transfers/branches/${reqFromBranchId}/inventory`)
      .then((r) => setReqInventory(r.data.data ?? []))
      .catch(() => showToast('Failed to load inventory', 'error'))
      .finally(() => setReqInvLoading(false))
  }, [reqFromBranchId, showToast])

  // ── Fetch transfers when tab changes ──
  const fetchForTab = useCallback(async (tab: OwnerTab | ManagerTab) => {
    setListLoading(true)
    try {
      if (tab === 'send') {
        const r = await api.get('/stock-transfers', { params: { transfer_type: 'send', status: 'in_transit' } })
        setSendResult(r.data.data ?? [])
      } else if (tab === 'requests') {
        const r = await api.get('/stock-transfers', { params: { status: 'requested' } })
        setRequests(r.data.data ?? [])
      } else if (tab === 'in_transit') {
        const r = await api.get('/stock-transfers', { params: { status: 'in_transit' } })
        setInTransit(r.data.data ?? [])
      } else if (tab === 'incoming') {
        const r = await api.get('/stock-transfers', { params: { status: 'in_transit', to_branch_id: userBranchId } })
        setIncoming(r.data.data ?? [])
      } else if (tab === 'my_requests') {
        const r = await api.get('/stock-transfers', { params: { transfer_type: 'request', to_branch_id: userBranchId } })
        setMyRequests(r.data.data ?? [])
      } else if (tab === 'history') {
        const params: Record<string, any> = { page: historyPage, per_page: HISTORY_PER_PAGE }
        if (isBranchManager && userBranchId) params.to_branch_id = userBranchId
        const r = await api.get('/stock-transfers', { params })
        setHistory(r.data.data ?? [])
        setHistoryTotal(r.data.total ?? 0)
      }
    } catch {
      showToast('Failed to load transfers', 'error')
    } finally {
      setListLoading(false)
    }
  }, [historyPage, isBranchManager, userBranchId, showToast])

  useEffect(() => {
    // Don't fetch before user is resolved — prevents ghost calls when user=null
    // causes isOwner=false, incorrectly routing to manager tabs on first render
    if (!user) return
    const tab = isOwner ? ownerTab : managerTab
    if (tab !== 'send' && tab !== 'request') {
      fetchForTab(tab as OwnerTab | ManagerTab)
    }
  }, [ownerTab, managerTab, isOwner, user, fetchForTab])

  // ── Derived ──
  const toBranchOptions = useMemo(() => branches.filter((b) => b.branch_id !== fromBranchId), [branches, fromBranchId])
  const reqBranchOptions = useMemo(() => branches.filter((b) => b.branch_id !== userBranchId), [branches, userBranchId])
  const selProduct = useMemo(() => inventory.find((i) => i.product_id === selProductId) ?? null, [inventory, selProductId])
  const reqSelProduct = useMemo(() => reqInventory.find((i) => i.product_id === reqSelProductId) ?? null, [reqInventory, reqSelProductId])
  const maxQty = useMemo(() => {
    if (!selProduct) return 0
    const inCart = cart.find((c) => c.product_id === selProduct.product_id)
    return selProduct.quantity - (inCart?.quantity ?? 0)
  }, [selProduct, cart])
  const reqMaxQty = useMemo(() => {
    if (!reqSelProduct) return 0
    const inCart = reqCart.find((c) => c.product_id === reqSelProduct.product_id)
    return reqSelProduct.quantity - (inCart?.quantity ?? 0)
  }, [reqSelProduct, reqCart])

  // ── Cart helpers (shared logic) ──
  const addToCart = useCallback((
    product: InventoryItem, qty: number,
    setCartFn: React.Dispatch<React.SetStateAction<CartItem[]>>,
    setSelFn: React.Dispatch<React.SetStateAction<string>>,
    setQtyFn: React.Dispatch<React.SetStateAction<number>>
  ) => {
    setCartFn((prev) => {
      const existing = prev.find((c) => c.product_id === product.product_id)
      if (existing) return prev.map((c) => c.product_id === product.product_id ? { ...c, quantity: c.quantity + qty } : c)
      return [...prev, { product_id: product.product_id, product_name: product.product_name, quantity: qty, unit: product.unit, item_code: product.item_code, available_stock: product.quantity }]
    })
    setSelFn('')
    setQtyFn(1)
  }, [])

  const adjustCartQty = useCallback((productId: string, delta: number, setCartFn: React.Dispatch<React.SetStateAction<CartItem[]>>) => {
    setCartFn((prev) => prev.map((c) => {
      if (c.product_id !== productId) return c
      const nq = c.quantity + delta
      return nq < 1 || nq > c.available_stock ? c : { ...c, quantity: nq }
    }))
  }, [])

  // ── Submit send (owner) ──
  const handleSend = async () => {
    if (!fromBranchId || !toBranchId) { showToast('Select both branches', 'error'); return }
    if (cart.length === 0) { showToast('Add at least one item', 'error'); return }
    try {
      setSubmitting(true)
      await api.post('/stock-transfers', {
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        items: cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
        notes: sendNotes.trim() || undefined,
      })
      showToast('Stock dispatched! Awaiting branch receipt confirmation.', 'success')
      setCart([]); setSendNotes(''); setFromBranchId(''); setToBranchId(''); setInventory([])
      fetchForTab('in_transit')
    } catch (err: any) {
      showToast(err.response?.data?.error ?? 'Failed to dispatch', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submit request (manager) ──
  const handleRequest = async () => {
    if (!reqFromBranchId) { showToast('Select the branch to request from', 'error'); return }
    if (reqCart.length === 0) { showToast('Add at least one item', 'error'); return }
    try {
      setReqSubmitting(true)
      await api.post('/stock-transfers/request', {
        from_branch_id: reqFromBranchId,
        items: reqCart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
        notes: reqNotes.trim() || undefined,
      })
      showToast('Stock request submitted. Waiting for owner approval.', 'success')
      setReqCart([]); setReqNotes(''); setReqFromBranchId(''); setReqInventory([])
      fetchForTab('my_requests')
    } catch (err: any) {
      showToast(err.response?.data?.error ?? 'Failed to submit request', 'error')
    } finally {
      setReqSubmitting(false)
    }
  }

  // ── Approve (owner approves a branch request) ──
  const handleApprove = async (transferId: string) => {
    setActionLoading(transferId)
    try {
      await api.post(`/stock-transfers/${transferId}/approve`)
      showToast('Request approved. Stock is in transit.', 'success')
      fetchForTab('requests')
      fetchForTab('in_transit')
    } catch (err: any) {
      showToast(err.response?.data?.error ?? 'Failed to approve', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Receive (branch manager confirms receipt) ──
  const handleReceive = async (transferId: string) => {
    setActionLoading(transferId)
    try {
      await api.post(`/stock-transfers/${transferId}/receive`)
      showToast('Stock received and added to your branch inventory!', 'success')
      fetchForTab('incoming')
    } catch (err: any) {
      showToast(err.response?.data?.error ?? 'Failed to mark received', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Reject ──
  const handleRejectConfirm = async () => {
    if (!rejectModalId) return
    setActionLoading(rejectModalId)
    try {
      await api.post(`/stock-transfers/${rejectModalId}/reject`, { reason: rejectReason.trim() || undefined })
      showToast('Transfer rejected', 'success')
      setRejectModalId(null); setRejectReason('')
      fetchForTab(isOwner ? 'requests' : 'incoming')
    } catch (err: any) {
      showToast(err.response?.data?.error ?? 'Failed to reject', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Owner: Send Stock tab ──────────────────────────────────────────────────

  const renderSendTab = () => (
    <div className="space-y-5">
      {/* Branch selectors */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500" /> Select Branches
        </h2>
        {branchesLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : branches.length < 2 ? (
          <div className="text-center py-6">
            <Building2 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">You need at least 2 branches to transfer stock.</p>
            <button onClick={() => navigate('/stock-transfer/branches')} className="mt-3 text-sm text-blue-600 dark:text-blue-400 underline">Manage Branches</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From Branch</label>
              <select
                value={fromBranchId}
                onChange={(e) => { setFromBranchId(e.target.value); if (e.target.value === toBranchId) setToBranchId(''); setCart([]) }}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select source branch…</option>
                {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}{b.location ? ` (${b.location})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To Branch</label>
              <select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                disabled={!fromBranchId}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">Select destination…</option>
                {toBranchOptions.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}{b.location ? ` (${b.location})` : ''}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Cart */}
      {fromBranchId && toBranchId && (
        <CartSection
          inv={inventory} invLoading={invLoading} selId={selProductId} setSelId={setSelProductId}
          qty={transferQty} setQty={setTransferQty} maxQ={maxQty} cartItems={cart}
          fromLabel={branches.find((b) => b.branch_id === fromBranchId)?.name ?? ''}
          onAdd={() => { if (!selProduct || transferQty < 1 || transferQty > maxQty) return; addToCart(selProduct, transferQty, setCart, setSelProductId, setTransferQty) }}
          onAdjust={(id, d) => adjustCartQty(id, d, setCart)}
          onRemove={(id) => setCart((p) => p.filter((c) => c.product_id !== id))}
          disabled={submitting}
        />
      )}

      {/* Notes + submit */}
      {cart.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes (optional)</label>
            <textarea
              value={sendNotes} onChange={(e) => setSendNotes(e.target.value)}
              rows={2} placeholder="Add notes about this transfer…"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg resize-none text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            Stock will be <strong>deducted from the source branch immediately</strong> and shown as "In Transit" until the destination branch confirms receipt.
          </div>
          <div className="flex justify-end">
            <button
              type="button" onClick={handleSend} disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Dispatch Stock
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ─── Owner: Branch Requests tab ───────────────────────────────────────────

  const renderRequestsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">Stock requests from your branch managers awaiting approval.</p>
        <button type="button" onClick={() => fetchForTab('requests')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {listLoading ? <SkeletonCard /> : requests.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Bell className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No pending requests</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Branch managers haven't requested any stock yet.</p>
        </div>
      ) : (
        requests.map((t) => (
          <TransferCard key={t.transfer_id} transfer={t} expanded={expanded.has(t.transfer_id)} onToggle={() => toggleExpand(t.transfer_id)}
            actionLoading={actionLoading}
            onApprove={handleApprove}
            onReject={(id) => { setRejectModalId(id); setRejectReason('') }}
          />
        ))
      )}
    </div>
  )

  // ─── Owner: In Transit tab ────────────────────────────────────────────────

  const renderInTransitTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">Stock dispatched, awaiting branch receipt confirmation.</p>
        <button type="button" onClick={() => fetchForTab('in_transit')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {listLoading ? <SkeletonCard /> : inTransit.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PackageOpen className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Nothing in transit</p>
        </div>
      ) : (
        inTransit.map((t) => (
          <TransferCard key={t.transfer_id} transfer={t} expanded={expanded.has(t.transfer_id)} onToggle={() => toggleExpand(t.transfer_id)}
            actionLoading={actionLoading}
            onReject={(id) => { setRejectModalId(id); setRejectReason('') }}
          />
        ))
      )}
    </div>
  )

  // ─── Manager: Incoming tab ────────────────────────────────────────────────

  const renderIncomingTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">Stock dispatched to your branch. Mark as received when goods arrive.</p>
        <button type="button" onClick={() => fetchForTab('incoming')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {listLoading ? <SkeletonCard /> : incoming.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PackageCheck className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No incoming stock</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">No transfers in transit to your branch right now.</p>
        </div>
      ) : (
        incoming.map((t) => (
          <TransferCard key={t.transfer_id} transfer={t} expanded={expanded.has(t.transfer_id)} onToggle={() => toggleExpand(t.transfer_id)}
            actionLoading={actionLoading}
            onReceive={handleReceive}
          />
        ))
      )}
    </div>
  )

  // ─── Manager: Request Stock tab ───────────────────────────────────────────

  const renderRequestTab = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-purple-500" /> Request From Branch
        </h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Request From</label>
          <select
            value={reqFromBranchId}
            onChange={(e) => { setReqFromBranchId(e.target.value); setReqCart([]) }}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
          >
            <option value="">Select branch to request from…</option>
            {reqBranchOptions.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}{b.location ? ` (${b.location})` : ''}</option>)}
          </select>
        </div>
      </div>

      {reqFromBranchId && (
        <CartSection
          inv={reqInventory} invLoading={reqInvLoading} selId={reqSelProductId} setSelId={setReqSelProductId}
          qty={reqQty} setQty={setReqQty} maxQ={reqMaxQty} cartItems={reqCart}
          fromLabel={branches.find((b) => b.branch_id === reqFromBranchId)?.name ?? ''}
          onAdd={() => { if (!reqSelProduct || reqQty < 1 || reqQty > reqMaxQty) return; addToCart(reqSelProduct, reqQty, setReqCart, setReqSelProductId, setReqQty) }}
          onAdjust={(id, d) => adjustCartQty(id, d, setReqCart)}
          onRemove={(id) => setReqCart((p) => p.filter((c) => c.product_id !== id))}
          disabled={reqSubmitting}
        />
      )}

      {reqCart.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes (optional)</label>
            <textarea
              value={reqNotes} onChange={(e) => setReqNotes(e.target.value)}
              rows={2} placeholder="Reason for request, urgency, etc…"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg resize-none text-sm focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button" onClick={handleRequest} disabled={reqSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm disabled:opacity-60"
            >
              {reqSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Request
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ─── Manager: My Requests tab ─────────────────────────────────────────────

  const renderMyRequestsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">Requests you've submitted to the owner.</p>
        <button type="button" onClick={() => fetchForTab('my_requests')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {listLoading ? <SkeletonCard /> : myRequests.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ClipboardList className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No requests yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Use the "Request Stock" tab to request materials.</p>
        </div>
      ) : (
        myRequests.map((t) => (
          <TransferCard key={t.transfer_id} transfer={t} expanded={expanded.has(t.transfer_id)} onToggle={() => toggleExpand(t.transfer_id)} actionLoading={actionLoading} />
        ))
      )}
    </div>
  )

  // ─── History tab (shared) ─────────────────────────────────────────────────

  const totalHistoryPages = Math.ceil(historyTotal / HISTORY_PER_PAGE)
  const renderHistoryTab = () => (
    <div className="space-y-4">
      {listLoading ? <SkeletonCard /> : history.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <History className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No transfer history</p>
        </div>
      ) : (
        <>
          {history.map((t) => (
            <TransferCard key={t.transfer_id} transfer={t} expanded={expanded.has(t.transfer_id)} onToggle={() => toggleExpand(t.transfer_id)} actionLoading={actionLoading} />
          ))}
          {totalHistoryPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-40">
                Previous
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">Page {historyPage} of {totalHistoryPages}</span>
              <button type="button" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage((p) => p + 1)} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const ownerTabs: { key: OwnerTab; label: string; icon: typeof Send }[] = [
    { key: 'send',       label: 'Send Stock',       icon: Send },
    { key: 'requests',   label: 'Branch Requests',  icon: Bell },
    { key: 'in_transit', label: 'In Transit',        icon: PackageOpen },
    { key: 'history',    label: 'History',           icon: History },
  ]

  const managerTabs: { key: ManagerTab; label: string; icon: typeof Send }[] = [
    { key: 'incoming',    label: 'Incoming',      icon: PackageCheck },
    { key: 'request',     label: 'Request Stock', icon: ClipboardList },
    { key: 'my_requests', label: 'My Requests',   icon: Clock },
    { key: 'history',     label: 'History',       icon: History },
  ]

  const activeTabs      = isOwner ? ownerTabs : managerTabs
  const activeTab       = isOwner ? ownerTab  : managerTab
  const setActiveTab    = isOwner
    ? (k: string) => setOwnerTab(k as OwnerTab)
    : (k: string) => setManagerTab(k as ManagerTab)

  const branchName = useMemo(() => {
    if (!userBranchId) return ''
    return branches.find((b) => b.branch_id === userBranchId)?.name ?? ''
  }, [branches, userBranchId])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      {/* Toast */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-lg shadow-2xl border ${
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/90 border-green-500 text-green-800 dark:text-green-100'
              : 'bg-red-50 dark:bg-red-900/90 border-red-500 text-red-800 dark:text-red-100'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
              {toast.type === 'success' ? <Check className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-white" />}
            </div>
            <p className="text-sm font-medium">{toast.message}</p>
            <button onClick={() => setToast({ show: false, message: '', type: 'success' })} className="ml-2 text-current opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Reject Transfer</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Provide an optional reason for rejecting this transfer.</p>
            <textarea
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)…" rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg resize-none text-sm focus:ring-2 focus:ring-red-500"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => { setRejectModalId(null); setRejectReason('') }} disabled={!!actionLoading}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium">
                Cancel
              </button>
              <button type="button" onClick={handleRejectConfirm} disabled={!!actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <ArrowLeftRight className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Stock Transfer
            {isBranchManager && branchName && (
              <span className="text-base font-normal text-gray-500 dark:text-gray-400">— {branchName}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {isOwner ? 'Dispatch stock to branches and manage transfer requests' : 'View incoming stock and request materials from other branches'}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => navigate('/stock-transfer/branches')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition font-medium text-sm"
          >
            <Settings className="w-4 h-4" /> Manage Branches
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {activeTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {isOwner && ownerTab === 'send'       && renderSendTab()}
      {isOwner && ownerTab === 'requests'   && renderRequestsTab()}
      {isOwner && ownerTab === 'in_transit' && renderInTransitTab()}
      {isOwner && ownerTab === 'history'    && renderHistoryTab()}

      {isBranchManager && managerTab === 'incoming'    && renderIncomingTab()}
      {isBranchManager && managerTab === 'request'     && renderRequestTab()}
      {isBranchManager && managerTab === 'my_requests' && renderMyRequestsTab()}
      {isBranchManager && managerTab === 'history'     && renderHistoryTab()}

      {/* Fallback for users with no role match */}
      {!isOwner && !isBranchManager && (
        <div className="text-center py-16">
          <ArrowLeftRight className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">You don't have access to stock transfers.</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Contact your administrator to be assigned to a branch.</p>
        </div>
      )}
    </DashboardLayout>
  )
}

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import {
  ArrowRight,
  ArrowLeftRight,
  Plus,
  Minus,
  X,
  Check,
  XCircle,
  Package,
  Building2,
  ClipboardList,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  FileText,
  ShoppingCart,
  Trash2,
  Settings,
} from 'lucide-react'

// ─── Type Definitions ────────────────────────────────────────────────────────

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

interface TransferItem {
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
  status: 'pending' | 'completed' | 'rejected'
  notes: string
  requester_name: string
  approver_name: string | null
  approved_at: string | null
  completed_at: string | null
  created_at: string
  items: {
    product_id: string
    product_name: string
    quantity: number
    unit: string
    item_code: string
  }[]
}

interface Toast {
  show: boolean
  message: string
  type: 'success' | 'error'
}

type TabKey = 'create' | 'pending' | 'history'

// ─── Helper: Format Date ─────────────────────────────────────────────────────

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Helper: Status Badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700',
      text: 'text-amber-800 dark:text-amber-300',
      label: 'Pending',
    },
    completed: {
      bg: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700',
      text: 'text-green-800 dark:text-green-300',
      label: 'Completed',
    },
    rejected: {
      bg: 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700',
      text: 'text-red-800 dark:text-red-300',
      label: 'Rejected',
    },
  }
  const c = config[status] ?? config.pending
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ─── Helper: Skeleton Card ───────────────────────────────────────────────────

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
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function StockTransfer() {
  const navigate = useNavigate()
  const hasInitialized = useRef(false)

  // ── Global State ──
  const [activeTab, setActiveTab] = useState<TabKey>('create')
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' })

  // ── Create Transfer State ──
  const [fromBranchId, setFromBranchId] = useState('')
  const [toBranchId, setToBranchId] = useState('')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [transferQty, setTransferQty] = useState<number>(1)
  const [cart, setCart] = useState<TransferItem[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Pending Approvals State ──
  const [pendingTransfers, setPendingTransfers] = useState<TransferRecord[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [expandedPending, setExpandedPending] = useState<Set<string>>(new Set())
  const [rejectModalId, setRejectModalId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── History State ──
  const [historyTransfers, setHistoryTransfers] = useState<TransferRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const HISTORY_PER_PAGE = 20

  // ── Toast Helper ──
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }, [])

  // ── Fetch Branches (on mount) ──
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const loadBranches = async () => {
      try {
        setBranchesLoading(true)
        const response = await api.get('/branches')
        setBranches(response.data.data ?? response.data.branches ?? [])
      } catch (err: any) {
        console.error('Failed to fetch branches:', err)
        showToast('Failed to load branches', 'error')
      } finally {
        setBranchesLoading(false)
      }
    }
    loadBranches()
  }, [showToast])

  // ── Fetch Inventory when "From Branch" changes ──
  useEffect(() => {
    if (!fromBranchId) {
      setInventory([])
      setSelectedProductId('')
      return
    }

    const loadInventory = async () => {
      try {
        setInventoryLoading(true)
        setSelectedProductId('')
        setTransferQty(1)
        const response = await api.get(`/stock-transfers/branches/${fromBranchId}/inventory`)
        setInventory(response.data.data ?? response.data.inventory ?? [])
      } catch (err: any) {
        console.error('Failed to fetch inventory:', err)
        showToast('Failed to load branch inventory', 'error')
        setInventory([])
      } finally {
        setInventoryLoading(false)
      }
    }
    loadInventory()
  }, [fromBranchId, showToast])

  // ── Fetch Pending Transfers when tab changes ──
  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingTransfers()
    }
  }, [activeTab])

  // ── Fetch History when tab/filter/page changes ──
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistoryTransfers()
    }
  }, [activeTab, historyStatusFilter, historyPage])

  // ── API Calls ──

  const fetchPendingTransfers = async () => {
    try {
      setPendingLoading(true)
      const response = await api.get('/stock-transfers', { params: { status: 'pending' } })
      setPendingTransfers(response.data.data ?? [])
    } catch (err: any) {
      console.error('Failed to fetch pending transfers:', err)
      showToast('Failed to load pending transfers', 'error')
    } finally {
      setPendingLoading(false)
    }
  }

  const fetchHistoryTransfers = async () => {
    try {
      setHistoryLoading(true)
      const params: Record<string, any> = { page: historyPage, per_page: HISTORY_PER_PAGE }
      if (historyStatusFilter !== 'all') {
        params.status = historyStatusFilter
      }
      const response = await api.get('/stock-transfers', { params })
      setHistoryTransfers(response.data.data ?? [])
      setHistoryTotal(response.data.total ?? 0)
    } catch (err: any) {
      console.error('Failed to fetch transfer history:', err)
      showToast('Failed to load transfer history', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  // ── Derived Values ──

  const toBranchOptions = useMemo(() => {
    return branches.filter((b) => b.branch_id !== fromBranchId)
  }, [branches, fromBranchId])

  const selectedProduct = useMemo(() => {
    return inventory.find((item) => item.product_id === selectedProductId) ?? null
  }, [inventory, selectedProductId])

  const maxQty = useMemo(() => {
    if (!selectedProduct) return 0
    const existingInCart = cart.find((c) => c.product_id === selectedProduct.product_id)
    return selectedProduct.quantity - (existingInCart?.quantity ?? 0)
  }, [selectedProduct, cart])

  const totalHistoryPages = Math.ceil(historyTotal / HISTORY_PER_PAGE)

  // ── Cart Actions ──

  const handleAddToCart = () => {
    if (!fromBranchId || !toBranchId) {
      showToast('Please select both From and To branches', 'error')
      return
    }
    if (!selectedProduct) {
      showToast('Please select a product', 'error')
      return
    }
    if (transferQty < 1 || transferQty > maxQty) {
      showToast(`Quantity must be between 1 and ${maxQty}`, 'error')
      return
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === selectedProduct.product_id)
      if (existing) {
        return prev.map((c) =>
          c.product_id === selectedProduct.product_id
            ? { ...c, quantity: c.quantity + transferQty }
            : c
        )
      }
      return [
        ...prev,
        {
          product_id: selectedProduct.product_id,
          product_name: selectedProduct.product_name,
          quantity: transferQty,
          unit: selectedProduct.unit,
          item_code: selectedProduct.item_code,
          available_stock: selectedProduct.quantity,
        },
      ]
    })

    setSelectedProductId('')
    setTransferQty(1)
  }

  const handleCartQtyChange = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item
        const newQty = item.quantity + delta
        if (newQty < 1 || newQty > item.available_stock) return item
        return { ...item, quantity: newQty }
      })
    )
  }

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId))
  }

  // ── Submit Transfer ──

  const handleSubmitTransfer = async () => {
    if (!fromBranchId || !toBranchId) {
      showToast('Please select both branches', 'error')
      return
    }
    if (cart.length === 0) {
      showToast('Please add at least one item to the transfer list', 'error')
      return
    }

    try {
      setSubmitting(true)
      await api.post('/stock-transfers', {
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
        notes: notes.trim() || undefined,
      })

      showToast('Transfer request submitted successfully!', 'success')
      setCart([])
      setNotes('')
      setFromBranchId('')
      setToBranchId('')
      setSelectedProductId('')
      setTransferQty(1)
      setInventory([])
    } catch (err: any) {
      const msg = err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to submit transfer request'
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Approve / Reject ──

  const handleApprove = async (transferId: string) => {
    try {
      setActionLoading(transferId)
      await api.post(`/stock-transfers/${transferId}/approve`)
      showToast('Transfer approved successfully!', 'success')
      fetchPendingTransfers()
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Failed to approve transfer'
      showToast(msg, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModalId) return
    try {
      setActionLoading(rejectModalId)
      await api.post(`/stock-transfers/${rejectModalId}/reject`, {
        reason: rejectReason.trim() || undefined,
      })
      showToast('Transfer rejected', 'success')
      setRejectModalId(null)
      setRejectReason('')
      fetchPendingTransfers()
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Failed to reject transfer'
      showToast(msg, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Toggle expand for cards ──

  const toggleExpandPending = (id: string) => {
    setExpandedPending((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpandHistory = (id: string) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Tab Definitions ──

  const tabs: { key: TabKey; label: string; icon: typeof ClipboardList }[] = [
    { key: 'create', label: 'Create Transfer', icon: ClipboardList },
    { key: 'pending', label: 'Pending Approvals', icon: Clock },
    { key: 'history', label: 'Transfer History', icon: History },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div
            className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl border ${
              toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/90 border-green-500 text-green-800 dark:text-green-100'
                : 'bg-red-50 dark:bg-red-900/90 border-red-500 text-red-800 dark:text-red-100'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
              }`}
            >
              {toast.type === 'success' ? (
                <Check className="w-5 h-5 text-white" />
              ) : (
                <X className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <p className="font-semibold text-lg">{toast.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-sm opacity-90">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast({ show: false, message: '', type: 'success' })}
              className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Reject Transfer</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Provide an optional reason for rejecting this transfer request.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setRejectModalId(null)
                  setRejectReason('')
                }}
                disabled={actionLoading === rejectModalId}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModalId}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {actionLoading === rejectModalId ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Reject Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <ArrowLeftRight className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Stock Transfer
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Transfer inventory between branches</p>
        </div>
        <button
          onClick={() => navigate('/stock-transfer/branches')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition font-medium text-sm"
        >
          <Settings className="w-4 h-4" />
          Manage Branches
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          const Icon = tab.icon
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

      {/* ═══════════════════════ Tab 1: Create Transfer ═══════════════════════ */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Branch Selectors */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Select Branches
            </h2>

            {branchesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="ml-3 text-gray-500 dark:text-gray-400">Loading branches...</span>
              </div>
            ) : branches.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No branches found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Create branches first to start transferring stock.
                </p>
                <button
                  onClick={() => navigate('/stock-transfer/branches')}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Branch
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* From Branch */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    From Branch
                  </label>
                  <select
                    value={fromBranchId}
                    onChange={(e) => {
                      setFromBranchId(e.target.value)
                      if (e.target.value === toBranchId) setToBranchId('')
                      setCart([])
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="">Select source branch...</option>
                    {branches.map((b) => (
                      <option key={b.branch_id} value={b.branch_id}>
                        {b.name} {b.location ? `(${b.location})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* To Branch */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    To Branch
                  </label>
                  <select
                    value={toBranchId}
                    onChange={(e) => setToBranchId(e.target.value)}
                    disabled={!fromBranchId}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select destination branch...</option>
                    {toBranchOptions.map((b) => (
                      <option key={b.branch_id} value={b.branch_id}>
                        {b.name} {b.location ? `(${b.location})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Product Selector + Add to Cart */}
          {fromBranchId && toBranchId && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                Add Products
              </h2>

              {inventoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-green-600 dark:text-green-400" />
                  <span className="ml-3 text-gray-500 dark:text-gray-400">Loading inventory...</span>
                </div>
              ) : inventory.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No inventory found</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                    This branch has no stock available to transfer.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Product Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Product
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => {
                        setSelectedProductId(e.target.value)
                        setTransferQty(1)
                      }}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                    >
                      <option value="">Select a product...</option>
                      {inventory
                        .filter((item) => item.quantity > 0)
                        .map((item) => {
                          const cartItem = cart.find((c) => c.product_id === item.product_id)
                          const remaining = item.quantity - (cartItem?.quantity ?? 0)
                          return (
                            <option
                              key={item.product_id}
                              value={item.product_id}
                              disabled={remaining <= 0}
                            >
                              {item.product_name} (Available: {remaining} {item.unit})
                              {remaining <= 0 ? ' - All in cart' : ''}
                            </option>
                          )
                        })}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="w-full sm:w-40">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={maxQty > 0 ? maxQty : 1}
                      value={transferQty}
                      onChange={(e) => setTransferQty(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={!selectedProduct || maxQty <= 0}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {selectedProduct && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Max: {maxQty} {selectedProduct.unit}
                      </p>
                    )}
                  </div>

                  {/* Add Button */}
                  <div className="flex items-end">
                    <button
                      onClick={handleAddToCart}
                      disabled={!selectedProduct || maxQty <= 0 || transferQty < 1}
                      className="w-full sm:w-auto px-5 py-2.5 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Transfer List
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transfer Cart */}
          {cart.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Transfer List
                <span className="ml-auto text-sm font-normal text-gray-500 dark:text-gray-400">
                  {cart.length} item{cart.length > 1 ? 's' : ''} ·{' '}
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} total units
                </span>
              </h2>

              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.product_id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.item_code ? `SKU: ${item.item_code} · ` : ''}
                        Available: {item.available_stock} {item.unit}
                      </p>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCartQtyChange(item.product_id, -1)}
                        disabled={item.quantity <= 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center font-semibold text-gray-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleCartQtyChange(item.product_id, 1)}
                        disabled={item.quantity >= item.available_stock}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{item.unit}</span>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => handleRemoveFromCart(item.product_id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                      aria-label={`Remove ${item.product_name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div className="mt-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes for this transfer..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Submit Button */}
              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleSubmitTransfer}
                  disabled={submitting}
                  className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition font-semibold flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  {submitting ? 'Submitting...' : 'Submit Transfer Request'}
                </button>
              </div>
            </div>
          )}

          {/* Empty state when branches are selected but cart is empty */}
          {fromBranchId && toBranchId && cart.length === 0 && !inventoryLoading && inventory.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 p-8 text-center">
              <ShoppingCart className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">Transfer list is empty</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Select products above and add them to the transfer list.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ Tab 2: Pending Approvals ═══════════════════════ */}
      {activeTab === 'pending' && (
        <div>
          {pendingLoading ? (
            <SkeletonCard count={3} />
          ) : pendingTransfers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Clock className="w-14 h-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-semibold text-lg">No pending approvals</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                All transfer requests have been processed.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingTransfers.map((transfer) => {
                const isExpanded = expandedPending.has(transfer.transfer_id)
                const totalItems = transfer.items?.length ?? 0
                const totalQty = transfer.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0

                return (
                  <div
                    key={transfer.transfer_id}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    {/* Card Header */}
                    <div
                      className="p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                      onClick={() => toggleExpandPending(transfer.transfer_id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        {/* Branch flow */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-semibold text-gray-900 dark:text-white truncate">
                            {transfer.from_branch_name}
                          </span>
                          <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="font-semibold text-gray-900 dark:text-white truncate">
                            {transfer.to_branch_name}
                          </span>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                          <StatusBadge status={transfer.status} />
                          <span>{totalItems} item{totalItems > 1 ? 's' : ''}</span>
                          <span>{totalQty} units</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>Requested by: {transfer.requester_name}</span>
                        <span>{formatDate(transfer.created_at)}</span>
                        {transfer.notes && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {transfer.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        {/* Items List */}
                        <div className="p-5">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Transfer Items</h4>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  <th className="pb-2 pr-4">Product</th>
                                  <th className="pb-2 pr-4">Item Code</th>
                                  <th className="pb-2 pr-4">Quantity</th>
                                  <th className="pb-2">Unit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {transfer.items?.map((item, idx) => (
                                  <tr key={idx}>
                                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">
                                      {item.product_name}
                                    </td>
                                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 font-mono text-xs">
                                      {item.item_code || '-'}
                                    </td>
                                    <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-white">
                                      {item.quantity}
                                    </td>
                                    <td className="py-2 text-gray-500 dark:text-gray-400">{item.unit}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="px-5 pb-5 flex justify-end gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setRejectModalId(transfer.transfer_id)
                            }}
                            disabled={actionLoading === transfer.transfer_id}
                            className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {actionLoading === transfer.transfer_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            Reject
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleApprove(transfer.transfer_id)
                            }}
                            disabled={actionLoading === transfer.transfer_id}
                            className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {actionLoading === transfer.transfer_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            Approve
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ Tab 3: Transfer History ═══════════════════════ */}
      {activeTab === 'history' && (
        <div>
          {/* Status Filter */}
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by status:</label>
            <select
              value={historyStatusFilter}
              onChange={(e) => {
                setHistoryStatusFilter(e.target.value)
                setHistoryPage(1)
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition min-w-[160px]"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {historyLoading ? (
            <SkeletonCard count={4} />
          ) : historyTransfers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 p-12 text-center">
              <History className="w-14 h-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-semibold text-lg">No transfers found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                {historyStatusFilter !== 'all'
                  ? `No ${historyStatusFilter} transfers to show.`
                  : 'No transfer history yet. Create your first transfer to see it here.'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {historyTransfers.map((transfer) => {
                  const isExpanded = expandedHistory.has(transfer.transfer_id)
                  const totalItems = transfer.items?.length ?? 0
                  const totalQty = transfer.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0

                  return (
                    <div
                      key={transfer.transfer_id}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                      {/* Card Header */}
                      <div
                        className="p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                        onClick={() => toggleExpandHistory(transfer.transfer_id)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          {/* Branch flow */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-semibold text-gray-900 dark:text-white truncate">
                              {transfer.from_branch_name}
                            </span>
                            <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="font-semibold text-gray-900 dark:text-white truncate">
                              {transfer.to_branch_name}
                            </span>
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                            <StatusBadge status={transfer.status} />
                            <span>{totalItems} item{totalItems > 1 ? 's' : ''}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>Requested by: {transfer.requester_name}</span>
                          <span>{formatDate(transfer.created_at)}</span>
                          {transfer.approver_name && (
                            <span>
                              {transfer.status === 'completed' ? 'Approved' : 'Reviewed'} by:{' '}
                              {transfer.approver_name}
                            </span>
                          )}
                          {transfer.approved_at && (
                            <span>{formatDate(transfer.approved_at)}</span>
                          )}
                          {transfer.notes && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {transfer.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && transfer.items && transfer.items.length > 0 && (
                        <div className="border-t border-gray-200 dark:border-gray-700 p-5">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            Transfer Items ({totalQty} total units)
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  <th className="pb-2 pr-4">Product</th>
                                  <th className="pb-2 pr-4">Item Code</th>
                                  <th className="pb-2 pr-4">Quantity</th>
                                  <th className="pb-2">Unit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {transfer.items.map((item, idx) => (
                                  <tr key={idx}>
                                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">
                                      {item.product_name}
                                    </td>
                                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 font-mono text-xs">
                                      {item.item_code || '-'}
                                    </td>
                                    <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-white">
                                      {item.quantity}
                                    </td>
                                    <td className="py-2 text-gray-500 dark:text-gray-400">{item.unit}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalHistoryPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage <= 1}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 px-4">
                    Page {historyPage} of {totalHistoryPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                    disabled={historyPage >= totalHistoryPages}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}

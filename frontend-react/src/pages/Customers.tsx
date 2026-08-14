

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { focusRowById } from '@/utils/focusRow'
import { CustomerCardSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { X, User, Phone, Mail, MapPin, ShoppingBag, TrendingUp, Clock, ChevronDown, ChevronUp, Package, Pencil, CreditCard, Download, CheckCircle } from 'lucide-react'
import { toast } from '@/utils/toast'
import { useClient } from '@/contexts/ClientContext'
import { useCurrency } from '@/lib/useCurrency'
import membershipService, { getMembershipError } from '@/services/membership'
import type { CardLookupResult } from '@/types/membership'
import { generateCustomerStatementPDF } from '@/lib/customerPdfService'

interface Customer {
  customer_id?: string
  customer_code: number | null
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_address: string
  customer_gstin?: string
  customer_city?: string
  customer_state?: string
  customer_pincode?: string
  notes?: string
  total_bills: number
  total_amount: number
  last_purchase: string
  first_purchase: string
  status: 'Active' | 'Inactive'
  gst_bills: number
  non_gst_bills: number
  loyalty_points?: number
  is_walkin?: boolean
  bill_number?: number
}

interface Statistics {
  total_customers: number
  active_customers: number
  inactive_customers: number
  total_revenue: number
  top_customer: Customer | null
}

// Module-level formatters — created once, never recreated on re-renders
const currencyFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateFormatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
const formatCurrencyWithSymbol = (amount: number, cur: string) => `${cur}${currencyFormatter.format(amount)}`
const formatDate = (dateString: string) => dateString ? dateFormatter.format(new Date(dateString)) : 'N/A'

export default function CustomersPage() {
  const { symbol: cur, taxLabel } = useCurrency()
  const formatCurrency = (amount: number) => formatCurrencyWithSymbol(amount, cur)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'Active' | 'Inactive'>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerBills, setCustomerBills] = useState<any[]>([])
  const [receiveBill, setReceiveBill] = useState<any | null>(null)
  const [receiveAmount, setReceiveAmount] = useState('')
  const [receiveMethod, setReceiveMethod] = useState('Cash')
  const [receiving, setReceiving] = useState(false)
  const [customerStats, setCustomerStats] = useState<any>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 25

  // Edit customer modal state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editForm, setEditForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    customer_gstin: '',
    customer_city: '',
    customer_state: '',
    customer_pincode: '',
    notes: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [lookingUpCard, setLookingUpCard] = useState(false)
  const { user, client } = useClient()
  const isOwner = user?.role === 'owner' || !!user?.is_super_admin

  // Membership card summary shown inside the customer drawer (auto-fetched by phone).
  const [drawerCard, setDrawerCard] = useState<CardLookupResult | null>(null)
  useEffect(() => {
    setDrawerCard(null)
    const phone = selectedCustomer?.customer_phone
    if (!phone || selectedCustomer?.is_walkin) return
    let stale = false
    membershipService.lookupCard(phone)
      .then(res => { if (!stale) setDrawerCard(res.data.data ?? null) })
      .catch(() => { /* non-member or lookup failure — just hide the strip */ })
    return () => { stale = true }
  }, [selectedCustomer])

  // Resolve the customer's membership card by phone, then deep-link to the
  // owner Membership page card view (?card=<id>). Owner-only entry point.
  const viewMembershipCard = useCallback(async (customer: Customer) => {
    if (!customer.customer_phone) {
      toast.error('No phone number on file to look up a card')
      return
    }
    setLookingUpCard(true)
    try {
      const res = await membershipService.lookupCard(customer.customer_phone)
      const card = res.data.data?.card
      if (card?.card_id) {
        navigate(`/membership?card=${encodeURIComponent(card.card_id)}`)
      } else {
        toast.error('This customer is not a member yet')
      }
    } catch (err) {
      toast.error(getMembershipError(err, 'Failed to look up membership card'))
    } finally {
      setLookingUpCard(false)
    }
  }, [navigate])

  const openEditCustomer = useCallback((customer: Customer) => {
    setEditingCustomer(customer)
    setEditForm({
      customer_name: customer.customer_name || '',
      customer_phone: customer.customer_phone || '',
      customer_email: customer.customer_email || '',
      customer_address: customer.customer_address || '',
      customer_gstin: customer.customer_gstin || '',
      customer_city: customer.customer_city || '',
      customer_state: customer.customer_state || '',
      customer_pincode: customer.customer_pincode || '',
      notes: customer.notes || '',
    })
  }, [])

  const closeEditCustomer = useCallback(() => {
    setEditingCustomer(null)
  }, [])

  const handleSaveCustomer = useCallback(async () => {
    if (!editingCustomer?.customer_id) {
      toast.error('Cannot edit this customer')
      return
    }
    if (!editForm.customer_name.trim() || !editForm.customer_phone.trim()) {
      toast.error('Name and phone are required')
      return
    }
    try {
      setSavingEdit(true)
      const response = await api.put(`/customer/${editingCustomer.customer_id}`, editForm)
      if (response.data.success) {
        const updated = response.data.customer
        setCustomers(prev => prev.map(c =>
          c.customer_id === updated.customer_id
            ? { ...c, ...updated, total_amount: updated.total_amount ?? updated.total_spent ?? c.total_amount }
            : c
        ))
        if (selectedCustomer?.customer_id === updated.customer_id) {
          setSelectedCustomer(prev => prev ? { ...prev, ...updated } : prev)
        }
        toast.success('Customer updated')
        closeEditCustomer()
      } else {
        toast.error(response.data.error || 'Failed to update customer')
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to update customer')
    } finally {
      setSavingEdit(false)
    }
  }, [editingCustomer, editForm, selectedCustomer, closeEditCustomer])

  // Track ongoing request to prevent duplicates (for React Strict Mode)
  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  useEffect(() => {
    // Prevent duplicate initialization in React Strict Mode
    if (hasInitialized.current) return
    hasInitialized.current = true

    fetchCustomers()
  }, [])

  const fetchCustomers = useCallback(async () => {
    if (ongoingRequest.current) {
      return ongoingRequest.current
    }

    const request = (async () => {
      try {
        setLoading(true)
        setFetchError(null)
        const response = await api.get('/customer/list')
        if (!response.data.success) {
          setFetchError(response.data.error || 'Failed to load customers')
          return
        }
        setCustomers((response.data.customers || []).map((c: any) => ({
          ...c,
          total_amount: c.total_amount ?? c.total_spent ?? 0,
          gst_bills: c.gst_bills ?? 0,
          non_gst_bills: c.non_gst_bills ?? 0,
          last_purchase: c.last_purchase ?? c.last_purchase_date ?? null,
          first_purchase: c.first_purchase ?? c.first_purchase_date ?? null,
        })))
        setStatistics(response.data.statistics)
      } catch (error: any) {
        console.error('Failed to fetch customers:', error)
        setFetchError(error?.response?.data?.error || 'Failed to load customers. Please try again.')
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }, [])

  const handleViewCustomer = useCallback(async (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomerBills([])
    setCustomerStats(null)
    setExpandedBillId(null)

    // Walk-in customers without a phone — can't look up history by phone
    if (!customer.customer_phone || customer.is_walkin) return

    try {
      setLoadingHistory(true)
      const response = await api.get(`/customer/${encodeURIComponent(customer.customer_phone)}`)
      if (response.data.success) {
        const bills = response.data.bills || []
        // Parse items if they're JSON strings (SQLite stores JSON as text)
        const parsedBills = bills.map((bill: any) => ({
          ...bill,
          items: typeof bill.items === 'string' ? (() => { try { return JSON.parse(bill.items) } catch { return [] } })() : (bill.items || [])
        }))
        setCustomerBills(parsedBills)
        setCustomerStats(response.data.statistics || null)
        // Auto-expand the first bill so user immediately sees products
        if (parsedBills.length > 0) {
          setExpandedBillId(parsedBills[0].bill_id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch customer history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const closeDrawer = useCallback(() => {
    setSelectedCustomer(null)
    setCustomerBills([])
    setCustomerStats(null)
    setExpandedBillId(null)
    setReceiveBill(null)
  }, [])

  /** Outstanding balance of a bill — backend sends balance_due; fall back to total − paid. */
  const billBalance = (bill: any): number => {
    if (bill.balance_due != null) return Number(bill.balance_due)
    const paid = bill.paid_amount ?? (bill.payment_status === 'pending' ? 0 : bill.amount)
    return Math.max((bill.amount || 0) - (paid || 0), 0)
  }

  const openReceivePayment = (bill: any) => {
    setReceiveBill(bill)
    setReceiveAmount(billBalance(bill).toFixed(2))
    setReceiveMethod('Cash')
  }

  const submitReceivePayment = async () => {
    if (!receiveBill || receiving) return
    const amount = parseFloat(receiveAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.warning('Enter a valid amount')
      return
    }
    setReceiving(true)
    try {
      const res = await api.post(`/billing/${receiveBill.bill_id}/payments`, {
        amount,
        payment_method: receiveMethod,
      })
      const updated = res.data?.bill
      const newPayment = res.data?.payment
      const patch: any = updated
        ? { payment_status: updated.payment_status, paid_amount: updated.paid_amount, balance_due: updated.balance_due }
        : { payment_status: 'paid' }
      setCustomerBills(prev => prev.map(b => b.bill_id === receiveBill.bill_id
        ? { ...b, ...patch, payments: newPayment ? [...(b.payments || []), newPayment] : b.payments }
        : b))
      toast.success(patch.payment_status === 'paid'
        ? `Bill #${receiveBill.bill_number} fully paid`
        : `Payment recorded — balance ${cur}${Number(patch.balance_due ?? 0).toFixed(2)}`)
      setReceiveBill(null)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record payment')
    } finally {
      setReceiving(false)
    }
  }

  function downloadCustomerStatement() {
    if (!selectedCustomer) return
    const activeBills = customerBills.filter(b => (b.status || 'final') === 'final')
    const totalAmount = activeBills.reduce((sum, b) => sum + (b.amount || 0), 0)
    const paidAmount = activeBills.reduce((sum, b) => sum + (b.paid_amount ?? b.amount ?? 0), 0)
    const balanceDue = Math.max(totalAmount - paidAmount, 0)
    generateCustomerStatementPDF({
      client: {
        client_name: client?.client_name || 'Business',
        address: client?.address,
        phone: client?.phone,
        email: client?.email,
        gstin: client?.gstin,
      },
      customer: {
        name: selectedCustomer.customer_name,
        phone: selectedCustomer.customer_phone,
        email: selectedCustomer.customer_email,
        address: selectedCustomer.customer_address,
        city: selectedCustomer.customer_city,
        state: selectedCustomer.customer_state,
        gstin: selectedCustomer.customer_gstin,
      },
      bills: activeBills.map(b => {
        const paid = b.paid_amount ?? b.amount ?? 0
        return {
          bill_id: b.bill_id,
          bill_number: b.bill_number,
          type: b.type,
          created_at: b.created_at,
          total: b.amount || 0,
          paid,
          balance: Math.max((b.amount || 0) - paid, 0),
          payments: b.payments || [],
        }
      }),
      totalAmount,
      paidAmount,
      balanceDue,
    })
  }

  // Membership-card-number search: a query like "VLX-000123" isn't in the customer
  // list data, so resolve it via the membership lookup to the holder's phone.
  const [cardMatchPhone, setCardMatchPhone] = useState<string | null>(null)
  useEffect(() => {
    const q = searchQuery.trim()
    if (!/^[A-Za-z]{2,5}-?\w{3,}$/.test(q)) { setCardMatchPhone(null); return }
    const t = setTimeout(async () => {
      try {
        const res = await membershipService.lookupCard(q.toUpperCase())
        setCardMatchPhone(res.data.data?.card?.customer_phone || null)
      } catch {
        setCardMatchPhone(null)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Hoist formatters outside render — avoids recreating Intl objects on every render cycle
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return customers.filter((customer) => {
      const matchesSearch =
        customer.customer_name.toLowerCase().includes(q) ||
        customer.customer_phone.includes(searchQuery) ||
        (customer.customer_code && customer.customer_code.toString().includes(searchQuery)) ||
        (cardMatchPhone != null && customer.customer_phone === cardMatchPhone)
      const matchesStatus = filterStatus === 'all' || customer.status === filterStatus
      return matchesSearch && matchesStatus
    })
  }, [customers, searchQuery, filterStatus, cardMatchPhone])

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterStatus])

  // Deep-link focus: scroll to and highlight the row matching ?focus=<customer_id>
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus) return
    if (!customers || customers.length === 0) return
    focusRowById(focus)
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }, [customers, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE))
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredCustomers, currentPage])

  return (
    <DashboardLayout>
      <div className="space-y-3">
        {/* Header - Compact */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Customers</h1>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Manage your customer base and track revenue</p>
          </div>
          <Link
            to="/billing/create"
            className="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Bill
          </Link>
        </div>

        {/* Statistics Cards - Compact */}
        {statistics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-2.5 text-white">
              <p className="text-[10px] font-medium text-blue-100">Total Customers</p>
              <p className="text-xl font-bold mt-0.5">{statistics.total_customers}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-2.5 text-white">
              <p className="text-[10px] font-medium text-green-100">Active</p>
              <p className="text-xl font-bold mt-0.5">{statistics.active_customers}</p>
              <p className="text-[9px] text-green-100 mt-0.5">Last 30 days</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md p-2.5 text-white">
              <p className="text-[10px] font-medium text-purple-100">Inactive</p>
              <p className="text-xl font-bold mt-0.5">{statistics.inactive_customers}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-2.5 text-white col-span-2 lg:col-span-1">
              <p className="text-[10px] font-medium text-orange-100">Total Revenue</p>
              <p className="text-lg font-bold mt-0.5">{formatCurrency(statistics.total_revenue)}</p>
            </div>
          </div>
        )}

        {/* Search and Filter - Compact */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2.5 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, phone or card no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition ${
                  filterStatus === 'all'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('Active')}
                className={`px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition ${
                  filterStatus === 'Active'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('Inactive')}
                className={`px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition ${
                  filterStatus === 'Inactive'
                    ? 'bg-gray-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>

        {/* Customers List */}
        {fetchError ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">{fetchError}</p>
            <button
              type="button"
              onClick={fetchCustomers}
              className="mt-3 text-sm text-red-500 underline hover:text-red-700"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <>
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <CustomerCardSkeleton count={8} />
              </div>
            </div>
            <div className="md:hidden">
              <CustomerCardSkeleton count={6} />
            </div>
          </>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-md p-8 sm:p-12 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">👥</div>
            <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400">No customers found</p>
            <p className="text-sm sm:text-base text-gray-400 dark:text-gray-500 mt-2">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Create your first bill to add customers'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View - Compact */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">No</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Customer</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Contact</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedCustomers.map((customer, i) => {
                      const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + i
                      return (
                      <tr
                        key={customer.is_walkin ? `walkin-${customer.bill_number}-${globalIndex}` : (customer.customer_code ?? customer.customer_phone ?? `customer-${globalIndex}`)}
                        data-focus-id={customer.customer_id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer"
                        onClick={() => handleViewCustomer(customer)}
                      >
                        <td className="px-3 py-2.5">
                          {customer.customer_code ? (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">#{customer.customer_code}</span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                              {customer.customer_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-3">
                              <div className="text-xs font-semibold text-gray-900 dark:text-white">{customer.customer_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-xs text-gray-900 dark:text-white">{customer.customer_phone}</div>
                          {customer.customer_email && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">{customer.customer_email}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 inline-flex text-[10px] font-semibold rounded-full ${
                            customer.status === 'Active'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                          }`}>
                            {customer.status}
                          </span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {paginatedCustomers.map((customer, i) => {
                const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + i
                return (
                  <div
                    key={customer.is_walkin ? `walkin-${customer.bill_number}-${globalIndex}` : (customer.customer_code ?? customer.customer_phone ?? `customer-${globalIndex}`)}
                    data-focus-id={customer.customer_id}
                    onClick={() => handleViewCustomer(customer)}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 hover:shadow-lg transition touch-manipulation border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {customer.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{customer.customer_name}</h3>
                          {customer.customer_code && (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">#{customer.customer_code}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{customer.customer_phone}</p>
                        {customer.customer_email && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{customer.customer_email}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                        customer.status === 'Active'
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}>
                        {customer.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-md px-4 py-3 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Customer Billing History Drawer */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={closeDrawer}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {selectedCustomer.customer_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    {selectedCustomer.customer_name}
                  </h2>
                  {selectedCustomer.customer_code && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">#{selectedCustomer.customer_code}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!selectedCustomer.is_walkin && selectedCustomer.customer_phone && (
                  <button
                    type="button"
                    onClick={downloadCustomerStatement}
                    disabled={loadingHistory || customerBills.length === 0}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50"
                    title="Download PDF statement"
                    aria-label="Download PDF statement"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                {isOwner && !selectedCustomer.is_walkin && selectedCustomer.customer_phone && (
                  <button
                    type="button"
                    onClick={() => viewMembershipCard(selectedCustomer)}
                    disabled={lookingUpCard}
                    className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 transition-colors disabled:opacity-50"
                    title="View membership card"
                    aria-label="View membership card"
                  >
                    <CreditCard className="w-4 h-4" />
                  </button>
                )}
                {!selectedCustomer.is_walkin && selectedCustomer.customer_id && (
                  <button
                    type="button"
                    onClick={() => openEditCustomer(selectedCustomer)}
                    className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                    title="Edit customer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Membership card summary (auto-fetched; hidden for non-members) */}
            {drawerCard?.card && (
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 flex-shrink-0"
                style={{ background: `${drawerCard.tier?.color || '#7c3aed'}14` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white shrink-0"
                    style={{ background: drawerCard.tier?.color || '#7c3aed' }}>
                    {drawerCard.tier?.name || 'Member'}
                  </span>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate">{drawerCard.card.membership_number}</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {drawerCard.card.redeemable_points.toLocaleString('en-IN')} pts
                    {drawerCard.redeemable_value != null && (
                      <span className="text-green-600 dark:text-green-400"> ≈ {cur}{drawerCard.redeemable_value.toLocaleString('en-IN')}</span>
                    )}
                  </span>
                </div>
                {isOwner && (
                  <button type="button"
                    onClick={() => navigate(`/membership?card=${encodeURIComponent(drawerCard.card.card_id)}`)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                    Open card
                  </button>
                )}
              </div>
            )}

            {/* Customer Info */}
            <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Phone</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{selectedCustomer.customer_phone || '—'}</p>
                </div>
              </div>
              {selectedCustomer.customer_email && (
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Email</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{selectedCustomer.customer_email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <ShoppingBag className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Total Bills</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{customerStats?.total_bills ?? selectedCustomer.total_bills}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Total Spent</p>
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(customerStats?.total_spent ?? selectedCustomer.total_amount)}</p>
                </div>
              </div>
              {!selectedCustomer.is_walkin && (selectedCustomer.loyalty_points ?? 0) > 0 && (
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Loyalty Points</p>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{selectedCustomer.loyalty_points} pts</p>
                  </div>
                </div>
              )}
              {customerStats && (
                <div className="flex items-start gap-2 col-span-2">
                  <TrendingUp className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Average Bill Value</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{formatCurrency(customerStats.average_bill_value)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Billing History */}
            <div className="px-5 py-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Billing History</h3>
                </div>
                {customerBills.length > 0 && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Tap bill to see items</span>
                )}
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 dark:border-gray-400"></div>
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading history...</span>
                </div>
              ) : selectedCustomer.is_walkin ? (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Walk-in customer</p>
                  <p className="text-xs mt-1">No purchase history available</p>
                </div>
              ) : customerBills.length === 0 ? (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                  <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No billing history found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerBills.map((bill) => {
                    const isCancelled = bill.status === 'cancelled'
                    const billItems = Array.isArray(bill.items) ? bill.items : []
                    const isExpanded = expandedBillId === bill.bill_id
                    const isUnsettled = !isCancelled && (bill.payment_status === 'pending' || bill.payment_status === 'partial')

                    return (
                      <div
                        key={bill.bill_id}
                        className={`rounded-lg border transition-all ${
                          isCancelled
                            ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        }`}
                      >
                        {/* Bill Header — clickable to expand/collapse */}
                        <button
                          type="button"
                          onClick={() => setExpandedBillId(isExpanded ? null : bill.bill_id)}
                          className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-t-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-semibold ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                                Bill #{bill.bill_number}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                bill.type === 'GST'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              }`}>
                                {bill.type}
                              </span>
                              {isCancelled && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                  Cancelled
                                </span>
                              )}
                              {isUnsettled && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                                  bill.payment_status === 'partial'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                }`}>
                                  {bill.payment_status === 'partial' ? 'Partial' : 'Pending'}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {formatDate(bill.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-sm font-bold ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                              {formatCurrency(bill.amount)}
                            </span>
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4 text-blue-500" />
                              : <ChevronDown className="w-4 h-4 text-blue-500" />
                            }
                          </div>
                        </button>

                        {/* Expanded Items — always show products */}
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700">
                            {billItems.length > 0 ? (
                              <>
                                <div className="flex items-center gap-1.5 mt-2 mb-1.5">
                                  <Package className="w-3 h-3 text-gray-400" />
                                  <span className="text-[10px] font-medium text-gray-400 uppercase">Products ({billItems.length})</span>
                                </div>
                                <div className="space-y-1">
                                  {billItems.map((item: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-800 dark:text-gray-200 truncate">{item.product_name}</p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                          {item.quantity} × {cur}{(item.rate || 0).toLocaleString('en-IN')}
                                          {item.gst_percentage ? ` + ${item.gst_percentage}% ${taxLabel}` : ''}
                                        </p>
                                      </div>
                                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3">
                                        {cur}{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">Item details not available</p>
                            )}

                            {/* Payment history — every instalment recorded against this bill */}
                            {Array.isArray(bill.payments) && bill.payments.length > 0 && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
                                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Payment History</p>
                                {bill.payments.map((p: any, i: number) => (
                                  <div key={p.payment_id || i} className="flex justify-between text-[11px] text-gray-700 dark:text-gray-300 py-0.5">
                                    <span>
                                      {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                      {p.notes ? ` · ${p.notes}` : ''}
                                    </span>
                                    <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Payment status row — receive an instalment or settle the balance */}
                            {isUnsettled && (
                              <div className={`mt-2 flex items-center justify-between p-2 rounded-lg border ${
                                bill.payment_status === 'partial'
                                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                              }`}>
                                <span className={`text-xs font-semibold ${
                                  bill.payment_status === 'partial'
                                    ? 'text-blue-700 dark:text-blue-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}>
                                  {bill.payment_status === 'partial'
                                    ? `Balance due: ${formatCurrency(billBalance(bill))}`
                                    : 'Payment Pending'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openReceivePayment(bill)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Receive
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer Summary */}
            {customerStats && customerBills.length > 0 && (
              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{customerStats.total_bills} bills total</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(customerStats.total_spent)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receive Payment Modal — settle a pending/partial bill's balance */}
      {receiveBill && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => !receiving && setReceiveBill(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Receive Payment — Bill #{receiveBill.bill_number}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Balance due: {formatCurrency(billBalance(receiveBill))}
                </p>
              </div>
            </div>

            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Amount received now</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={billBalance(receiveBill)}
              value={receiveAmount}
              onChange={e => setReceiveAmount(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <p className="-mt-2 mb-3 text-[11px] text-gray-400 dark:text-gray-500">
              A smaller amount records another instalment; the full balance settles the bill.
            </p>

            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Payment method</label>
            <select
              value={receiveMethod}
              onChange={e => setReceiveMethod(e.target.value)}
              className="w-full px-3 py-2 mb-4 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
            >
              {['Cash', 'UPI', 'Card'].map(name => <option key={name} value={name}>{name}</option>)}
            </select>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={receiving}
                onClick={() => setReceiveBill(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={receiving}
                onClick={submitReceivePayment}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-60"
              >
                {receiving ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={closeEditCustomer}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Edit Customer</h3>
              <button
                type="button"
                onClick={closeEditCustomer}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSaveCustomer() }}
              className="p-5 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editForm.customer_name}
                  onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={editForm.customer_phone}
                    onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.customer_email}
                    onChange={e => setEditForm(f => ({ ...f, customer_email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <textarea
                  value={editForm.customer_address}
                  onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                  <input
                    type="text"
                    value={editForm.customer_city}
                    onChange={e => setEditForm(f => ({ ...f, customer_city: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">State</label>
                  <input
                    type="text"
                    value={editForm.customer_state}
                    onChange={e => setEditForm(f => ({ ...f, customer_state: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={editForm.customer_pincode}
                    onChange={e => setEditForm(f => ({ ...f, customer_pincode: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={editForm.customer_gstin}
                  onChange={e => setEditForm(f => ({ ...f, customer_gstin: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditCustomer}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

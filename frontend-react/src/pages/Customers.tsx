

import { useEffect, useState, useRef, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { Link } from 'react-router-dom'
import { CustomerCardSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { X, User, Phone, Mail, MapPin, ShoppingBag, TrendingUp, Clock, ChevronDown, ChevronUp, Package } from 'lucide-react'

interface Customer {
  customer_code: number | null
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_address: string
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
const formatCurrency = (amount: number) => `₹${currencyFormatter.format(amount)}`
const formatDate = (dateString: string) => dateString ? dateFormatter.format(new Date(dateString)) : 'N/A'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'Active' | 'Inactive'>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerBills, setCustomerBills] = useState<any[]>([])
  const [customerStats, setCustomerStats] = useState<any>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null)

  // Track ongoing request to prevent duplicates (for React Strict Mode)
  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  useEffect(() => {
    // Prevent duplicate initialization in React Strict Mode
    if (hasInitialized.current) return
    hasInitialized.current = true

    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    // If a request is already ongoing, return that promise
    if (ongoingRequest.current) {
      return ongoingRequest.current
    }

    const request = (async () => {
      try {
        setLoading(true)
        const response = await api.get('/customer/list')
        setCustomers(response.data.customers || [])
        setStatistics(response.data.statistics)
      } catch (error) {
        console.error('Failed to fetch customers:', error)
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }

  const handleViewCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomerBills([])
    setCustomerStats(null)
    setExpandedBillId(null)

    // Walk-in customers without a phone — can't look up history by phone
    if (!customer.customer_phone || customer.is_walkin) return

    try {
      setLoadingHistory(true)
      const response = await api.get(`/customer/${encodeURIComponent(customer.customer_phone)}`)
      console.log('[CUSTOMER] API response:', JSON.stringify(response.data, null, 2))
      if (response.data.success) {
        const bills = response.data.bills || []
        // Parse items if they're JSON strings (SQLite stores JSON as text)
        const parsedBills = bills.map((bill: any) => ({
          ...bill,
          items: typeof bill.items === 'string' ? (() => { try { return JSON.parse(bill.items) } catch { return [] } })() : (bill.items || [])
        }))
        console.log('[CUSTOMER] Parsed bills with items:', parsedBills.map((b: any) => ({ bill_number: b.bill_number, items_count: b.items?.length })))
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
  }

  const closeDrawer = () => {
    setSelectedCustomer(null)
    setCustomerBills([])
    setCustomerStats(null)
    setExpandedBillId(null)
  }

  // Hoist formatters outside render — avoids recreating Intl objects on every render cycle
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return customers.filter((customer) => {
      const matchesSearch =
        customer.customer_name.toLowerCase().includes(q) ||
        customer.customer_phone.includes(searchQuery) ||
        (customer.customer_code && customer.customer_code.toString().includes(searchQuery))
      const matchesStatus = filterStatus === 'all' || customer.status === filterStatus
      return matchesSearch && matchesStatus
    })
  }, [customers, searchQuery, filterStatus])

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
                  placeholder="Search by name or phone..."
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
        {loading ? (
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
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Bills</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Total Spent</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Last Purchase</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredCustomers.map((customer, index) => (
                      <tr
                        key={customer.is_walkin ? `walkin-${customer.bill_number}-${index}` : (customer.customer_code ?? customer.customer_phone ?? `customer-${index}`)}
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
                          <div className="text-xs font-medium text-gray-900 dark:text-white">{customer.total_bills}</div>
                          {!customer.is_walkin && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">
                              {customer.gst_bills} GST, {customer.non_gst_bills} Non-GST
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-xs font-bold text-green-600 dark:text-green-400">{formatCurrency(customer.total_amount)}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            Avg: {customer.total_bills > 0 ? formatCurrency(customer.total_amount / customer.total_bills) : '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-900 dark:text-white">{formatDate(customer.last_purchase)}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredCustomers.map((customer, index) => (
                <div
                  key={customer.is_walkin ? `walkin-${customer.bill_number}-${index}` : (customer.customer_code ?? customer.customer_phone ?? `customer-${index}`)}
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

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Bills</p>
                      <p className="text-base font-bold text-gray-900 dark:text-white">{customer.total_bills}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Spent</p>
                      <p className="text-base font-bold text-green-600 dark:text-green-400">{formatCurrency(customer.total_amount)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Last Purchase</p>
                      <p className="text-sm text-gray-900 dark:text-white">{formatDate(customer.last_purchase)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
              <button
                type="button"
                onClick={closeDrawer}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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
                  <p className="text-sm text-gray-800 dark:text-gray-200">{selectedCustomer.total_bills}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Total Spent</p>
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(selectedCustomer.total_amount)}</p>
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
                                          {item.quantity} × ₹{(item.rate || 0).toLocaleString('en-IN')}
                                          {item.gst_percentage ? ` + ${item.gst_percentage}% GST` : ''}
                                        </p>
                                      </div>
                                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3">
                                        ₹{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">Item details not available</p>
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
    </DashboardLayout>
  )
}

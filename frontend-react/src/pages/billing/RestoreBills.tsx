import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { RotateCcw, Calendar, X, Package, User, Clock, Hash } from 'lucide-react'

interface BillItem {
  product_name: string
  quantity: number
  rate: number
  mrp?: number
  gst_percentage?: number
  amount: number
  item_code?: string
}

interface Bill {
  bill_id: any
  bill_number: any
  type: 'gst' | 'non_gst'
  customer_name: any
  customer_phone: any
  subtotal?: number
  gst_percentage?: number
  gst_amount?: number
  final_amount?: number
  total_amount?: number
  payment_type: any
  created_at: any
  items?: BillItem[]
  discount_percentage?: number
  discount_amount?: number
  negotiable_amount?: number
  cgst?: number
  sgst?: number
  igst?: number
  status?: string
  payment_status?: 'paid' | 'pending'
  user_name?: string
  created_by?: string
}

export default function RestoreBills() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 17
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)

  // Date filter state
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'custom'>('all')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const ongoingRequest = useRef<Promise<void> | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    ongoingRequest.current = null
    const request = (async () => {
      try {
        setLoading(true)
        const billsRes = await api.get('/billing/list?limit=100&status=cancelled')
        const fetchedBills = billsRes.data.bills || []
        setBills(fetchedBills)
      } catch (error: any) {
        console.error('Failed to fetch cancelled bills:', error)
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()
    ongoingRequest.current = request
    return request
  }

  const getAmount = (bill: Bill) => {
    if (bill.type === 'gst') {
      return parseFloat(String(bill.final_amount || '0'))
    }
    return parseFloat(String(bill.total_amount || '0'))
  }

  const getLocalDateString = useCallback((date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  const todayString = useMemo(() => getLocalDateString(new Date()), [getLocalDateString])

  const dateFilteredBills = useMemo(() => bills.filter(bill => {
    if (dateFilter === 'all') return true
    const billDate = getLocalDateString(new Date(bill.created_at))
    if (dateFilter === 'today') return billDate === todayString
    if (fromDate && toDate) return billDate >= fromDate && billDate <= toDate
    if (fromDate) return billDate >= fromDate
    if (toDate) return billDate <= toDate
    return true
  }), [bills, dateFilter, fromDate, toDate, todayString, getLocalDateString])

  const totalPages = Math.ceil(dateFilteredBills.length / itemsPerPage)
  const paginatedBills = dateFilteredBills.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const handleViewBill = async (bill: Bill) => {
    if (bill.items && bill.items.length > 0) {
      setSelectedBill(bill)
      return
    }
    try {
      const res = await api.get(`/billing/${bill.bill_id}`)
      const fullBill = res.data.bill || res.data
      setSelectedBill({ ...bill, ...fullBill })
    } catch {
      setSelectedBill(bill)
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-2rem)] md:h-screen overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-2 md:px-6 md:pt-6 md:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-orange-500" />
                Cancelled Bills
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {dateFilteredBills.length} cancelled bill{dateFilteredBills.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Date Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setDateFilter('all'); setFromDate(''); setToDate(''); setCurrentPage(1) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${dateFilter === 'all' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => { setDateFilter('today'); setFromDate(''); setToDate(''); setCurrentPage(1) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${dateFilter === 'today' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              Today
            </button>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setDateFilter('custom'); setCurrentPage(1) }}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setDateFilter('custom'); setCurrentPage(1) }}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden px-4 md:px-6 pb-4">
          {loading ? (
            <>
              <div className="hidden md:block"><TableSkeleton rows={8} /></div>
              <div className="md:hidden"><CardSkeleton count={4} /></div>
            </>
          ) : dateFilteredBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
              <RotateCcw className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No cancelled bills</p>
              <p className="text-xs mt-1">Cancelled bills will appear here</p>
            </div>
          ) : (
            <div className="flex gap-4 h-full">
              {/* Table */}
              <div className="flex-1 overflow-auto">
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 dark:bg-gray-800/80 backdrop-blur-sm">
                        <th className="px-2 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">#</th>
                        <th className="px-2 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Bill No</th>
                        <th className="px-2 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Customer</th>
                        <th className="px-2 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Date</th>
                        <th className="px-2 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {paginatedBills.map((bill, idx) => (
                        <tr
                          key={bill.bill_id}
                          onClick={() => handleViewBill(bill)}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <td className="px-2 py-1.5 text-xs text-gray-400">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <span className="text-xs font-semibold text-gray-900 dark:text-white">#{bill.bill_number}</span>
                            <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase">Cancelled</span>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300">{bill.customer_name || 'Walk-in'}</td>
                          <td className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {bill.created_at ? new Date(bill.created_at).toLocaleDateString() : ''}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              ₹{getAmount(bill).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {paginatedBills.map(bill => (
                    <div
                      key={bill.bill_id}
                      onClick={() => handleViewBill(bill)}
                      className="cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">#{bill.bill_number}</p>
                            <span className="px-1.5 py-0.5 text-[9px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase">Cancelled</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{bill.customer_name || 'Walk-in'}</p>
                        </div>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          ₹{getAmount(bill).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {bill.created_at ? new Date(bill.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1 mt-3">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Detail Panel (Desktop) */}
              {selectedBill && (
                <div className="hidden md:block w-80 flex-shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-auto">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Bill #{selectedBill.bill_number}</h3>
                      <button type="button" onClick={() => setSelectedBill(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-full uppercase">Cancelled</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {selectedBill.customer_name || 'Walk-in'}
                        {selectedBill.customer_phone && <span className="text-gray-400">({selectedBill.customer_phone})</span>}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {selectedBill.created_at ? new Date(selectedBill.created_at).toLocaleString() : ''}
                      </div>

                      {selectedBill.user_name && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <Hash className="w-3.5 h-3.5" />
                          Created by: {selectedBill.user_name}
                        </div>
                      )}

                      {/* Items */}
                      {selectedBill.items && selectedBill.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1">
                            <Package className="w-3 h-3" /> Items
                          </p>
                          <div className="space-y-1.5">
                            {selectedBill.items.map((item, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{item.product_name}</span>
                                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                                  {item.quantity} x ₹{item.rate} = ₹{item.amount?.toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Total */}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Total</span>
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            ₹{getAmount(selectedBill).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination footer (mobile) */}
        {!loading && totalPages > 1 && (
          <div className="flex-shrink-0 px-4 md:px-6 pb-3 md:hidden">
            <div className="flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg disabled:opacity-40"
              >
                Prev
              </button>
              <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

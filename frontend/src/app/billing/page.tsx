'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { useClient } from '@/contexts/ClientContext'
import { Wallet, CreditCard, Smartphone, Building2, FileText, Banknote, DollarSign, RefreshCw, XCircle, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
  user_name?: string
  created_by?: string
}

interface PaymentType {
  payment_type_id: string
  payment_name: string
}

export default function AllBillsPage() {
  const router = useRouter()
  const { client } = useClient()
  const [bills, setBills] = useState<Bill[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 17
  const [loadingBillDetails, setLoadingBillDetails] = useState(false)

  // Date filter state
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'custom'>('all')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // Track ongoing request to prevent duplicates (for React Strict Mode)
  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  useEffect(() => {
    // Prevent duplicate initialization in React Strict Mode
    if (hasInitialized.current) return
    hasInitialized.current = true

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helper function to parse payment types from bill
  const parsePaymentTypes = (bill: Bill): string[] => {
    if (!bill.payment_type) return []

    // Check if it's a JSON string (split payment)
    if (typeof bill.payment_type === 'string' && bill.payment_type.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(bill.payment_type)
        if (Array.isArray(parsed)) {
          return parsed.map(p => p.PAYMENT_TYPE || p.payment_type).filter(Boolean)
        }
      } catch (e) {
        // If parsing fails, treat as single payment
        return [bill.payment_type]
      }
    }

    // Single payment type
    return [bill.payment_type]
  }

  const fetchData = async () => {
    // If a request is already ongoing, return that promise
    if (ongoingRequest.current) {
      return ongoingRequest.current
    }

    const request = (async () => {
      try {
        setLoading(true)

        const billsRes = await api.get('/billing/list?limit=100')
        const fetchedBills = billsRes.data.bills || []
        setBills(fetchedBills)

        // Extract unique payment types from bills (including split payments)
        if (fetchedBills.length > 0) {
          const uniquePaymentTypes = new Set<string>()
          fetchedBills.forEach((bill: Bill) => {
            const paymentTypes = parsePaymentTypes(bill)
            paymentTypes.forEach(pt => uniquePaymentTypes.add(pt))
          })

          // Convert to array and sort by common payment methods first
          const sortOrder = ['CASH', 'UPI', 'CARD', 'NET BANKING', 'CHEQUE', 'CREDIT', 'WALLET']
          const sortedTypes = Array.from(uniquePaymentTypes).sort((a, b) => {
            const indexA = sortOrder.indexOf(a.toUpperCase())
            const indexB = sortOrder.indexOf(b.toUpperCase())
            if (indexA !== -1 && indexB !== -1) return indexA - indexB
            if (indexA !== -1) return -1
            if (indexB !== -1) return 1
            return a.localeCompare(b)
          })

          setPaymentTypes(sortedTypes.map(pt => ({
            payment_type_id: pt,
            payment_name: pt
          })))
        }
      } catch (error: any) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }

  const getAmount = (bill: Bill) => {
    // Cancelled bills show as 0
    if (bill.status === 'cancelled') {
      return 0
    }
    if (bill.type === 'gst') {
      return parseFloat(String(bill.final_amount || '0'))
    }
    return parseFloat(String(bill.total_amount || '0'))
  }

  // Get amount for specific payment type in a bill
  const getAmountForPaymentType = (bill: Bill, paymentType: string): number => {
    const totalAmount = getAmount(bill)

    // Check if it's a split payment
    if (typeof bill.payment_type === 'string' && bill.payment_type.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(bill.payment_type)
        if (Array.isArray(parsed)) {
          const paymentSplit = parsed.find(p => (p.PAYMENT_TYPE || p.payment_type) === paymentType)
          if (paymentSplit) {
            return parseFloat(String(paymentSplit.AMOUNT || paymentSplit.amount || 0))
          }
        }
      } catch (e) {
        // If parsing fails, return full amount if payment type matches
        return bill.payment_type === paymentType ? totalAmount : 0
      }
    }

    // Single payment - return full amount if matches
    return bill.payment_type === paymentType ? totalAmount : 0
  }

  // Create expanded bills array where split payments become separate rows
  const getExpandedBills = (billsList: Bill[]) => {
    const expanded: Array<Bill & { displayPaymentType: string; displayAmount: number; isFirstPayment: boolean; paymentCount: number; billSequenceNumber: number }> = []
    let billSequenceNumber = 0

    billsList.forEach(bill => {
      const paymentTypes = parsePaymentTypes(bill)
      billSequenceNumber++ // Increment for each unique bill

      if (paymentTypes.length > 1) {
        // Split payment - create a row for each payment type
        paymentTypes.forEach((pt, index) => {
          expanded.push({
            ...bill,
            displayPaymentType: pt,
            displayAmount: getAmountForPaymentType(bill, pt),
            isFirstPayment: index === 0,
            paymentCount: paymentTypes.length,
            billSequenceNumber
          })
        })
      } else {
        // Single payment - add as is
        expanded.push({
          ...bill,
          displayPaymentType: paymentTypes[0] || bill.payment_type,
          displayAmount: getAmount(bill),
          isFirstPayment: true,
          paymentCount: 1,
          billSequenceNumber
        })
      }
    })

    return expanded
  }

  // Helper to get date string in LOCAL timezone (YYYY-MM-DD)
  // Using local timezone to avoid off-by-one day errors for IST users
  const getLocalDateString = useCallback((date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  // Memoize today's date string to avoid recalculation
  const todayString = useMemo(() => getLocalDateString(new Date()), [getLocalDateString])

  // Filter bills by date - memoized for performance
  const dateFilteredBills = useMemo(() => bills.filter(bill => {
    if (dateFilter === 'all') return true

    const billDate = getLocalDateString(new Date(bill.created_at))

    if (dateFilter === 'today') {
      return billDate === todayString
    }

    // Custom date range (set same date in From & To for specific day)
    if (fromDate && toDate) {
      return billDate >= fromDate && billDate <= toDate
    }
    if (fromDate) {
      return billDate >= fromDate
    }
    if (toDate) {
      return billDate <= toDate
    }

    return true
  }), [bills, dateFilter, fromDate, toDate, todayString, getLocalDateString])

  // Filter and expand bills - memoized for performance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expandedBills = useMemo(() => getExpandedBills(dateFilteredBills), [dateFilteredBills])

  const filteredExpandedBills = useMemo(() => {
    if (selectedPaymentType === 'all') return expandedBills

    if (selectedPaymentType.includes('+')) {
      // Split payment filter - show bills that have this exact combination
      return expandedBills.filter(bill => {
        const billTypes = parsePaymentTypes(bill)
        if (billTypes.length <= 1) return false
        const sortedTypes = [...billTypes].sort().join('+')
        return sortedTypes === selectedPaymentType
      })
    }

    // Single payment filter - only show bills with exactly that one payment type (no splits)
    return expandedBills.filter(bill => {
      const billTypes = parsePaymentTypes(bill)
      return billTypes.length === 1 && bill.displayPaymentType === selectedPaymentType
    })
  }, [expandedBills, selectedPaymentType])

  // Pagination
  const totalPages = Math.ceil(filteredExpandedBills.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBills = filteredExpandedBills.slice(startIndex, endIndex)

  // Calculate totals (using date filtered bills) - memoized
  const grandTotal = useMemo(() =>
    dateFilteredBills.reduce((sum, bill) => sum + getAmount(bill), 0),
    [dateFilteredBills]
  )
  const filteredTotal = useMemo(() =>
    filteredExpandedBills.reduce((sum, bill) => sum + bill.displayAmount, 0),
    [filteredExpandedBills]
  )

  // Get payment type statistics (only single payment bills, not split payments) - memoized
  const paymentTypeStats = useMemo(() => paymentTypes.map(pt => {
    // Count only bills that have exactly this single payment type (no splits)
    let count = 0
    let totalAmount = 0

    dateFilteredBills.forEach(bill => {
      const types = parsePaymentTypes(bill)
      // Only count if this bill has exactly one payment type and it matches
      if (types.length === 1 && types[0] === pt.payment_type_id) {
        count += 1
        totalAmount += getAmount(bill)
      }
    })

    return {
      ...pt,
      count,
      total: totalAmount
    }
  }), [paymentTypes, dateFilteredBills])

  // Get split payment (relationship) statistics - memoized
  const splitPaymentStats = useMemo(() => {
    const splitCombinations = new Map<string, { count: number; total: number; types: string[] }>()

    dateFilteredBills.forEach(bill => {
      const types = parsePaymentTypes(bill)
      if (types.length > 1) {
        // Sort types to ensure consistent key (e.g., "CASH+UPI" not "UPI+CASH")
        const sortedTypes = [...types].sort()
        const key = sortedTypes.join('+')

        const existing = splitCombinations.get(key) || { count: 0, total: 0, types: sortedTypes }
        existing.count += 1
        existing.total += getAmount(bill)
        splitCombinations.set(key, existing)
      }
    })

    return Array.from(splitCombinations.entries()).map(([key, data]) => ({
      id: key,
      name: key,
      count: data.count,
      total: data.total,
      types: data.types
    }))
  }, [dateFilteredBills])

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedPaymentType, dateFilter, fromDate, toDate])

  const handlePrintBill = async (billId: string) => {
    try {
      setLoadingBillDetails(true)

      // OPTIMIZED: Try to use bill from local state first, only fetch if items missing
      let billData = bills.find(b => b.bill_id === billId)

      // Fetch from API only if items are missing (list might not include full items)
      if (!billData?.items || billData.items.length === 0) {
        const response = await api.get(`/billing/${billId}`)
        billData = response.data.bill
      }

      if (!billData) {
        throw new Error('Bill data not found')
      }

      console.log('[BILLING] Bill data received:', billData)
      console.log('[BILLING] negotiable_amount:', billData.negotiable_amount)
      console.log('[BILLING] discount_amount:', billData.discount_amount)

      const billForPrint = {
        bill_number: billData.bill_number,
        customer_name: billData.customer_name,
        customer_phone: billData.customer_phone,
        items: billData.items,
        subtotal: billData.subtotal || billData.total_amount || 0,
        discount_percentage: billData.discount_percentage,
        discount_amount: billData.discount_amount,
        negotiable_amount: billData.negotiable_amount || 0,
        gst_amount: billData.gst_amount || 0,
        gst_percentage: billData.gst_percentage || 0,
        final_amount: billData.final_amount || billData.total_amount || 0,
        total_amount: billData.total_amount || billData.subtotal || 0,
        payment_type: billData.payment_type,
        created_at: billData.created_at,
        type: billData.type,
        cgst: billData.cgst || 0,
        sgst: billData.sgst || 0,
        igst: billData.igst || 0,
        user_name: billData.user_name || (billData as any).created_by_name || (billData as any).created_by || 'Admin'
      }

      console.log('[BILLING] Bill for print:', billForPrint)

      const clientInfo = client ? {
        client_name: client.client_name,
        address: client.address,
        phone: client.phone,
        email: client.email,
        gstin: client.gstin,
        logo_url: client.logo_url
      } : {
        client_name: 'Business Name',
        address: '',
        phone: '',
        email: '',
        gstin: '',
        logo_url: ''
      }

      // Check if running in Electron desktop app
      const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null
      const hasElectronPrint = electronAPI && typeof electronAPI.silentPrint === 'function'

      if (hasElectronPrint) {
        // Use Electron's silent print for desktop app
        console.log('[BILLING] Electron detected - using Electron print API...')
        try {
          const { generateReceiptHtml } = await import('@/lib/webPrintService')
          const receiptHtml = generateReceiptHtml(billForPrint as any, clientInfo, true)
          const printResult = await electronAPI.silentPrint(receiptHtml, null)

          if (printResult.success) {
            console.log('Print successful!')
          } else {
            throw new Error(printResult.error || 'Print failed')
          }
        } catch (electronPrintError: any) {
          console.error('Electron print failed:', electronPrintError)
          alert('Print failed: ' + (electronPrintError.message || 'Unknown error'))
        }
      } else {
        // Use browser print dialog for web deployment
        console.log('[BILLING] Web mode - using browser print dialog...')
        const { printBill } = await import('@/lib/webPrintService')
        const printResult = printBill(billForPrint as any, clientInfo, true)

        if (printResult.success) {
          console.log('Print dialog opened successfully!')
        } else {
          throw new Error(printResult.message || 'Print failed')
        }
      }
    } catch (error: any) {
      console.error('Failed to print bill:', error)
      alert(error.message || 'Print failed. Please try again.')
    } finally {
      setLoadingBillDetails(false)
    }
  }

  const handleExchangeBill = (billId: string) => {
    router.push(`/billing/exchange/${billId}`)
  }

  const handleCancelBill = async (billId: string, billNumber: number) => {
    if (!confirm(`Are you sure you want to cancel Bill #${billNumber}? This will restore all item quantities to stock.`)) {
      return
    }

    try {
      const response = await api.post(`/billing/${billId}/cancel`)
      if (response.data.success) {
        // Immediately update UI - set status to cancelled
        setBills(prevBills =>
          prevBills.map(bill =>
            bill.bill_id === billId ? { ...bill, status: 'cancelled' } : bill
          )
        )
        alert(`Bill #${billNumber} cancelled successfully. Stock has been restored.`)
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to cancel bill'
      // Check if it's already cancelled (means previous attempt succeeded)
      if (errorMsg.includes('already cancelled')) {
        // Update UI to reflect the cancelled status
        setBills(prevBills =>
          prevBills.map(bill =>
            bill.bill_id === billId ? { ...bill, status: 'cancelled' } : bill
          )
        )
      }
      alert(errorMsg)
    }
  }

  // Get icon for payment type
  const getPaymentIcon = (paymentType: string) => {
    const type = paymentType.toUpperCase()
    if (type.includes('CASH')) return Banknote
    if (type.includes('UPI')) return Smartphone
    if (type.includes('CARD')) return CreditCard
    if (type.includes('BANK') || type.includes('NET')) return Building2
    if (type.includes('WALLET')) return Wallet
    if (type.includes('CHEQUE') || type.includes('CHECK')) return FileText
    return DollarSign
  }

  // Get color for payment type
  const getPaymentColor = (paymentType: string) => {
    const type = paymentType.toUpperCase()
    if (type.includes('CASH')) return { bg: 'from-green-500 to-green-600', text: 'text-green-600', border: 'border-green-500' }
    if (type.includes('UPI')) return { bg: 'from-purple-500 to-purple-600', text: 'text-purple-600', border: 'border-purple-500' }
    if (type.includes('CARD')) return { bg: 'from-blue-500 to-blue-600', text: 'text-blue-600', border: 'border-blue-500' }
    if (type.includes('BANK') || type.includes('NET')) return { bg: 'from-indigo-500 to-indigo-600', text: 'text-indigo-600', border: 'border-indigo-500' }
    if (type.includes('WALLET')) return { bg: 'from-orange-500 to-orange-600', text: 'text-orange-600', border: 'border-orange-500' }
    if (type.includes('CHEQUE') || type.includes('CHECK')) return { bg: 'from-teal-500 to-teal-600', text: 'text-teal-600', border: 'border-teal-500' }
    return { bg: 'from-gray-500 to-gray-600', text: 'text-gray-600', border: 'border-gray-500' }
  }

  return (
    <DashboardLayout>
      {/* Full height container with fixed footer */}
      <div className="flex flex-col h-[calc(100vh-6rem)]">
        {/* Header with Date Filter */}
        <div className="flex-shrink-0 mb-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">All Bills</h1>
              <p className="text-[10px] text-gray-600 dark:text-gray-400">Filter by date and payment method</p>
            </div>

            {/* Date Filter - Compact */}
            <div className="flex items-center gap-1.5">
              {/* All Dates */}
              <button
                type="button"
                onClick={() => {
                  setDateFilter('all')
                  setFromDate('')
                  setToDate('')
                }}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  dateFilter === 'all'
                    ? 'bg-slate-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                All
              </button>

              {/* Today */}
              <button
                type="button"
                onClick={() => {
                  setDateFilter('today')
                  setFromDate('')
                  setToDate('')
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  dateFilter === 'today'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Calendar className="w-3 h-3" />
                Today
              </button>

              {/* Separator */}
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

              {/* From Date */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-500 dark:text-gray-400">From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || todayString}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                    setDateFilter('custom')
                  }}
                  className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* To Date */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-500 dark:text-gray-400">To</span>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={todayString}
                  onChange={(e) => {
                    setToDate(e.target.value)
                    setDateFilter('custom')
                  }}
                  className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Clear custom dates */}
              {dateFilter === 'custom' && (fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFilter('all')
                    setFromDate('')
                    setToDate('')
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Clear dates"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton count={4} />
            <TableSkeleton rows={10} />
          </div>
        ) : bills.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 text-base">No bills found</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">Create your first bill to get started</p>
            </div>
          </div>
        ) : (
          <>
            {/* Payment Type Filter Cards - Compact */}
            <div className="flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide">
              <div className="flex gap-1.5 pb-1 min-w-max">
                {/* All Bills Card */}
                <button
                  type="button"
                  onClick={() => setSelectedPaymentType('all')}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${
                    selectedPaymentType === 'all'
                      ? 'bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-md'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm'
                  }`}
                >
                  <div className={`p-1 rounded ${
                    selectedPaymentType === 'all'
                      ? 'bg-white/20'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <FileText className={`w-3 h-3 ${
                      selectedPaymentType === 'all' ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                    }`} />
                  </div>
                  <div className="text-left">
                    <p className={`text-[9px] font-medium ${
                      selectedPaymentType === 'all' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      All Bills
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-sm font-bold ${
                        selectedPaymentType === 'all' ? 'text-white' : 'text-gray-900 dark:text-white'
                      }`}>
                        {dateFilteredBills.length}
                      </span>
                      <span className={`text-[10px] font-medium ${
                        selectedPaymentType === 'all' ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Payment Type Cards with Icons */}
                {paymentTypeStats.map(stat => {
                  const Icon = getPaymentIcon(stat.payment_name)
                  const colors = getPaymentColor(stat.payment_name)
                  const isSelected = selectedPaymentType === stat.payment_type_id

                  return (
                    <button
                      key={stat.payment_type_id}
                      type="button"
                      onClick={() => setSelectedPaymentType(stat.payment_type_id)}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${
                        isSelected
                          ? `bg-gradient-to-br ${colors.bg} border-transparent shadow-md`
                          : `bg-white dark:bg-gray-800 ${colors.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-sm`
                      }`}
                    >
                      <div className={`p-1 rounded ${
                        isSelected
                          ? 'bg-white/20'
                          : `bg-${colors.text.split('-')[1]}-50 dark:bg-${colors.text.split('-')[1]}-900/20`
                      }`}>
                        <Icon className={`w-3 h-3 ${
                          isSelected ? 'text-white' : colors.text
                        }`} />
                      </div>
                      <div className="text-left">
                        <p className={`text-[9px] font-medium uppercase tracking-wide ${
                          isSelected ? 'text-white/80' : `${colors.text} opacity-70`
                        }`}>
                          {stat.payment_name}
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-sm font-bold ${
                            isSelected ? 'text-white' : 'text-gray-900 dark:text-white'
                          }`}>
                            {stat.count}
                          </span>
                          <span className={`text-[10px] font-medium ${
                            isSelected ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            ₹{stat.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}

                {/* Split Payment Relationship Cards */}
                {splitPaymentStats.length > 0 && (
                  <>
                    <div className="w-px bg-gray-300 dark:bg-gray-600 mx-1 self-stretch" />
                    {splitPaymentStats.map(stat => {
                      const isSelected = selectedPaymentType === stat.id
                      return (
                        <button
                          key={stat.id}
                          type="button"
                          onClick={() => setSelectedPaymentType(stat.id)}
                          className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${
                            isSelected
                              ? 'bg-gradient-to-br from-amber-500 to-orange-500 border-transparent shadow-md'
                              : 'bg-white dark:bg-gray-800 border-amber-400 border-opacity-40 dark:border-opacity-40 hover:border-opacity-70 hover:shadow-sm'
                          }`}
                        >
                          <div className={`p-1 rounded ${
                            isSelected ? 'bg-white/20' : 'bg-amber-50 dark:bg-amber-900/20'
                          }`}>
                            <RefreshCw className={`w-3 h-3 ${
                              isSelected ? 'text-white' : 'text-amber-600'
                            }`} />
                          </div>
                          <div className="text-left">
                            <p className={`text-[9px] font-medium uppercase tracking-wide ${
                              isSelected ? 'text-white/80' : 'text-amber-600 opacity-70'
                            }`}>
                              {stat.name}
                            </p>
                            <div className="flex items-baseline gap-1">
                              <span className={`text-sm font-bold ${
                                isSelected ? 'text-white' : 'text-gray-900 dark:text-white'
                              }`}>
                                {stat.count}
                              </span>
                              <span className={`text-[10px] font-medium ${
                                isSelected ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'
                              }`}>
                                ₹{stat.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Scrollable Bills Table - Maximized Space */}
            <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase">Bill #</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase">Date</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase">Customer</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase">Phone</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase">Payment Type</th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-bold text-white uppercase">Amount</th>
                    <th className="px-2 py-1.5 text-center text-[10px] font-bold text-white uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedBills.map((bill, index) => {
                    // Use display payment type from expanded bill
                    const paymentTypeName = bill.displayPaymentType || 'Unknown'
                    // Get color scheme for this payment type
                    const colors = getPaymentColor(paymentTypeName)

                    // Check if this is part of a split payment group
                    const isSplitPayment = bill.paymentCount > 1
                    const showActions = bill.isFirstPayment // Only show actions for the first payment in a group

                    // Calculate display number based on filtered bills (for pagination)
                    const filteredBillNumbers = new Set(filteredExpandedBills.slice(0, startIndex + index + 1).map(b => b.billSequenceNumber))
                    const displayNumber = filteredBillNumbers.size

                    return (
                      <tr key={`${bill.bill_id}-${bill.displayPaymentType}-${index}`}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!bill.isFirstPayment && isSplitPayment ? 'border-t-0' : ''}`}>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {bill.isFirstPayment ? (
                            <div className="flex items-center gap-1">
                              <span className={`text-xs font-semibold ${bill.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>{displayNumber}</span>
                              {bill.status === 'cancelled' && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase">Cancelled</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500 pl-2">↳</span>
                          )}
                        </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {bill.isFirstPayment ? (
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {new Date(bill.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {bill.isFirstPayment ? (
                          <span className="text-xs text-gray-700 dark:text-gray-300">{bill.customer_name}</span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {bill.isFirstPayment ? (
                          <span className="text-xs text-gray-600 dark:text-gray-400">{bill.customer_phone}</span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gradient-to-r ${colors.bg} rounded-full uppercase shadow-sm`}>
                          {paymentTypeName}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          ₹{bill.displayAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      {showActions ? (
                        <td className="px-2 py-1.5 text-center whitespace-nowrap" rowSpan={bill.paymentCount}>
                          {bill.status === 'cancelled' ? (
                            <span className="text-[10px] text-gray-400">No actions</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleExchangeBill(bill.bill_id)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all"
                                title="Exchange Bill"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Exchange
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintBill(bill.bill_id)}
                                disabled={loadingBillDetails}
                                className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Print Bill"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelBill(bill.bill_id, bill.bill_number)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all"
                                title="Cancel Bill"
                              >
                                <XCircle className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      ) : null}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - Compact */}
            {totalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-center gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${
                        currentPage === page
                          ? 'bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-md'
                          : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            {/* Fixed Footer with Page Total and Grand Total */}
            <div className="flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-6">
                  {/* Page Info */}
                  <div>
                    <p className="text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium">Page {currentPage} of {totalPages || 1}</p>
                    <p className="text-slate-300 dark:text-gray-300 text-xs font-semibold">
                      {paginatedBills.length} items
                    </p>
                  </div>
                  {/* Page Total */}
                  <div className="border-l border-slate-600 pl-6">
                    <p className="text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium">Page Total</p>
                    <p className="text-yellow-400 text-sm font-bold">
                      ₹{paginatedBills.reduce((sum, bill) => sum + bill.displayAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                {/* Grand Total */}
                <div className="text-right">
                  <p className="text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium">
                    {selectedPaymentType === 'all'
                      ? `Grand Total (${dateFilteredBills.length} bills)${dateFilter !== 'all' ? ` • ${dateFilter === 'today' ? 'Today' : 'Custom'}` : ''}`
                      : `${paymentTypes.find(pt => pt.payment_type_id === selectedPaymentType)?.payment_name || selectedPaymentType} (${new Set(filteredExpandedBills.map(b => b.bill_id)).size} bills)`
                    }
                  </p>
                  <p className="text-white text-lg font-bold">
                    ₹{filteredTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

    </DashboardLayout>
  )
}

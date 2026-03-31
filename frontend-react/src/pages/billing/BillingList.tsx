

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { useClient } from '@/contexts/ClientContext'
import { Wallet, CreditCard, Smartphone, Building2, FileText, Banknote, DollarSign, RefreshCw, XCircle, Calendar, X, Package, User, Clock, Hash, CheckCircle } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { generateBillPDF } from '@/lib/pdfService'
import { getShopSettings } from '@/services/shopSettingsService'
import type { ShopSettings } from '@/services/shopSettingsService'

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

interface PaymentType {
  payment_type_id: string
  payment_name: string
}

export default function AllBillsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { client } = useClient()
  const [bills, setBills] = useState<Bill[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 17
  const [loadingBillDetails, setLoadingBillDetails] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)

  // Date filter state
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'custom'>('all')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // Cancel confirmation modal state
  const [cancelConfirm, setCancelConfirm] = useState<{ billId: string; billNumber: number } | null>(null)

  // Shop settings (for logo + address in PDF)
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null)

  // Track ongoing request to prevent duplicates (for React Strict Mode)
  const ongoingRequest = useRef<Promise<void> | null>(null)

  const isFirstMount = useRef(true)

  useEffect(() => {
    fetchData()
    getShopSettings().then(setShopSettings).catch(() => {/* non-critical */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch whenever the user navigates to this page (e.g. after creating a bill)
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return }
    ongoingRequest.current = null
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // Force-refresh when coming back from exchange (or cancel that updated data)
  useEffect(() => {
    const state = location.state as { refreshAfterExchange?: boolean } | null
    if (state?.refreshAfterExchange) {
      navigate(location.pathname, { replace: true, state: {} })
      ongoingRequest.current = null
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Parse payment_type JSON once per bill and memoize as a Map<bill_id, string[]>
  // Avoids repeated JSON.parse calls inside getExpandedBills, filteredBills, paymentTypeStats, etc.
  const parsedPaymentMap = useMemo(() => {
    const map = new Map<string, string[]>()
    bills.forEach(bill => {
      if (!bill.payment_type) { map.set(bill.bill_id, []); return }
      const rawPt = String(bill.payment_type).trim()
      // Old format: bare UUID stored as payment_type — name is unrecoverable, treat as unknown
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawPt)) {
        map.set(bill.bill_id, [])
        return
      }
      if (rawPt.startsWith('[')) {
        try {
          const parsed = JSON.parse(rawPt)
          if (Array.isArray(parsed)) {
            // Handles all stored formats:
            //   {PAYMENT_TYPE: "Cash"}     — old uppercase key
            //   {payment_type: "Cash"}     — current key
            //   {payment_name: "Pending"}  — pending-bill key
            map.set(bill.bill_id, parsed.map((p: any) => p.PAYMENT_TYPE || p.payment_type || p.payment_name).filter(Boolean))
            return
          }
        } catch { /* fall through */ }
      }
      map.set(bill.bill_id, [rawPt])
    })
    return map
  }, [bills])

  const parsePaymentTypes = (bill: Bill): string[] => parsedPaymentMap.get(bill.bill_id) ?? []

  const fetchData = async () => {
    ongoingRequest.current = null

    const request = (async () => {
      try {
        setLoading(true)

        const billsRes = await api.get('/billing/list?limit=100&status=all')
        const fetchedBills = billsRes.data.bills || []
        setBills(fetchedBills)

        // Extract unique payment types directly from fetched bills (not from stale memoized map)
        if (fetchedBills.length > 0) {
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          const uniquePaymentTypes = new Set<string>()
          fetchedBills.forEach((bill: Bill) => {
            if (!bill.payment_type) return
            const rawPt = String(bill.payment_type).trim()
            // Old UUID-only format — name is unrecoverable, skip it
            if (UUID_RE.test(rawPt)) return
            if (rawPt.startsWith('[')) {
              try {
                const parsed = JSON.parse(rawPt)
                if (Array.isArray(parsed)) {
                  parsed.forEach((p: any) => {
                    const pt = p.PAYMENT_TYPE || p.payment_type || p.payment_name
                    if (pt) uniquePaymentTypes.add(pt)
                  })
                  return
                }
              } catch { /* fall through */ }
            }
            uniquePaymentTypes.add(rawPt)
          })

          const sortOrder = ['CASH', 'UPI', 'CARD', 'CREDIT CARD', 'NET BANKING', 'CHEQUE', 'CREDIT', 'WALLET']
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

    return expandedBills.filter(bill => {
      const billTypes = parsedPaymentMap.get(bill.bill_id) ?? []
      // Backend may return split payments as a single string "Cash+UPI"
      // or as separate entries ["Cash", "UPI"] — handle both
      const resolvedTypes = billTypes.length === 1 && billTypes[0].includes('+')
        ? billTypes[0].split('+')
        : billTypes

      if (selectedPaymentType.includes('+')) {
        // Split payment filter
        if (resolvedTypes.length <= 1) return false
        const sortedTypes = [...resolvedTypes].sort().join('+')
        return sortedTypes === selectedPaymentType
      }

      // Single payment filter
      return resolvedTypes.length === 1 && bill.displayPaymentType === selectedPaymentType
    })
  }, [expandedBills, selectedPaymentType, parsedPaymentMap])

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

      const clientInfo = client ? {
        client_name: client.client_name,
        address: client.address,
        phone: client.phone,
        email: client.email,
        gstin: client.gstin,
        logo_url: client.logo_url,
        upi_id: (client as any).upi_id || '',
        receipt_footer: (client as any).receipt_footer || ''
      } : {
        client_name: 'Business Name',
        address: '',
        phone: '',
        email: '',
        gstin: '',
        logo_url: '',
        upi_id: '',
        receipt_footer: ''
      }

      // Check if running in Electron desktop app
      const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null
      const hasElectronPrint = electronAPI && typeof electronAPI.silentPrint === 'function'

      if (hasElectronPrint) {
        // Use Electron's silent print for desktop app
        try {
          const { generateReceiptHtml, generateUpiQrDataUrl } = await import('@/lib/webPrintService')
          const qrDataUrl = clientInfo.upi_id ? await generateUpiQrDataUrl(clientInfo.upi_id, clientInfo.client_name || '') : undefined
          const receiptHtml = generateReceiptHtml(billForPrint as any, clientInfo, true, qrDataUrl)
          const printResult = await electronAPI.silentPrint(receiptHtml, null)

          if (!printResult.success) {
            throw new Error(printResult.error || 'Print failed')
          }
        } catch (electronPrintError: any) {
          console.error('Electron print failed:', electronPrintError)
          alert('Print failed: ' + (electronPrintError.message || 'Unknown error'))
        }
      } else {
        // Use browser print dialog for web deployment
        const { printBill } = await import('@/lib/webPrintService')
        const printResult = await printBill(billForPrint as any, clientInfo, true)

        if (!printResult.success) {
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

  const handleViewBill = async (bill: Bill) => {
    // Show drawer immediately with list data, then fetch fresh details
    setSelectedBill(bill)
    try {
      const response = await api.get(`/billing/${bill.bill_id}`)
      const freshBill = response.data.bill
      // Merge fresh data into selected bill (keep display fields from list)
      setSelectedBill(prev => prev && prev.bill_id === bill.bill_id ? { ...prev, ...freshBill } : prev)
      // Also update the bill in the list so it stays fresh
      setBills(prevBills =>
        prevBills.map(b => b.bill_id === bill.bill_id ? { ...b, ...freshBill } : b)
      )
    } catch (error) {
      console.error('Failed to fetch fresh bill details:', error)
      // Keep showing the list data — better than nothing
    }
  }

  const handleExchangeBill = (billId: string) => {
    navigate(`/billing/exchange/${billId}`)
  }

  const handleCancelBill = async (billId: string, billNumber: number) => {
    // Show custom confirmation modal instead of browser confirm()
    setCancelConfirm({ billId, billNumber })
  }

  const confirmCancelBill = async () => {
    if (!cancelConfirm) return
    const { billId, billNumber } = cancelConfirm
    setCancelConfirm(null)

    try {
      const response = await api.post(`/billing/${billId}/cancel`)
      if (response.data.success) {
        setBills(prevBills =>
          prevBills.map(bill =>
            bill.bill_id === billId ? { ...bill, status: 'cancelled' } : bill
          )
        )
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to cancel bill'
      if (errorMsg.includes('already cancelled')) {
        setBills(prevBills =>
          prevBills.map(bill =>
            bill.bill_id === billId ? { ...bill, status: 'cancelled' } : bill
          )
        )
      } else {
        alert(errorMsg)
      }
    }
  }

  const handleMarkPaid = async (billId: string, billNumber: number) => {
    if (!window.confirm(`Mark Bill #${billNumber} as Paid?`)) return
    try {
      await api.put(`/billing/${billId}/mark-paid`)
      setBills(prev => prev.map(b => b.bill_id === billId ? { ...b, payment_status: 'paid' } : b))
      if (selectedBill?.bill_id === billId) setSelectedBill(prev => prev ? { ...prev, payment_status: 'paid' } : prev)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to mark as paid')
    }
  }

  const handleDownloadPDF = async (bill: Bill) => {
    const clientInfo = {
      client_name: shopSettings?.shop_name || client?.client_name || 'Business',
      address: shopSettings?.address1 || client?.address || '',
      address2: shopSettings?.address2 || '',
      phone: shopSettings?.phone || client?.phone || '',
      gstin: shopSettings?.gst_number || client?.gstin || '',
      logo_url: client?.logo_url || '',
      receipt_footer: shopSettings?.receipt_footer || '',
    }
    const isGST = bill.type === 'gst'
    const grandTotal = isGST ? (bill.final_amount ?? 0) : (bill.total_amount ?? 0)
    const pdfBill = {
      bill_number: bill.bill_number,
      customer_name: bill.customer_name || 'Walk-in Customer',
      customer_phone: bill.customer_phone || '',
      items: (bill.items || []).map(item => ({
        product_id: '',
        product_name: item.product_name,
        item_code: item.item_code || '',
        hsn_code: '',
        unit: 'pcs',
        quantity: item.quantity,
        rate: item.rate,
        mrp: item.mrp,
        gst_percentage: item.gst_percentage ?? 0,
        gst_amount: ((item.quantity * item.rate) * (item.gst_percentage ?? 0)) / 100,
        amount: item.amount,
      })),
      subtotal: bill.subtotal ?? grandTotal,
      discount_percentage: bill.discount_percentage ?? 0,
      discount_amount: bill.discount_amount ?? 0,
      negotiable_amount: bill.negotiable_amount,
      gst_amount: bill.gst_amount ?? 0,
      final_amount: bill.final_amount ?? grandTotal,
      total_amount: bill.total_amount ?? grandTotal,
      payment_type: bill.payment_type || '[]',
      created_at: bill.created_at,
      type: (isGST ? 'gst' : 'non-gst') as 'gst' | 'non-gst',
      cgst: bill.cgst ?? 0,
      sgst: bill.sgst ?? 0,
      igst: bill.igst ?? 0,
      user_name: bill.user_name || '',
      payment_status: (bill.payment_status || 'paid') as 'paid' | 'pending',
    }
    await generateBillPDF(pdfBill, clientInfo)
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
    if (type.includes('PENDING')) return { bg: 'from-amber-500 to-amber-600', text: 'text-amber-600', border: 'border-amber-500' }
    return { bg: 'from-gray-500 to-gray-600', text: 'text-gray-600', border: 'border-gray-500' }
  }

  return (
    <DashboardLayout>
      {/* Full height container with fixed footer */}
      <div className="flex flex-col h-[calc(100vh-6rem)]">
        {/* Header with Date Filter */}
        <div className="flex-shrink-0 mb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">All Bills</h1>
              <p className="text-[10px] text-gray-600 dark:text-gray-400">Filter by date and payment method</p>
            </div>

            {/* Date Filter - Compact */}
            <div className="flex flex-wrap items-center gap-1.5">
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
                  onClick={() => { setSelectedPaymentType('all'); fetchData() }}
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
            <div className="hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
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
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!bill.isFirstPayment && isSplitPayment ? 'border-t-0' : ''}`}
                          onClick={() => bill.isFirstPayment && handleViewBill(bill)}>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {bill.isFirstPayment ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`text-xs font-semibold ${bill.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>{displayNumber}</span>
                              {bill.status === 'cancelled' && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase">Cancelled</span>
                              )}
                              {bill.payment_status === 'pending' && bill.status !== 'cancelled' && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase">Pending</span>
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
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {/* Mark Paid — only for pending bills */}
                              {bill.payment_status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleMarkPaid(bill.bill_id, bill.bill_number) }}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-all border border-green-300 dark:border-green-700"
                                  title="Mark as Paid"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Mark Paid
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleExchangeBill(bill.bill_id) }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all"
                                title="Exchange Bill"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Exchange
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handlePrintBill(bill.bill_id) }}
                                disabled={loadingBillDetails}
                                className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Print Bill"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print
                              </button>
                              {/* PDF download */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDownloadPDF(bill) }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded transition-all"
                                title="Download PDF"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleCancelBill(bill.bill_id, bill.bill_number) }}
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

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {paginatedBills
                .filter(bill => bill.isFirstPayment !== false)
                .map(bill => (
                  <div
                    key={`${bill.bill_id}-${bill.displayPaymentType ?? bill.payment_type}`}
                    onClick={() => handleViewBill(bill)}
                    className="cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">#{bill.bill_number}</p>
                          {bill.payment_status === 'pending' && bill.status !== 'cancelled' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase">Payment Pending</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{bill.customer_name || 'Walk-in'}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        bill.status === 'cancelled'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      }`}>
                        {bill.displayPaymentType ?? bill.payment_type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{bill.created_at ? new Date(bill.created_at).toLocaleDateString() : ''}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">₹{bill.displayAmount?.toLocaleString()}</span>
                    </div>
                    {bill.payment_status === 'pending' && bill.status !== 'cancelled' && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMarkPaid(bill.bill_id, bill.bill_number) }}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded border border-green-300 dark:border-green-700"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Mark Paid
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDownloadPDF(bill) }}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          PDF
                        </button>
                      </div>
                    )}
                  </div>
                ))}
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

      {/* Bill Detail Drawer */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedBill(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Bill #{selectedBill.bill_number}
                </h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedBill.type === 'gst' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                  {selectedBill.type === 'gst' ? 'GST' : 'Non-GST'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Meta info */}
            <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Customer</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{selectedBill.customer_name || 'Walk-In'}</p>
                  {selectedBill.customer_phone && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selectedBill.customer_phone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Date</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    {new Date(selectedBill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(selectedBill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Wallet className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Payment</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    {selectedBill.payment_type
                      ? (() => {
                          const pt = selectedBill.payment_type
                          if (typeof pt === 'string' && pt.trim().startsWith('[')) {
                            try {
                              const arr = JSON.parse(pt)
                              return Array.isArray(arr)
                                ? arr.map((p: { payment_type?: string; PAYMENT_TYPE?: string; amount?: number; AMOUNT?: number }) =>
                                    `${p.payment_type || p.PAYMENT_TYPE || ''}${p.amount || p.AMOUNT ? ` ₹${p.amount || p.AMOUNT}` : ''}`
                                  ).join(' + ')
                                : pt
                            } catch { return pt }
                          }
                          return pt
                        })()
                      : '—'}
                  </p>
                </div>
              </div>
              {selectedBill.status === 'cancelled' && (
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Status</p>
                    <p className="text-sm text-red-500 font-medium">Cancelled</p>
                  </div>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="px-5 py-4 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Items</h3>
              </div>
              {selectedBill.items && selectedBill.items.length > 0 ? (
                <div className="space-y-2">
                  {selectedBill.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.quantity} × ₹{(item.rate || 0).toLocaleString('en-IN')}
                          {item.gst_percentage ? ` + ${item.gst_percentage}% GST` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3">
                        ₹{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No item details available</p>
              )}
            </div>

            {/* Totals */}
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {selectedBill.type === 'gst' && selectedBill.subtotal !== undefined && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>₹{(selectedBill.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {selectedBill.gst_amount !== undefined && selectedBill.gst_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>GST ({selectedBill.gst_percentage || 0}%)</span>
                  <span>₹{(selectedBill.gst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {selectedBill.discount_amount !== undefined && selectedBill.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span>Discount {selectedBill.discount_percentage ? `(${selectedBill.discount_percentage}%)` : ''}</span>
                  <span>-₹{(selectedBill.discount_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span>
                <span>₹{((selectedBill.final_amount ?? selectedBill.total_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Payment status row */}
              {selectedBill.payment_status === 'pending' && selectedBill.status !== 'cancelled' && (
                <div className="mt-3 flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600 dark:text-amber-400 text-sm">⏳</span>
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Payment Pending</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMarkPaid(selectedBill.bill_id, selectedBill.bill_number)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Mark Paid
                  </button>
                </div>
              )}

              {/* Detail panel actions */}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPDF(selectedBill)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-700 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setCancelConfirm(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cancel Bill #{cancelConfirm.billNumber}?</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This will restore all item quantities to stock.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setCancelConfirm(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              >
                No, Keep Bill
              </button>
              <button
                type="button"
                onClick={confirmCancelBill}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Yes, Cancel Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

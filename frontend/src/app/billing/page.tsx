'use client'

import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { useData } from '@/contexts/DataContext'
import { useClient } from '@/contexts/ClientContext'
import BillPrintPreview from '@/components/BillPrintPreview'
import { Wallet, CreditCard, Smartphone, Building2, FileText, Banknote, DollarSign, Edit, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface BillItem {
  product_name: string
  quantity: number
  rate: number
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
  cgst?: number
  sgst?: number
  igst?: number
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
  const itemsPerPage = 20
  const [selectedBillForPrint, setSelectedBillForPrint] = useState<Bill | null>(null)
  const [loadingBillDetails, setLoadingBillDetails] = useState(false)

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
    const expanded: Array<Bill & { displayPaymentType: string; displayAmount: number }> = []

    billsList.forEach(bill => {
      const paymentTypes = parsePaymentTypes(bill)

      if (paymentTypes.length > 1) {
        // Split payment - create a row for each payment type
        paymentTypes.forEach(pt => {
          expanded.push({
            ...bill,
            displayPaymentType: pt,
            displayAmount: getAmountForPaymentType(bill, pt)
          })
        })
      } else {
        // Single payment - add as is
        expanded.push({
          ...bill,
          displayPaymentType: paymentTypes[0] || bill.payment_type,
          displayAmount: getAmount(bill)
        })
      }
    })

    return expanded
  }

  // Filter and expand bills
  const expandedBills = getExpandedBills(bills)
  const filteredExpandedBills = selectedPaymentType === 'all'
    ? expandedBills
    : expandedBills.filter(bill => bill.displayPaymentType === selectedPaymentType)

  // Pagination
  const totalPages = Math.ceil(filteredExpandedBills.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBills = filteredExpandedBills.slice(startIndex, endIndex)

  // Calculate totals
  const grandTotal = bills.reduce((sum, bill) => sum + getAmount(bill), 0)
  const filteredTotal = filteredExpandedBills.reduce((sum, bill) => sum + bill.displayAmount, 0)

  // Get payment type statistics
  const paymentTypeStats = paymentTypes.map(pt => {
    // Find all bills that include this payment type (including split payments)
    const ptBills = bills.filter(bill => {
      const paymentTypes = parsePaymentTypes(bill)
      return paymentTypes.includes(pt.payment_type_id)
    })

    // Calculate total for this payment type (only the amount paid via this method)
    const total = ptBills.reduce((sum, bill) => {
      return sum + getAmountForPaymentType(bill, pt.payment_type_id)
    }, 0)

    return {
      ...pt,
      count: ptBills.length,
      total
    }
  })

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedPaymentType])

  const handlePrintBill = async (billId: string) => {
    try {
      setLoadingBillDetails(true)
      const response = await api.get(`/billing/${billId}`)
      const billData = response.data.bill
      setSelectedBillForPrint(billData)
    } catch (error: any) {
      console.error('Failed to fetch bill details:', error)
      alert('Failed to load bill details for printing')
    } finally {
      setLoadingBillDetails(false)
    }
  }

  const handleEditBill = (billId: string) => {
    router.push(`/billing/edit/${billId}`)
  }

  const handleExchangeBill = (billId: string) => {
    router.push(`/billing/exchange/${billId}`)
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
        {/* Header */}
        <div className="flex-shrink-0 mb-2">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">All Bills</h1>
          <p className="text-[10px] text-gray-600 dark:text-gray-400">Filter and view billing records by payment method</p>
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
            {/* Payment Type Filter Cards - User Friendly */}
            <div className="flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-1 min-w-max">
                {/* All Bills Card */}
                <button
                  type="button"
                  onClick={() => setSelectedPaymentType('all')}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
                    selectedPaymentType === 'all'
                      ? 'bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-lg scale-105'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md'
                  }`}
                >
                  <div className={`p-1.5 rounded-md ${
                    selectedPaymentType === 'all'
                      ? 'bg-white/20'
                      : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
                  }`}>
                    <FileText className={`w-4 h-4 ${
                      selectedPaymentType === 'all' ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                    }`} />
                  </div>
                  <div className="text-left">
                    <p className={`text-[10px] font-semibold ${
                      selectedPaymentType === 'all' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      All Bills
                    </p>
                    <p className={`text-base font-bold ${
                      selectedPaymentType === 'all' ? 'text-white' : 'text-gray-900 dark:text-white'
                    }`}>
                      {bills.length}
                    </p>
                    <p className={`text-xs font-semibold ${
                      selectedPaymentType === 'all' ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
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
                      className={`group flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
                        isSelected
                          ? `bg-gradient-to-br ${colors.bg} border-transparent shadow-xl scale-105`
                          : `bg-white dark:bg-gray-800 ${colors.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-lg`
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${
                        isSelected
                          ? 'bg-white/20'
                          : `bg-${colors.text.split('-')[1]}-50 dark:bg-${colors.text.split('-')[1]}-900/20`
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          isSelected ? 'text-white' : colors.text
                        }`} />
                      </div>
                      <div className="text-left">
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isSelected ? 'text-white/80' : `${colors.text} opacity-70`
                        }`}>
                          {stat.payment_name}
                        </p>
                        <p className={`text-base font-bold ${
                          isSelected ? 'text-white' : 'text-gray-900 dark:text-white'
                        }`}>
                          {stat.count}
                        </p>
                        <p className={`text-xs font-semibold ${
                          isSelected ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          ₹{stat.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </button>
                  )
                })}
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
                    // Calculate sequential display number
                    const displayNumber = startIndex + index + 1
                    // Use display payment type from expanded bill
                    const paymentTypeName = bill.displayPaymentType || 'Unknown'
                    // Get color scheme for this payment type
                    const colors = getPaymentColor(paymentTypeName)

                    return (
                      <tr key={`${bill.bill_id}-${bill.displayPaymentType}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{displayNumber}</span>
                        </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(bill.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="text-xs text-gray-700 dark:text-gray-300">{bill.customer_name}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{bill.customer_phone}</span>
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
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleExchangeBill(bill.bill_id)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 rounded-md transition-all"
                            title="Exchange Bill"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Exchange
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditBill(bill.bill_id)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 rounded-md transition-all"
                            title="Edit Bill"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintBill(bill.bill_id)}
                            disabled={loadingBillDetails}
                            className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-white bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Print Bill"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print
                          </button>
                        </div>
                      </td>
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

            {/* Fixed Grand Total at Bottom */}
            <div className="flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-bold text-white">GRAND TOTAL</h2>
                  <p className="text-slate-300 dark:text-gray-300 text-[10px]">
                    {selectedPaymentType === 'all'
                      ? `All Bills (${bills.length})`
                      : `${paymentTypes.find(pt => pt.payment_type_id === selectedPaymentType)?.payment_name} (${filteredExpandedBills.length})`
                    }
                  </p>
                </div>
                <p className="text-white text-lg font-bold">
                  ₹{filteredTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bill Print Preview Modal */}
      {selectedBillForPrint && client && selectedBillForPrint.items && (
        <BillPrintPreview
          bill={{
            bill_number: Number(selectedBillForPrint.bill_number) || 0,
            customer_name: selectedBillForPrint.customer_name,
            customer_phone: selectedBillForPrint.customer_phone,
            items: selectedBillForPrint.items,
            subtotal: selectedBillForPrint.subtotal || 0,
            discount_percentage: selectedBillForPrint.discount_percentage,
            discount_amount: selectedBillForPrint.discount_amount,
            gst_amount: selectedBillForPrint.gst_amount,
            final_amount: selectedBillForPrint.final_amount || 0,
            total_amount: selectedBillForPrint.total_amount || 0,
            payment_type: String(selectedBillForPrint.payment_type || ''),
            created_at: String(selectedBillForPrint.created_at || ''),
            type: selectedBillForPrint.type === 'non_gst' ? 'non-gst' : 'gst',
            cgst: selectedBillForPrint.cgst,
            sgst: selectedBillForPrint.sgst,
            igst: selectedBillForPrint.igst
          }}
          clientInfo={{
            client_name: client.client_name,
            address: client.address,
            phone: client.phone,
            email: client.email,
            gstin: client.gstin,
            logo_url: client.logo_url
          }}
          onClose={() => setSelectedBillForPrint(null)}
        />
      )}
    </DashboardLayout>
  )
}

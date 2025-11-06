'use client'

import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { useData } from '@/contexts/DataContext'
import { useClient } from '@/contexts/ClientContext'
import BillPrintPreview from '@/components/BillPrintPreview'

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
  const { client } = useClient()
  const [bills, setBills] = useState<Bill[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
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

        // Extract unique payment types from bills
        if (fetchedBills.length > 0) {
          const uniquePaymentTypes = new Map<string, PaymentType>()
          fetchedBills.forEach((bill: Bill) => {
            if (bill.payment_type && !uniquePaymentTypes.has(bill.payment_type)) {
              uniquePaymentTypes.set(bill.payment_type, {
                payment_type_id: bill.payment_type,
                payment_name: bill.payment_type
              })
            }
          })
          setPaymentTypes(Array.from(uniquePaymentTypes.values()))
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

  // Filter bills by selected payment type
  const filteredBills = selectedPaymentType === 'all'
    ? bills
    : bills.filter(bill => bill.payment_type === selectedPaymentType)

  // Pagination
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBills = filteredBills.slice(startIndex, endIndex)

  // Calculate totals
  const grandTotal = bills.reduce((sum, bill) => sum + getAmount(bill), 0)
  const filteredTotal = filteredBills.reduce((sum, bill) => sum + getAmount(bill), 0)

  // Get payment type statistics
  const paymentTypeStats = paymentTypes.map(pt => {
    const ptBills = bills.filter(bill => bill.payment_type === pt.payment_type_id)
    const total = ptBills.reduce((sum, bill) => sum + getAmount(bill), 0)
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

  return (
    <DashboardLayout>
      {/* Fixed height container */}
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex-shrink-0 mb-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">All Bills</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Filter and view billing records by payment method</p>
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
            <div className="flex-shrink-0 mb-3 overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {/* All Filter */}
                <button
                  type="button"
                  onClick={() => setSelectedPaymentType('all')}
                  className={`flex-shrink-0 px-3 py-2.5 rounded-lg border transition-all ${
                    selectedPaymentType === 'all'
                      ? 'bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-lg'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-slate-400 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="text-left">
                    <p className={`text-[10px] font-medium ${selectedPaymentType === 'all' ? 'text-slate-200' : 'text-gray-600 dark:text-gray-400'}`}>
                      All Bills
                    </p>
                    <p className={`text-base font-bold ${selectedPaymentType === 'all' ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                      {bills.length}
                    </p>
                    <p className={`text-xs font-semibold ${selectedPaymentType === 'all' ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </button>

                {/* Payment Type Cards */}
                {paymentTypeStats.map(stat => (
                  <button
                    key={stat.payment_type_id}
                    type="button"
                    onClick={() => setSelectedPaymentType(stat.payment_type_id)}
                    className={`flex-shrink-0 px-3 py-2.5 rounded-lg border transition-all ${
                      selectedPaymentType === stat.payment_type_id
                        ? 'bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-lg'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-slate-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`text-[10px] font-medium uppercase ${
                        selectedPaymentType === stat.payment_type_id ? 'text-slate-200' : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {stat.payment_name}
                      </p>
                      <p className={`text-base font-bold ${
                        selectedPaymentType === stat.payment_type_id ? 'text-white' : 'text-gray-900 dark:text-white'
                      }`}>
                        {stat.count}
                      </p>
                      <p className={`text-xs font-semibold ${
                        selectedPaymentType === stat.payment_type_id ? 'text-white' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        ₹{stat.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Bills Table - Compact */}
            <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Bill #</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Customer</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Phone</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Payment Type</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-white uppercase">Amount</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-white uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedBills.map((bill, index) => {
                    // Calculate sequential display number based on filtered list position
                    const displayNumber = filteredBills.findIndex(b => b.bill_id === bill.bill_id) + 1
                    // Payment type is already a string (Cash, UPI, etc.)
                    const paymentTypeName = bill.payment_type || 'Unknown'
                    return (
                      <tr key={bill.bill_id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{displayNumber}</span>
                        </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(bill.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-700 dark:text-gray-300">{bill.customer_name}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{bill.customer_phone}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-white bg-gradient-to-r from-slate-600 to-slate-500 dark:from-gray-600 dark:to-gray-500 rounded-full uppercase">
                          {paymentTypeName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          ₹{getAmount(bill).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handlePrintBill(bill.bill_id)}
                          disabled={loadingBillDetails}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Print Bill"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - Compact */}
            {totalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-center gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="flex gap-1.5">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        currentPage === page
                          ? 'bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-lg'
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
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            {/* Fixed Grand Total at Bottom - Compact */}
            <div className="flex-shrink-0 mt-3 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-4 py-2.5">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold text-white">GRAND TOTAL</h2>
                  <p className="text-slate-300 dark:text-gray-300 text-[10px]">
                    {selectedPaymentType === 'all'
                      ? `All Bills (${bills.length})`
                      : `${paymentTypes.find(pt => pt.payment_type_id === selectedPaymentType)?.payment_name} (${filteredBills.length})`
                    }
                  </p>
                </div>
                <p className="text-white text-xl font-bold">
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

'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'
import { useData } from '@/contexts/DataContext'

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
}

interface PaymentType {
  payment_type_id: string
  payment_name: string
}

export default function AllBillsPage() {
  const { fetchPaymentTypes } = useData()
  const [bills, setBills] = useState<Bill[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch both in parallel
      const [billsRes, cachedPaymentTypes] = await Promise.all([
        api.get('/billing/list?limit=100'),
        fetchPaymentTypes()
      ])

      const fetchedBills = billsRes.data.bills || []
      setBills(fetchedBills)

      // Use cached payment types
      if (cachedPaymentTypes.length > 0) {
        setPaymentTypes(cachedPaymentTypes)
      } else if (fetchedBills.length > 0) {
        // Fallback: create payment types from bill data
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
    }
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

  return (
    <DashboardLayout>
      {/* Fixed height container */}
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex-shrink-0 mb-4">
          <h1 className="text-2xl font-bold text-slate-800">All Bills</h1>
          <p className="text-sm text-slate-500 mt-1">Filter and view billing records by payment method</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton count={4} />
            <TableSkeleton rows={10} />
          </div>
        ) : bills.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200 shadow">
            <div className="text-center">
              <p className="text-slate-500 text-base">No bills found</p>
              <p className="text-slate-400 text-sm mt-1">Create your first bill to get started</p>
            </div>
          </div>
        ) : (
          <>
            {/* Payment Type Filter Cards */}
            <div className="flex-shrink-0 mb-4 overflow-x-auto">
              <div className="flex gap-3 pb-2">
                {/* All Filter */}
                <button
                  onClick={() => setSelectedPaymentType('all')}
                  className={`flex-shrink-0 px-6 py-4 rounded-xl border-2 transition-all ${
                    selectedPaymentType === 'all'
                      ? 'bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-lg'
                      : 'bg-white border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="text-left">
                    <p className={`text-xs font-medium ${selectedPaymentType === 'all' ? 'text-slate-200' : 'text-slate-500'}`}>
                      All Bills
                    </p>
                    <p className={`text-lg font-bold ${selectedPaymentType === 'all' ? 'text-white' : 'text-slate-800'}`}>
                      {bills.length}
                    </p>
                    <p className={`text-sm font-semibold ${selectedPaymentType === 'all' ? 'text-white' : 'text-slate-600'}`}>
                      ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </button>

                {/* Payment Type Cards */}
                {paymentTypeStats.map(stat => (
                  <button
                    key={stat.payment_type_id}
                    onClick={() => setSelectedPaymentType(stat.payment_type_id)}
                    className={`flex-shrink-0 px-6 py-4 rounded-xl border-2 transition-all ${
                      selectedPaymentType === stat.payment_type_id
                        ? 'bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-lg'
                        : 'bg-white border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`text-xs font-medium uppercase ${
                        selectedPaymentType === stat.payment_type_id ? 'text-slate-200' : 'text-slate-500'
                      }`}>
                        {stat.payment_name}
                      </p>
                      <p className={`text-lg font-bold ${
                        selectedPaymentType === stat.payment_type_id ? 'text-white' : 'text-slate-800'
                      }`}>
                        {stat.count}
                      </p>
                      <p className={`text-sm font-semibold ${
                        selectedPaymentType === stat.payment_type_id ? 'text-white' : 'text-slate-600'
                      }`}>
                        ₹{stat.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Bills Table */}
            <div className="flex-1 overflow-auto bg-white rounded-xl border-2 border-slate-200 shadow-md">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-700 to-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase">Bill #</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase">Date</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase">Customer</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase">Phone</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase">Payment Type</th>
                    <th className="px-4 py-4 text-right text-xs font-bold text-white uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedBills.map((bill, index) => {
                    // Calculate sequential display number based on filtered list position
                    const displayNumber = filteredBills.findIndex(b => b.bill_id === bill.bill_id) + 1
                    // Get payment type name
                    const paymentTypeName = paymentTypes.find(pt => pt.payment_type_id === bill.payment_type)?.payment_name || 'Unknown'
                    return (
                      <tr key={bill.bill_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-slate-700">{displayNumber}</span>
                        </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-600">
                          {new Date(bill.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-700">{bill.customer_name}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-600">{bill.customer_phone}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="inline-block px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-slate-600 to-slate-500 rounded-full uppercase">
                          {paymentTypeName}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className="text-sm font-bold text-slate-800">
                          ₹{getAmount(bill).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-white border-2 border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="flex gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-lg font-bold transition-all ${
                        currentPage === page
                          ? 'bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-lg'
                          : 'bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg bg-white border-2 border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            {/* Fixed Grand Total at Bottom */}
            <div className="flex-shrink-0 mt-4 bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl border-2 border-slate-600 shadow-xl px-6 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">GRAND TOTAL</h2>
                  <p className="text-slate-300 text-sm">
                    {selectedPaymentType === 'all'
                      ? `All Bills (${bills.length})`
                      : `${paymentTypes.find(pt => pt.payment_type_id === selectedPaymentType)?.payment_name} (${filteredBills.length})`
                    }
                  </p>
                </div>
                <p className="text-white text-3xl font-bold">
                  ₹{filteredTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

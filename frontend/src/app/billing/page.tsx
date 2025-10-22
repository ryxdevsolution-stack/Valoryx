'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'

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

export default function AllBillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'gst' | 'non_gst'>('all')

  useEffect(() => {
    fetchBills()
  }, [])

  const fetchBills = async () => {
    try {
      setLoading(true)
      const response = await api.get('/billing/list?limit=100')
      setBills(response.data.bills || [])
    } catch (error: any) {

    } finally {
      setLoading(false)
    }
  }

  const filteredBills = bills.filter((bill) => {
    if (filter === 'all') return true
    return bill.type === filter
  })

  const getAmount = (bill: Bill) => {
    if (bill.type === 'gst') {
      return parseFloat(String(bill.final_amount || '0'))
    }
    return parseFloat(String(bill.total_amount || '0'))
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col min-h-0">
        {/* Header - Responsive */}
        <div className="mb-3 sm:mb-4 md:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold bg-gradient-to-r from-slate-700 to-slate-500 bg-clip-text text-transparent">
            All Bills
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-600">View and manage all billing records</p>
        </div>

        {/* Filter Tabs - Responsive */}
        <div className="mb-3 sm:mb-4 md:mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 min-h-touch ${
              filter === 'all'
                ? 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-700 shadow-lg shadow-slate-200/50 border border-white/50'
                : 'bg-white/40 backdrop-blur-sm text-slate-600 hover:bg-white/60 border border-slate-100'
            }`}
          >
            All ({bills.length})
          </button>
          <button
            onClick={() => setFilter('gst')}
            className={`px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 min-h-touch ${
              filter === 'gst'
                ? 'bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-700 shadow-lg shadow-emerald-200/50 border border-white/50'
                : 'bg-white/40 backdrop-blur-sm text-slate-600 hover:bg-white/60 border border-slate-100'
            }`}
          >
            GST ({bills.filter((b) => b.type === 'gst').length})
          </button>
          <button
            onClick={() => setFilter('non_gst')}
            className={`px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 min-h-touch ${
              filter === 'non_gst'
                ? 'bg-gradient-to-br from-violet-50 to-purple-50 text-violet-700 shadow-lg shadow-violet-200/50 border border-white/50'
                : 'bg-white/40 backdrop-blur-sm text-slate-600 hover:bg-white/60 border border-slate-100'
            }`}
          >
            Non-GST ({bills.filter((b) => b.type === 'non_gst').length})
          </button>
        </div>

        {/* Content Area - Responsive */}
        {loading ? (
          <div className="flex items-center justify-center bg-white/40 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/50 shadow-xl p-8 sm:p-12">
            <div className="text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 border-3 border-slate-200 border-t-slate-400 rounded-full animate-spin mx-auto"></div>
              <p className="mt-3 text-slate-500 text-xs sm:text-sm">Loading...</p>
            </div>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="flex items-center justify-center bg-white/40 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/50 shadow-xl p-8 sm:p-12">
            <div className="text-center">
              <p className="text-slate-400 text-sm sm:text-base">No bills found</p>
              <p className="text-slate-300 text-xs sm:text-sm mt-1">Create your first bill to get started</p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View - Hidden on mobile */}
            <div className="hidden md:block bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-xl overflow-hidden">
              {/* Table Header */}
              <div className="bg-gradient-to-r from-slate-50/80 to-white/80 backdrop-blur-sm border-b border-slate-100/50">
                <div className="grid grid-cols-6 gap-4 px-4 lg:px-6 py-3">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Bill #</div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Type</div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Customer</div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Phone</div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Amount</div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Date</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
                {filteredBills.map((bill) => (
                  <div
                    key={bill.bill_id}
                    className="grid grid-cols-6 gap-4 px-4 lg:px-6 py-3 hover:bg-white/40 transition-all duration-200 border-b border-slate-50/50 last:border-0"
                  >
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {bill.bill_number}
                    </div>
                    <div className="text-sm">
                      <span
                        className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${
                          bill.type === 'gst'
                            ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700'
                            : 'bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700'
                        }`}
                      >
                        {bill.type === 'gst' ? 'GST' : 'Non-GST'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 truncate">
                      {bill.customer_name}
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {bill.customer_phone}
                    </div>
                    <div className="text-sm font-semibold text-slate-700">
                      ₹{getAmount(bill).toFixed(2)}
                    </div>
                    <div className="text-sm text-slate-500">
                      {new Date(bill.created_at).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile Card View - Visible only on mobile/tablet */}
            <div className="md:hidden space-y-3">
              {filteredBills.map((bill) => (
                <div
                  key={bill.bill_id}
                  className="bg-white/60 backdrop-blur-md rounded-xl border border-white/50 shadow-lg p-4 hover:shadow-xl transition-all duration-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-base sm:text-lg font-bold text-slate-700 mb-1">
                        Bill #{bill.bill_number}
                      </div>
                      <span
                        className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${
                          bill.type === 'gst'
                            ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700'
                            : 'bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700'
                        }`}
                      >
                        {bill.type === 'gst' ? 'GST' : 'Non-GST'}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-lg sm:text-xl font-bold text-slate-700">
                        ₹{getAmount(bill).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <span className="text-slate-500 min-w-[4rem]">Customer:</span>
                      <span className="text-slate-700 font-medium truncate">{bill.customer_name}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="text-slate-500 min-w-[4rem]">Phone:</span>
                      <span className="text-slate-600">{bill.customer_phone}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="text-slate-500 min-w-[4rem]">Date:</span>
                      <span className="text-slate-600">
                        {new Date(bill.created_at).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

'use client'

import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'

interface GSTBill {
  bill_id: string
  bill_number: number
  customer_name: string
  customer_phone: string
  items: any[]
  subtotal: number
  gst_percentage: number
  gst_amount: number
  final_amount: number
  payment_type: string
  created_at: string
}

export default function AuditorReportsPage() {
  const [loading, setLoading] = useState(false)
  const [gstBills, setGstBills] = useState<GSTBill[]>([])
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: ''
  })
  const [auditorEmail, setAuditorEmail] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)

  // Track ongoing request to prevent duplicates (for React Strict Mode)
  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  // Auto-set last 30 days on mount and fetch data
  useEffect(() => {
    // Prevent duplicate initialization in React Strict Mode
    if (hasInitialized.current) return
    hasInitialized.current = true

    const today = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const startDate = thirtyDaysAgo.toISOString().split('T')[0]
    const endDate = today.toISOString().split('T')[0]

    setDateRange({
      start_date: startDate,
      end_date: endDate
    })

    // Auto-fetch data for last 30 days using the dates directly
    fetchGSTBillsWithDates(startDate, endDate, false)
  }, [])

  // Fetch function with explicit dates (for initialization)
  const fetchGSTBillsWithDates = async (startDate: string, endDate: string, showAlert: boolean = true) => {
    if (!startDate || !endDate) {
      if (showAlert) alert('Please select date range')
      return
    }

    // If a request is already ongoing, return that promise
    if (ongoingRequest.current) {
      return ongoingRequest.current
    }

    const request = (async () => {
      try {
        setLoading(true)
        const response = await api.get('/billing/list', {
          params: {
            type: 'gst',
            date_from: startDate,
            date_to: endDate,
            limit: 1000
          }
        })

        const bills = response.data.bills || []
        const gstOnly = bills.filter((b: any) => b.type === 'gst')
        setGstBills(gstOnly)
        setShowPreview(true)
      } catch (error: any) {
        if (showAlert) {
          alert(error.response?.data?.error || 'Failed to fetch GST bills')
        } else {
          console.error('Failed to fetch GST bills:', error)
        }
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }

  // Wrapper that uses dateRange state
  const fetchGSTBills = async (showAlert: boolean = true) => {
    return fetchGSTBillsWithDates(dateRange.start_date, dateRange.end_date, showAlert)
  }

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      // Call backend API to generate PDF
      // Client and user info are fetched from Redis cache in backend
      const response = await api.post('/report/export-pdf', {
        bills: gstBills,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date
      }, { responseType: 'blob' })

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `GST_Bills_${dateRange.start_date}_to_${dateRange.end_date}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      alert('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  const handleExportExcel = () => {
    setExporting(true)
    try {
      // Create CSV content
      const headers = ['Bill No', 'Date', 'Customer', 'Phone', 'Subtotal', 'GST %', 'GST Amount', 'Final Amount', 'Payment Type']
      const rows = gstBills.map(bill => [
        bill.bill_number,
        new Date(bill.created_at).toLocaleDateString('en-IN'),
        bill.customer_name,
        bill.customer_phone || '-',
        bill.subtotal,
        bill.gst_percentage,
        bill.gst_amount,
        bill.final_amount,
        bill.payment_type
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `GST_Bills_${dateRange.start_date}_to_${dateRange.end_date}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      alert('Failed to export Excel')
    } finally {
      setExporting(false)
    }
  }

  const handleSendEmail = async () => {
    if (!auditorEmail) {
      alert('Please enter auditor email')
      return
    }

    setSendingEmail(true)
    try {
      await api.post('/reports/send-auditor-email', {
        email: auditorEmail,
        bills: gstBills,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date
      })
      alert('Email sent successfully to auditor!')
      setAuditorEmail('')
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send email')
    } finally {
      setSendingEmail(false)
    }
  }

  const getTotalSubtotal = () => gstBills.reduce((sum, bill) => sum + parseFloat(String(bill.subtotal)), 0)
  const getTotalGSTAmount = () => gstBills.reduce((sum, bill) => sum + parseFloat(String(bill.gst_amount)), 0)
  const getTotalFinalAmount = () => gstBills.reduce((sum, bill) => sum + parseFloat(String(bill.final_amount)), 0)

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex-shrink-0 mb-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Auditor Reports</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Export GST bills data for auditors</p>
        </div>

        {/* Date Range Selection & Actions - Compact */}
        <div className="flex-shrink-0 mb-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Start Date */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.start_date}
                onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.end_date}
                onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              />
            </div>

            {/* Auditor Email */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Auditor Email</label>
              <input
                type="email"
                value={auditorEmail}
                onChange={(e) => setAuditorEmail(e.target.value)}
                placeholder="auditor@example.com"
                className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-gray-400"
              />
            </div>

            {/* Generate Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchGSTBills()}
                disabled={loading}
                className="w-full px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-700 dark:to-blue-600 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            <CardSkeleton count={4} />
            <TableSkeleton rows={10} />
          </div>
        )}

        {/* Preview Section */}
        {!loading && showPreview && gstBills.length > 0 && (
          <>
            {/* Action Buttons - Compact */}
            <div className="flex-shrink-0 mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={exporting}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-red-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Export PDF
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exporting}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-600 to-green-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Export Excel
              </button>

              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendingEmail || !auditorEmail}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {sendingEmail ? 'Sending...' : 'Send to Auditor'}
              </button>
            </div>

            {/* Summary Cards - Compact */}
            <div className="flex-shrink-0 mb-3 grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total Bills</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{gstBills.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total Subtotal</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">₹{getTotalSubtotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total GST Amount</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">₹{getTotalGSTAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Grand Total</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">₹{getTotalFinalAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Bills Table - Compact */}
            <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Bill #</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase">Customer</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-white uppercase">Subtotal</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-white uppercase">GST %</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-white uppercase">GST Amount</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-white uppercase">Final Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {gstBills.map((bill, index) => (
                    <tr key={bill.bill_id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{index + 1}</span>
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
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                          ₹{parseFloat(String(bill.subtotal)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {bill.gst_percentage}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          ₹{parseFloat(String(bill.gst_amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                          ₹{parseFloat(String(bill.final_amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && showPreview && gstBills.length === 0 && (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">No GST bills found for selected date range</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Try selecting a different date range</p>
            </div>
          </div>
        )}

        {/* Initial State */}
        {!loading && !showPreview && (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Select date range and generate report</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">GST bills will be displayed here for export</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

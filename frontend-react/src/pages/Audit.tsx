
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader'

interface GSTBill {
  bill_id: string
  bill_number: number
  customer_name: string
  customer_phone: string
  subtotal: number
  gst_percentage: number
  gst_amount: number
  final_amount: number
  payment_type: string
  created_at: string
  status?: string
}

export default function AuditorReportsPage() {
  const [loading, setLoading] = useState(false)
  const [gstBills, setGstBills] = useState<GSTBill[]>([])
  const [dateRange, setDateRange] = useState({ start_date: '', end_date: '' })
  const [showPreview, setShowPreview] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [auditorEmail, setAuditorEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')

  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const today = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const startDate = thirtyDaysAgo.toISOString().split('T')[0]
    const endDate = today.toISOString().split('T')[0]

    setDateRange({ start_date: startDate, end_date: endDate })
    fetchGSTBillsWithDates(startDate, endDate, false)
  }, [])

  // Focus email input when modal opens
  useEffect(() => {
    if (showEmailModal) {
      setTimeout(() => emailInputRef.current?.focus(), 80)
    }
  }, [showEmailModal])

  const fetchGSTBillsWithDates = useCallback(async (
    startDate: string,
    endDate: string,
    showAlert = true,
    page = 1
  ) => {
    if (!startDate || !endDate) {
      if (showAlert) alert('Please select date range')
      return
    }

    if (ongoingRequest.current) return ongoingRequest.current

    const request = (async () => {
      try {
        setLoading(true)
        const response = await api.get('/billing/list', {
          params: { type: 'gst', status: 'final', date_from: startDate, date_to: endDate, limit: 50, page }
        })
        const bills = response.data.bills || []
        setGstBills(bills.filter((b: any) => b.type === 'gst'))
        const pag = response.data.pagination || {}
        setTotalPages(pag.total_pages || 1)
        setTotalRecords(pag.total_records || bills.length)
        setCurrentPage(pag.page || page)
        setShowPreview(true)
      } catch (error: any) {
        if (showAlert) alert(error.response?.data?.error || 'Failed to fetch GST bills')
        else console.error('Failed to fetch GST bills:', error)
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }, [])

  const fetchGSTBills = useCallback((showAlert = true) =>
    fetchGSTBillsWithDates(dateRange.start_date, dateRange.end_date, showAlert, 1),
    [fetchGSTBillsWithDates, dateRange]
  )

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const response = await api.post('/report/export-pdf', {
        start_date: dateRange.start_date,
        end_date: dateRange.end_date
      }, { responseType: 'blob' })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `GST_Bills_${dateRange.start_date}_to_${dateRange.end_date}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      alert('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  const handleExportExcel = () => {
    setExporting(true)
    try {
      const escape = (v: any) => {
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s
      }
      const headers = ['Bill No', 'Date', 'Customer', 'Phone', 'Subtotal', 'GST %', 'GST Amount', 'Final Amount', 'Payment Type']
      const rows = gstBills.map((b, i) => [
        i + 1,
        new Date(b.created_at).toLocaleDateString('en-IN'),
        b.customer_name,
        b.customer_phone || '-',
        b.subtotal,
        b.gst_percentage,
        b.gst_amount,
        b.final_amount,
        b.payment_type
      ])

      const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `GST_Bills_${dateRange.start_date}_to_${dateRange.end_date}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      alert('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  const openEmailModal = () => {
    setAuditorEmail('')
    setEmailSent(false)
    setEmailError('')
    setShowEmailModal(true)
  }

  const closeEmailModal = () => {
    if (sendingEmail) return
    setShowEmailModal(false)
    setAuditorEmail('')
    setEmailSent(false)
    setEmailError('')
  }

  const handleSendEmail = async () => {
    setEmailError('')
    const trimmed = auditorEmail.trim()
    if (!trimmed) {
      setEmailError('Please enter an email address.')
      return
    }
    const emailRe = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
    if (!emailRe.test(trimmed)) {
      setEmailError('Please enter a valid email address.')
      return
    }

    setSendingEmail(true)
    try {
      await api.post('/report/send-auditor-email', {
        email: trimmed,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date
      })
      setEmailSent(true)
    } catch (error: any) {
      setEmailError(error.response?.data?.error || 'Failed to send email. Please try again.')
    } finally {
      setSendingEmail(false)
    }
  }

  // Single pass over gstBills instead of 3 separate reduce() calls on every render.
  const { totalSubtotal, totalGSTAmount, totalFinalAmount } = useMemo(() => {
    let totalSubtotal = 0, totalGSTAmount = 0, totalFinalAmount = 0
    for (const b of gstBills) {
      totalSubtotal   += parseFloat(String(b.subtotal))
      totalGSTAmount  += parseFloat(String(b.gst_amount))
      totalFinalAmount += parseFloat(String(b.final_amount))
    }
    return { totalSubtotal, totalGSTAmount, totalFinalAmount }
  }, [gstBills])

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">

        {/* Header */}
        <div className="flex-shrink-0 mb-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Auditor Reports</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Export GST bills data for auditors</p>
        </div>

        {/* Filter bar */}
        <div className="flex-shrink-0 mb-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.start_date}
                onChange={(e) => setDateRange(d => ({ ...d, start_date: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.end_date}
                onChange={(e) => setDateRange(d => ({ ...d, end_date: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchGSTBills()}
                disabled={loading}
                className="w-full px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            <CardSkeleton count={4} />
            <TableSkeleton rows={10} />
          </div>
        )}

        {/* Preview */}
        {!loading && showPreview && gstBills.length > 0 && (
          <>
            {/* Action buttons */}
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
                onClick={openEmailModal}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send to Mail
              </button>
            </div>

            {/* Summary cards */}
            <div className="flex-shrink-0 mb-3 grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total Bills</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{totalRecords}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total Subtotal</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">₹{totalSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total GST Amount</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">₹{totalGSTAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-2.5">
                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Grand Total</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">₹{totalFinalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Bills table */}
            <div className="hidden md:flex md:flex-col flex-1 overflow-hidden bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
              <div className="overflow-auto flex-1">
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
                          {new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
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
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{bill.gst_percentage}%</span>
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
              {/* Pagination bar */}
              {totalPages > 1 && (
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Showing {(currentPage - 1) * 50 + 1}–{Math.min(currentPage * 50, totalRecords)} of {totalRecords} bills
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fetchGSTBillsWithDates(dateRange.start_date, dateRange.end_date, false, currentPage - 1)}
                      disabled={currentPage === 1 || loading}
                      className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ‹ Prev
                    </button>
                    <span className="text-[11px] text-gray-600 dark:text-gray-400 px-1">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => fetchGSTBillsWithDates(dateRange.start_date, dateRange.end_date, false, currentPage + 1)}
                      disabled={currentPage === totalPages || loading}
                      className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {gstBills.map((bill, index) => (
                <div
                  key={bill.bill_id ?? index}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">#{bill.bill_number}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{bill.customer_name || 'Walk-in'}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">₹{bill.final_amount?.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{bill.customer_phone}</span>
                    <span>GST: ₹{bill.gst_amount?.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {bill.created_at ? new Date(bill.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && showPreview && gstBills.length === 0 && (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">No GST bills found for selected date range</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Try selecting a different date range</p>
            </div>
          </div>
        )}

        {/* Initial state */}
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

      {/* ── Send to Mail Modal ── */}
      {showEmailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onKeyDown={(e) => { if (e.key === 'Escape') closeEmailModal() }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeEmailModal}
          />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Send Report to Mail</h2>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">PDF will be sent as an attachment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEmailModal}
                disabled={sendingEmail}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-5">
              {emailSent ? (
                /* Success state */
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Report Sent!</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    The PDF has been sent to <span className="font-semibold text-gray-700 dark:text-gray-300">{auditorEmail}</span>
                  </p>
                  <button
                    type="button"
                    onClick={closeEmailModal}
                    className="mt-4 px-5 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-bold hover:opacity-90 transition-opacity"
                  >
                    Close
                  </button>
                </div>
              ) : (
                /* Input state */
                <>
                  {/* Report summary */}
                  <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Report Summary</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Period</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {dateRange.start_date} → {dateRange.end_date}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Bills</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{gstBills.length}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Grand Total</p>
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          ₹{totalFinalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Email input */}
                  <div className="mb-1">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Recipient Email Address
                    </label>
                    <input
                      ref={emailInputRef}
                      type="email"
                      value={auditorEmail}
                      onChange={(e) => { setAuditorEmail(e.target.value); setEmailError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendEmail() }}
                      placeholder="auditor@example.com"
                      disabled={sendingEmail}
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors
                        bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400
                        ${emailError
                          ? 'border-red-400 focus:ring-red-300'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-purple-400 focus:border-purple-400'
                        } disabled:opacity-50`}
                    />
                    {emailError && (
                      <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {emailError}
                      </p>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-5 mt-2">
                    The GST bills PDF for the selected period will be attached and sent to this address.
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeEmailModal}
                      disabled={sendingEmail}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSendEmail}
                      disabled={sendingEmail || !auditorEmail.trim()}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {sendingEmail ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Send Report
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

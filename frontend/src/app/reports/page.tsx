'use client'

import { useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'

interface Report {
  report_id: string
  report_date: string
  start_date: string
  end_date: string
  total_sales: number
  gst_sales: number
  non_gst_sales: number
  payment_breakdown: any
  created_at: string
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: '',
  })

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!dateRange.start_date || !dateRange.end_date) {
      alert('Please select both start and end dates')
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/report/generate', dateRange)
      setReport(response.data.report)
      alert('Report generated successfully!')
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="mt-2 text-gray-600">Generate sales and financial reports</p>
      </div>

      {/* Report Generation Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Generate New Report</h2>
        <form onSubmit={handleGenerateReport} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={dateRange.start_date}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start_date: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date *
              </label>
              <input
                type="date"
                required
                value={dateRange.end_date}
                onChange={(e) =>
                  setDateRange({ ...dateRange, end_date: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Generating Report...' : 'Generate Report'}
          </button>
        </form>
      </div>

      {/* Report Display */}
      {report && (
        <div className="space-y-6">
          {/* Report Header */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Sales Report</h2>
                <p className="text-gray-600 mt-1">
                  Report ID: {report.report_id.slice(0, 8)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Generated on</p>
                <p className="text-gray-900 font-medium">
                  {formatDate(report.created_at)}
                </p>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-gray-700">
                <span className="font-medium">Period:</span> {formatDate(report.start_date)} to{' '}
                {formatDate(report.end_date)}
              </p>
            </div>
          </div>

          {/* Sales Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
              <p className="text-blue-100 text-sm font-medium">Total Sales</p>
              <p className="text-3xl font-bold mt-2">{formatCurrency(report.total_sales)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
              <p className="text-green-100 text-sm font-medium">GST Sales</p>
              <p className="text-3xl font-bold mt-2">{formatCurrency(report.gst_sales)}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white">
              <p className="text-purple-100 text-sm font-medium">Non-GST Sales</p>
              <p className="text-3xl font-bold mt-2">{formatCurrency(report.non_gst_sales)}</p>
            </div>
          </div>

          {/* Payment Breakdown */}
          {report.payment_breakdown && Object.keys(report.payment_breakdown).length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Payment Method Breakdown
              </h3>
              <div className="space-y-3">
                {Object.entries(report.payment_breakdown).map(([method, amount]: [string, any]) => (
                  <div
                    key={method}
                    className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
                  >
                    <span className="text-gray-700 font-medium capitalize">{method}</span>
                    <span className="text-gray-900 font-bold text-lg">
                      {formatCurrency(parseFloat(amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sales Distribution Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Sales Distribution</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700 font-medium">GST Sales</span>
                  <span className="text-gray-900 font-semibold">
                    {((report.gst_sales / report.total_sales) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all"
                    style={{
                      width: `${(report.gst_sales / report.total_sales) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700 font-medium">Non-GST Sales</span>
                  <span className="text-gray-900 font-semibold">
                    {((report.non_gst_sales / report.total_sales) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-purple-500 h-3 rounded-full transition-all"
                    style={{
                      width: `${(report.non_gst_sales / report.total_sales) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <button
              onClick={() => window.print()}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
            >
              Print / Export PDF
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!report && !loading && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">No report generated yet</p>
          <p className="text-gray-400 mt-2">
            Select a date range and click &quot;Generate Report&quot; to view sales data
          </p>
        </div>
      )}
    </DashboardLayout>
  )
}

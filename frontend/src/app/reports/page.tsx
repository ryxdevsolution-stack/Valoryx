'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { ReportSkeleton } from '@/components/SkeletonLoader'

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
  useEffect(() => {
    // Set default date range to last 20 days
    const today = new Date()
    const twentyDaysAgo = new Date()
    twentyDaysAgo.setDate(today.getDate() - 20)

    const endDate = today.toISOString().split('T')[0]
    const startDate = twentyDaysAgo.toISOString().split('T')[0]

    setDateRange({
      start_date: startDate,
      end_date: endDate,
    })

    // Auto-generate report for last 20 days
    const generateInitialReport = async () => {
      try {
        setLoading(true)
        const response = await api.post('/report/generate', {
          start_date: startDate,
          end_date: endDate,
        })

        if (response.data && response.data.report) {
          setReport(response.data.report)
        }
      } catch (error: any) {
        // Show error if API fails
        if (error.response?.status === 401) {
          // Token expired, handled by interceptor
        } else {
          // Other errors - might be no data, which is okay
          console.error('Report generation error:', error.response?.data?.error || error.message)
        }
      } finally {
        setLoading(false)
      }
    }

    // Small delay to ensure auth is ready
    setTimeout(() => {
      generateInitialReport()
    }, 500)
  }, [])

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!dateRange.start_date || !dateRange.end_date) {
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/report/generate', dateRange)
      setReport(response.data.report)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Highcharts options for pie chart
  const getPieChartOptions = () => {
    if (!report) return {}

    const gstAmount = parseFloat(String(report.gst_sales)) || 0
    const nonGstAmount = parseFloat(String(report.non_gst_sales)) || 0

    return {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        height: 320,
      },
      title: {
        text: 'Sales Distribution',
        style: {
          fontSize: '16px',
          fontWeight: 'bold',
          color: '#334155',
        },
      },
      tooltip: {
        pointFormat: '<b>{point.percentage:.1f}%</b><br/>₹{point.y:,.2f}',
        style: {
          fontSize: '14px',
        },
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          dataLabels: {
            enabled: true,
            format: '<b>{point.name}</b><br>{point.percentage:.1f}%',
            style: {
              fontSize: '13px',
              fontWeight: '600',
              textOutline: 'none',
            },
            distance: 20,
          },
          showInLegend: false,
          size: '80%',
        },
      },
      series: [{
        name: 'Sales',
        colorByPoint: true,
        data: [{
          name: 'GST Sales',
          y: gstAmount,
          color: '#059669',
        }, {
          name: 'Non-GST Sales',
          y: nonGstAmount,
          color: '#7c3aed',
        }],
      }],
      credits: {
        enabled: false,
      },
    }
  }

  // Highcharts options for payment breakdown bar chart
  const getBarChartOptions = () => {
    if (!report || !report.payment_breakdown) return {}

    const categories = Object.keys(report.payment_breakdown)
    const data = Object.values(report.payment_breakdown).map((val: any) => parseFloat(val) || 0)

    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 320,
      },
      title: {
        text: 'Payment Methods',
        style: {
          fontSize: '16px',
          fontWeight: 'bold',
          color: '#334155',
        },
      },
      xAxis: {
        categories,
        labels: {
          style: {
            fontSize: '13px',
            fontWeight: '500',
          },
        },
      },
      yAxis: {
        title: {
          text: 'Amount (₹)',
          style: {
            fontSize: '14px',
            fontWeight: '600',
          },
        },
        labels: {
          formatter: function(this: any) {
            return '₹' + this.value.toLocaleString('en-IN')
          },
          style: {
            fontSize: '12px',
          },
        },
      },
      tooltip: {
        formatter: function(this: any) {
          return '<b>' + this.x + '</b><br/>₹' + this.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })
        },
        style: {
          fontSize: '14px',
        },
      },
      plotOptions: {
        column: {
          colorByPoint: true,
          colors: ['#1e40af', '#059669', '#d97706', '#dc2626', '#6d28d9'],
          borderRadius: 6,
          dataLabels: {
            enabled: true,
            formatter: function(this: any) {
              return '₹' + this.y.toLocaleString('en-IN', { maximumFractionDigits: 0 })
            },
            style: {
              fontSize: '12px',
              fontWeight: 'bold',
              textOutline: 'none',
            },
          },
        },
      },
      series: [{
        name: 'Amount',
        data,
        showInLegend: false,
      }],
      credits: {
        enabled: false,
      },
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] overflow-hidden">
        {/* Header */}
        <div className="flex-none mb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold bg-gradient-to-r from-slate-700 to-slate-500 bg-clip-text text-transparent">
                Reports
              </h1>
              <p className="text-sm text-slate-500 mt-1">Generate sales and financial reports</p>
            </div>
            <div className="bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl border border-white/50 px-4 py-2.5 shadow-lg">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Viewing Period</p>
              <p className="text-base text-slate-700 font-bold mt-1">Last 20 Days</p>
              {dateRange.start_date && dateRange.end_date && (
                <p className="text-xs text-slate-500 mt-1">
                  {formatDate(dateRange.start_date)} - {formatDate(dateRange.end_date)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Report Generation Form - Compact */}
        <div className="flex-none mb-4 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-xl p-4">
          <h2 className="text-base font-semibold text-slate-700 mb-3">Generate New Report</h2>
          <form onSubmit={handleGenerateReport}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={dateRange.start_date}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, start_date: e.target.value })
                  }
                  className="w-full px-3 py-2.5 text-sm font-medium text-slate-700 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  value={dateRange.end_date}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, end_date: e.target.value })
                  }
                  className="w-full px-3 py-2.5 text-sm font-medium text-slate-700 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white transition-all"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-500 text-white text-sm font-medium rounded-xl hover:from-slate-700 hover:to-slate-600 transition-all disabled:opacity-50 shadow-lg disabled:shadow-none"
                >
                  {loading ? 'Generating...' : 'Generate Report'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Report Display - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && (
            <ReportSkeleton />
          )}

          {!loading && !report && (
            <div className="h-full flex items-center justify-center bg-white/40 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl">
              <div className="text-center px-4">
                <div className="text-6xl mb-4">📊</div>
                <p className="text-slate-600 text-lg font-semibold">No Data Available</p>
                <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
                  There are no sales records for the last 20 days. Try a different date range or create some bills first.
                </p>
                <div className="mt-4 text-xs text-slate-400">
                  Current range: {dateRange.start_date && formatDate(dateRange.start_date)} - {dateRange.end_date && formatDate(dateRange.end_date)}
                </div>
              </div>
            </div>
          )}

          {!loading && report && (
            <div className="space-y-4 pb-4">
              {/* Professional Report Card */}
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                {/* Report Header with Dark Banner */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Sales Report</h2>
                      <p className="text-slate-200 text-sm mt-1">
                        Period: {formatDate(report.start_date)} - {formatDate(report.end_date)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-slate-300 text-xs uppercase tracking-wide">Generated On</p>
                      <p className="text-white font-semibold text-lg mt-1">
                        {formatDate(report.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Section */}
                <div className="p-6 bg-gradient-to-br from-slate-50 to-white">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <span className="bg-slate-700 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">1</span>
                    Financial Summary
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border-2 border-slate-200 p-5 hover:border-slate-300 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Revenue</p>
                        <span className="text-2xl">💰</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-800">{formatCurrency(report.total_sales)}</p>
                      <p className="text-xs text-slate-500 mt-2">Combined GST + Non-GST</p>
                    </div>
                    <div className="bg-white rounded-xl border-2 border-emerald-300 p-5 hover:border-emerald-400 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-emerald-700 text-xs font-semibold uppercase tracking-wider">GST Sales</p>
                        <span className="text-2xl">📊</span>
                      </div>
                      <p className="text-3xl font-bold text-emerald-800">{formatCurrency(report.gst_sales)}</p>
                      <p className="text-xs text-emerald-700 mt-2">
                        {((parseFloat(String(report.gst_sales)) / parseFloat(String(report.total_sales))) * 100).toFixed(1)}% of total
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border-2 border-violet-300 p-5 hover:border-violet-400 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-violet-700 text-xs font-semibold uppercase tracking-wider">Non-GST Sales</p>
                        <span className="text-2xl">📈</span>
                      </div>
                      <p className="text-3xl font-bold text-violet-800">{formatCurrency(report.non_gst_sales)}</p>
                      <p className="text-xs text-violet-700 mt-2">
                        {((parseFloat(String(report.non_gst_sales)) / parseFloat(String(report.total_sales))) * 100).toFixed(1)}% of total
                      </p>
                    </div>
                  </div>
                </div>

                {/* Charts Section */}
                <div className="p-6 border-t border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <span className="bg-slate-700 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">2</span>
                    Sales Analytics
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Pie Chart */}
                    <div className="bg-white rounded-xl border-2 border-slate-200 p-5 shadow-sm min-h-[350px]">
                      <HighchartsReact
                        highcharts={Highcharts}
                        options={getPieChartOptions()}
                      />
                    </div>

                    {/* Bar Chart */}
                    <div className="bg-white rounded-xl border-2 border-slate-200 p-5 shadow-sm min-h-[350px]">
                      {report.payment_breakdown && Object.keys(report.payment_breakdown).length > 0 ? (
                        <HighchartsReact
                          highcharts={Highcharts}
                          options={getBarChartOptions()}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-slate-400">No payment data</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment Breakdown Table */}
                {report.payment_breakdown && Object.keys(report.payment_breakdown).length > 0 && (
                  <div className="p-6 border-t border-slate-200 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                      <span className="bg-slate-700 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">3</span>
                      Payment Method Breakdown
                    </h3>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-100 border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Payment Method</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Percentage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {Object.entries(report.payment_breakdown).map(([method, amount]: [string, any]) => {
                            const percentage = (parseFloat(amount) / parseFloat(String(report.total_sales))) * 100
                            return (
                              <tr key={method} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-slate-700 font-semibold capitalize text-base">{method}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className="text-slate-900 font-bold text-lg">
                                    {formatCurrency(parseFloat(amount))}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                                    {percentage.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                          <tr>
                            <td className="px-6 py-4 font-bold text-slate-700">Total</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900 text-lg">
                              {formatCurrency(report.total_sales)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-slate-600 text-white">
                                100%
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Report Footer */}
                <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <p className="text-xs text-slate-500">
                    Report ID: {report.report_id.slice(0, 8).toUpperCase()}
                  </p>
                  <button
                    onClick={() => window.print()}
                    className="px-6 py-2.5 bg-gradient-to-r from-slate-800 to-slate-700 text-white text-sm font-semibold rounded-lg hover:from-slate-900 hover:to-slate-800 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <span>🖨️</span>
                    Print / Export PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}



import { useEffect, useState, useRef, useMemo, lazy } from 'react'

// Computed once at module load — never changes during a session
const TODAY_LABEL = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
import DashboardLayout from '@/components/DashboardLayout'
import { useClient } from '@/contexts/ClientContext'
import { useCurrency } from '@/lib/useCurrency'
import api from '@/lib/api'
import { DashboardSkeleton } from '@/components/SkeletonLoader'
import { motion } from 'framer-motion'
import SyncButton from '@/components/SyncButton'
import { toast } from '@/utils/toast'

const RevenueAreaChart = lazy(() => import('@/components/charts/RevenueAreaChart'))
const PeakHoursChart = lazy(() => import('@/components/charts/PeakHoursChart'))
const TopProductsPieChart = lazy(() => import('@/components/charts/TopProductsPieChart'))
const ProductPerformanceChart = lazy(() => import('@/components/charts/ProductPerformanceChart'))
const ProfitabilityGauge = lazy(() => import('@/components/charts/ProfitabilityTierBar'))
const PayrollTrendChart = lazy(() => import('@/components/charts/PayrollTrendChart'))

interface AnalyticsDashboard {
  revenue: {
    today: number
    thisWeek: number
    thisMonth: number
    growth: number
    // Outstanding (billed but not yet paid); today/week/month above are PAID-only.
    pendingToday?: number
    pendingWeek?: number
    pendingMonth?: number
  }
  bills: {
    totalGST: number
    totalNonGST: number
    todayCount: number
    avgBillValue: number
  }
  products: {
    topSelling: Array<{
      product_name: string
      quantity_sold: number
      revenue: number
      category: string
    }>
    lowPerforming: Array<{
      product_name: string
      quantity_sold: number
      revenue: number
      category: string
    }>
    trending: Array<{
      product_name: string
      growth_rate: number
      category: string
    }>
    topProductsFiltered: Array<{
      product_name: string
      revenue: number
      quantity: number
      category: string
    }>
    performanceTiers: {
      mostSelling: Array<{ name: string; quantity: number }>
      lessSelling: Array<{ name: string; quantity: number }>
      nonSelling: Array<{ name: string; quantity: number }>
    }
  }
  inventory: {
    lowStock: Array<{
      product_id: string
      product_name: string
      quantity: number
      low_stock_alert: number
      rate: number
      unit: string
      category: string
    }>
    totalValue: number
    criticalCount: number
  }
  insights: {
    peakHours: Array<{ hour: number; sales: number; count: number }>
    paymentPreferences: Array<{ method: string; count: number; amount: number }>
    categoryPerformance: Array<{ category: string; revenue: number; items_sold: number }>
    revenueTrend: Array<{ date: string; revenue: number; bills: number }>
    topCustomers: Array<{ name: string; total_spend: number; visit_count: number; avg_spend: number }>
    profitMargin: number
    totalProfit: number
  }
}

// Payroll snapshot from /api/employees/summary — matches the backend payload
interface PayrollSummary {
  active_employees: number
  open_cycles: number
  paid_in_period: number
  paid_all_time: number
  pending_advances: number
  leave_days_period: number
  absent_days_period: number
  period: { from: string; to: string }
}

// One month in the payroll trend chart — matches /api/employees/payroll-timeseries
interface PayrollTrendPoint {
  month: string
  label: string
  gross_earned: number
  advances_paid: number
  net_paid: number
  cash_out: number
  cycles_paid: number
  // Legacy back-compat fields still returned by the API
  paid: number
  gross: number
}

export default function DashboardPage() {
  const { client } = useClient()
  const { symbol: cur } = useCurrency()
  const [analytics, setAnalytics] = useState<AnalyticsDashboard | null>(null)
  const [payroll, setPayroll] = useState<PayrollSummary | null>(null)
  const [payrollTrend, setPayrollTrend] = useState<PayrollTrendPoint[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('month')
  const [showPredictions, setShowPredictions] = useState(false)

  // Prevent entrance animations from re-firing on subsequent data refreshes
  const hasAnimated = useRef(false)

  // AbortController ref — cancelled in the useEffect cleanup when timeRange changes.
  // Prevents the stale response from a previous range overwriting the new one.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Cancel any in-flight request for the previous time range
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const run = async () => {
      try {
        setLoading(true)
        const response = await api.get(`/analytics/dashboard?range=${timeRange}`, {
          signal: controller.signal,
        })
        setAnalytics(response.data)
      } catch (error: any) {
        // Ignore cancellation — user switched time range before this resolved
        if (error?.code !== 'ERR_CANCELED' && error?.name !== 'AbortError') {
          setAnalytics(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    run()

    return () => {
      controller.abort()
    }
  }, [timeRange])

  // Fetch payroll summary in parallel with analytics — separate state so a slow
  // or failing payroll endpoint never blocks the rest of the dashboard.
  useEffect(() => {
    const controller = new AbortController()

    // Derive from/to dates from the same timeRange the analytics endpoint uses
    const today = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    let fromDate: Date
    if (timeRange === 'today') {
      fromDate = today
    } else if (timeRange === 'week') {
      fromDate = new Date(today); fromDate.setDate(today.getDate() - 6)
    } else {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1)
    }

    api.get(`/employees/summary?from=${iso(fromDate)}&to=${iso(today)}`, {
      signal: controller.signal,
    })
      .then(res => setPayroll(res.data.data))
      .catch(err => {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'AbortError') {
          setPayroll(null)
        }
      })

    return () => controller.abort()
  }, [timeRange])

  // Payroll trend chart — always last 6 months regardless of timeRange (the
  // chart's purpose is a *trend*, which needs a fixed-length window, not the
  // currently-viewed slice). Fetched once per session.
  useEffect(() => {
    const controller = new AbortController()
    api.get('/employees/payroll-timeseries?months=6', { signal: controller.signal })
      .then(res => setPayrollTrend(res.data.data))
      .catch(err => {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'AbortError') {
          setPayrollTrend(null)
        }
      })
    return () => controller.abort()
  }, [])

  // Memoize low stock calculations to prevent recalculation on every render
  const lowStockCalculations = useMemo(() => {
    if (!analytics?.inventory?.lowStock) return { items: [], total: 0 }

    const items = analytics.inventory.lowStock.map(item => {
      const needToOrder = Math.max(0, item.low_stock_alert - item.quantity)
      const rate = typeof item.rate === 'number' ? item.rate : parseFloat(String(item.rate)) || 0
      const estimatedCost = needToOrder * rate
      return { ...item, needToOrder, rate, estimatedCost }
    })

    const total = items.reduce((sum, item) => sum + item.estimatedCost, 0)

    return { items, total }
  }, [analytics?.inventory?.lowStock])

  const exportLowStock = async (format: 'pdf' | 'xlsx') => {
    let url: string | null = null
    try {
      const response = await api.post(
        '/stock/export-low-stock',
        { format },
        { responseType: 'blob' }
      )

      const blob = new Blob([response.data])
      url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `low_stock_report_${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'html' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export')
    } finally {
      // Always cleanup Object URL to prevent memory leak
      if (url) window.URL.revokeObjectURL(url)
    }
  }

  if (loading) return (
    <DashboardLayout>
      <DashboardSkeleton />
    </DashboardLayout>
  )

  if (!analytics) return (
    <DashboardLayout>
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">No analytics data available</p>
      </div>
    </DashboardLayout>
  )

  // Mark as animated so subsequent re-renders skip entrance animations
  hasAnimated.current = true

  return (
    <DashboardLayout>
      {/* Header Section - Compact */}
      <div className="mb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Analytics</h1>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              {client?.client_name} • {TODAY_LABEL}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Time Range Selector - Compact */}
            <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded p-0.5">
              {(['today', 'week', 'month'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    timeRange === range
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {range === 'today' ? 'Today' : range === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>

            {/* Predictions Toggle - Compact */}
            <button
              type="button"
              onClick={() => setShowPredictions(!showPredictions)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                showPredictions
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {showPredictions ? 'Hide' : 'Show'} Forecast
            </button>

            {/* Sync Button */}
            <SyncButton />
          </div>
        </div>
      </div>

      {/* Key Metrics - Compact Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {/* Revenue Card */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Revenue</span>
            {analytics.revenue.growth > 0 && (
              <span className="text-[10px] text-green-600 font-medium">
                ↑ {analytics.revenue.growth.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">
            {cur}{(timeRange === 'today' ? analytics.revenue.today :
               timeRange === 'week' ? analytics.revenue.thisWeek :
               analytics.revenue.thisMonth).toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            {timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This week' : 'This month'} · paid
          </p>
          {(() => {
            const pending = timeRange === 'today' ? (analytics.revenue.pendingToday || 0)
              : timeRange === 'week' ? (analytics.revenue.pendingWeek || 0)
              : (analytics.revenue.pendingMonth || 0)
            return pending > 0 ? (
              <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mt-1">
                {cur}{pending.toLocaleString('en-IN')} pending
              </p>
            ) : null
          })()}
        </motion.div>

        {/* Bills Card */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Transactions</span>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">
            {analytics.bills.totalGST + analytics.bills.totalNonGST}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            {analytics.bills.totalGST} GST · {analytics.bills.totalNonGST} Non-GST
          </p>
        </motion.div>

        {/* Avg Bill Value Card */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Transaction</span>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">
            {cur}{analytics.bills.avgBillValue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Per bill average</p>
        </motion.div>

        {/* Inventory Alert Card */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className={`border rounded p-3 hover:shadow-md transition-shadow ${
            analytics.inventory.criticalCount > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Low Stock</span>
          </div>
          <p className={`text-lg font-bold mb-0.5 ${
            analytics.inventory.criticalCount > 0 ? 'text-red-600' : 'text-gray-900'
          }`}>
            {analytics.inventory.criticalCount}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            {analytics.inventory.criticalCount > 0 ? 'Items need attention' : 'All stock healthy'}
          </p>
        </motion.div>
      </div>

      {/* Analytics Charts - Compact Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mb-3">
        {/* Revenue Trend Chart */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <RevenueAreaChart data={analytics.insights.revenueTrend} />
            </div>
          </div>
        </motion.div>

        {/* Peak Hours Chart */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <PeakHoursChart data={analytics.insights.peakHours} />
            </div>
          </div>
        </motion.div>

        {/* Top Products Pie Chart - Filtered by Time Range */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <TopProductsPieChart
                data={analytics.products.topProductsFiltered}
                timeRange={timeRange}
              />
            </div>
          </div>
        </motion.div>

        {/* Product Performance Tiers Chart */}
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <ProductPerformanceChart
                mostSelling={analytics.products.performanceTiers.mostSelling}
                lessSelling={analytics.products.performanceTiers.lessSelling}
                nonSelling={analytics.products.performanceTiers.nonSelling}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Predictive Analytics Section - Compact */}
      {showPredictions && analytics.insights.revenueTrend.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded p-3"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Forecast & Predictions</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Based on historical trends</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {/* Revenue Prediction */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
              <div className="mb-2">
                <h4 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Next Period Revenue</h4>
              </div>
              {(() => {
                const recentRevenue = analytics.insights.revenueTrend.slice(-7)
                const avgGrowth = recentRevenue.length > 1
                  ? recentRevenue.reduce((sum, d, i) => {
                      if (i === 0) return 0
                      return sum + ((d.revenue - recentRevenue[i - 1].revenue) / Math.max(recentRevenue[i - 1].revenue, 1))
                    }, 0) / (recentRevenue.length - 1)
                  : 0
                const lastRevenue = recentRevenue[recentRevenue.length - 1]?.revenue || 0
                const predictedRevenue = lastRevenue * (1 + avgGrowth)

                return (
                  <>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      {cur}{predictedRevenue.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-medium ${avgGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {avgGrowth >= 0 ? '↑' : '↓'} {Math.abs(avgGrowth * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">growth trend</span>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Stock Alert Prediction */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
              <div className="mb-2">
                <h4 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stock Depletion Rate</h4>
              </div>
              {(() => {
                const topProducts = analytics.products.topSelling.slice(0, 3)
                const avgDailySales = topProducts.reduce((sum, p) => sum + p.quantity_sold, 0) / Math.max(analytics.insights.revenueTrend.length, 1)

                return (
                  <>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      {Math.ceil(avgDailySales)} units/day
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Restock needed in ~{Math.ceil(30 / Math.max(avgDailySales, 1))} days
                    </p>
                  </>
                )
              })()}
            </div>

            {/* Customer Growth */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
              <div className="mb-2">
                <h4 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customer Retention</h4>
              </div>
              {(() => {
                const totalCustomers = analytics.insights.topCustomers.length
                const repeatCustomers = analytics.insights.topCustomers.filter(c => c.visit_count > 1).length
                const retentionRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0

                return (
                  <>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      {retentionRate.toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {repeatCustomers} of {totalCustomers} repeat customers
                    </p>
                  </>
                )
              })()}
            </div>
          </div>
        </motion.div>
      )}

      {/* Product Performance Section - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-3">
        {/* Top Selling Products */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Top Products</h3>
            <span className="text-[10px] text-green-600 font-medium">High Sales</span>
          </div>
          <div className="space-y-1">
            {analytics.products.topSelling.slice(0, 5).map((product, index) => (
              <div key={index} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-gray-400 w-3">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-xs truncate">{product.product_name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{product.category}</p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="font-semibold text-gray-900 text-xs">{product.quantity_sold}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{cur}{product.revenue.toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trending Products */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Trending</h3>
            <span className="text-[10px] text-blue-600 font-medium">Growing</span>
          </div>
          <div className="space-y-1">
            {analytics.products.trending.slice(0, 5).map((product, index) => (
              <div key={index} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-xs truncate">{product.product_name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{product.category}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-semibold text-blue-600 text-xs">+{product.growth_rate.toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Performing Products */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Slow Movers</h3>
            <span className="text-[10px] text-orange-600 font-medium">Low Sales</span>
          </div>
          <div className="space-y-1">
            {analytics.products.lowPerforming.slice(0, 5).map((product, index) => (
              <div key={index} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-xs truncate">{product.product_name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{product.category}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-semibold text-gray-900 text-xs">{product.quantity_sold}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{cur}{product.revenue.toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insights Section - Profit & Customers.
          Default `stretch` alignment — both cards take the height of the taller
          sibling (Top Customers with its payroll strip). Profitability's
          internal layout uses justify-between so the tier bar breathes into
          any extra vertical space. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        {/* Profit Analysis - Tier Bar. Height comes from the grid stretch;
            the component distributes its children vertically to fill cleanly. */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-4 h-full">
          <ProfitabilityGauge
            profitMargin={analytics.insights.profitMargin}
            totalProfit={analytics.insights.totalProfit}
          />
        </div>

        {/* Top Customers (+ compact Payroll footer when employees exist) */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Top Customers</h3>
            <span className="text-[10px] text-blue-600 font-medium">By revenue</span>
          </div>
          <div className="space-y-1">
            {analytics.insights.topCustomers.slice(0, 5).map((customer, index) => (
              <div key={index} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-gray-400 w-3">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-xs truncate">{customer.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{customer.visit_count} visits</p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="font-semibold text-gray-900 text-xs">{cur}{customer.total_spend.toLocaleString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Compact payroll strip — sits naturally after the customer list.
              Card no longer stretches thanks to `items-start` on the parent grid. */}
          {payroll && payroll.active_employees > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Payroll &amp; Attendance
                </h4>
                <span className="text-[9px] text-gray-400">
                  {timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This week' : 'This month'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Employees</p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{payroll.active_employees}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Paid</p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">
                    {cur}{payroll.paid_in_period.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Open</p>
                  <p className={`text-xs font-bold ${payroll.pending_advances > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                    {payroll.open_cycles}
                    {payroll.pending_advances > 0 && (
                      <span className="text-[9px] font-normal text-amber-500 ml-1">
                        · {cur}{payroll.pending_advances.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Leave</p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">
                    {payroll.leave_days_period + payroll.absent_days_period}
                    <span className="text-[9px] font-normal text-gray-400 ml-1">
                      ({payroll.leave_days_period}L · {payroll.absent_days_period}A)
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payroll Trend — always shown when payroll module is in use.
          `payroll.active_employees > 0` is the right gate (do they use payroll at all?),
          not "is there already chart data" (which would hide the chart until first
          paid cycle, confusing new users). Empty months show as zero-height bars. */}
      {payrollTrend && payroll && payroll.active_employees > 0 && (
        <motion.div
          initial={hasAnimated.current ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 mb-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Payroll Trend</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                Gross earned (bars) · Advances vs Salary paid (lines) · Last 6 months
              </p>
            </div>
            <span className="text-[10px] text-gray-400">
              Total Earned: {cur}{payrollTrend.reduce((s, p) => s + Math.max(0, p.gross_earned), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
          {payrollTrend.some(p => p.gross_earned > 0 || p.advances_paid > 0 || p.net_paid > 0) ? (
            <PayrollTrendChart data={payrollTrend} />
          ) : (
            // Empty state — when no paid cycles yet, show a clear message
            // instead of an empty chart with axes only.
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                No payroll paid out yet
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
                The trend will appear once you mark a salary cycle as paid with gross earnings.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Low Stock Alert - Compact Design */}
      {analytics.inventory.lowStock.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white">
                Low Stock Alert
              </h3>
              <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                {analytics.inventory.lowStock.length} items need restocking
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => exportLowStock('xlsx')}
                className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => exportLowStock('pdf')}
                className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium"
              >
                Export PDF
              </button>
            </div>
          </div>

          {/* Low Stock Table - Compact */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Product</th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stock</th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Need</th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {lowStockCalculations.items.map((item) => (
                    <tr key={item.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-2 py-1.5">
                        <p className="font-medium text-gray-900 dark:text-white">{item.product_name}</p>
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300">{item.category || '-'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-semibold text-red-600 dark:text-red-400">{item.quantity}</span>
                        <span className="text-gray-500 dark:text-gray-400 ml-1">{item.unit}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-semibold text-gray-900 dark:text-white">{item.needToOrder}</span>
                        <span className="text-gray-500 dark:text-gray-400 ml-1">{item.unit}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-gray-900 dark:text-white">
                        {cur}{item.estimatedCost.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                  <tr>
                    <td colSpan={4} className="px-2 py-1.5 text-right font-semibold text-gray-900 dark:text-white">
                      Total:
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold text-gray-900 dark:text-white">
                      {cur}{lowStockCalculations.total.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  )
}

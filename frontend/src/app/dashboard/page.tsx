'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import { DashboardSkeleton } from '@/components/SkeletonLoader'

interface AnalyticsDashboard {
  revenue: {
    today: number
    thisWeek: number
    thisMonth: number
    growth: number
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
    peakHours: Array<{ hour: number; sales: number }>
    paymentPreferences: Array<{ method: string; count: number; amount: number }>
    categoryPerformance: Array<{ category: string; revenue: number; items_sold: number }>
  }
}

export default function DashboardPage() {
  const { client } = useClient()
  const [analytics, setAnalytics] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/analytics/dashboard?range=${timeRange}`)
      setAnalytics(response.data)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportLowStock = async (format: 'pdf' | 'xlsx') => {
    try {
      const response = await api.post(
        '/stock/export-low-stock',
        { format },
        { responseType: 'blob' }
      )

      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `low_stock_report_${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'html' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Export error:', error)
      alert(error.response?.data?.error || 'Failed to export')
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
        <p className="text-gray-500">No analytics data available</p>
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              Business Analytics
            </h1>
            <p className="text-gray-600 mt-2">
              Welcome back, {client?.client_name} • Real-time insights for data-driven decisions
            </p>
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm border">
            {(['today', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  timeRange === range
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {range === 'today' ? 'Today' : range === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Revenue Card */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
            {analytics.revenue.growth > 0 && (
              <span className="text-xs bg-green-400 px-2 py-1 rounded-full font-bold">
                +{analytics.revenue.growth.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="mb-2">
            <p className="text-blue-100 text-sm font-medium">Total Revenue</p>
            <p className="text-3xl font-bold">
              ₹{(timeRange === 'today' ? analytics.revenue.today :
                 timeRange === 'week' ? analytics.revenue.thisWeek :
                 analytics.revenue.thisMonth).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <p className="text-blue-100 text-xs">
            {timeRange === 'today' ? "Today's performance" :
             timeRange === 'week' ? 'Last 7 days' :
             'Last 30 days'}
          </p>
        </div>

        {/* Bills Card */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📄</span>
            </div>
          </div>
          <div className="mb-2">
            <p className="text-green-100 text-sm font-medium">Total Bills</p>
            <p className="text-3xl font-bold">
              {analytics.bills.totalGST + analytics.bills.totalNonGST}
            </p>
          </div>
          <p className="text-green-100 text-xs">
            GST: {analytics.bills.totalGST} • Non-GST: {analytics.bills.totalNonGST}
          </p>
        </div>

        {/* Avg Bill Value Card */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
          <div className="mb-2">
            <p className="text-purple-100 text-sm font-medium">Avg Bill Value</p>
            <p className="text-3xl font-bold">
              ₹{analytics.bills.avgBillValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <p className="text-purple-100 text-xs">
            Per transaction average
          </p>
        </div>

        {/* Inventory Alert Card */}
        <div className={`rounded-xl shadow-lg p-6 text-white ${
          analytics.inventory.criticalCount > 0
            ? 'bg-gradient-to-br from-red-500 to-red-600 animate-pulse'
            : 'bg-gradient-to-br from-orange-500 to-orange-600'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
          </div>
          <div className="mb-2">
            <p className="text-red-100 text-sm font-medium">Critical Stock</p>
            <p className="text-3xl font-bold">
              {analytics.inventory.criticalCount}
            </p>
          </div>
          <p className="text-red-100 text-xs">
            Items need immediate attention
          </p>
        </div>
      </div>

      {/* Product Performance Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Top Selling Products */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">🏆 Top Performers</h3>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
              High Demand
            </span>
          </div>
          <div className="space-y-3">
            {analytics.products.topSelling.slice(0, 5).map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{product.product_name}</p>
                    <p className="text-xs text-gray-500">{product.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600 text-sm">{product.quantity_sold} sold</p>
                  <p className="text-xs text-gray-600">₹{product.revenue.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trending Products */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">📈 Trending Now</h3>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
              Growth
            </span>
          </div>
          <div className="space-y-3">
            {analytics.products.trending.slice(0, 5).map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{product.product_name}</p>
                  <p className="text-xs text-gray-500">{product.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-bold text-blue-600 text-sm">+{product.growth_rate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600">growth</p>
                  </div>
                  <span className="text-blue-600 text-xl">📊</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Performing Products */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">📉 Need Attention</h3>
            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full font-medium">
              Low Sales
            </span>
          </div>
          <div className="space-y-3">
            {analytics.products.lowPerforming.slice(0, 5).map((product, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{product.product_name}</p>
                  <p className="text-xs text-gray-500">{product.category}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-orange-600 text-sm">{product.quantity_sold} sold</p>
                  <p className="text-xs text-gray-600">₹{product.revenue.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Business Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Category Performance */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">📦 Category Performance</h3>
          <div className="space-y-4">
            {analytics.insights.categoryPerformance.map((cat, index) => {
              const maxRevenue = Math.max(...analytics.insights.categoryPerformance.map(c => c.revenue))
              const percentage = (cat.revenue / maxRevenue) * 100

              return (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{cat.category || 'Uncategorized'}</span>
                    <span className="text-sm font-bold text-gray-700">₹{cat.revenue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 min-w-[3rem]">{cat.items_sold} sold</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">💳 Payment Preferences</h3>
          <div className="space-y-4">
            {analytics.insights.paymentPreferences.map((payment, index) => {
              const maxAmount = Math.max(...analytics.insights.paymentPreferences.map(p => p.amount))
              const percentage = (payment.amount / maxAmount) * 100

              return (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{payment.method}</span>
                    <span className="text-sm font-bold text-gray-700">₹{payment.amount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 min-w-[3rem]">{payment.count} txns</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Critical Inventory Management */}
      {analytics.inventory.lowStock.length > 0 && (
        <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-lg border-2 border-red-300 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                <span className="text-3xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-red-900">
                  Critical Stock Alert - Immediate Action Required
                </h3>
                <p className="text-red-700 font-medium">
                  {analytics.inventory.lowStock.length} products need restocking •
                  Est. Cost: ₹{analytics.inventory.lowStock.reduce((sum, item) => {
                    const needToOrder = Math.max(0, item.low_stock_alert - item.quantity)
                    return sum + (needToOrder * item.rate)
                  }, 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => exportLowStock('xlsx')}
                className="px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <span className="text-xl">📊</span>
                Export Excel
              </button>
              <button
                onClick={() => exportLowStock('pdf')}
                className="px-5 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <span className="text-xl">📄</span>
                Export PDF
              </button>
            </div>
          </div>

          {/* Low Stock Table */}
          <div className="bg-white rounded-lg overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-red-600 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold">Product</th>
                    <th className="px-6 py-4 text-left text-sm font-bold">Category</th>
                    <th className="px-6 py-4 text-left text-sm font-bold">Current</th>
                    <th className="px-6 py-4 text-left text-sm font-bold">Required</th>
                    <th className="px-6 py-4 text-left text-sm font-bold">Order Qty</th>
                    <th className="px-6 py-4 text-left text-sm font-bold">Rate</th>
                    <th className="px-6 py-4 text-left text-sm font-bold">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {analytics.inventory.lowStock.map((item, index) => {
                    const needToOrder = Math.max(0, item.low_stock_alert - item.quantity)
                    const estimatedCost = needToOrder * item.rate

                    return (
                      <tr key={item.product_id} className={`hover:bg-red-50 transition ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-red-500 animate-pulse font-bold">🔴</span>
                            <span className="font-medium text-gray-900">{item.product_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.category || '-'}</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-red-600 text-lg">{item.quantity}</span>
                          <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">{item.low_stock_alert}</span>
                          <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-orange-600 text-lg">{needToOrder}</span>
                          <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          ₹{item.rate.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 font-bold text-green-600 text-lg">
                          ₹{estimatedCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-800 text-white">
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-right font-bold text-lg">
                      Total Estimated Investment:
                    </td>
                    <td className="px-6 py-4 font-bold text-green-400 text-xl">
                      ₹{analytics.inventory.lowStock.reduce((sum, item) => {
                        const needToOrder = Math.max(0, item.low_stock_alert - item.quantity)
                        return sum + (needToOrder * item.rate)
                      }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-900">
              💡 <strong>Pro Tip:</strong> Download this report and share directly with your supplier for quick restocking
            </p>
            <a
              href="/stock"
              className="text-sm font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
            >
              Manage Full Inventory →
            </a>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">⚡ Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a
            href="/billing/create"
            className="flex flex-col items-center justify-center p-6 bg-blue-50 hover:bg-blue-100 rounded-lg transition group"
          >
            <span className="text-4xl mb-2 group-hover:scale-110 transition">🧾</span>
            <span className="text-sm font-medium text-gray-700">New Bill</span>
          </a>
          <a
            href="/stock"
            className="flex flex-col items-center justify-center p-6 bg-purple-50 hover:bg-purple-100 rounded-lg transition group"
          >
            <span className="text-4xl mb-2 group-hover:scale-110 transition">📦</span>
            <span className="text-sm font-medium text-gray-700">Manage Stock</span>
          </a>
          <a
            href="/customers"
            className="flex flex-col items-center justify-center p-6 bg-green-50 hover:bg-green-100 rounded-lg transition group"
          >
            <span className="text-4xl mb-2 group-hover:scale-110 transition">👥</span>
            <span className="text-sm font-medium text-gray-700">Customers</span>
          </a>
          <a
            href="/reports"
            className="flex flex-col items-center justify-center p-6 bg-orange-50 hover:bg-orange-100 rounded-lg transition group"
          >
            <span className="text-4xl mb-2 group-hover:scale-110 transition">📊</span>
            <span className="text-sm font-medium text-gray-700">Reports</span>
          </a>
        </div>
      </div>
    </DashboardLayout>
  )
}

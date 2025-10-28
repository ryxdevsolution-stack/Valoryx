'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { motion } from 'framer-motion'

interface Bill {
  bill_id: string
  bill_number: number
  customer_name: string
  customer_phone: string
  items: any[]
  total_amount: number
  payment_type: string
  created_at: string
  type: string
}

interface ReportData {
  total_bills: number
  total_revenue: number
  average_bill_value: number
  bills_growth: number
  revenue_growth: number
  daily_revenue: Array<{ date: string; revenue: number; bills_count: number }>
  payment_methods: Array<{ method: string; count: number; amount: number }>
  top_customers: Array<{ name: string; total_spend: number; bills_count: number }>
  hourly_distribution: Array<{ hour: number; bills: number; revenue: number }>
  bills: Bill[]
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: '',
  })
  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date')

  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const today = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const endDate = today.toISOString().split('T')[0]
    const startDate = thirtyDaysAgo.toISOString().split('T')[0]

    setDateRange({
      start_date: startDate,
      end_date: endDate,
    })

    fetchReportData(startDate, endDate)
  }, [])

  const fetchReportData = async (startDate: string, endDate: string) => {
    if (!startDate || !endDate) {
      console.log('Missing date range:', { startDate, endDate })
      return
    }

    if (ongoingRequest.current) {
      return ongoingRequest.current
    }

    const request = (async () => {
      try {
        setLoading(true)
        console.log('Fetching report data for:', { startDate, endDate })
        const response = await api.get('/billing/list', {
          params: {
            date_from: startDate,
            date_to: endDate,
            limit: 1000
          }
        })

        console.log('Report data received:', response.data)
        const bills = response.data.bills || []

        // Calculate statistics
        const totalBills = bills.length
        const totalRevenue = bills.reduce((sum: number, bill: any) => {
          const amount = bill.type === 'gst' ? parseFloat(bill.final_amount || 0) : parseFloat(bill.total_amount || 0)
          return sum + amount
        }, 0)
        const averageBillValue = totalBills > 0 ? totalRevenue / totalBills : 0

        // Group by date for daily revenue
        const dailyRevenueMap = new Map<string, { revenue: number; bills_count: number }>()
        bills.forEach((bill: any) => {
          const date = new Date(bill.created_at).toISOString().split('T')[0]
          const amount = bill.type === 'gst' ? parseFloat(bill.final_amount || 0) : parseFloat(bill.total_amount || 0)

          if (!dailyRevenueMap.has(date)) {
            dailyRevenueMap.set(date, { revenue: 0, bills_count: 0 })
          }
          const current = dailyRevenueMap.get(date)!
          current.revenue += amount
          current.bills_count += 1
        })

        const dailyRevenue = Array.from(dailyRevenueMap.entries()).map(([date, data]) => ({
          date,
          revenue: data.revenue,
          bills_count: data.bills_count
        })).sort((a, b) => a.date.localeCompare(b.date))

        // Payment methods breakdown
        const paymentMethodsMap = new Map<string, { count: number; amount: number }>()
        bills.forEach((bill: any) => {
          const method = bill.payment_type || 'Cash'
          const amount = bill.type === 'gst' ? parseFloat(bill.final_amount || 0) : parseFloat(bill.total_amount || 0)

          if (!paymentMethodsMap.has(method)) {
            paymentMethodsMap.set(method, { count: 0, amount: 0 })
          }
          const current = paymentMethodsMap.get(method)!
          current.count += 1
          current.amount += amount
        })

        const paymentMethods = Array.from(paymentMethodsMap.entries()).map(([method, data]) => ({
          method,
          count: data.count,
          amount: data.amount
        })).sort((a, b) => b.amount - a.amount)

        // Top customers
        const customersMap = new Map<string, { total_spend: number; bills_count: number }>()
        bills.forEach((bill: any) => {
          const customer = bill.customer_name || 'Walk-in Customer'
          const amount = bill.type === 'gst' ? parseFloat(bill.final_amount || 0) : parseFloat(bill.total_amount || 0)

          if (!customersMap.has(customer)) {
            customersMap.set(customer, { total_spend: 0, bills_count: 0 })
          }
          const current = customersMap.get(customer)!
          current.total_spend += amount
          current.bills_count += 1
        })

        const topCustomers = Array.from(customersMap.entries())
          .map(([name, data]) => ({
            name,
            total_spend: data.total_spend,
            bills_count: data.bills_count
          }))
          .sort((a, b) => b.total_spend - a.total_spend)
          .slice(0, 10)

        // Hourly distribution
        const hourlyMap = new Map<number, { bills: number; revenue: number }>()
        bills.forEach((bill: any) => {
          const hour = new Date(bill.created_at).getHours()
          const amount = bill.type === 'gst' ? parseFloat(bill.final_amount || 0) : parseFloat(bill.total_amount || 0)

          if (!hourlyMap.has(hour)) {
            hourlyMap.set(hour, { bills: 0, revenue: 0 })
          }
          const current = hourlyMap.get(hour)!
          current.bills += 1
          current.revenue += amount
        })

        const hourlyDistribution = Array.from(hourlyMap.entries())
          .map(([hour, data]) => ({
            hour,
            bills: data.bills,
            revenue: data.revenue
          }))
          .sort((a, b) => a.hour - b.hour)

        setReportData({
          total_bills: totalBills,
          total_revenue: totalRevenue,
          average_bill_value: averageBillValue,
          bills_growth: 0,
          revenue_growth: 0,
          daily_revenue: dailyRevenue,
          payment_methods: paymentMethods,
          top_customers: topCustomers,
          hourly_distribution: hourlyDistribution,
          bills
        })
      } catch (error: any) {
        console.error('Failed to fetch report data:', error)
        console.error('Error details:', error.response?.data)
        // Set empty data on error
        setReportData({
          total_bills: 0,
          total_revenue: 0,
          average_bill_value: 0,
          bills_growth: 0,
          revenue_growth: 0,
          daily_revenue: [],
          payment_methods: [],
          top_customers: [],
          hourly_distribution: [],
          bills: []
        })
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }

  const handleDateChange = () => {
    if (dateRange.start_date && dateRange.end_date) {
      fetchReportData(dateRange.start_date, dateRange.end_date)
    }
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const filteredBills = reportData?.bills.filter(bill => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      bill.customer_name?.toLowerCase().includes(query) ||
      bill.bill_number.toString().includes(query) ||
      bill.customer_phone?.includes(query)
    )
  }).sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    } else if (sortBy === 'amount') {
      const amountA = a.type === 'gst' ? parseFloat((a as any).final_amount || 0) : parseFloat((a as any).total_amount || 0)
      const amountB = b.type === 'gst' ? parseFloat((b as any).final_amount || 0) : parseFloat((b as any).total_amount || 0)
      return amountB - amountA
    } else {
      return (a.customer_name || '').localeCompare(b.customer_name || '')
    }
  }) || []

  const getMaxRevenue = () => {
    if (!reportData?.daily_revenue.length) return 0
    return Math.max(...reportData.daily_revenue.map(d => d.revenue))
  }

  if (loading && !reportData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading reports...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!reportData) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Data Available</h2>
            <p className="text-gray-500 dark:text-gray-400">Failed to load report data. Please try again.</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
            {dateRange.start_date && dateRange.end_date && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {formatDate(dateRange.start_date)} - {formatDate(dateRange.end_date)}
              </p>
            )}
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <span className="text-gray-500 dark:text-gray-400">to</span>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleDateChange}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Apply'}
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Bills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Total Bills
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {reportData?.total_bills || 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Created in selected period
            </p>
          </motion.div>

          {/* Total Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Total Revenue
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {formatCurrency(reportData?.total_revenue || 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Across all bills
            </p>
          </motion.div>

          {/* Average Bill Value */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Average Bill Value
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {formatCurrency(reportData?.average_bill_value || 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Per transaction
            </p>
          </motion.div>
        </div>

        {/* Revenue Trend Chart */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Revenue Trend</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTimeFilter('daily')}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    timeFilter === 'daily'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setTimeFilter('weekly')}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    timeFilter === 'weekly'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setTimeFilter('monthly')}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    timeFilter === 'monthly'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Simple Bar Chart */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {reportData?.daily_revenue.slice(-7).map((day, index) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">
                    {new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-8 relative overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(day.revenue / getMaxRevenue()) * 100}%` }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full flex items-center justify-end pr-3"
                      >
                        <span className="text-xs font-medium text-white">
                          {formatCurrency(day.revenue)}
                        </span>
                      </motion.div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                    {day.bills_count} bills
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Payment Methods */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Payment Methods</h3>
            <div className="space-y-4">
              {reportData?.payment_methods.slice(0, 5).map((method, index) => {
                const percentage = ((method.amount / (reportData.total_revenue || 1)) * 100).toFixed(1)
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500']
                return (
                  <div key={method.method}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{method.method}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{percentage}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                          className={`h-full ${colors[index % colors.length]}`}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white w-24 text-right">
                        {formatCurrency(method.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {method.count} transactions
                    </p>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>

        {/* Top Customers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 mb-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Customers</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Total Spend
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Bills
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Avg Bill
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {reportData?.top_customers.slice(0, 5).map((customer, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                            {customer.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{customer.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(customer.total_spend)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-500 dark:text-gray-400">
                      {customer.bills_count}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-500 dark:text-gray-400">
                      {formatCurrency(customer.total_spend / customer.bills_count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Bills History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bills History</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="date">Sort by Date</option>
                <option value="amount">Sort by Amount</option>
                <option value="customer">Sort by Customer</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Bill #
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Payment
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredBills.slice(0, 20).map((bill) => {
                  const amount = bill.type === 'gst' ? parseFloat((bill as any).final_amount || 0) : parseFloat((bill as any).total_amount || 0)
                  return (
                    <tr key={bill.bill_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(bill.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                        #{bill.bill_number}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                        {bill.customer_name || 'Walk-in'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          {bill.payment_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredBills.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No bills found</p>
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  )
}

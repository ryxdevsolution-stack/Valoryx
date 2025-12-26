'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import NotesModal from '@/components/NotesModal'
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

interface Expense {
  expense_id: string
  category: string
  description: string
  amount: string
  expense_date: string
  payment_method: string
  notes: string
  created_at: string
}

interface ReportData {
  total_bills: number
  total_revenue: number
  bills_growth: number
  revenue_growth: number
  top_customers: Array<{ name: string; total_spend: number; bills_count: number }>
  hourly_distribution: Array<{ hour: number; bills: number; revenue: number }>
  bills: Bill[]
  expenses?: {
    total_expenses: number
    expense_count: number
    category_breakdown: Record<string, number>
    net_profit: number
    expense_list: Expense[]
  }
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: '',
  })
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date')
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 17

  // Expense management states
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showExpensesPanel, setShowExpensesPanel] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [expenseCategories, setExpenseCategories] = useState<string[]>([])
  const [expenseFormData, setExpenseFormData] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: '',
    payment_method: 'cash',
    notes: ''
  })

  // Collapsible section states
  const [isExpenseCategoriesOpen, setIsExpenseCategoriesOpen] = useState(false)
  const [isTopCustomersOpen, setIsTopCustomersOpen] = useState(false)

  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  // Calculate date range based on period type
  const calculateDateRange = (type: 'daily' | 'weekly' | 'monthly') => {
    const today = new Date()
    const endDate = today.toISOString().split('T')[0]
    let startDate = ''

    if (type === 'daily') {
      // Today only
      startDate = endDate
    } else if (type === 'weekly') {
      // Last 7 days
      const weekAgo = new Date()
      weekAgo.setDate(today.getDate() - 6)
      startDate = weekAgo.toISOString().split('T')[0]
    } else if (type === 'monthly') {
      // Last 30 days
      const monthAgo = new Date()
      monthAgo.setDate(today.getDate() - 29)
      startDate = monthAgo.toISOString().split('T')[0]
    }

    return { start_date: startDate, end_date: endDate }
  }

  // Handle period type change
  const handlePeriodChange = (type: 'daily' | 'weekly' | 'monthly') => {
    // Prevent changing period while loading
    if (loading) return

    setPeriodType(type)
    const range = calculateDateRange(type)
    setDateRange(range)
    fetchReportData(range.start_date, range.end_date)
  }

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    // Fetch expense categories once on mount (they don't change with date range)
    const fetchCategories = async () => {
      try {
        const categoriesRes = await api.get('/expense/categories')
        if (categoriesRes.data.success) {
          setExpenseCategories(categoriesRes.data.categories)
        }
      } catch (error) {
        console.log('Failed to fetch expense categories:', error)
      }
    }

    fetchCategories()

    const range = calculateDateRange('monthly')
    setDateRange(range)
    fetchReportData(range.start_date, range.end_date)
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

        // Fetch all data in parallel for faster loading
        const [billsResponse, expenseSummaryRes, expenseListRes] = await Promise.all([
          api.get('/billing/list', {
            params: {
              date_from: startDate,
              date_to: endDate,
              limit: 500  // Reduced from 1000 for faster response
            }
          }),
          api.get('/expense/summary', {
            params: {
              date_from: startDate,
              date_to: endDate,
              period_type: 'day'
            }
          }).catch(() => ({ data: { success: false } })),
          api.get('/expense/list', {
            params: {
              date_from: startDate,
              date_to: endDate,
              limit: 500  // Reduced from 1000 for faster response
            }
          }).catch(() => ({ data: { success: false } }))
        ])

        const response = billsResponse

        console.log('Report data received:', response.data)
        const bills = response.data.bills || []

        // Calculate statistics
        const totalBills = bills.length
        const totalRevenue = bills.reduce((sum: number, bill: any) => {
          const amount = bill.type === 'gst' ? parseFloat(bill.final_amount || 0) : parseFloat(bill.total_amount || 0)
          return sum + amount
        }, 0)

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

        // Process expenses data (already fetched in parallel above)
        let expensesData = undefined
        if (expenseSummaryRes.data.success) {
          const expenseSummary = expenseSummaryRes.data.summary
          const expenses = expenseListRes.data.success ? expenseListRes.data.expenses : []

          expensesData = {
            total_expenses: expenseSummary.total_expenses || 0,
            expense_count: expenseSummary.expense_count || 0,
            category_breakdown: expenseSummary.category_breakdown || {},
            net_profit: totalRevenue - (expenseSummary.total_expenses || 0),
            expense_list: expenses
          }
        }

        setReportData({
          total_bills: totalBills,
          total_revenue: totalRevenue,
          bills_growth: 0,
          revenue_growth: 0,
          top_customers: topCustomers,
          hourly_distribution: hourlyDistribution,
          bills,
          expenses: expensesData
        })
      } catch (error: any) {
        console.error('Failed to fetch report data:', error)
        console.error('Error details:', error.response?.data)
        // Set empty data on error
        setReportData({
          total_bills: 0,
          total_revenue: 0,
          bills_growth: 0,
          revenue_growth: 0,
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


  // Expense management functions
  const handleAddExpense = () => {
    setEditingExpense(null)
    setExpenseFormData({
      category: '',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      notes: ''
    })
    setShowExpenseModal(true)
  }

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setExpenseFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      expense_date: expense.expense_date,
      payment_method: expense.payment_method,
      notes: expense.notes || ''
    })
    setShowExpenseModal(true)
  }

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return

    try {
      setLoading(true)
      await api.delete(`/expense/${expenseId}`)
      // Refresh data
      if (dateRange.start_date && dateRange.end_date) {
        fetchReportData(dateRange.start_date, dateRange.end_date)
      }
    } catch (error: any) {
      console.error('Failed to delete expense:', error)
      alert(error.response?.data?.error || 'Failed to delete expense')
    } finally {
      setLoading(false)
    }
  }

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)

      if (editingExpense) {
        await api.put(`/expense/${editingExpense.expense_id}`, expenseFormData)
      } else {
        await api.post('/expense/create', expenseFormData)
      }

      setShowExpenseModal(false)
      setEditingExpense(null)

      // Refresh data
      if (dateRange.start_date && dateRange.end_date) {
        fetchReportData(dateRange.start_date, dateRange.end_date)
      }
    } catch (error: any) {
      console.error('Failed to save expense:', error)
      alert(error.response?.data?.error || 'Failed to save expense')
    } finally {
      setLoading(false)
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage)
  const paginatedBills = filteredBills.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Calculate page total for current page
  const pageTotal = paginatedBills.reduce((sum, bill) => {
    const amount = bill.type === 'gst' ? parseFloat((bill as any).final_amount || 0) : parseFloat((bill as any).total_amount || 0)
    return sum + amount
  }, 0)

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortBy])

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

          {/* Period Selector, Expenses and Notes Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowExpensesPanel(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              title="View and manage expenses"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Expenses
            </button>
            <button
              type="button"
              onClick={() => setIsNotesModalOpen(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              title="View and manage notes"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Notes
            </button>

            {/* Period Selector Buttons */}
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => handlePeriodChange('daily')}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  periodType === 'daily'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {loading && periodType === 'daily' && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                )}
                Daily
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('weekly')}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium border-l border-r border-gray-300 dark:border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  periodType === 'weekly'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {loading && periodType === 'weekly' && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                )}
                Weekly
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('monthly')}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  periodType === 'monthly'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {loading && periodType === 'monthly' && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                )}
                Monthly
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          {/* Total Bills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Total Bills
              </span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {reportData?.total_bills || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Created in selected period
            </p>
          </motion.div>

          {/* Total Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Total Revenue
              </span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(reportData?.total_revenue || 0)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Across all bills
            </p>
          </motion.div>

          {/* Total Expenses */}
          {reportData?.expenses && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-md p-3 border border-red-200 dark:border-red-900"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total Expenses
                </span>
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(reportData.expenses.total_expenses)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {reportData.expenses.expense_count} transactions
              </p>
            </motion.div>
          )}

          {/* Net Profit */}
          {reportData?.expenses && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-md p-3 border border-green-200 dark:border-green-900"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Net Profit
                </span>
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className={`text-xl font-bold ${reportData.expenses.net_profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(reportData.expenses.net_profit)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Revenue - Expenses
              </p>
            </motion.div>
          )}
        </div>


        {/* Expense Categories Breakdown */}
        {reportData?.expenses && Object.keys(reportData.expenses.category_breakdown).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-6 overflow-hidden"
          >
            <button
              onClick={() => setIsExpenseCategoriesOpen(!isExpenseCategoriesOpen)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Expense Categories</h3>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isExpenseCategoriesOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpenseCategoriesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="px-6 pb-6"
              >
                <div className="space-y-4">
                  {Object.entries(reportData.expenses.category_breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([category, amount], index) => {
                      const percentage = ((amount / reportData.expenses!.total_expenses) * 100).toFixed(1)
                      const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-amber-500', 'bg-pink-500']
                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{category}</span>
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
                              {formatCurrency(amount)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}


        {/* Top Customers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-6 overflow-hidden"
        >
          <button
            onClick={() => setIsTopCustomersOpen(!isTopCustomersOpen)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Customers</h3>
            <svg
              className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isTopCustomersOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isTopCustomersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-x-auto"
            >
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
            </motion.div>
          )}
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
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Bill #
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Payment
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {paginatedBills.map((bill) => {
                  const amount = bill.type === 'gst' ? parseFloat((bill as any).final_amount || 0) : parseFloat((bill as any).total_amount || 0)

                  // Format payment type properly
                  const formatPaymentType = (type: string) => {
                    if (!type) return 'N/A'
                    return type.split('_').map(word =>
                      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ')
                  }

                  // Get payment type color
                  const getPaymentColor = (type: string) => {
                    const lowerType = type?.toLowerCase() || ''
                    if (lowerType.includes('cash')) return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    if (lowerType.includes('upi')) return 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    if (lowerType.includes('card')) return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    if (lowerType.includes('bank')) return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    return 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }

                  return (
                    <tr key={bill.bill_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {new Date(bill.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                        #{bill.bill_number}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                        {bill.customer_name || 'Walk-in'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentColor(bill.payment_type)}`}>
                          {formatPaymentType(bill.payment_type)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {formatCurrency(amount)}
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

          {/* Pagination Controls */}
          {filteredBills.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-4 pb-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Prev
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 text-xs font-medium rounded ${
                        currentPage === pageNum
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          )}

          {/* Fixed Footer with Page Total and Grand Total */}
          {filteredBills.length > 0 && (
            <div className="mt-3 bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-4 border border-slate-600">
              <div className="flex justify-between items-center">
                {/* Left side - Page Info and Page Total */}
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-slate-400">Page {currentPage} of {totalPages || 1}</p>
                    <p className="text-xs text-slate-400">{paginatedBills.length} items</p>
                  </div>
                  <div className="border-l border-slate-600 pl-6">
                    <p className="text-xs text-slate-400">Page Total</p>
                    <p className="text-lg font-bold text-yellow-400">{formatCurrency(pageTotal)}</p>
                  </div>
                </div>

                {/* Middle - Expenses Info (if available) */}
                {reportData?.expenses && (
                  <div className="flex items-center gap-6">
                    <div className="border-l border-slate-600 pl-6">
                      <p className="text-xs text-slate-400">Total Expenses</p>
                      <p className="text-lg font-bold text-red-400">{formatCurrency(reportData.expenses.total_expenses)}</p>
                    </div>
                    <div className="border-l border-slate-600 pl-6">
                      <p className="text-xs text-slate-400">Net Profit</p>
                      <p className={`text-lg font-bold ${reportData.expenses.net_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(reportData.expenses.net_profit)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Right side - Grand Total */}
                <div className="text-right">
                  <p className="text-xs text-slate-400">Grand Total ({filteredBills.length} bills)</p>
                  <p className="text-xl font-bold text-white">
                    {formatCurrency(filteredBills.reduce((sum, bill) => {
                      const amount = bill.type === 'gst' ? parseFloat((bill as any).final_amount || 0) : parseFloat((bill as any).total_amount || 0)
                      return sum + amount
                    }, 0))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Notes Modal */}
      <NotesModal isOpen={isNotesModalOpen} onClose={() => setIsNotesModalOpen(false)} />

      {/* Expenses Panel */}
      {showExpensesPanel && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity"
              onClick={() => setShowExpensesPanel(false)}
            />

            <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-screen max-w-2xl"
              >
                <div className="h-full flex flex-col bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
                  {/* Header */}
                  <div className="px-6 py-4 bg-red-600 dark:bg-red-700">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-white">Daily Expenses</h2>
                      <button
                        type="button"
                        onClick={() => setShowExpensesPanel(false)}
                        className="text-white hover:text-gray-200 transition-colors"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 px-6 py-4 overflow-y-auto">
                    <div className="mb-6">
                      <button
                        type="button"
                        onClick={handleAddExpense}
                        className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Expense
                      </button>
                    </div>

                    {reportData?.expenses && reportData.expenses.expense_list && reportData.expenses.expense_list.length > 0 ? (
                      <div className="space-y-4">
                        {reportData.expenses.expense_list.map((expense) => (
                          <div
                            key={expense.expense_id}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                    {expense.category}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatDate(expense.expense_date)}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                  {expense.description || 'No description'}
                                </p>
                                <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                                  {formatCurrency(parseFloat(expense.amount))}
                                </p>
                                {expense.payment_method && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Payment: {expense.payment_method}
                                  </p>
                                )}
                                {expense.notes && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Notes: {expense.notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  type="button"
                                  onClick={() => handleEditExpense(expense)}
                                  className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpense(expense.expense_id)}
                                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No expenses yet</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          Start tracking your business expenses to see profit analysis
                        </p>
                        <button
                          type="button"
                          onClick={handleAddExpense}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Your First Expense
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75"
              onClick={() => setShowExpenseModal(false)}
            />

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full relative z-10"
            >
              <form onSubmit={handleExpenseSubmit}>
                <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {editingExpense ? 'Edit Expense' : 'Add New Expense'}
                  </h3>
                </div>

                <div className="px-6 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category *
                    </label>
                    <select
                      value={expenseFormData.category}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, category: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select category</option>
                      {expenseCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Amount *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={expenseFormData.amount}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Expense Date *
                    </label>
                    <input
                      type="date"
                      value={expenseFormData.expense_date}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, expense_date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={expenseFormData.payment_method}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, payment_method: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="card">Card</option>
                      <option value="upi">UPI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={expenseFormData.description}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Brief description"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={expenseFormData.notes}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowExpenseModal(false)
                      setEditingExpense(null)
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : editingExpense ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import Link from 'next/link'
import { CustomerCardSkeleton, CardSkeleton } from '@/components/SkeletonLoader'

interface Customer {
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_address: string
  total_bills: number
  total_amount: number
  last_purchase: string
  first_purchase: string
  status: 'Active' | 'Inactive'
  gst_bills: number
  non_gst_bills: number
}

interface Statistics {
  total_customers: number
  active_customers: number
  inactive_customers: number
  total_revenue: number
  top_customer: Customer | null
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'Active' | 'Inactive'>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const response = await api.get('/customer/list')
      setCustomers(response.data.customers || [])
      setStatistics(response.data.statistics)
    } catch (error) {
      console.error('Failed to fetch customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Filter customers based on search and status
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.customer_phone.includes(searchQuery)
    const matchesStatus = filterStatus === 'all' || customer.status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">Customers</h1>
            <p className="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400">Manage your customer base and track revenue</p>
          </div>
          <Link
            href="/billing/create"
            className="inline-flex items-center justify-center px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm sm:text-base font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl min-h-touch"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Bill
          </Link>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 text-white">
              <p className="text-xs sm:text-sm font-medium text-blue-100">Total Customers</p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold mt-1 sm:mt-2">{statistics.total_customers}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 text-white">
              <p className="text-xs sm:text-sm font-medium text-green-100">Active</p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold mt-1 sm:mt-2">{statistics.active_customers}</p>
              <p className="text-[10px] sm:text-xs text-green-100 mt-1">Last 30 days</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 text-white">
              <p className="text-xs sm:text-sm font-medium text-purple-100">Inactive</p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold mt-1 sm:mt-2">{statistics.inactive_customers}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 text-white col-span-2 lg:col-span-1">
              <p className="text-xs sm:text-sm font-medium text-orange-100">Total Revenue</p>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold mt-1 sm:mt-2">{formatCurrency(statistics.total_revenue)}</p>
            </div>
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-md p-3 sm:p-4 md:p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm sm:text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition min-h-touch ${
                  filterStatus === 'all'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('Active')}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition min-h-touch ${
                  filterStatus === 'Active'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setFilterStatus('Inactive')}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition min-h-touch ${
                  filterStatus === 'Inactive'
                    ? 'bg-gray-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>

        {/* Customers List */}
        {loading ? (
          <>
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <CustomerCardSkeleton count={8} />
              </div>
            </div>
            <div className="md:hidden">
              <CustomerCardSkeleton count={6} />
            </div>
          </>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-md p-8 sm:p-12 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">👥</div>
            <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400">No customers found</p>
            <p className="text-sm sm:text-base text-gray-400 dark:text-gray-500 mt-2">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Create your first bill to add customers'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Bills</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Total Spent</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Last Purchase</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredCustomers.map((customer) => (
                      <tr
                        key={customer.customer_phone}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer"
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                              {customer.customer_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">{customer.customer_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">{customer.customer_phone}</div>
                          {customer.customer_email && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{customer.customer_email}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{customer.total_bills}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {customer.gst_bills} GST, {customer.non_gst_bills} Non-GST
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(customer.total_amount)}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Avg: {formatCurrency(customer.total_amount / customer.total_bills)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{formatDate(customer.last_purchase)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${
                            customer.status === 'Active'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                          }`}>
                            {customer.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.customer_phone}
                  onClick={() => setSelectedCustomer(customer)}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 hover:shadow-lg transition touch-manipulation border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                      {customer.customer_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{customer.customer_name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{customer.customer_phone}</p>
                      {customer.customer_email && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{customer.customer_email}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                      customer.status === 'Active'
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                    }`}>
                      {customer.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Bills</p>
                      <p className="text-base font-bold text-gray-900 dark:text-white">{customer.total_bills}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Spent</p>
                      <p className="text-base font-bold text-green-600 dark:text-green-400">{formatCurrency(customer.total_amount)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Last Purchase</p>
                      <p className="text-sm text-gray-900 dark:text-white">{formatDate(customer.last_purchase)}</p>
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

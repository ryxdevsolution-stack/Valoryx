'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import { DashboardSkeleton } from '@/components/SkeletonLoader'

interface DashboardStats {
  todaySales: number
  totalGSTBills: number
  totalNonGSTBills: number
  lowStockCount: number
}

export default function DashboardPage() {
  const { client } = useClient()
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    totalGSTBills: 0,
    totalNonGSTBills: 0,
    lowStockCount: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // Fetch bills
      const billsResponse = await api.get('/billing/list?limit=1000')
      const bills = billsResponse.data.bills

      // Calculate today's sales
      const today = new Date().toISOString().split('T')[0]
      const todayBills = bills.filter((bill: any) =>
        bill.created_at.startsWith(today)
      )

      const todaySales = todayBills.reduce((sum: number, bill: any) => {
        const amount = bill.type === 'gst' ? parseFloat(bill.final_amount) : parseFloat(bill.total_amount)
        return sum + amount
      }, 0)

      // Count GST and Non-GST bills
      const gstCount = bills.filter((b: any) => b.type === 'gst').length
      const nonGstCount = bills.filter((b: any) => b.type === 'non_gst').length

      // Fetch low stock alerts
      const stockResponse = await api.get('/stock/alerts')
      const lowStockCount = stockResponse.data.alert_count

      setStats({
        todaySales,
        totalGSTBills: gstCount,
        totalNonGSTBills: nonGstCount,
        lowStockCount,
      })
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: "Today's Sales",
      value: `₹${stats.todaySales.toFixed(2)}`,
      icon: '💰',
      color: 'bg-blue-500',
    },
    {
      title: 'GST Bills',
      value: stats.totalGSTBills,
      icon: '🧾',
      color: 'bg-green-500',
    },
    {
      title: 'Non-GST Bills',
      value: stats.totalNonGSTBills,
      icon: '📝',
      color: 'bg-purple-500',
    },
    {
      title: 'Low Stock Alerts',
      value: stats.lowStockCount,
      icon: '⚠️',
      color: 'bg-red-500',
    },
  ]

  return (
    <DashboardLayout>
      <div className="mb-4 sm:mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 break-words">
          Welcome, {client?.client_name}
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">Here&apos;s an overview of your billing system</p>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            {statCards.map((card, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-md p-4 sm:p-5 md:p-6 border border-gray-200 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{card.title}</p>
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2 break-words">{card.value}</p>
                  </div>
                  <div className={`${card.color} rounded-full p-2 sm:p-3 md:p-4 text-2xl sm:text-3xl md:text-4xl flex-shrink-0 ml-2`}>
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-5 md:p-6 border border-gray-200 mb-4 sm:mb-6 md:mb-8">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              <a
                href="/billing/create"
                className="flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-blue-50 hover:bg-blue-100 rounded-lg transition min-h-touch"
              >
                <span className="text-3xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">🧾</span>
                <span className="text-xs sm:text-sm font-medium text-gray-700 text-center">New GST Bill</span>
              </a>
              <a
                href="/billing/create"
                className="flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-green-50 hover:bg-green-100 rounded-lg transition min-h-touch"
              >
                <span className="text-3xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">📝</span>
                <span className="text-xs sm:text-sm font-medium text-gray-700 text-center">New Non-GST Bill</span>
              </a>
              <a
                href="/stock"
                className="flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-purple-50 hover:bg-purple-100 rounded-lg transition min-h-touch"
              >
                <span className="text-3xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">📦</span>
                <span className="text-xs sm:text-sm font-medium text-gray-700 text-center">Add Stock</span>
              </a>
              <a
                href="/reports"
                className="flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-orange-50 hover:bg-orange-100 rounded-lg transition min-h-touch"
              >
                <span className="text-3xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">📈</span>
                <span className="text-xs sm:text-sm font-medium text-gray-700 text-center">Generate Report</span>
              </a>
            </div>
          </div>

          {/* Low Stock Alert */}
          {stats.lowStockCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-5 md:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-red-800 mb-1 sm:mb-2">
                ⚠️ Low Stock Alert
              </h3>
              <p className="text-sm sm:text-base text-red-700">
                You have {stats.lowStockCount} product(s) with low stock.{' '}
                <a href="/stock" className="underline font-medium hover:text-red-900">
                  View stock alerts
                </a>
              </p>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}

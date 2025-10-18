'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'

interface Bill {
  bill_id: any
  bill_number: any
  type: 'gst' | 'non_gst'
  customer_name: any
  customer_phone: any
  subtotal?: number
  gst_percentage?: number
  gst_amount?: number
  final_amount?: number
  total_amount?: number
  payment_type: any
  created_at: any
}

export default function AllBillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'gst' | 'non_gst'>('all')

  useEffect(() => {
    fetchBills()
  }, [])

  const fetchBills = async () => {
    try {
      setLoading(true)
      const response = await api.get('/billing/list?limit=100')
      setBills(response.data.bills || [])
    } catch (error: any) {
      console.error('Failed to fetch bills:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredBills = bills.filter((bill) => {
    if (filter === 'all') return true
    return bill.type === filter
  })

  const getAmount = (bill: Bill) => {
    if (bill.type === 'gst') {
      return parseFloat(String(bill.final_amount || '0'))
    }
    return parseFloat(String(bill.total_amount || '0'))
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">All Bills</h1>
        <p className="mt-2 text-gray-600">View and manage all billing records</p>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-6 py-2 rounded-lg font-medium transition ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          All Bills ({bills.length})
        </button>
        <button
          onClick={() => setFilter('gst')}
          className={`px-6 py-2 rounded-lg font-medium transition ${
            filter === 'gst'
              ? 'bg-green-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          GST Bills ({bills.filter((b) => b.type === 'gst').length})
        </button>
        <button
          onClick={() => setFilter('non_gst')}
          className={`px-6 py-2 rounded-lg font-medium transition ${
            filter === 'non_gst'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Non-GST Bills ({bills.filter((b) => b.type === 'non_gst').length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading bills...</p>
        </div>
      ) : filteredBills.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">No bills found</p>
          <p className="text-gray-400 mt-2">Create your first bill to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bill Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBills.map((bill) => (
                <tr key={bill.bill_id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {bill.bill_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        bill.type === 'gst'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {bill.type === 'gst' ? 'GST' : 'Non-GST'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bill.customer_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bill.customer_phone}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                    ₹{getAmount(bill).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(bill.created_at).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}

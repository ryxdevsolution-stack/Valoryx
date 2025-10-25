'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { PaymentTypesSkeleton } from '@/components/SkeletonLoader'
import { useData } from '@/contexts/DataContext'

interface PaymentType {
  payment_type_id: string
  type_name: string
  created_at: string
}

export default function PaymentTypesPage() {
  const { fetchPaymentTypes: fetchCachedPaymentTypes, invalidateCache } = useData()
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [typeName, setTypeName] = useState('')

  useEffect(() => {
    loadPaymentTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPaymentTypes = async () => {
    try {
      setLoading(true)
      const types = await fetchCachedPaymentTypes()
      setPaymentTypes(types as unknown as PaymentType[])
    } catch (error) {
      console.error('Failed to fetch payment types:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshPaymentTypes = async () => {
    try {
      setLoading(true)
      // Invalidate cache and fetch fresh data
      invalidateCache('paymentTypes')
      const types = await fetchCachedPaymentTypes(true)
      setPaymentTypes(types as unknown as PaymentType[])
    } catch (error) {
      console.error('Failed to refresh payment types:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!typeName.trim()) {
      alert('Please enter a payment type name')
      return
    }

    try {
      await api.post('/payment', { type_name: typeName })
      alert('Payment type added successfully!')
      setTypeName('')
      setShowAddForm(false)
      refreshPaymentTypes()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to add payment type')
    }
  }

  const handleDelete = async (paymentTypeId: string) => {
    if (!confirm('Are you sure you want to delete this payment type?')) return

    try {
      await api.delete(`/payment/${paymentTypeId}`)
      alert('Payment type deleted successfully!')
      refreshPaymentTypes()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete payment type')
    }
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
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payment Types</h1>
          <p className="mt-2 text-gray-600">Manage payment methods for your business</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          {showAddForm ? 'Cancel' : '+ Add Payment Type'}
        </button>
      </div>

      {/* Add Payment Type Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Add New Payment Type</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Type Name *
              </label>
              <input
                type="text"
                required
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="e.g., Cash, Credit Card, UPI, Bank Transfer"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Add Payment Type
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  setTypeName('')
                }}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Types List */}
      {loading ? (
        <PaymentTypesSkeleton count={6} />
      ) : paymentTypes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">No payment types found</p>
          <p className="text-gray-400 mt-2">Add your first payment type to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paymentTypes.map((paymentType) => (
            <div
              key={paymentType.payment_type_id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {paymentType.type_name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Added on {formatDate(paymentType.created_at)}
                  </p>
                </div>
                <div className="text-3xl">💳</div>
              </div>
              <div className="border-t pt-4 flex justify-between items-center">
                <span className="text-xs text-gray-400 font-mono">
                  ID: {paymentType.payment_type_id.slice(0, 8)}
                </span>
                <button
                  onClick={() => handleDelete(paymentType.payment_type_id)}
                  className="text-red-600 hover:text-red-800 font-medium text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Common Payment Types Suggestion */}
      {!showAddForm && paymentTypes.length === 0 && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            💡 Common Payment Types
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-blue-700 text-sm">• Cash</div>
            <div className="text-blue-700 text-sm">• Credit Card</div>
            <div className="text-blue-700 text-sm">• Debit Card</div>
            <div className="text-blue-700 text-sm">• UPI</div>
            <div className="text-blue-700 text-sm">• Bank Transfer</div>
            <div className="text-blue-700 text-sm">• Cheque</div>
            <div className="text-blue-700 text-sm">• Net Banking</div>
            <div className="text-blue-700 text-sm">• Wallet</div>
          </div>
          <p className="text-blue-600 text-sm mt-3">
            Click &quot;Add Payment Type&quot; to create your first payment method
          </p>
        </div>
      )}
    </DashboardLayout>
  )
}

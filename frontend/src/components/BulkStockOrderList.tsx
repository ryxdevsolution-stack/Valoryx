'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface OrderItem {
  item_id: string
  product_name: string
  quantity_ordered: number
  quantity_received: number
  unit: string
  cost_price?: number
  selling_price?: number
}

interface BulkOrder {
  order_id: string
  order_number: string
  supplier_name: string
  supplier_contact?: string
  order_date: string
  expected_delivery_date?: string
  status: string
  notes?: string
  items: OrderItem[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onReceive: (order: BulkOrder) => void
}

export default function BulkStockOrderList({ isOpen, onClose, onReceive }: Props) {
  const [orders, setOrders] = useState<BulkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchOrders()
    }
  }, [isOpen, filter])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const params = filter !== 'all' ? { status: filter } : {}
      const response = await api.get('/bulk-orders', { params })
      setOrders(response.data.orders || [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return

    try {
      await api.delete(`/bulk-orders/${orderId}`)
      fetchOrders()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete order')
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700',
      partial: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700',
      received: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700',
      cancelled: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700',
    }
    return styles[status as keyof typeof styles] || styles.pending
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Bulk Stock Orders</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ✕
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'All Orders' },
              { value: 'pending', label: 'Pending' },
              { value: 'partial', label: 'Partial' },
              { value: 'received', label: 'Received' },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`px-4 py-2 rounded-lg transition ${
                  filter === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg">No orders found</p>
              <p className="text-sm mt-2">Create a new bulk stock order to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map(order => (
                <div
                  key={order.order_id}
                  className="bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
                >
                  {/* Order Header */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-lg text-gray-900 dark:text-white">
                          {order.order_number}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(order.status)}`}>
                          {order.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {order.status !== 'received' && (
                          <button
                            onClick={() => onReceive(order)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                          >
                            Receive Items
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedOrder(expandedOrder === order.order_id ? null : order.order_id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                        >
                          {expandedOrder === order.order_id ? 'Hide Details' : 'View Details'}
                        </button>
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleDelete(order.order_id)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Supplier:</span>
                        <p className="font-medium text-gray-900 dark:text-white">{order.supplier_name}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Contact:</span>
                        <p className="font-medium text-gray-900 dark:text-white">{order.supplier_contact || '-'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Order Date:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {new Date(order.order_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Expected:</span>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {order.expected_delivery_date
                            ? new Date(order.expected_delivery_date).toLocaleDateString()
                            : '-'}
                        </p>
                      </div>
                    </div>

                    {order.notes && (
                      <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-800 dark:text-yellow-300">
                          <strong>Notes:</strong> {order.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Expanded Items */}
                  {expandedOrder === order.order_id && (
                    <div className="border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Order Items</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                                Product
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                                Ordered
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                                Received
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                                Cost Price
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                                Selling Price
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {order.items.map(item => (
                              <tr key={item.item_id}>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {item.product_name}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {item.quantity_ordered} {item.unit}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {item.quantity_received} {item.unit}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {item.cost_price ? `₹${item.cost_price}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {item.selling_price ? `₹${item.selling_price}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {item.quantity_received >= item.quantity_ordered ? (
                                    <span className="text-green-600 dark:text-green-400">✓ Complete</span>
                                  ) : item.quantity_received > 0 ? (
                                    <span className="text-blue-600 dark:text-blue-400">Partial</span>
                                  ) : (
                                    <span className="text-gray-500 dark:text-gray-400">Pending</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

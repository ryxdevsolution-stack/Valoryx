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
  items: OrderItem[]
}

interface ReceiveItem {
  item_id: string
  quantity_received: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  order: BulkOrder | null
  onSuccess: () => void
}

export default function ReceiveStockModal({ isOpen, onClose, order, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [receiveData, setReceiveData] = useState<{ [key: string]: number }>({})

  useEffect(() => {
    if (order) {
      // Initialize with remaining quantities
      const initial: { [key: string]: number } = {}
      order.items.forEach(item => {
        const remaining = item.quantity_ordered - item.quantity_received
        initial[item.item_id] = remaining > 0 ? remaining : 0
      })
      setReceiveData(initial)
    }
  }, [order])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!order) return

    // Prepare items array
    const items: ReceiveItem[] = Object.entries(receiveData)
      .filter(([_, qty]) => qty > 0)
      .map(([item_id, quantity_received]) => ({
        item_id,
        quantity_received
      }))

    if (items.length === 0) {
      alert('Please enter quantities to receive')
      return
    }

    setSubmitting(true)
    try {
      await api.post(`/bulk-orders/${order.order_id}/receive`, { items })
      onSuccess()
      onClose()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to receive items')
    } finally {
      setSubmitting(false)
    }
  }

  const updateQuantity = (itemId: string, value: number, maxValue: number) => {
    // Ensure value is not negative and not more than remaining
    const finalValue = Math.max(0, Math.min(value, maxValue))
    setReceiveData(prev => ({ ...prev, [itemId]: finalValue }))
  }

  const setAllMax = () => {
    if (!order) return
    const maxData: { [key: string]: number } = {}
    order.items.forEach(item => {
      const remaining = item.quantity_ordered - item.quantity_received
      maxData[item.item_id] = remaining > 0 ? remaining : 0
    })
    setReceiveData(maxData)
  }

  const clearAll = () => {
    if (!order) return
    const emptyData: { [key: string]: number } = {}
    order.items.forEach(item => {
      emptyData[item.item_id] = 0
    })
    setReceiveData(emptyData)
  }

  if (!isOpen || !order) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Receive Stock</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Order: {order.order_number} - {order.supplier_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4 flex justify-between items-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter quantities received for each item
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={setAllMax}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition"
                >
                  Fill All Max
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {order.items.map(item => {
                const remaining = item.quantity_ordered - item.quantity_received
                const isFullyReceived = remaining <= 0

                return (
                  <div
                    key={item.item_id}
                    className={`bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border ${
                      isFullyReceived
                        ? 'border-green-200 dark:border-green-700 opacity-60'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                          {item.product_name}
                          {isFullyReceived && (
                            <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                              ✓ Fully Received
                            </span>
                          )}
                        </h4>
                        <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span>Ordered: {item.quantity_ordered} {item.unit}</span>
                          <span>Already Received: {item.quantity_received} {item.unit}</span>
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            Remaining: {remaining} {item.unit}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Receive Now
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            value={receiveData[item.item_id] || 0}
                            onChange={(e) =>
                              updateQuantity(item.item_id, parseInt(e.target.value) || 0, remaining)
                            }
                            disabled={isFullyReceived}
                            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white rounded text-center disabled:opacity-50"
                          />
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {item.unit}
                        </div>
                      </div>
                    </div>

                    {item.cost_price && item.selling_price && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                        <span>Cost: ₹{item.cost_price}</span>
                        <span>Selling: ₹{item.selling_price}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900">
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={submitting || Object.values(receiveData).every(v => v === 0)}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {submitting ? 'Processing...' : 'Receive Items & Update Stock'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-6 py-3 bg-gray-600 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Stock will be automatically added to inventory when you receive items
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

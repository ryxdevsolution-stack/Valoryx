import { memo } from 'react'

interface BillItem {
  product_id: string
  product_name: string
  item_code: string
  hsn_code: string
  unit: string
  quantity: number
  rate: number
  gst_percentage: number
  gst_amount: number
  amount: number
  cost_price?: number
  mrp?: number
}

interface MobileCartListProps {
  items: BillItem[]
  showGst: boolean
  onUpdateQuantity: (index: number, newQuantity: number) => void
  onRemoveItem: (index: number) => void
}

function MobileCartList({ items, showGst, onUpdateQuantity, onRemoveItem }: MobileCartListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
        <svg aria-hidden="true" className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-sm font-medium">No items added</p>
        <p className="text-xs">Tap a product to add</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-2">
      {items.map((item, index) => (
        <div
          key={`${item.product_id}-${item.rate}-${index}`}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate capitalize">
                {item.product_name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                ₹{item.rate.toFixed(2)} x {item.quantity} {item.unit}
                {showGst && item.gst_percentage > 0 && (
                  <span className="ml-1">+ {item.gst_percentage}% GST</span>
                )}
              </p>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white ml-2">
              ₹{item.amount.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease quantity of ${item.product_name}`}
                onClick={() => {
                  if (item.quantity > 1) onUpdateQuantity(index, item.quantity - 1)
                  else onRemoveItem(index)
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
              >
                {item.quantity === 1 ? (
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                ) : (
                  <span className="text-sm font-bold">&minus;</span>
                )}
              </button>
              <span className="text-sm font-bold text-gray-900 dark:text-white w-8 text-center">
                {item.quantity}
              </span>
              <button
                type="button"
                aria-label={`Increase quantity of ${item.product_name}`}
                onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 transition-colors"
              >
                <span className="text-sm font-bold">+</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRemoveItem(index)}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default memo(MobileCartList)

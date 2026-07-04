import { useState, useMemo, useRef, memo } from 'react'
import { useCurrency } from '@/lib/useCurrency'

interface Product {
  product_id: string
  product_name: string
  rate: number | string
  quantity: number
  item_code: string
  barcode: string
  gst_percentage: number | string
  hsn_code: string
  unit: string
  available_quantity: number
  cost_price?: number | string
  mrp?: number | string
  category?: string
}

interface BillItem {
  product_id: string
  product_name: string
  item_code: string
  quantity: number
  rate: number
  [key: string]: any
}

interface ProductCardGridProps {
  products: Product[]
  billItems: BillItem[]
  onProductTap: (product: Product) => void
  isLoading: boolean
}

function ProductCardGrid({ products, billItems, onProductTap, isLoading }: ProductCardGridProps) {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const tabsRef = useRef<HTMLDivElement>(null)
  const { format } = useCurrency()

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category || 'Uncategorized').filter(Boolean))]
    cats.sort()
    return ['All', ...cats]
  }, [products])

  const filteredProducts = useMemo(() => {
    let filtered = products

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => (p.category || 'Uncategorized') === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(p =>
        p.product_name.toLowerCase().includes(query) ||
        (p.item_code && p.item_code.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [products, selectedCategory, searchQuery])

  const billItemQuantityMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of billItems) {
      const id = String(item.product_id)
      map.set(id, (map.get(id) || 0) + item.quantity)
      if (item.item_code) {
        map.set(item.item_code, (map.get(item.item_code) || 0) + item.quantity)
      }
    }
    return map
  }, [billItems])

  const getItemQuantity = (product: Product): number => {
    return billItemQuantityMap.get(String(product.product_id))
      || billItemQuantityMap.get(product.item_code)
      || 0
  }

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    counts.set('All', products.length)
    for (const p of products) {
      const cat = p.category || 'Uncategorized'
      counts.set(cat, (counts.get(cat) || 0) + 1)
    }
    return counts
  }, [products])

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading products...</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      {/* Category Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div
          ref={tabsRef}
          className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300"
          style={{ scrollbarWidth: 'thin' }}
        >
          {categories.map(cat => (
            <button
              type="button"
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap shadow-sm ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-blue-200 dark:shadow-blue-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md'
              }`}
            >
              {cat}
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                selectedCategory === cat
                  ? 'bg-blue-500 text-blue-100'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
              }`}>
                {categoryCounts.get(cat) || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search within cards */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
          />
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="p-3 max-h-[28rem] overflow-y-auto">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm font-medium">No products found</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-blue-500 mt-2 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredProducts.map(product => {
              const inStock = Number(product.quantity) > 0
              const qtyInBill = getItemQuantity(product)
              const isLowStock = Number(product.quantity) > 0 && Number(product.quantity) <= 5

              return (
                <button
                  type="button"
                  key={product.product_id}
                  onClick={() => inStock && onProductTap(product)}
                  disabled={!inStock}
                  className={`relative p-3.5 rounded-xl border-2 text-left transition-all duration-150 ${
                    inStock
                      ? qtyInBill > 0
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-95'
                        : 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg hover:-translate-y-0.5 bg-white dark:bg-gray-800 cursor-pointer active:scale-95'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  {qtyInBill > 0 && (
                    <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-800">
                      {qtyInBill > 99 ? '99+' : qtyInBill}
                    </span>
                  )}

                  {!inStock && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide">
                      OUT
                    </span>
                  )}

                  {isLowStock && (
                    <span className="absolute top-2 right-2 bg-orange-400 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                      LOW
                    </span>
                  )}

                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate capitalize leading-tight mb-1.5">
                    {product.product_name}
                  </p>

                  <p className="text-base font-extrabold text-blue-600 dark:text-blue-400 leading-none">
                    {format(product.rate)}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {product.unit || 'pcs'}
                    </span>
                    <span className={`text-xs font-bold ${
                      isLowStock
                        ? 'text-orange-500'
                        : Number(product.quantity) > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-500'
                    }`}>
                      {Number(product.quantity) > 999 ? '999+' : product.quantity}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(ProductCardGrid)

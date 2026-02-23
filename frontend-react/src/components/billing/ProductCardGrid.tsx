import { useState, useMemo, useRef, memo } from 'react'

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
          className="flex gap-1 px-2 py-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300"
          style={{ scrollbarWidth: 'thin' }}
        >
          {categories.map(cat => (
            <button
              type="button"
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat}
              <span className={`ml-1 text-[10px] ${
                selectedCategory === cat ? 'text-blue-200' : 'text-gray-400'
              }`}>
                {categoryCounts.get(cat) || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search within cards */}
      <div className="px-2 pt-2">
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* Product Cards Grid */}
      <div className="p-2 max-h-64 overflow-y-auto">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No products found</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-blue-500 mt-1 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {filteredProducts.map(product => {
              const inStock = Number(product.quantity) > 0
              const qtyInBill = getItemQuantity(product)

              return (
                <button
                  type="button"
                  key={product.product_id}
                  onClick={() => inStock && onProductTap(product)}
                  disabled={!inStock}
                  className={`relative p-2.5 rounded-lg border-2 text-left transition-all ${
                    inStock
                      ? 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md bg-white dark:bg-gray-800 cursor-pointer active:scale-95'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  {qtyInBill > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                      {qtyInBill}
                    </span>
                  )}

                  {!inStock && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                      OUT
                    </span>
                  )}

                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate capitalize leading-tight">
                    {product.product_name}
                  </p>

                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">
                    ₹{Number(product.rate).toFixed(2)}
                  </p>

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {product.unit || 'pcs'}
                    </span>
                    <span className={`text-[10px] font-medium ${
                      Number(product.quantity) <= 5
                        ? 'text-orange-500'
                        : 'text-gray-400'
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

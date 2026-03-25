
import { createContext, useContext, useState, useCallback, useRef, useMemo, ReactNode } from 'react'
import api from '@/lib/api'

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
}


interface DataContextType {
  products: Product[]
  fetchProducts: (forceRefresh?: boolean) => Promise<Product[]>
  invalidateCache: (key?: 'products') => void
}

const DataContext = createContext<DataContextType | undefined>(undefined)

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000

export function DataProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])

  // Timestamp refs — don't need to be in state (don't drive rendering)
  const fetchTimeRef = useRef<{ products: number | null }>({
    products: null,
  })

  // Keep a live ref for each data array for use inside async callbacks
  const productsRef = useRef<Product[]>(products)
  productsRef.current = products

  // Track ongoing requests to prevent duplicates
  const ongoingRequests = useRef<{
    products: Promise<Product[]> | null
  }>({
    products: null,
  })

  const fetchProducts = useCallback(async (forceRefresh = false): Promise<Product[]> => {
    const now = Date.now()
    const ft = fetchTimeRef.current

    if (!forceRefresh && ft.products && now - ft.products < CACHE_DURATION && productsRef.current.length > 0) {
      return productsRef.current
    }
    if (ongoingRequests.current.products) {
      return ongoingRequests.current.products
    }

    const request = (async () => {
      try {
        const response = await api.get('/stock')
        const data: Product[] = response.data.stock || []
        setProducts(data)
        fetchTimeRef.current.products = Date.now()
        return data
      } catch {
        return productsRef.current.length > 0 ? productsRef.current : []
      } finally {
        ongoingRequests.current.products = null
      }
    })()

    ongoingRequests.current.products = request
    return request
  }, [])

  // Invalidate cache — reset timestamps so next fetch goes to network
  const invalidateCache = useCallback((key?: 'products') => {
    if (key) {
      fetchTimeRef.current[key] = null
    } else {
      fetchTimeRef.current.products = null
    }
  }, [])

  // Memoize context value
  const contextValue = useMemo(() => ({
    products,
    fetchProducts,
    invalidateCache,
  }), [products, fetchProducts, invalidateCache])

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider')
  }
  return context
}


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

interface PaymentType {
  payment_type_id: string
  payment_name: string
}


interface DataContextType {
  products: Product[]
  paymentTypes: PaymentType[]
  fetchProducts: (forceRefresh?: boolean) => Promise<Product[]>
  fetchPaymentTypes: (forceRefresh?: boolean) => Promise<PaymentType[]>
  invalidateCache: (key?: 'products' | 'paymentTypes') => void
}

const DataContext = createContext<DataContextType | undefined>(undefined)

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000

export function DataProvider({ children }: { children: ReactNode }) {
  // Split into two separate states so updating products doesn't re-render paymentType
  // consumers and vice versa (referential equality check works correctly)
  const [products, setProducts] = useState<Product[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])

  // Timestamp refs — don't need to be in state (don't drive rendering)
  const fetchTimeRef = useRef<{ products: number | null; paymentTypes: number | null }>({
    products: null,
    paymentTypes: null,
  })

  // Keep a live ref for each data array for use inside async callbacks
  const productsRef = useRef<Product[]>(products)
  const paymentTypesRef = useRef<PaymentType[]>(paymentTypes)
  productsRef.current = products
  paymentTypesRef.current = paymentTypes

  // Track ongoing requests to prevent duplicates
  const ongoingRequests = useRef<{
    products: Promise<Product[]> | null
    paymentTypes: Promise<PaymentType[]> | null
  }>({
    products: null,
    paymentTypes: null,
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

  const fetchPaymentTypes = useCallback(async (forceRefresh = false): Promise<PaymentType[]> => {
    const now = Date.now()
    const ft = fetchTimeRef.current

    if (!forceRefresh && ft.paymentTypes && now - ft.paymentTypes < CACHE_DURATION && paymentTypesRef.current.length > 0) {
      return paymentTypesRef.current
    }
    if (ongoingRequests.current.paymentTypes) {
      return ongoingRequests.current.paymentTypes
    }

    const request = (async () => {
      try {
        const response = await api.get('/payment/list')
        const data: PaymentType[] = response.data.payment_types || []
        setPaymentTypes(data)
        fetchTimeRef.current.paymentTypes = Date.now()
        return data
      } catch {
        return paymentTypesRef.current.length > 0 ? paymentTypesRef.current : []
      } finally {
        ongoingRequests.current.paymentTypes = null
      }
    })()

    ongoingRequests.current.paymentTypes = request
    return request
  }, [])

  // Invalidate cache — reset timestamps so next fetch goes to network
  const invalidateCache = useCallback((key?: 'products' | 'paymentTypes') => {
    if (key) {
      fetchTimeRef.current[key] = null
    } else {
      fetchTimeRef.current.products = null
      fetchTimeRef.current.paymentTypes = null
    }
  }, [])

  // Memoize context value — products and paymentTypes consumers only re-render
  // when their own state changes, not when the other one updates
  const contextValue = useMemo(() => ({
    products,
    paymentTypes,
    fetchProducts,
    fetchPaymentTypes,
    invalidateCache,
  }), [products, paymentTypes, fetchProducts, fetchPaymentTypes, invalidateCache])

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

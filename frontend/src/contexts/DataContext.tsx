'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
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

interface DataCache {
  products: Product[]
  paymentTypes: PaymentType[]
  lastFetchTime: {
    products: number | null
    paymentTypes: number | null
  }
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
  const [cache, setCache] = useState<DataCache>({
    products: [],
    paymentTypes: [],
    lastFetchTime: {
      products: null,
      paymentTypes: null,
    },
  })

  // Track ongoing requests to prevent duplicates
  const ongoingRequests = useRef<{
    products: Promise<Product[]> | null
    paymentTypes: Promise<PaymentType[]> | null
  }>({
    products: null,
    paymentTypes: null,
  })

  // Fetch products with caching and request deduplication
  const fetchProducts = useCallback(async (forceRefresh = false): Promise<Product[]> => {
    const now = Date.now()

    // Use ref to get current cache state without dependencies
    const currentCache = cache

    // Check if we have valid cached data
    if (!forceRefresh &&
        currentCache.lastFetchTime.products &&
        now - currentCache.lastFetchTime.products < CACHE_DURATION &&
        currentCache.products.length > 0) {
      return currentCache.products
    }

    // If a request is already ongoing, return that promise
    if (ongoingRequests.current.products) {
      return ongoingRequests.current.products
    }

    // Create new request
    const request = (async () => {
      try {
        const response = await api.get('/stock')
        const products = response.data.stock || []

        setCache(prev => ({
          ...prev,
          products,
          lastFetchTime: {
            ...prev.lastFetchTime,
            products: Date.now(),
          },
        }))

        return products
      } catch (error) {
        console.error('Failed to fetch products:', error)
        // Return current cache or empty array
        const fallbackCache = cache
        return fallbackCache.products.length > 0 ? fallbackCache.products : []
      } finally {
        ongoingRequests.current.products = null
      }
    })()

    ongoingRequests.current.products = request
    return request
  }, [cache])

  // Fetch payment types with caching and request deduplication
  const fetchPaymentTypes = useCallback(async (forceRefresh = false): Promise<PaymentType[]> => {
    const now = Date.now()

    // Use ref to get current cache state without dependencies
    const currentCache = cache

    // Check if we have valid cached data
    if (!forceRefresh &&
        currentCache.lastFetchTime.paymentTypes &&
        now - currentCache.lastFetchTime.paymentTypes < CACHE_DURATION &&
        currentCache.paymentTypes.length > 0) {
      return currentCache.paymentTypes
    }

    // If a request is already ongoing, return that promise
    if (ongoingRequests.current.paymentTypes) {
      return ongoingRequests.current.paymentTypes
    }

    // Create new request
    const request = (async () => {
      try {
        const response = await api.get('/payment/list')
        const paymentTypes = response.data.payment_types || []

        setCache(prev => ({
          ...prev,
          paymentTypes,
          lastFetchTime: {
            ...prev.lastFetchTime,
            paymentTypes: Date.now(),
          },
        }))

        return paymentTypes
      } catch (error) {
        console.error('Failed to fetch payment types:', error)
        // Return current cache or empty array
        const fallbackCache = cache
        return fallbackCache.paymentTypes.length > 0 ? fallbackCache.paymentTypes : []
      } finally {
        ongoingRequests.current.paymentTypes = null
      }
    })()

    ongoingRequests.current.paymentTypes = request
    return request
  }, [cache])

  // Invalidate cache manually
  const invalidateCache = useCallback((key?: 'products' | 'paymentTypes') => {
    if (key) {
      setCache(prev => ({
        ...prev,
        lastFetchTime: {
          ...prev.lastFetchTime,
          [key]: null,
        },
      }))
    } else {
      // Invalidate all caches
      setCache(prev => ({
        ...prev,
        lastFetchTime: {
          products: null,
          paymentTypes: null,
        },
      }))
    }
  }, [])

  return (
    <DataContext.Provider
      value={{
        products: cache.products,
        paymentTypes: cache.paymentTypes,
        fetchProducts,
        fetchPaymentTypes,
        invalidateCache,
      }}
    >
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

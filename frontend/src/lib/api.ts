// src/lib/api.ts
import axios, { AxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // PERFORMANCE: Set aggressive timeouts for faster failure detection
  timeout: 30000, // 30 second max (was unlimited)
})

// ==================== REQUEST CACHE FOR PERFORMANCE ====================
// Cache GET requests for frequently accessed data
interface CacheEntry {
  data: any
  timestamp: number
  ttl: number
}

const requestCache = new Map<string, CacheEntry>()

// Cache TTLs in milliseconds - OPTIMIZED: aligned with backend cache durations
// Frontend cache should be slightly shorter than backend to avoid stale data
const CACHE_TTLS: Record<string, number> = {
  '/stock': 240000,          // 4 min (backend: 5 min) - stock list
  '/stock/lookup': 120000,   // 2 min - product lookups
  '/customer/search': 60000, // 1 min - customer search results
  '/payment': 300000,        // 5 min - payment types rarely change
  '/billing/printers': 120000, // 2 min - printer list
  '/billing/list': 240000    // 4 min - billing list (aligned with stock)
}

// Get cache TTL based on URL pattern
function getCacheTTL(url: string): number {
  for (const [pattern, ttl] of Object.entries(CACHE_TTLS)) {
    if (url.includes(pattern)) return ttl
  }
  return 0 // No caching by default
}

// Get from cache if valid
function getFromCache(url: string): any | null {
  const entry = requestCache.get(url)
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    return entry.data
  }
  // Expired - remove it
  if (entry) requestCache.delete(url)
  return null
}

// Save to cache
function saveToCache(url: string, data: any, ttl: number): void {
  if (ttl > 0) {
    requestCache.set(url, { data, timestamp: Date.now(), ttl })
  }
}

// Clear cache for a pattern (call after mutations)
export function invalidateCache(pattern?: string): void {
  if (pattern) {
    for (const key of requestCache.keys()) {
      if (key.includes(pattern)) {
        requestCache.delete(key)
      }
    }
  } else {
    requestCache.clear()
  }
}

// ==================== END REQUEST CACHE ====================

// Loading state management
let showLoadingFn: ((message?: string) => void) | null = null
let hideLoadingFn: (() => void) | null = null
let activeRequests = 0
let loadingTimeout: NodeJS.Timeout | null = null
const LOADING_DELAY = 100 // Only show loading after 100ms delay (optimized from 300ms)

// Function to set loading handlers from React context
export function setLoadingHandlers(
  showLoading: (message?: string) => void,
  hideLoading: () => void
) {
  showLoadingFn = showLoading
  hideLoadingFn = hideLoading
}

// Extend AxiosRequestConfig to support showLoading option
declare module 'axios' {
  export interface AxiosRequestConfig {
    showLoading?: boolean  // Opt-in: set to true to show global loading
    loadingMessage?: string
  }
}

// Add request interceptor to include token and show loading
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // For FormData, remove Content-Type to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    // Show loading indicator only if showLoading is explicitly true
    if (config.showLoading && showLoadingFn) {
      const loadingFn = showLoadingFn // Capture for closure
      activeRequests++
      if (activeRequests === 1) {
        // Delay showing the loading to prevent flicker on fast requests
        loadingTimeout = setTimeout(() => {
          if (activeRequests > 0 && loadingFn) {
            loadingFn(config.loadingMessage)
          }
        }, LOADING_DELAY)
      }
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Helper function to hide loading
const decrementLoading = (config: AxiosRequestConfig | undefined) => {
  if (config && config.showLoading && hideLoadingFn) {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) {
      // Clear timeout if request finished before delay
      if (loadingTimeout) {
        clearTimeout(loadingTimeout)
        loadingTimeout = null
      }
      hideLoadingFn()
    }
  }
}

// Logout handler - will be set by ClientContext
let logoutHandlerFn: (() => void) | null = null

export function setLogoutHandler(handler: () => void) {
  logoutHandlerFn = handler
}

// Add response interceptor to handle token expiration, caching, and hide loading
api.interceptors.response.use(
  (response) => {
    decrementLoading(response.config)

    // Cache successful GET responses
    if (response.config.method === 'get' && response.config.url) {
      const url = response.config.url
      const ttl = getCacheTTL(url)
      if (ttl > 0) {
        saveToCache(url, response.data, ttl)
      }
    }

    return response
  },
  (error) => {
    decrementLoading(error.config)

    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('client')

      // Clear axios header
      delete api.defaults.headers.common['Authorization']

      // Only redirect if not already on login page
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/login')) {
        // Use logout handler if available (proper React state cleanup)
        if (logoutHandlerFn) {
          logoutHandlerFn()
        } else {
          // Fallback to direct redirect
          window.location.href = '/auth/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// ==================== OPTIMIZED CACHED API METHODS ====================
// Use these for frequently accessed read-only data

// Cached GET - returns from cache if available, otherwise fetches
// Includes error handling for corrupted cache entries
export async function cachedGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
  try {
    const cached = getFromCache(url)
    if (cached) {
      return { data: cached as T }
    }
  } catch (error) {
    // Cache read failed (corrupted data) - invalidate and fetch fresh
    console.warn(`[API Cache] Read failed for ${url}, fetching fresh`)
    invalidateCache(url)
  }
  return api.get<T>(url, config)
}

// Force invalidate and refetch
export async function invalidateAndGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
  invalidateCache(url)
  return api.get<T>(url, config)
}

// ==================== END OPTIMIZED API METHODS ====================

export default api

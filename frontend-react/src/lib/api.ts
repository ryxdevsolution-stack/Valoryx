// src/lib/api.ts
import axios, { AxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5017/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // PERFORMANCE: Set aggressive timeouts for faster failure detection
  timeout: 30000, // 30 second max (was unlimited)
})

// ==================== API PERFORMANCE STORE ====================
// Module-level store — no React state, zero re-renders. Subscribe via useApiPerformance hook.

export interface ApiTimingEntry {
  url: string
  method: string
  /** Total round-trip time measured by the browser (ms) */
  durationMs: number
  /** Server-side processing time from X-Response-Time header (ms), if available */
  serverMs: number | null
  /** HTTP status code */
  status: number
  /** Whether served from frontend cache */
  fromCache: boolean
  timestamp: number
}

const MAX_TIMING_ENTRIES = 50

const _timingStore: ApiTimingEntry[] = []
const _timingListeners = new Set<() => void>()

export function getApiTimings(): readonly ApiTimingEntry[] {
  return _timingStore
}

export function subscribeToApiTimings(listener: () => void): () => void {
  _timingListeners.add(listener)
  return () => _timingListeners.delete(listener)
}

function _recordTiming(entry: ApiTimingEntry): void {
  _timingStore.unshift(entry) // newest first
  if (_timingStore.length > MAX_TIMING_ENTRIES) {
    _timingStore.pop()
  }
  _timingListeners.forEach(fn => fn())
}
// ==================== END PERFORMANCE STORE ====================

// ==================== REQUEST CACHE FOR PERFORMANCE ====================
// Cache GET requests for frequently accessed data
interface CacheEntry {
  data: any
  timestamp: number
  ttl: number
}

const requestCache = new Map<string, CacheEntry>()

// In-flight request deduplication — prevents simultaneous identical GET requests
const inflightRequests = new Map<string, Promise<any>>()

// Cache TTLs in milliseconds - OPTIMIZED: aligned with backend cache durations
// Frontend cache should be slightly shorter than backend to avoid stale data
const CACHE_TTLS: Record<string, number> = {
  '/stock/lookup': 120000,   // 2 min - product lookups
  '/customer/search': 60000, // 1 min - customer search results
  '/billing/printers': 120000, // 2 min - printer list
  '/billing/list': 240000,   // 4 min - billing list (aligned with stock)
  '/subscription/plans': 300000, // 5 min - plans rarely change
}

// Get cache TTL based on URL pattern
function getCacheTTL(url: string): number {
  for (const [pattern, ttl] of Object.entries(CACHE_TTLS)) {
    if (url.includes(pattern)) return ttl
  }
  return 0 // No caching by default
}

// Build a cache key that includes query params, so /billing/list?from=A&to=B
// and /billing/list?from=C&to=D don't collide. Sorted to be order-stable.
function buildCacheKey(url: string, params?: Record<string, any>): string {
  if (!params) return url
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return url
  const qs = entries.map(([k, v]) => `${k}=${v}`).join('&')
  return `${url}?${qs}`
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
let loadingTimeout: ReturnType<typeof setTimeout> | null = null
const LOADING_DELAY = 100 // Only show loading after 100ms delay (optimized from 300ms)

// Function to set loading handlers from React context
export function setLoadingHandlers(
  showLoading: (message?: string) => void,
  hideLoading: () => void
) {
  showLoadingFn = showLoading
  hideLoadingFn = hideLoading
}

// Extend AxiosRequestConfig to support showLoading + timing metadata
declare module 'axios' {
  export interface AxiosRequestConfig {
    showLoading?: boolean  // Opt-in: set to true to show global loading
    loadingMessage?: string
    /** Internal: request start time for measuring round-trip duration */
    _startTime?: number
    /** Internal: whether this response was served from frontend cache */
    _fromCache?: boolean
  }
}

// Add request interceptor to include token, record start time, and show loading
api.interceptors.request.use(
  (config) => {
    // Record start time for round-trip timing
    config._startTime = Date.now()

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

// Add response interceptor to handle token expiration, caching, timing, and hide loading
api.interceptors.response.use(
  (response) => {
    decrementLoading(response.config)

    // --- Record API timing ---
    const startTime = response.config._startTime
    if (startTime) {
      const durationMs = Date.now() - startTime
      const serverTimeHeader = response.headers['x-response-time']
      const serverMs = serverTimeHeader ? parseFloat(serverTimeHeader) : null
      const entry: ApiTimingEntry = {
        url: response.config.url || '',
        method: (response.config.method || 'GET').toUpperCase(),
        durationMs,
        serverMs,
        status: response.status,
        fromCache: response.config._fromCache ?? false,
        timestamp: Date.now(),
      }
      _recordTiming(entry)
      if (import.meta.env.DEV) {
        const serverLabel = serverMs !== null ? ` (server: ${serverMs}ms)` : ''
        console.debug(
          `%c[API] ${entry.method} ${entry.url} → ${entry.status} — ${durationMs}ms${serverLabel}`,
          'color: #4ade80; font-weight: 500'
        )
      }
    }

    // Cache successful GET responses
    if (response.config.method === 'get' && response.config.url) {
      const url = response.config.url
      const ttl = getCacheTTL(url)
      if (ttl > 0) {
        saveToCache(buildCacheKey(url, response.config.params), response.data, ttl)
      }
    }

    return response
  },
  (error) => {
    // Record timing for failed requests too
    const startTime = error.config?._startTime
    if (startTime) {
      const durationMs = Date.now() - startTime
      const entry: ApiTimingEntry = {
        url: error.config?.url || '',
        method: (error.config?.method || 'GET').toUpperCase(),
        durationMs,
        serverMs: null,
        status: error.response?.status ?? 0,
        fromCache: false,
        timestamp: Date.now(),
      }
      _recordTiming(entry)
      if (import.meta.env.DEV) {
        console.debug(
          `%c[API] ${entry.method} ${entry.url} → ${entry.status || 'ERR'} — ${durationMs}ms`,
          'color: #f87171; font-weight: 500'
        )
      }
    }

    decrementLoading(error.config)

    if (error.response?.status === 403 && error.response?.data?.code === 'TRIAL_EXPIRED') {
      // Don't redirect if already on upgrade page or if this is a subscription API call
      const isOnUpgrade = window.location.href.includes('/upgrade') || window.location.href.includes('/pricing')
      const isSubscriptionCall = error.config?.url?.includes('/subscription/')
      if (typeof window !== 'undefined' && !isOnUpgrade && !isSubscriptionCall) {
        const isElectron = !!(window as any).electronAPI?.isElectron
        if (isElectron) {
          window.location.hash = '/upgrade'
        } else {
          window.location.href = '/upgrade'
        }
      }
      return Promise.reject(error)
    }

    if (error.response?.status === 401) {
      // Token expired or invalid
      // Clear auth keys only — billing draft stays so user sees it on next login
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('client')

      // Clear axios header
      delete api.defaults.headers.common['Authorization']

      // Only redirect if not already on login page
      if (typeof window !== 'undefined' && !window.location.href.includes('/auth/login')) {
        // Use logout handler if available (proper React state cleanup)
        if (logoutHandlerFn) {
          logoutHandlerFn()
        } else {
          // Fallback to direct redirect
          const isElectron = !!(window as any).electronAPI?.isElectron
          window.location.href = isElectron ? '#/auth/login' : '/auth/login'
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
      // Record cache-hit timing (0ms round-trip)
      const entry: ApiTimingEntry = {
        url,
        method: 'GET',
        durationMs: 0,
        serverMs: null,
        status: 200,
        fromCache: true,
        timestamp: Date.now(),
      }
      _recordTiming(entry)
      if (import.meta.env.DEV) {
        console.debug(`%c[API] GET ${url} → 200 — 0ms (cache hit)`, 'color: #a78bfa; font-weight: 500')
      }
      return { data: cached as T }
    }
  } catch (error) {
    // Cache read failed (corrupted data) - invalidate and fetch fresh
    console.warn(`[API Cache] Read failed for ${url}, fetching fresh`)
    invalidateCache(url)
  }
  return api.get<T>(url, { ...config, _fromCache: false })
}

// Force invalidate and refetch
export async function invalidateAndGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
  invalidateCache(url)
  return api.get<T>(url, config)
}

// ==================== END OPTIMIZED API METHODS ====================

// ==================== SMART GET WITH DEDUP ====================
// Wraps api.get to check cache first AND deduplicate in-flight requests.
// For cacheable URLs (those with a TTL), simultaneous calls share one network request.
const originalGet = api.get.bind(api)
api.get = function smartGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<any> {
  const ttl = getCacheTTL(url)
  if (ttl <= 0) return originalGet<T>(url, config)

  const cacheKey = buildCacheKey(url, config?.params)

  // 1. Serve from cache if fresh
  const cached = getFromCache(cacheKey)
  if (cached) {
    return Promise.resolve({ data: cached, status: 200, statusText: 'OK', headers: {}, config: { ...config, _fromCache: true } })
  }

  // 2. Deduplicate in-flight requests for the same URL+params
  const inflight = inflightRequests.get(cacheKey)
  if (inflight) return inflight

  const request = originalGet<T>(url, config).then((response: any) => {
    saveToCache(cacheKey, response.data, ttl)
    inflightRequests.delete(cacheKey)
    return response
  }).catch((err: any) => {
    inflightRequests.delete(cacheKey)
    throw err
  })

  inflightRequests.set(cacheKey, request)
  return request
} as typeof api.get

// ==================== END SMART GET ====================

export default api

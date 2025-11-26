// src/lib/api.ts
import axios, { AxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Loading state management
let showLoadingFn: ((message?: string) => void) | null = null
let hideLoadingFn: (() => void) | null = null
let activeRequests = 0
let loadingTimeout: NodeJS.Timeout | null = null
const LOADING_DELAY = 300 // Only show loading after 300ms delay

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

// Add response interceptor to handle token expiration and hide loading
api.interceptors.response.use(
  (response) => {
    decrementLoading(response.config)
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

export default api

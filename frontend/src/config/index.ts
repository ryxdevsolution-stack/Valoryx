
/**
 * RYX Billing - Centralized Frontend Configuration
 * Single source of truth for all configuration values
 *
 * IMPORTANT: This file should be the ONLY place where environment
 * variables are accessed. All other files should import from here.
 */

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

export const IS_BROWSER = typeof window !== 'undefined';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * Get API URL from environment or default to localhost
 * In production, NEXT_PUBLIC_API_URL must be set
 */
function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  if (envUrl) {
    // Remove trailing slash if present
    return envUrl.replace(/\/$/, '');
  }

  // Development default
  if (IS_DEVELOPMENT) {
    return 'http://localhost:5000';
  }

  // Production without env var - this is a configuration error
  // but we handle gracefully with a warning
  if (IS_BROWSER) {
    console.warn(
      '[Config] NEXT_PUBLIC_API_URL is not set. Using default localhost URL. ' +
      'This should be set in production.'
    );
  }

  return 'http://localhost:5000';
}

export const API_URL = getApiUrl();
export const API_BASE_URL = `${API_URL}/api`;

// ============================================================================
// APP CONFIGURATION
// ============================================================================

export const APP_CONFIG = {
  name: 'RYX Billing',
  version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  supportEmail: 'support@ryxbilling.com',
} as const;

// ============================================================================
// PAGINATION DEFAULTS
// ============================================================================

export const PAGINATION = {
  defaultPageSize: 50,
  maxPageSize: 200,
  pageSizeOptions: [10, 25, 50, 100, 200],
} as const;

// ============================================================================
// TIMEOUTS & DELAYS
// ============================================================================

export const TIMEOUTS = {
  /** Delay before showing loading indicator (ms) */
  loadingDelay: 300,
  /** API request timeout (ms) */
  requestTimeout: 30000,
  /** Debounce delay for search inputs (ms) */
  searchDebounce: 300,
  /** Toast notification auto-dismiss (ms) */
  toastDuration: 5000,
} as const;

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
  token: 'token',
  user: 'user',
  client: 'client',
  theme: 'theme',
  sidebarCollapsed: 'sidebar-collapsed',
} as const;

// ============================================================================
// VALIDATION LIMITS
// ============================================================================

export const VALIDATION = {
  /** Maximum file upload size (bytes) */
  maxFileSize: 10 * 1024 * 1024, // 10MB
  /** Allowed file extensions for stock import */
  allowedImportExtensions: ['csv', 'xlsx', 'xls'],
  /** Phone number regex pattern */
  phonePattern: /^(\+\d{10,15}|\d{10})$/,
  /** Email regex pattern */
  emailPattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  /** GSTIN regex pattern */
  gstinPattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
} as const;

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export const FEATURES = {
  /** Enable/disable thermal printing */
  thermalPrinting: true,
  /** Enable/disable barcode scanning */
  barcodeScanning: true,
  /** Enable/disable bulk import/export */
  bulkOperations: true,
  /** Enable/disable analytics dashboard */
  analytics: true,
} as const;

// ============================================================================
// BILLING CONFIGURATION
// ============================================================================

export const BILLING_CONFIG = {
  /** Default GST percentages available */
  gstRates: [0, 5, 12, 18, 28],
  /** Default unit options */
  units: ['pcs', 'kg', 'g', 'L', 'mL', 'box', 'pack', 'set'],
  /** Default payment types */
  paymentMethods: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'],
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

const config = {
  API_URL,
  API_BASE_URL,
  APP_CONFIG,
  PAGINATION,
  TIMEOUTS,
  STORAGE_KEYS,
  VALIDATION,
  FEATURES,
  BILLING_CONFIG,
  IS_BROWSER,
  IS_PRODUCTION,
  IS_DEVELOPMENT,
} as const;

export default config;

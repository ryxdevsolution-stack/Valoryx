/**
 * RYX Billing - Types Export
 * Central export for all TypeScript type definitions
 */

// Billing types
export * from './billing';

// Stock/Product types
export * from './stock';

// Customer types
export * from './customer';

// User/Auth types
export * from './user';

// ============================================================================
// COMMON API TYPES
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// COMMON ENTITY TYPES
// ============================================================================

export interface BaseEntity {
  created_at: string;
  updated_at?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface FilterConfig {
  [key: string]: string | number | boolean | undefined;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface RevenueStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  growth: number;
}

export interface BillStats {
  totalGST: number;
  totalNonGST: number;
  todayCount: number;
  avgBillValue: number;
}

export interface ProductPerformance {
  product_name: string;
  quantity_sold: number;
  revenue: number;
  category: string;
}

export interface DashboardAnalytics {
  revenue: RevenueStats;
  bills: BillStats;
  products: {
    topSelling: ProductPerformance[];
    lowPerforming: ProductPerformance[];
    trending: { product_name: string; growth_rate: number; category: string }[];
    topProductsFiltered: ProductPerformance[];
    performanceTiers: {
      mostSelling: { name: string; quantity: number }[];
      lessSelling: { name: string; quantity: number }[];
      nonSelling: { name: string; quantity: number }[];
    };
  };
  inventory: {
    lowStock: Product[];
    totalValue: number;
    criticalCount: number;
  };
  insights: {
    peakHours: { hour: number; sales: number; count: number }[];
    paymentPreferences: { method: string; count: number; amount: number }[];
    categoryPerformance: { category: string; revenue: number; items_sold: number }[];
    revenueTrend: { date: string; revenue: number; bills: number }[];
    topCustomers: { name: string; total_spend: number; visit_count: number; avg_spend: number }[];
    profitMargin: number;
    totalProfit: number;
  };
}

// Import Product from stock for the analytics type
import type { Product } from './stock';

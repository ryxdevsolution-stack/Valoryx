/**
 * Valoryx - Stock/Product Types
 * Type definitions for inventory and stock management
 */

// ============================================================================
// PRODUCT / STOCK ENTRY
// ============================================================================

export interface Product {
  product_id: string;
  client_id: string;
  product_name: string;
  category: string;
  quantity: number;
  rate: number;
  cost_price?: number;
  mrp?: number;
  pricing?: number;
  unit: string;
  low_stock_alert: number;
  item_code?: string;
  barcode?: string;
  gst_percentage: number;
  hsn_code?: string;
  // Optional percentage discounts (v25)
  purchase_discount_percentage?: number;  // supplier discount; profit calc only
  selling_discount_percentage?: number;   // customer discount; auto-applies on the bill line
  // Apparel hang-tag / Legal Metrology fields
  brand_name?: string;
  size_variant?: string;
  colour?: string;
  country_of_origin?: string;
  manufacture_date?: string;  // YYYY-MM
  importer_name?: string;
  importer_address?: string;
  consumer_care_phone?: string;
  consumer_care_email?: string;
  created_at: string;
  updated_at?: string;
}

// Alias for backward compatibility
export type StockEntry = Product;

// ============================================================================
// PRODUCT CREATION/UPDATE
// ============================================================================

export interface CreateProductRequest {
  product_name: string;
  category?: string;
  quantity: number;
  rate: number;
  cost_price?: number;
  mrp?: number;
  pricing?: number;
  unit?: string;
  low_stock_alert?: number;
  item_code?: string;
  barcode?: string;
  gst_percentage?: number;
  hsn_code?: string;
  purchase_discount_percentage?: number;
  selling_discount_percentage?: number;
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {
  product_id?: string;
}

export interface ProductResponse {
  success: boolean;
  product_id: string;
  message: string;
  product: Product;
}

// ============================================================================
// STOCK LIST
// ============================================================================

export interface StockListResponse {
  success: boolean;
  stock: Product[];
}

// ============================================================================
// LOW STOCK ALERTS
// ============================================================================

export interface LowStockAlert {
  product_id: string;
  product_name: string;
  current_quantity: number;
  alert_threshold: number;
  unit: string;
}

export interface LowStockAlertResponse {
  success: boolean;
  alerts: LowStockAlert[];
  low_stock_products: Product[];
  alert_count: number;
}

// ============================================================================
// BULK IMPORT/EXPORT
// ============================================================================

export interface BulkImportResult {
  success: boolean;
  message: string;
  summary: {
    total_rows: number;
    success_count: number;
    created_count: number;
    updated_count: number;
    error_count: number;
    errors: string[];
  };
}

// ============================================================================
// PRODUCT LOOKUP
// ============================================================================

export interface ProductLookupResponse {
  success: boolean;
  product: Product;
  stock_status: 'available' | 'low_stock' | 'out_of_stock';
  available_quantity: number;
}

// ============================================================================
// CATEGORY
// ============================================================================

export interface Category {
  name: string;
  count: number;
}

// ============================================================================
// PRODUCT FOR BILLING
// ============================================================================

export interface ProductForBilling {
  product_id: string;
  product_name: string;
  item_code?: string;
  hsn_code?: string;
  rate: number;
  mrp?: number;
  quantity: number;
  unit: string;
  gst_percentage: number;
  category?: string;
}

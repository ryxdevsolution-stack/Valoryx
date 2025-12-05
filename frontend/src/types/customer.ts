/**
 * RYX Billing - Customer Types
 * Type definitions for customer management
 */

// ============================================================================
// CUSTOMER
// ============================================================================

export interface Customer {
  customer_id: string;
  client_id: string;
  customer_code: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address?: string;
  customer_gstin?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  notes?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at?: string;
}

// ============================================================================
// CUSTOMER FROM BILLING (Aggregated)
// ============================================================================

export interface CustomerFromBilling {
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  customer_code?: number;
  total_bills: number;
  total_amount: number;
  gst_bills: number;
  non_gst_bills: number;
  last_purchase?: string;
  first_purchase?: string;
  status: 'Active' | 'Inactive';
  is_walkin?: boolean;
  bill_number?: number;
}

// ============================================================================
// CUSTOMER LIST
// ============================================================================

export interface CustomerListResponse {
  success: boolean;
  customers: CustomerFromBilling[];
  statistics: {
    total_customers: number;
    active_customers: number;
    inactive_customers: number;
    total_revenue: number;
    top_customer: CustomerFromBilling | null;
  };
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// ============================================================================
// CUSTOMER DETAILS
// ============================================================================

export interface CustomerBillSummary {
  bill_id: string;
  bill_number: number;
  type: 'GST' | 'Non-GST';
  amount: number;
  created_at: string;
  payment_type: string;
}

export interface CustomerDetailsResponse {
  success: boolean;
  customer: {
    customer_name: string;
    customer_phone: string;
    customer_email?: string;
    customer_address?: string;
    customer_gstin?: string;
  };
  bills: CustomerBillSummary[];
  statistics: {
    total_bills: number;
    total_spent: number;
    average_bill_value: number;
    gst_bills_count: number;
    non_gst_bills_count: number;
  };
}

// ============================================================================
// CUSTOMER CREATION
// ============================================================================

export interface CreateCustomerRequest {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address?: string;
  customer_gstin?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  notes?: string;
}

export interface CustomerResponse {
  success: boolean;
  customer: Customer;
  message: string;
}

// ============================================================================
// CUSTOMER SEARCH
// ============================================================================

export interface CustomerSearchResponse {
  success: boolean;
  customers: Customer[];
}

// ============================================================================
// NEXT CUSTOMER CODE
// ============================================================================

export interface NextCustomerCodeResponse {
  success: boolean;
  next_code: number;
}

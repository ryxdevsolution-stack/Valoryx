/**
 * RYX Billing - Billing Types
 * Type definitions for billing-related entities
 */

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export interface PaymentSplit {
  payment_type_id: string;
  payment_name: string;
  amount: number;
}

export type PaymentType = PaymentSplit[];

// ============================================================================
// BILLING ITEMS
// ============================================================================

export interface BillItem {
  product_id: string;
  product_name: string;
  item_code?: string;
  hsn_code?: string;
  unit: string;
  quantity: number;
  rate: number;
  mrp?: number;
  gst_percentage: number;
  gst_amount: number;
  amount: number;
  category?: string;
}

// ============================================================================
// GST BILL
// ============================================================================

export interface GSTBill {
  bill_id: string;
  client_id: string;
  bill_number: number;
  customer_name: string;
  customer_phone?: string;
  customer_gstin?: string;
  items: BillItem[];
  subtotal: number;
  gst_percentage: number;
  gst_amount: number;
  final_amount: number;
  discount_percentage?: number;
  discount_amount?: number;
  payment_type: string;
  amount_received?: number;
  status: 'draft' | 'final' | 'cancelled';
  created_by: string;
  created_at: string;
  updated_at?: string;
  type: 'gst';
}

// ============================================================================
// NON-GST BILL
// ============================================================================

export interface NonGSTBill {
  bill_id: string;
  client_id: string;
  bill_number: number;
  customer_name: string;
  customer_phone?: string;
  customer_gstin?: string;
  items: BillItem[];
  total_amount: number;
  discount_percentage?: number;
  discount_amount?: number;
  payment_type: string;
  amount_received?: number;
  status: 'draft' | 'final' | 'cancelled';
  created_by: string;
  created_at: string;
  updated_at?: string;
  type: 'non-gst';
}

// Union type for any bill
export type Bill = GSTBill | NonGSTBill;

// ============================================================================
// BILL CREATION
// ============================================================================

export interface CreateBillRequest {
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  items: Partial<BillItem>[];
  payment_type: string;
  discount_percentage?: number;
  amount_received?: number;
}

export interface CreateBillResponse {
  success: boolean;
  bill_id: string;
  bill_number: number;
  bill_type: 'GST' | 'Non-GST';
  subtotal?: number;
  gst_amount?: number;
  final_amount?: number;
  total_amount?: number;
  message: string;
  bill: PrintableBill;
}

// ============================================================================
// PRINTABLE BILL
// ============================================================================

export interface PrintableBill {
  bill_number: number;
  customer_name: string;
  customer_phone?: string;
  items: BillItem[];
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  gst_amount: number;
  final_amount: number;
  total_amount: number;
  payment_type: string;
  created_at: string;
  type: 'gst' | 'non-gst';
  cgst: number;
  sgst: number;
  igst: number;
  user_name: string;
}

// ============================================================================
// BILL LIST
// ============================================================================

export interface BillListItem {
  bill_id: string;
  bill_number: number;
  customer_name: string;
  customer_phone?: string;
  final_amount?: number;
  total_amount?: number;
  status: string;
  created_at: string;
  type: 'gst' | 'non-gst';
}

export interface BillListResponse {
  success: boolean;
  bills: BillListItem[];
  pagination: {
    page: number;
    limit: number;
    total_records: number;
    total_pages: number;
  };
}

// ============================================================================
// EXCHANGE BILL
// ============================================================================

export interface ExchangeBillRequest {
  returned_items: BillItem[];
  new_items: BillItem[];
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  payment_type: string;
  amount_received?: number;
  discount_percentage?: number;
}

export interface ExchangeBillResponse {
  success: boolean;
  message: string;
  bill_id: string;
  bill_number: number;
  returned_amount: number;
  new_amount: number;
  difference: number;
}

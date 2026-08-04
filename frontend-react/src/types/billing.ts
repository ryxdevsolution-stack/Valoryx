/**
 * Valoryx - Billing Types
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
  // Per-line customer discount % (v25); pre-filled from the product's selling_discount_percentage,
  // editable per bill. Applied off the rate, before GST.
  discount_percentage?: number;
}

// ============================================================================
// GST BILL
// ============================================================================

export interface GSTBill {
  bill_id: string;
  client_id: string;
  bill_number: number;
  bill_prefix?: string | null;
  bill_no_display?: string | null;
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
  negotiable_amount?: number;
  payment_type: string;
  amount_received?: number;
  status: 'draft' | 'final' | 'cancelled';
  payment_status: 'paid' | 'pending' | 'partial';
  /** How much the customer has paid so far (v42). Balance = total - paid. */
  paid_amount?: number | string;
  balance_due?: number | string;
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
  bill_prefix?: string | null;
  bill_no_display?: string | null;
  customer_name: string;
  customer_phone?: string;
  customer_gstin?: string;
  items: BillItem[];
  total_amount: number;
  discount_percentage?: number;
  discount_amount?: number;
  negotiable_amount?: number;
  payment_type: string;
  amount_received?: number;
  status: 'draft' | 'final' | 'cancelled';
  payment_status: 'paid' | 'pending' | 'partial';
  /** How much the customer has paid so far (v42). Balance = total - paid. */
  paid_amount?: number | string;
  balance_due?: number | string;
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
  negotiable_amount?: number;
  amount_received?: number;
}

export interface CreateBillResponse {
  success: boolean;
  bill_id: string;
  bill_number: number;
  bill_prefix?: string | null;
  bill_no_display?: string | null;
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
  bill_prefix?: string | null;
  bill_no_display?: string | null;
  customer_name: string;
  customer_phone?: string;
  customer_gstin?: string;
  items: BillItem[];
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  negotiable_amount?: number;
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
  payment_status?: 'paid' | 'pending' | 'partial';
  /** v42 partial payment — drives the Paid/Balance lines on receipts. */
  paid_amount?: number | string;
  balance_due?: number | string;
  /** Instalments received against this bill, oldest first. Rendered as a
   *  Payment History section on the A4 PDF (omitted on the thermal receipt —
   *  58mm has no room). */
  payments?: {
    payment_id?: string;
    amount: number | string;
    payment_method?: string | null;
    payment_date?: string | null;
  }[];
  points_earned?: number;
  /** Per-bill regional currency, frozen at create time. */
  currency_code?: string;
  currency_symbol?: string;
  locale?: string;
  /** Tax components for this bill, e.g. [{name:'CGST',amount}, {name:'SGST',amount}]. */
  tax_breakdown?: { name: string; amount: number }[];
  /** ₹ knocked off this bill by membership point redemption. */
  membership_redeemed?: number | null;
  /** Membership receipt block (card number, earn/redeem, balance). */
  membership?: {
    card_number: string;
    points_earned: number;
    points_redeemed: number;
    redeemed_amount: number;
    points_balance: number;
  } | null;
}

// ============================================================================
// BILL LIST
// ============================================================================

export interface BillListItem {
  bill_id: string;
  bill_number: number;
  bill_prefix?: string | null;
  bill_no_display?: string | null;
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
  negotiable_amount?: number;
}

export interface ExchangeBillResponse {
  success: boolean;
  message: string;
  bill_id: string;
  bill_number: number;
  bill_prefix?: string | null;
  bill_no_display?: string | null;
  returned_amount: number;
  new_amount: number;
  difference: number;
}

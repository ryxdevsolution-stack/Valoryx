/**
 * Exchange inside Create Bill.
 *
 * Clicking Exchange on a bill opens Create Bill with `?exchange=<billId>`. The bill is
 * loaded into its own tab; the cashier lowers quantities / removes lines (returns) and
 * adds products (new items). On save we send the bill as it should end up
 * (`final_items`) — the server works out stock, totals and the payment ledger.
 */
import api from '@/lib/api'

export interface ExchangeInfo {
  billId: string
  billNumber: number
  /** Printed form, e.g. "R-34" (prefix + number). */
  billLabel: string
  isGst: boolean
  /** What the customer had already paid before this exchange. */
  alreadyPaid: number
  originalTotal: number
  /** Where a refund is paid from when the new bill is cheaper. */
  refundMethod: string
  /** Server revision when loaded — a stale tab is refused (409) instead of overwriting. */
  version: string
  /** ₹ of membership points redeemed on the bill; stays as money off. */
  redeemedValue: number
  /** Quantity per product on the saved bill — only the EXTRA needs stock. */
  originalQty: Record<string, number>
}

/** Item shape shared with Create Bill's BillItem (only the fields we fill). */
export interface ExchangeLine {
  product_id: string
  product_name: string
  item_code: string
  hsn_code: string
  unit: string
  quantity: number
  rate: number
  gst_percentage: number
  gst_amount: number
  amount: number
  mrp?: number
  discount_percentage?: number
}

export interface LoadedExchange {
  exchange: ExchangeInfo
  items: ExchangeLine[]
  customer_name: string
  customer_phone: string
  customer_gstin: string
  discountPercentage: number
  negotiableAmount: number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Fetch a saved bill and shape it for an exchange tab. Throws a user-facing message. */
export async function loadBillForExchange(billId: string): Promise<LoadedExchange> {
  const res = await api.get(`/billing/${billId}`, { params: { exchange: 1 } })
  const bill = res.data?.bill
  if (!bill) throw new Error('Bill not found')
  if (bill.status === 'cancelled') throw new Error('A cancelled bill cannot be exchanged')

  const isGst = bill.type === 'gst'
  const total = num(isGst ? bill.final_amount : bill.total_amount)
  // paid_amount is NULL on pre-v42 bills: unpaid only if explicitly pending.
  const alreadyPaid = bill.paid_amount != null
    ? num(bill.paid_amount)
    : bill.payment_status === 'pending' ? 0 : total

  const items: ExchangeLine[] = (bill.items || []).map((it: Record<string, unknown>) => ({
    product_id: String(it.product_id ?? ''),
    product_name: String(it.product_name ?? ''),
    item_code: String(it.item_code ?? ''),
    hsn_code: String(it.hsn_code ?? ''),
    unit: String(it.unit ?? 'pcs'),
    quantity: num(it.quantity),
    rate: num(it.rate),
    gst_percentage: isGst ? num(it.gst_percentage) : 0,
    gst_amount: isGst ? num(it.gst_amount) : 0,
    amount: num(it.amount),
    mrp: it.mrp != null ? num(it.mrp) : undefined,
    discount_percentage: num(it.discount_percentage),
  }))

  const prefix = bill.bill_prefix ? `${bill.bill_prefix}-` : ''
  return {
    exchange: {
      billId,
      billNumber: num(bill.bill_number),
      billLabel: bill.bill_no_display || `${prefix}${bill.bill_number}`,
      isGst,
      alreadyPaid,
      originalTotal: total,
      refundMethod: 'Cash',
      version: String(bill.version ?? ''),
      redeemedValue: num(bill.membership_redeemed),
      originalQty: items.reduce<Record<string, number>>((acc, i) => {
        acc[i.product_id] = (acc[i.product_id] || 0) + i.quantity
        return acc
      }, {}),
    },
    items,
    // The default 'Walk-In Customer' isn't a real name — loading it would make Phone required.
    customer_name: /^walk-?in customer$/i.test(bill.customer_name || '') ? '' : (bill.customer_name || ''),
    customer_phone: bill.customer_phone || '',
    customer_gstin: bill.customer_gstin || '',
    discountPercentage: num(bill.discount_percentage),
    negotiableAmount: num(bill.negotiable_amount),
  }
}

/** > 0: customer pays this much more. < 0: refund this much. Rounded to paise. */
export function exchangeDifference(newTotal: number, alreadyPaid: number): number {
  return Math.round((newTotal - alreadyPaid) * 100) / 100
}

export interface ExchangeResult {
  new_total: number
  difference: number
  collected: number
  refunded: number
  balance_due: number
  payment_status: string
  bill_number: number
}

/** Save the exchange. Payments only count when the customer owes more. */
export async function submitExchange(
  exchange: ExchangeInfo,
  finalItems: ExchangeLine[],
  payments: { payment_type: string; amount: number }[],
  discount: { percentage: number; negotiable: number },
): Promise<ExchangeResult> {
  const res = await api.post(`/billing/exchange/${exchange.billId}`, {
    expected_version: exchange.version,
    // Send the tab's bill-level discount so the server total matches the banner.
    discount_percentage: discount.percentage,
    negotiable_amount: discount.negotiable,
    final_items: finalItems.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      item_code: i.item_code,
      hsn_code: i.hsn_code,
      unit: i.unit,
      quantity: i.quantity,
      rate: i.rate,
      gst_percentage: i.gst_percentage,
      discount_percentage: i.discount_percentage ?? 0,
      mrp: i.mrp,
    })),
    payments: payments.filter((p) => p.amount > 0),
    refund_method: exchange.refundMethod,
  })
  return res.data
}

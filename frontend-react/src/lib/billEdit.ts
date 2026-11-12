/**
 * Bills → Edit: change a saved bill's DETAILS only — customer name / phone / GSTIN and the
 * payment TYPE of money already paid. Never items, quantities, prices, totals or stock
 * (that is Exchange, lib/billExchange.ts). Server: PATCH /billing/<id>/details.
 */
import api from '@/lib/api'

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Credit Card', 'Bank Transfer']

export interface PaidSplit { payment_type: string; amount: number }

export interface EditableBill {
  billId: string
  billLabel: string
  total: number
  customer_name: string
  customer_phone: string
  customer_gstin: string
  /** Earlier payments; empty for old bills that stored a plain label (type not editable). */
  paidSplits: PaidSplit[]
  /** Server revision — a stale dialog is refused (409) instead of overwriting newer changes. */
  version: string
}

/** Bill payment_type is JSON splits since v42; older bills hold a plain label. */
export function parsePaidSplits(raw: unknown): PaidSplit[] {
  if (typeof raw !== 'string' || !raw.trim().startsWith('[')) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr)
      ? arr.map((s: Record<string, unknown>) => ({
          payment_type: String(s.payment_type ?? s.PAYMENT_TYPE ?? 'Cash'),
          amount: Math.round(Number(s.amount ?? s.AMOUNT ?? 0) * 100) / 100,
        }))
      : []
  } catch {
    return []
  }
}

export async function loadBillForEdit(billId: string): Promise<EditableBill> {
  const res = await api.get(`/billing/${billId}`, { params: { exchange: 1 } })
  const bill = res.data?.bill
  if (!bill) throw new Error('Bill not found')
  if (bill.status === 'cancelled') throw new Error('A cancelled bill cannot be edited')
  const prefix = bill.bill_prefix ? `${bill.bill_prefix}-` : ''
  return {
    billId,
    billLabel: bill.bill_no_display || `${prefix}${bill.bill_number}`,
    total: Number(bill.type === 'gst' ? bill.final_amount : bill.total_amount) || 0,
    customer_name: /^walk-?in customer$/i.test(bill.customer_name || '') ? '' : (bill.customer_name || ''),
    customer_phone: bill.customer_phone || '',
    customer_gstin: bill.customer_gstin || '',
    paidSplits: parsePaidSplits(bill.payment_type),
    version: String(bill.version ?? ''),
  }
}

/** Send only what changed. Returns the server's updated bill. */
export async function saveBillDetails(original: EditableBill, edited: EditableBill) {
  const body: Record<string, unknown> = { expected_version: original.version }
  if (edited.customer_name.trim() !== original.customer_name) body.customer_name = edited.customer_name.trim()
  if (edited.customer_phone.trim() !== original.customer_phone) body.customer_phone = edited.customer_phone.trim()
  if (edited.customer_gstin.trim().toUpperCase() !== original.customer_gstin) body.customer_gstin = edited.customer_gstin.trim()
  if (edited.paidSplits.some((p, i) => p.payment_type !== original.paidSplits[i]?.payment_type)) {
    body.paid_splits = edited.paidSplits
  }
  if (Object.keys(body).length === 1) return null  // nothing changed
  const res = await api.patch(`/billing/${original.billId}/details`, body)
  return res.data
}

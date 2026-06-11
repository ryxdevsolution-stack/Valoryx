import api from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────

export interface BillLineEdit {
  product_id: string
  product_name: string
  rate: number
  quantity: number
  discount?: number
  tax_percent?: number
}

export interface BillUpdatePayload {
  items: BillLineEdit[]
  subtotal: number
  gst_percentage?: number
  total_amount?: number
  payment_type: string
}

export interface BillUpdateResponse {
  success: boolean
  message: string
  bill: Record<string, unknown>
  scope: 'audit_only'
}

// ─── API Functions ───────────────────────────────────────────────────

/**
 * Record an audit correction (audit note) on a bill.
 *
 * Owner/Manager only (enforced server-side). The correction is stored as an
 * overlay in `audit_overrides`; the original bill items, totals, prints and
 * reports are NEVER mutated. Only the audit view reflects the corrected figures.
 *
 * @param billId   The bill_id to correct.
 * @param payload  Corrected pricing fields.
 */
export async function updateBillFromAudit(
  billId: string,
  payload: BillUpdatePayload,
): Promise<BillUpdateResponse> {
  const { data } = await api.put<BillUpdateResponse>(`/billing/${billId}`, payload)
  return data
}

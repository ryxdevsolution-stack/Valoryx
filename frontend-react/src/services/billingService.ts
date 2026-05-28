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

export type AuditEditScope = 'audit_only' | 'apply'

export interface BillUpdateResponse {
  success: boolean
  message: string
  bill: Record<string, unknown>
  scope: AuditEditScope
}

// ─── API Functions ───────────────────────────────────────────────────

/**
 * Update a bill from the Auditor Reports edit flow.
 *
 * @param billId   The bill_id to update.
 * @param payload  Pricing-field-only update payload.
 * @param opts     scope:
 *   - 'audit_only' → write to audit_overrides; bill itself unchanged.
 *                    Only the audit view reflects the correction.
 *   - 'apply'      → mutate bill items; clear any prior audit_overrides.
 *                    Bill, reports, prints all reflect the new values.
 */
export async function updateBillFromAudit(
  billId: string,
  payload: BillUpdatePayload,
  opts: { scope: AuditEditScope },
): Promise<BillUpdateResponse> {
  const params = new URLSearchParams()
  params.set('scope', opts.scope)
  const url = `/billing/${billId}?${params.toString()}`
  const { data } = await api.put<BillUpdateResponse>(url, payload)
  return data
}

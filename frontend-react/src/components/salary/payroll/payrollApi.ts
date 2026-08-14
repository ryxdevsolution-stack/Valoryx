import api from '@/lib/api'

/**
 * Client for /api/payroll — work groups and payroll invoices.
 *
 * A labour contractor pays 30–40 workers individually (payslips, which already
 * exist), then raises ONE GST invoice on the principal company those workers
 * were supplied to. Each work group becomes one invoice line carrying its own
 * HSN/SAC and service-charge %, because the margin differs by kind of work.
 */

export interface WorkGroup {
  group_id: string
  client_id: string
  name: string
  description: string | null
  hsn_code: string | null
  service_charge_percent: number | null
  display_order: number
  is_active: boolean
  employee_count?: number
}

export interface InvoiceLineEmployee {
  employee_id: string
  employee_name: string
  cycle_id: string | null
  gross_salary: number
}

export interface InvoiceLine {
  group_id: string | null
  line_id?: string
  description: string
  hsn_code: string | null
  headcount: number
  salary_amount: number
  service_charge_percent: number
  service_charge_amount: number
  taxable_amount: number
  gst_rate: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
  sort_order: number
  employees?: InvoiceLineEmployee[]
}

export interface InvoiceTotals {
  salary_total: number
  service_total: number
  taxable_total: number
  cgst_total: number
  sgst_total: number
  igst_total: number
  tax_total: number
  grand_total: number
  headcount: number
}

export type TaxMode = 'intra' | 'inter'

export interface InvoicePreview {
  period_start: string
  period_end: string
  tax_mode: TaxMode
  invoice_number_preview: string
  customer: Record<string, unknown> | null
  lines: InvoiceLine[]
  totals: InvoiceTotals
}

export interface PayrollInvoicePayment {
  payment_id: string
  amount: number
  payment_method: string | null
  reference_no: string | null
  payment_date: string | null
  notes: string | null
}

export interface PayrollInvoice {
  invoice_id: string
  invoice_number: string
  invoice_date: string
  period_start: string
  period_end: string
  customer_name: string
  customer_gstin: string | null
  customer_state: string | null
  customer_address: string | null
  tax_mode: TaxMode | null
  salary_total: number
  service_total: number
  taxable_total: number
  cgst_total: number
  sgst_total: number
  igst_total: number
  tax_total: number
  grand_total: number
  received_amount: number
  balance: number
  status: string
  notes: string | null
  lines?: InvoiceLine[]
  payments?: PayrollInvoicePayment[]
}

/**
 * Per-line edits the user made in the builder, keyed by group_id — or the
 * literal 'ungrouped' for the catch-all line, which the backend expects because
 * ungrouped employees have no group_id to key on.
 */
export interface LineOverride {
  description?: string
  hsn_code?: string | null
  service_charge_percent?: number
  gst_rate?: number
}

export const overrideKey = (groupId: string | null) => groupId || 'ungrouped'

// ── Work groups ──────────────────────────────────────────────────────────────

export async function listWorkGroups(): Promise<{ groups: WorkGroup[]; ungroupedCount: number }> {
  const res = await api.get('/payroll/work-groups')
  return {
    groups: res.data?.data ?? [],
    ungroupedCount: res.data?.ungrouped_count ?? 0,
  }
}

export async function createWorkGroup(body: Partial<WorkGroup>): Promise<WorkGroup> {
  const res = await api.post('/payroll/work-groups', body)
  return res.data?.data
}

export async function updateWorkGroup(groupId: string, body: Partial<WorkGroup>): Promise<WorkGroup> {
  const res = await api.put(`/payroll/work-groups/${groupId}`, body)
  return res.data?.data
}

export async function deleteWorkGroup(groupId: string): Promise<void> {
  await api.delete(`/payroll/work-groups/${groupId}`)
}

/** group_id null unassigns — members are never deleted, only unlinked. */
export async function assignEmployees(groupId: string | null, employeeIds: string[]): Promise<number> {
  const res = await api.post('/payroll/work-groups/assign', {
    group_id: groupId,
    employee_ids: employeeIds,
  })
  return res.data?.updated ?? 0
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export interface BuildInvoiceBody {
  period_start: string
  period_end: string
  customer_id?: string | null
  customer_name?: string
  customer_address?: string | null
  customer_gstin?: string | null
  customer_state?: string | null
  customer_phone?: string | null
  ship_to?: string | null
  place_of_supply?: string | null
  tax_mode?: TaxMode
  invoice_date?: string
  notes?: string | null
  employee_ids?: string[]
  line_overrides?: Record<string, LineOverride>
}

export async function previewInvoice(body: BuildInvoiceBody): Promise<InvoicePreview> {
  const res = await api.post('/payroll/invoices/preview', body)
  return res.data?.data
}

export async function createInvoice(body: BuildInvoiceBody): Promise<{ invoice_id: string; invoice_number: string }> {
  const res = await api.post('/payroll/invoices', body)
  return res.data?.data
}

export async function listInvoices(
  page = 1,
  status = '',
): Promise<{ invoices: PayrollInvoice[]; total: number; perPage: number }> {
  const res = await api.get('/payroll/invoices', { params: { page, status: status || undefined } })
  return {
    invoices: res.data?.data ?? [],
    total: res.data?.total ?? 0,
    perPage: res.data?.per_page ?? 20,
  }
}

export async function getInvoice(invoiceId: string): Promise<PayrollInvoice> {
  const res = await api.get(`/payroll/invoices/${invoiceId}`)
  return res.data?.data
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await api.delete(`/payroll/invoices/${invoiceId}`)
}

export async function recordInvoicePayment(
  invoiceId: string,
  body: { amount: number; payment_method?: string; reference_no?: string; notes?: string },
): Promise<void> {
  await api.post(`/payroll/invoices/${invoiceId}/payments`, body)
}

/** The invoice PDF as an object URL. Caller MUST revokeObjectURL when done. */
export async function fetchInvoicePdfUrl(
  invoiceId: string,
  copy?: string,
): Promise<string> {
  const res = await api.get(`/payroll/invoices/${invoiceId}/pdf`, {
    params: copy ? { copy } : undefined,
    responseType: 'blob',
  })
  return window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
}

/** Filename used for both the download and the preview's save button. */
export function invoicePdfName(inv: Pick<PayrollInvoice, 'invoice_number'>) {
  return `${inv.invoice_number.replace(/[\\/\s]+/g, '_')}.pdf`
}

/** Triggers a browser download from an object URL already in hand. */
export function saveObjectUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Streams the PDF as a blob and saves it — same approach as the payslip download. */
export async function downloadInvoicePdf(
  inv: Pick<PayrollInvoice, 'invoice_id' | 'invoice_number'>,
  copy?: string,
) {
  const url = await fetchInvoicePdfUrl(inv.invoice_id, copy)
  try {
    saveObjectUrl(url, invoicePdfName(inv))
  } finally {
    window.URL.revokeObjectURL(url)
  }
}

/** Backend errors are {success:false, error}; fall back to the axios message. */
export function apiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error || e?.message || fallback
}

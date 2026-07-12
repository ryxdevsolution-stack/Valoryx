/**
 * Valoryx — Supplier Statement PDF Generator
 *
 * Generates a clean, print-ready A4 statement of account for a single supplier:
 *   • Branded header (your business + supplier details, generated timestamp)
 *   • Summary totals (deliveries, total amount, paid, balance due)
 *   • Full delivery history ledger (every delivery, with running totals)
 *
 * Mirrors lib/reportPdfService.ts: builds HTML, opens it as a Blob URL, and relies
 * on the browser's native "Save as PDF / Print" — no extra dependencies, XSS-safe
 * (all user-supplied text is escaped via esc()).
 */

import { toast } from '@/utils/toast'

// ─── Input contracts ──────────────────────────────────────────────────────────

export interface SupplierPdfClientInfo {
  client_name: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
}

export interface SupplierPdfSupplier {
  name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  state?: string | null
  gst_number?: string | null
}

export interface SupplierPdfDelivery {
  delivery_id: string
  invoice_number: string | null
  delivery_date: string | null
  status: string
  total: number
  paid: number
  balance: number
  items: { length: number } | unknown[]
}

export interface SupplierStatementPdfParams {
  client: SupplierPdfClientInfo
  supplier: SupplierPdfSupplier
  deliveries: SupplierPdfDelivery[]
  totalAmount: number
  paidAmount: number
  balanceDue: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  let symbol = '₹', locale = 'en-IN'
  try {
    const c = JSON.parse(localStorage.getItem('client') || '{}')
    if (c.currency_symbol) symbol = c.currency_symbol
    if (c.locale) locale = c.locale
  } catch { /* localStorage unavailable / bad JSON */ }
  return symbol + (amount || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return esc(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(date: Date): string {
  return (
    date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  )
}

/** Escape user-supplied text to prevent HTML injection. */
function esc(str: string | undefined | null): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', confirmed: 'Confirmed', completed: 'Completed',
}

// ─── Main export ────────────────────────────────────────────────────────────────

export function generateSupplierStatementPDF(params: SupplierStatementPdfParams): void {
  const { client, supplier, deliveries, totalAmount, paidAmount, balanceDue } = params

  const generatedOn = formatDateTime(new Date())

  // ── Summary cards ────────────────────────────────────────────────────────────
  const kpis: Array<{ label: string; value: string; accent?: string }> = [
    { label: 'Total Deliveries', value: String(deliveries.length) },
    { label: 'Total Amount', value: formatCurrency(totalAmount) },
    { label: 'Paid Amount', value: formatCurrency(paidAmount), accent: 'pos' },
    { label: 'Balance Due', value: formatCurrency(balanceDue), accent: balanceDue > 0 ? 'neg' : 'pos' },
  ]
  const kpiHtml = kpis
    .map(
      k => `
      <div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value ${k.accent || ''}">${k.value}</div>
      </div>`
    )
    .join('')

  // ── Delivery ledger (oldest first) ───────────────────────────────────────────
  const sorted = [...deliveries].sort(
    (a, b) => new Date(a.delivery_date || 0).getTime() - new Date(b.delivery_date || 0).getTime()
  )
  const rows = sorted.length
    ? sorted
        .map(d => {
          const itemCount = Array.isArray(d.items) ? d.items.length : 0
          return `
        <tr>
          <td>${formatDate(d.delivery_date)}</td>
          <td>${d.invoice_number ? `#${esc(d.invoice_number)}` : '—'}</td>
          <td>${esc(STATUS_LABEL[d.status] || d.status)}</td>
          <td class="num muted">${itemCount}</td>
          <td class="num">${formatCurrency(d.total)}</td>
          <td class="num pos">${formatCurrency(d.paid)}</td>
          <td class="num ${d.balance > 0 ? 'neg' : ''}">${formatCurrency(d.balance)}</td>
        </tr>`
        })
        .join('')
    : `<tr><td colspan="7" class="empty">No deliveries recorded for this supplier.</td></tr>`

  const ledgerHtml = `
    <section>
      <h2>Delivery History <span class="count">(${sorted.length})</span></h2>
      <table class="ledger">
        <thead>
          <tr><th>Date</th><th>Invoice</th><th>Status</th><th class="num">Items</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">Total</td>
            <td class="num">${formatCurrency(totalAmount)}</td>
            <td class="num">${formatCurrency(paidAmount)}</td>
            <td class="num">${formatCurrency(balanceDue)}</td>
          </tr>
        </tfoot>
      </table>
    </section>`

  // ── Header meta ──────────────────────────────────────────────────────────────
  const addressLine = esc(client.address)
  const contactBits = [client.phone, client.email, client.gstin ? `GSTIN: ${client.gstin}` : '']
    .filter(Boolean)
    .map(esc)
    .join('  ·  ')

  const suppLeft: string[] = []
  const suppRight: string[] = []
  if (supplier.contact_person) suppLeft.push(`<div class="biz-row"><span class="biz-lbl">Contact</span><span class="biz-val">${esc(supplier.contact_person)}</span></div>`)
  if (supplier.phone) suppLeft.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${esc(supplier.phone)}</span></div>`)
  if (supplier.email) suppRight.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${esc(supplier.email)}</span></div>`)
  if (supplier.gst_number) suppRight.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${esc(supplier.gst_number)}</span></div>`)
  if (supplier.address) suppLeft.push(`<div class="biz-row"><span class="biz-lbl">Address</span><span class="biz-val">${esc(supplier.address)}</span></div>`)
  if (supplier.state) suppRight.push(`<div class="biz-row"><span class="biz-lbl">State</span><span class="biz-val">${esc(supplier.state)}</span></div>`)

  const supplierInfoHtml = (suppLeft.length || suppRight.length)
    ? `
    <section style="margin-top:18px">
      <h2>Supplier Details</h2>
      <div class="biz-grid">
        <div class="biz-col">${suppLeft.join('')}</div>
        <div class="biz-col">${suppRight.join('')}</div>
      </div>
    </section>`
    : ''

  // ─── Full HTML ────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Supplier Statement — ${esc(supplier.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--brand:#6B0000;--ink:#1a1a1a;--muted:#6b7280;--line:#e5e7eb;--pos:#047857;--neg:#b91c1c}
  body{
    font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
    color:var(--ink);background:#f3f4f6;padding:24px 16px 40px;font-size:12.5px;line-height:1.45;
  }
  .sheet{max-width:820px;margin:0 auto;background:#fff;padding:32px 36px 40px;box-shadow:0 8px 40px rgba(0,0,0,.10)}

  /* Header */
  .doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid var(--brand);padding-bottom:14px;margin-bottom:18px}
  .biz-name{font-size:22px;font-weight:800;color:var(--brand);letter-spacing:-0.3px}
  .biz-sub{font-size:11.5px;color:var(--muted);margin-top:3px}
  .doc-title{text-align:right}
  .doc-title .t{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--ink)}
  .doc-title .sub{font-size:13px;font-weight:700;color:var(--ink);margin-top:4px}
  .doc-title .gen{font-size:10.5px;color:#9ca3af;margin-top:2px}

  /* KPI grid */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
  .kpi{border:1px solid var(--line);border-radius:8px;padding:11px 13px;background:#fafafa}
  .kpi-label{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  .kpi-value{font-size:17px;font-weight:800;margin-top:5px;color:var(--ink)}
  .kpi-value.pos{color:var(--pos)} .kpi-value.neg{color:var(--neg)}

  /* Supplier info grid */
  .biz-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
  .biz-row{margin-bottom:6px}
  .biz-lbl{display:block;font-size:9.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
  .biz-val{display:block;font-size:12px;color:var(--ink);font-weight:600;margin-top:1px}

  /* Sections */
  section{margin-top:22px}
  h2{font-size:13.5px;font-weight:800;color:var(--ink);border-left:4px solid var(--brand);padding-left:9px;margin-bottom:9px}
  h2 .count{font-weight:500;color:var(--muted);font-size:11.5px}

  /* Tables */
  table{width:100%;border-collapse:collapse}
  .ledger th{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left;padding:7px 8px;border-bottom:2px solid var(--line);font-weight:700}
  .ledger td{padding:7px 8px;border-bottom:1px solid #f1f1f1;font-size:11.5px;vertical-align:top}
  .ledger tbody tr:nth-child(even) td{background:#fafafa}
  .ledger tfoot td{padding:9px 8px;border-top:2px solid var(--ink);font-weight:800;font-size:12px}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pos{color:var(--pos)} .neg{color:var(--neg)} .muted{color:var(--muted)}
  .empty{text-align:center;color:var(--muted);font-style:italic;padding:16px 8px}

  /* Footer */
  .doc-foot{margin-top:28px;padding-top:12px;border-top:1px solid var(--line);text-align:center;font-size:10px;color:#9ca3af}
  .doc-foot strong{color:#555}

  /* Print */
  .actions{max-width:820px;margin:18px auto 0;display:flex;gap:12px;justify-content:center}
  .btn{padding:11px 30px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:none;letter-spacing:.3px}
  .btn-primary{background:var(--brand);color:#fff}
  .btn-secondary{background:#fff;color:#555;border:1.5px solid #d1d5db}
  section{break-inside:avoid}
  tr{break-inside:avoid}
  @media print{
    body{background:#fff;padding:0;font-size:11px}
    .sheet{box-shadow:none;max-width:100%;padding:0}
    .actions{display:none}
  }
</style>
</head>
<body>
  <div class="sheet">

    <!-- Header -->
    <div class="doc-head">
      <div>
        <div class="biz-name">${esc(client.client_name)}</div>
        ${addressLine ? `<div class="biz-sub">${addressLine}</div>` : ''}
        ${contactBits ? `<div class="biz-sub">${contactBits}</div>` : ''}
      </div>
      <div class="doc-title">
        <div class="t">Supplier Statement</div>
        <div class="sub">${esc(supplier.name)}</div>
        <div class="gen">Generated ${generatedOn}</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpis">${kpiHtml}</div>

    ${supplierInfoHtml}
    ${ledgerHtml}

    <div class="doc-foot">
      Statement of account for <strong>${esc(supplier.name)}</strong> &nbsp;·&nbsp; Generated by <strong>Valoryx</strong>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
    <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=900,height=1000,scrollbars=yes')
  if (!win) {
    toast.error('Popup blocked — please allow popups for this site to export the statement.')
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

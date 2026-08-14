/**
 * Valoryx — Customer Statement PDF Generator
 *
 * Generates a clean, print-ready A4 statement of account for a single customer:
 *   • Branded header (your business + customer details, generated timestamp)
 *   • Summary totals (bills, total amount, paid, balance due)
 *   • Full account ledger (every bill + every payment, with a running balance)
 *
 * Mirrors lib/supplierPdfService.ts — same ledger shape, but from the customer's
 * side of the books: a bill is a Debit (it increases what they owe us), a payment
 * is a Credit (it reduces what they owe us), and the running balance carries a
 * "Dr" suffix while they owe money (the standard debtor-ledger convention).
 *
 * Builds HTML, opens it as a Blob URL, and relies on the browser's native
 * "Save as PDF / Print" — no extra dependencies, XSS-safe (all user-supplied
 * text is escaped via esc()).
 */

import { toast } from '@/utils/toast'

// ─── Input contracts ──────────────────────────────────────────────────────────

export interface CustomerPdfClientInfo {
  client_name: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
}

export interface CustomerPdfCustomer {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  gstin?: string | null
}

export interface CustomerPdfPayment {
  amount: number
  payment_date: string | null
  notes?: string | null
}

export interface CustomerPdfBill {
  bill_id: string
  bill_number: number | string | null
  type: 'GST' | 'Non-GST' | string
  created_at: string | null
  total: number
  paid: number
  balance: number
  payments?: CustomerPdfPayment[]
}

export interface CustomerStatementPdfParams {
  client: CustomerPdfClientInfo
  customer: CustomerPdfCustomer
  bills: CustomerPdfBill[]
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

// ─── Main export ────────────────────────────────────────────────────────────────

export function generateCustomerStatementPDF(params: CustomerStatementPdfParams): void {
  const { client, customer, bills, totalAmount, paidAmount, balanceDue } = params

  const generatedOn = formatDateTime(new Date())

  // ── Summary cards ────────────────────────────────────────────────────────────
  const kpis: Array<{ label: string; value: string; accent?: string }> = [
    { label: 'Total Bills', value: String(bills.length) },
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

  // ── Account ledger: one Debit line per bill (sale — increases what the
  //    customer owes), one Credit line per payment against it — sorted
  //    chronologically with a running balance. ──────────────────────────────
  type LedgerEntry = {
    date: string | null
    particulars: string
    vchType: string
    vchNo: string
    credit: number
    debit: number
    sortKey: number
  }

  const entries: LedgerEntry[] = []
  bills.forEach((b, bi) => {
    entries.push({
      date: b.created_at,
      particulars: b.type === 'GST' ? 'Tax Invoice' : 'Cash Sale',
      vchType: 'Sales',
      vchNo: b.bill_number != null ? `#${b.bill_number}` : '—',
      credit: 0,
      debit: b.total,
      sortKey: new Date(b.created_at || 0).getTime() * 1000 + bi * 2,
    })
    const payments = b.payments || []
    payments.forEach((p, pi) => {
      entries.push({
        date: p.payment_date,
        particulars: p.notes?.trim() || 'Payment Received',
        vchType: 'Receipt',
        vchNo: '—',
        credit: p.amount,
        debit: 0,
        sortKey: new Date(p.payment_date || 0).getTime() * 1000 + bi * 2 + 1 + pi,
      })
    })
    // Bills settled at the till (payment_status 'paid' with no /payments instalment
    // rows) carry their paid amount only on the bill itself — without this, the
    // running balance would treat them as unpaid and climb forever.
    const recorded = payments.reduce((sum, p) => sum + p.amount, 0)
    const unrecorded = Math.round((b.paid - recorded) * 100) / 100
    if (unrecorded > 0.01) {
      entries.push({
        date: b.created_at,
        particulars: 'Payment Received',
        vchType: 'Receipt',
        vchNo: '—',
        credit: unrecorded,
        debit: 0,
        sortKey: new Date(b.created_at || 0).getTime() * 1000 + bi * 2 + 0.5,
      })
    }
  })
  entries.sort((a, b) => a.sortKey - b.sortKey)

  let running = 0
  const rows = entries.length
    ? entries
        .map(e => {
          running += e.debit - e.credit
          const bal = Math.abs(running)
          const balSuffix = running === 0 ? '' : running > 0 ? ' Dr' : ' Cr'
          return `
        <tr>
          <td>${formatDate(e.date)}</td>
          <td>${esc(e.particulars)}</td>
          <td>${esc(e.vchType)}</td>
          <td>${esc(e.vchNo)}</td>
          <td class="num pos">${e.credit ? formatCurrency(e.credit) : ''}</td>
          <td class="num neg">${e.debit ? formatCurrency(e.debit) : ''}</td>
          <td class="num">${formatCurrency(bal)}${balSuffix}</td>
        </tr>`
        })
        .join('')
    : `<tr><td colspan="7" class="empty">No bills recorded for this customer.</td></tr>`

  const finalBalSuffix = balanceDue === 0 ? '' : ' Dr'
  const ledgerHtml = `
    <section>
      <h2>Ledger <span class="count">(${entries.length})</span></h2>
      <table class="ledger">
        <colgroup>
          <col style="width:11%"/><col style="width:21%"/><col style="width:10%"/>
          <col style="width:13%"/><col style="width:14%"/><col style="width:14%"/><col style="width:17%"/>
        </colgroup>
        <thead>
          <tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th>Vch No</th><th class="num">Credit</th><th class="num">Debit</th><th class="num">Balance</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">Total</td>
            <td class="num">${formatCurrency(paidAmount)}</td>
            <td class="num">${formatCurrency(totalAmount)}</td>
            <td class="num">${formatCurrency(balanceDue)}${finalBalSuffix}</td>
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

  const custLeft: string[] = []
  const custRight: string[] = []
  if (customer.phone) custLeft.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${esc(customer.phone)}</span></div>`)
  if (customer.email) custLeft.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${esc(customer.email)}</span></div>`)
  if (customer.gstin) custRight.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${esc(customer.gstin)}</span></div>`)
  if (customer.address) custLeft.push(`<div class="biz-row"><span class="biz-lbl">Address</span><span class="biz-val">${esc(customer.address)}</span></div>`)
  const cityState = [customer.city, customer.state].filter(Boolean).join(', ')
  if (cityState) custRight.push(`<div class="biz-row"><span class="biz-lbl">City / State</span><span class="biz-val">${esc(cityState)}</span></div>`)

  const customerInfoHtml = (custLeft.length || custRight.length)
    ? `
    <section style="margin-top:18px">
      <h2>Customer Details</h2>
      <div class="biz-grid">
        <div class="biz-col">${custLeft.join('')}</div>
        <div class="biz-col">${custRight.join('')}</div>
      </div>
    </section>`
    : ''

  // ─── Full HTML ────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Customer Statement — ${esc(customer.name)}</title>
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

  /* Customer info grid */
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
  .ledger{table-layout:fixed}
  .ledger th{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left;padding:7px 8px;border-bottom:2px solid var(--line);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ledger th.num{text-align:right}
  .ledger td{padding:7px 8px;border-bottom:1px solid #f1f1f1;font-size:11.5px;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ledger tbody tr:nth-child(even) td{background:#fafafa}
  .ledger tfoot td{padding:9px 8px;border-top:2px solid var(--ink);font-weight:800;font-size:12px;overflow:visible;white-space:nowrap}
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
        <div class="t">Customer Statement</div>
        <div class="sub">${esc(customer.name)}</div>
        <div class="gen">Generated ${generatedOn}</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpis">${kpiHtml}</div>

    ${customerInfoHtml}
    ${ledgerHtml}

    <div class="doc-foot">
      Statement of account for <strong>${esc(customer.name)}</strong> &nbsp;·&nbsp; Generated by <strong>Valoryx</strong>
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

/**
 * Valoryx — Professional Reports PDF Generator
 *
 * Generates a clean, print-ready A4 financial report containing:
 *   • Branded header (shop name, address, report period, generated timestamp)
 *   • KPI summary grid (bills, revenue, expenses, payroll, net profit)
 *   • Expense category breakdown
 *   • Salary / payroll & attendance summary
 *   • Full bills ledger (every bill in the period, with grand total)
 *   • Full expenses ledger (every expense in the period, with total)
 *
 * Intentionally EXCLUDES the "Top Customers" section.
 *
 * Mirrors lib/pdfService.ts: builds HTML, opens it as a Blob URL, and relies on
 * the browser's native "Save as PDF / Print" — no extra dependencies, XSS-safe
 * (all user-supplied text is escaped via esc()).
 */

import { toast } from '@/utils/toast'

// ─── Input contracts ──────────────────────────────────────────────────────────

export interface ReportPdfClientInfo {
  client_name: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
}

export interface ReportPdfBill {
  bill_number: number
  customer_name?: string
  payment_type?: string
  created_at: string
  type?: string
  total_amount?: number | string
  final_amount?: number | string
}

export interface ReportPdfExpense {
  category: string
  description?: string
  amount: number | string
  expense_date: string
  payment_method?: string
}

export interface ReportPdfPayroll {
  active_employees: number
  paid_in_period: number
  advances_paid_in_period: number
  total_payroll_expense: number
  pending_advances: number
  leave_days_period: number
  absent_days_period: number
}

export interface ReportPdfParams {
  client: ReportPdfClientInfo
  periodLabel: string          // e.g. "Monthly"
  startDate: string            // ISO yyyy-mm-dd
  endDate: string              // ISO yyyy-mm-dd
  totalBills: number
  totalRevenue: number
  generalExpenses: number      // reportData.expenses.total_expenses
  bills: ReportPdfBill[]
  expenses: ReportPdfExpense[]
  categoryBreakdown: Record<string, number>
  payroll: ReportPdfPayroll | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Region-aware currency (no hooks — this module builds PDFs). Resolve the
// client's symbol + locale from localStorage, same pattern as pdfService /
// webPrintService, so reports never hardcode ₹/INR.
function formatCurrency(amount: number): string {
  let symbol = '₹', locale = 'en-IN'
  try {
    const c = JSON.parse(localStorage.getItem('client') || '{}')
    if (c.currency_symbol) symbol = c.currency_symbol
    if (c.locale) locale = c.locale
  } catch { /* localStorage unavailable / bad JSON */ }
  return symbol + (amount || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string): string {
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

/** Resolve a bill's amount the same way the Reports page does (GST vs non-GST). */
function billAmount(bill: ReportPdfBill): number {
  const raw = bill.type === 'gst' ? bill.final_amount : bill.total_amount
  return parseFloat(String(raw ?? 0)) || 0
}

/** Human-readable payment label from the (possibly JSON) payment_type field. */
function paymentLabel(paymentType?: string): string {
  if (!paymentType) return 'Cash'
  const trimmed = paymentType.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const labels = parsed
          .map(
            (p: Record<string, string>) =>
              p.payment_name || p.PAYMENT_TYPE || p.payment_type || ''
          )
          .filter(Boolean)
        if (labels.length) return labels.join(' + ')
      }
    } catch {
      /* fall through to raw */
    }
  }
  return trimmed
}

// ─── Main export ────────────────────────────────────────────────────────────────

export function generateReportPDF(params: ReportPdfParams): void {
  const {
    client,
    periodLabel,
    startDate,
    endDate,
    totalBills,
    totalRevenue,
    generalExpenses,
    bills,
    expenses,
    categoryBreakdown,
    payroll,
  } = params

  const payrollExpense = payroll?.total_payroll_expense ?? 0
  const combinedExpenses = generalExpenses + payrollExpense
  const netProfit = totalRevenue - combinedExpenses

  const generatedOn = formatDateTime(new Date())

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const kpis: Array<{ label: string; value: string; accent?: string }> = [
    { label: 'Total Bills', value: String(totalBills) },
    { label: 'Total Revenue', value: formatCurrency(totalRevenue), accent: 'pos' },
    { label: 'Total Expenses', value: formatCurrency(combinedExpenses), accent: 'neg' },
    {
      label: 'Net Profit',
      value: formatCurrency(netProfit),
      accent: netProfit >= 0 ? 'pos' : 'neg',
    },
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

  // ── Financial summary table ──────────────────────────────────────────────────
  const summaryRows: string[] = [
    `<tr><td>Revenue</td><td class="num pos">${formatCurrency(totalRevenue)}</td></tr>`,
    `<tr><td>General Expenses</td><td class="num neg">− ${formatCurrency(generalExpenses)}</td></tr>`,
  ]
  if (payrollExpense > 0) {
    summaryRows.push(
      `<tr><td>Payroll (Salary + Advances)</td><td class="num neg">− ${formatCurrency(payrollExpense)}</td></tr>`
    )
  }
  summaryRows.push(
    `<tr class="grand"><td>Net Profit</td><td class="num ${netProfit >= 0 ? 'pos' : 'neg'}">${formatCurrency(netProfit)}</td></tr>`
  )

  // ── Expense category breakdown ───────────────────────────────────────────────
  const categories = Object.entries(categoryBreakdown || {})
    .filter(([, amt]) => Number(amt) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
  const categoryHtml = categories.length
    ? `
    <section>
      <h2>Expense Categories</h2>
      <table class="ledger">
        <thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
        <tbody>
          ${categories
            .map(([name, amt]) => {
              const pct = generalExpenses > 0 ? (Number(amt) / generalExpenses) * 100 : 0
              return `<tr><td>${esc(name)}</td><td class="num">${formatCurrency(Number(amt))}</td><td class="num muted">${pct.toFixed(1)}%</td></tr>`
            })
            .join('')}
        </tbody>
        <tfoot><tr><td>Total General Expenses</td><td class="num">${formatCurrency(generalExpenses)}</td><td class="num"></td></tr></tfoot>
      </table>
    </section>`
    : ''

  // ── Payroll / salary summary ─────────────────────────────────────────────────
  const payrollHtml =
    payroll && payroll.active_employees > 0
      ? `
    <section>
      <h2>Salary &amp; Payroll</h2>
      <table class="ledger">
        <tbody>
          <tr><td>Active Employees</td><td class="num">${payroll.active_employees}</td></tr>
          <tr><td>Salary Paid (period)</td><td class="num">${formatCurrency(payroll.paid_in_period)}</td></tr>
          <tr><td>Advances Disbursed (period)</td><td class="num">${formatCurrency(payroll.advances_paid_in_period)}</td></tr>
          <tr><td>Pending Advances (to repay)</td><td class="num">${formatCurrency(payroll.pending_advances)}</td></tr>
          <tr><td>Leave / Absent Days</td><td class="num">${payroll.leave_days_period} / ${payroll.absent_days_period}</td></tr>
          <tr class="grand"><td>Total Payroll Cost</td><td class="num">${formatCurrency(payroll.total_payroll_expense)}</td></tr>
        </tbody>
      </table>
    </section>`
      : ''

  // ── Bills ledger (all bills) ─────────────────────────────────────────────────
  const sortedBills = [...bills].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const billsTotal = sortedBills.reduce((sum, b) => sum + billAmount(b), 0)
  const billRows = sortedBills.length
    ? sortedBills
        .map(
          b => `
        <tr>
          <td>${formatDate(b.created_at)}</td>
          <td>#${esc(String(b.bill_number))}</td>
          <td>${esc(b.customer_name || 'Walk-in Customer')}</td>
          <td>${esc(paymentLabel(b.payment_type))}</td>
          <td class="num">${formatCurrency(billAmount(b))}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="empty">No bills in this period.</td></tr>`

  const billsHtml = `
    <section>
      <h2>Bills <span class="count">(${sortedBills.length})</span></h2>
      <table class="ledger">
        <thead>
          <tr><th>Date</th><th>Bill #</th><th>Customer</th><th>Payment</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>${billRows}</tbody>
        <tfoot>
          <tr><td colspan="4">Total Revenue</td><td class="num">${formatCurrency(billsTotal)}</td></tr>
        </tfoot>
      </table>
    </section>`

  // ── Expenses ledger (all expenses) ───────────────────────────────────────────
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime()
  )
  const expensesTotal = sortedExpenses.reduce(
    (sum, e) => sum + (parseFloat(String(e.amount)) || 0),
    0
  )
  const expenseRows = sortedExpenses.length
    ? sortedExpenses
        .map(
          e => `
        <tr>
          <td>${formatDate(e.expense_date)}</td>
          <td>${esc(e.category)}</td>
          <td>${esc(e.description || '—')}</td>
          <td>${esc((e.payment_method || '').toUpperCase() || '—')}</td>
          <td class="num">${formatCurrency(parseFloat(String(e.amount)) || 0)}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="empty">No expenses recorded in this period.</td></tr>`

  const expensesHtml = `
    <section>
      <h2>Expenses <span class="count">(${sortedExpenses.length})</span></h2>
      <table class="ledger">
        <thead>
          <tr><th>Date</th><th>Category</th><th>Description</th><th>Payment</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>${expenseRows}</tbody>
        <tfoot>
          <tr><td colspan="4">Total Expenses</td><td class="num">${formatCurrency(expensesTotal)}</td></tr>
        </tfoot>
      </table>
    </section>`

  // ── Header meta ──────────────────────────────────────────────────────────────
  const addressLine = esc(client.address)
  const contactBits = [client.phone, client.email, client.gstin ? `GSTIN: ${client.gstin}` : '']
    .filter(Boolean)
    .map(esc)
    .join('  ·  ')

  // ─── Full HTML ────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Business Report — ${esc(client.client_name)}</title>
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
  .doc-title .period{font-size:12px;color:var(--muted);margin-top:4px}
  .doc-title .gen{font-size:10.5px;color:#9ca3af;margin-top:2px}

  /* KPI grid */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
  .kpi{border:1px solid var(--line);border-radius:8px;padding:11px 13px;background:#fafafa}
  .kpi-label{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  .kpi-value{font-size:17px;font-weight:800;margin-top:5px;color:var(--ink)}
  .kpi-value.pos{color:var(--pos)} .kpi-value.neg{color:var(--neg)}

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
  .ledger .grand td{border-top:2px solid var(--ink);font-weight:800;font-size:12.5px}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pos{color:var(--pos)} .neg{color:var(--neg)} .muted{color:var(--muted)}
  .empty{text-align:center;color:var(--muted);font-style:italic;padding:16px 8px}

  /* Two-up summary layout */
  .summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}

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
        <div class="t">Business Report</div>
        <div class="period">${esc(periodLabel)} · ${formatDate(startDate)} – ${formatDate(endDate)}</div>
        <div class="gen">Generated ${generatedOn}</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpis">${kpiHtml}</div>

    <!-- Financial summary + Payroll, side by side -->
    <div class="summary-grid">
      <section style="margin-top:18px">
        <h2>Financial Summary</h2>
        <table class="ledger"><tbody>${summaryRows.join('')}</tbody></table>
      </section>
      ${payrollHtml || '<div></div>'}
    </div>

    ${categoryHtml}
    ${billsHtml}
    ${expensesHtml}

    <div class="doc-foot">
      Net Profit = Revenue − General Expenses${payrollExpense > 0 ? ' − Payroll' : ''} &nbsp;·&nbsp; Generated by <strong>Valoryx</strong>
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
    toast.error('Popup blocked — please allow popups for this site to export the report.')
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

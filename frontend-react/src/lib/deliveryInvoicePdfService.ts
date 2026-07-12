/**
 * Valoryx — Delivery Tax Invoice PDF Generator
 *
 * Recreates the classic Indian GST "Tax Invoice" layout (Tally-style) for a
 * single supplier delivery — seller/buyer/consignee boxes, the full invoice
 * meta grid, an HSN/SAC item table with CGST + SGST breakup, amount-in-words,
 * an HSN-wise tax summary, a "Scan to Pay" box, Company's Bank Details, and a
 * declaration/signatory footer — matching the reference layout section-for-
 * section.
 *
 * Fields the app doesn't collect (logistics fields like Dispatch Doc No.,
 * and the supplier's bank account info) are rendered as blank ("—") rather
 * than dropping the box, so the printed form keeps its familiar shape.
 *
 * The "Scan to Pay" QR uses the business's own UPI ID (Shop Settings) — the
 * same one used for customer receipts — generated client-side as a real,
 * scannable code via the `qrcode` package (no external API calls).
 *
 * `cost_price` is treated as the buyer's final per-unit rate (tax-inclusive),
 * matching how the rest of the app sums cost_price × quantity as "Total Cost".
 * The taxable value is backed out per item so the invoice's Grand Total always
 * equals that same figure — no independent rounding drift.
 *
 * Mirrors lib/pdfService.ts / reportPdfService.ts: builds HTML, opens it as a
 * Blob URL, and relies on the browser's native "Save as PDF / Print".
 */

import QRCode from 'qrcode'
import { toast } from '@/utils/toast'

// ─── Input contracts ──────────────────────────────────────────────────────────

export interface TaxInvoiceClientInfo {
  client_name: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
}

export interface TaxInvoiceSupplier {
  name: string
  address?: string | null
  state?: string | null
  gst_number?: string | null
  email?: string | null
  phone?: string | null
  payment_terms?: string | null
  bank_account_name?: string | null
  bank_name?: string | null
  bank_account_number?: string | null
  bank_ifsc_code?: string | null
}

export interface TaxInvoiceItem {
  product_name: string
  category?: string | null
  hsn_code?: string | null
  quantity: number
  unit?: string | null
  cost_price: string | number | null
  gst_percentage: string | number | null
}

export interface TaxInvoiceParams {
  client: TaxInvoiceClientInfo
  supplier: TaxInvoiceSupplier
  invoice_number: string | null
  delivery_date: string | null
  notes?: string | null
  buyer_order_no?: string | null
  buyer_order_date?: string | null
  dispatched_through?: string | null
  destination?: string | null
  vehicle_no?: string | null
  lr_rr_no?: string | null
  upi_id?: string | null
  items: TaxInvoiceItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DASH = '—'

function num(v: string | number | null | undefined): number {
  return parseFloat(String(v ?? 0)) || 0
}

function formatAmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string | null): string {
  if (!iso) return DASH
  const d = new Date(iso)
  if (isNaN(d.getTime())) return esc(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

function esc(str: string | undefined | null): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Indian-numbering number-to-words ─────────────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
}

function threeDigitWords(n: number): string {
  let str = ''
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred'
    n %= 100
    if (n) str += ' '
  }
  if (n) str += twoDigitWords(n)
  return str
}

function numberToWordsIndian(input: number): string {
  let n = Math.floor(input)
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 10000000); n %= 10000000
  const lakh = Math.floor(n / 100000); n %= 100000
  const thousand = Math.floor(n / 1000); n %= 1000
  const hundred = n

  let str = ''
  if (crore) str += threeDigitWords(crore) + ' Crore '
  if (lakh) str += threeDigitWords(lakh) + ' Lakh '
  if (thousand) str += threeDigitWords(thousand) + ' Thousand '
  if (hundred) str += threeDigitWords(hundred)
  return str.trim()
}

function amountInWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let words = `INR ${numberToWordsIndian(rupees)}`
  if (paise > 0) words += ` and ${numberToWordsIndian(paise)} Paise`
  return words + ' Only'
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateDeliveryTaxInvoicePDF(params: TaxInvoiceParams): Promise<void> {
  const {
    client, supplier, invoice_number, delivery_date, notes, items, upi_id,
    buyer_order_no, buyer_order_date, dispatched_through, destination, vehicle_no, lr_rr_no,
  } = params

  // ── Per-item tax breakup ─────────────────────────────────────────────────────
  // cost_price is the tax-inclusive rate the buyer actually pays per unit;
  // back out the taxable (excl.) rate so amounts reconcile exactly.
  type Row = {
    idx: number
    name: string
    category: string
    hsn: string
    qty: number
    unit: string
    rateIncl: number
    rateExcl: number
    taxable: number
    gstPct: number
    cgstAmt: number
    sgstAmt: number
  }

  const rows: Row[] = items.map((it, i) => {
    const qty = num(it.quantity) || 0
    const gstPct = num(it.gst_percentage)
    const rateIncl = num(it.cost_price)
    const rateExcl = gstPct > 0 ? rateIncl / (1 + gstPct / 100) : rateIncl
    const taxable = rateExcl * qty
    const cgstAmt = taxable * (gstPct / 2) / 100
    const sgstAmt = taxable * (gstPct / 2) / 100
    return {
      idx: i + 1,
      name: it.product_name,
      category: it.category || '',
      hsn: it.hsn_code || DASH,
      qty, unit: it.unit || 'Nos',
      rateIncl, rateExcl, taxable, gstPct, cgstAmt, sgstAmt,
    }
  })

  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const taxableTotal = rows.reduce((s, r) => s + r.taxable, 0)
  const cgstTotal = rows.reduce((s, r) => s + r.cgstAmt, 0)
  const sgstTotal = rows.reduce((s, r) => s + r.sgstAmt, 0)
  const grandTotal = taxableTotal + cgstTotal + sgstTotal
  const roundedGrandTotal = Math.round(grandTotal)
  const roundOff = roundedGrandTotal - grandTotal

  // ── "Scan to Pay" QR — the business's own UPI ID (Shop Settings), generated
  // client-side as a real scannable code, pre-filled with this invoice's total.
  let qrDataUrl: string | null = null
  if (upi_id) {
    try {
      const upiUri = `upi://pay?${new URLSearchParams({
        pa: upi_id,
        pn: client.client_name,
        am: roundedGrandTotal.toFixed(2),
        cu: 'INR',
      }).toString()}`
      qrDataUrl = await QRCode.toDataURL(upiUri, { width: 220, margin: 1 })
    } catch {
      qrDataUrl = null
    }
  }

  // ── Item rows ─────────────────────────────────────────────────────────────────
  const itemRowsHtml = rows.length
    ? rows.map(r => `
      <tr>
        <td class="tc">${r.idx}</td>
        <td>
          <span class="item-name">${esc(r.name)}</span>
          ${r.category ? `<span class="item-sub">${esc(r.category)}</span>` : ''}
        </td>
        <td class="tc">${esc(r.hsn)}</td>
        <td class="tc">${r.qty.toLocaleString('en-IN')} ${esc(r.unit)}</td>
        <td class="tr">${formatAmt(r.rateIncl)}</td>
        <td class="tr">${formatAmt(r.rateExcl)}</td>
        <td class="tc">${esc(r.unit)}</td>
        <td class="tr">${formatAmt(r.taxable)}</td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="empty">No items recorded for this delivery.</td></tr>`

  // ── Tax rate lines within the items table (CGST/SGST/Round Off), Tally-style ──
  const rateGroups = new Map<number, { taxable: number; cgst: number; sgst: number }>()
  for (const r of rows) {
    const g = rateGroups.get(r.gstPct) || { taxable: 0, cgst: 0, sgst: 0 }
    g.taxable += r.taxable
    g.cgst += r.cgstAmt
    g.sgst += r.sgstAmt
    rateGroups.set(r.gstPct, g)
  }
  const taxLineRows = [...rateGroups.entries()]
    .filter(([pct]) => pct > 0)
    .flatMap(([pct, g]) => [
      `<tr><td colspan="4" class="tr muted">CGST ${(pct / 2).toFixed(1)}%</td><td class="tc">${(pct / 2).toFixed(1)}</td><td class="tc">%</td><td></td><td class="tr">${formatAmt(g.cgst)}</td></tr>`,
      `<tr><td colspan="4" class="tr muted">SGST ${(pct / 2).toFixed(1)}%</td><td class="tc">${(pct / 2).toFixed(1)}</td><td class="tc">%</td><td></td><td class="tr">${formatAmt(g.sgst)}</td></tr>`,
    ])
    .join('')
  const roundOffRow = Math.abs(roundOff) >= 0.005
    ? `<tr><td colspan="7" class="tr muted">Less: Round Off</td><td class="tr">${roundOff < 0 ? '(-)' : ''}${formatAmt(Math.abs(roundOff))}</td></tr>`
    : ''

  // ── HSN/SAC-wise tax summary (grouped) ───────────────────────────────────────
  const hsnGroups = new Map<string, { hsn: string; gstPct: number; taxable: number; cgst: number; sgst: number }>()
  for (const r of rows) {
    const key = `${r.hsn}__${r.gstPct}`
    const g = hsnGroups.get(key) || { hsn: r.hsn, gstPct: r.gstPct, taxable: 0, cgst: 0, sgst: 0 }
    g.taxable += r.taxable
    g.cgst += r.cgstAmt
    g.sgst += r.sgstAmt
    hsnGroups.set(key, g)
  }
  const hsnRows = [...hsnGroups.values()]
  const hsnSummaryHtml = hsnRows.length
    ? hsnRows.map(g => `
      <tr>
        <td>${esc(g.hsn)}</td>
        <td class="tr">${formatAmt(g.taxable)}</td>
        <td class="tc">${(g.gstPct / 2).toFixed(1)}%</td>
        <td class="tr">${formatAmt(g.cgst)}</td>
        <td class="tc">${(g.gstPct / 2).toFixed(1)}%</td>
        <td class="tr">${formatAmt(g.sgst)}</td>
        <td class="tr">${formatAmt(g.cgst + g.sgst)}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty">No tax lines.</td></tr>`

  // ── Header meta ──────────────────────────────────────────────────────────────
  const supplierInitial = esc(supplier.name.charAt(0).toUpperCase() || '?')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Tax Invoice ${invoice_number ? `#${esc(invoice_number)}` : ''} — ${esc(supplier.name)}</title>
<style>
  @page { size: A4; margin: 8mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:Arial,Helvetica,sans-serif;
    color:#000;background:#e9e9e9;padding:20px 12px 36px;font-size:11px;line-height:1.35;
  }
  .sheet{max-width:840px;margin:0 auto;background:#fff;border:1.5px solid #000;box-shadow:0 8px 40px rgba(0,0,0,.10)}
  table{border-collapse:collapse;width:100%}
  .muted{color:#555}
  .tc{text-align:center} .tr{text-align:right} .tl{text-align:left}
  .b-top{border-top:1px solid #000} .b-bottom{border-bottom:1px solid #000}
  .b-left{border-left:1px solid #000} .b-right{border-right:1px solid #000}

  /* Title bar */
  .title-row{text-align:center;font-size:15px;font-weight:700;padding:5px 0;border-bottom:1px solid #000;position:relative}
  .title-row .tag{position:absolute;right:10px;top:7px;font-size:9px;font-style:italic}

  /* Seller + invoice meta grid */
  .top-grid{display:grid;grid-template-columns:56% 44%;border-bottom:1px solid #000}
  .seller-cell{padding:8px;border-right:1px solid #000;display:flex;gap:10px}
  .logo-box{width:44px;height:44px;border:2px solid #000;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}
  .seller-name{font-size:14px;font-weight:800}
  .seller-addr{font-size:10.5px;margin-top:2px;line-height:1.5}

  .meta-tbl td{border-bottom:1px solid #000;padding:4px 7px;font-size:10px;vertical-align:top}
  .meta-tbl tr:last-child td{border-bottom:none}
  .meta-tbl td.k{color:#555;font-size:9px}
  .meta-tbl td.v{font-weight:700;font-size:10.5px}
  .meta-tbl .half{width:50%}

  /* Consignee / Buyer boxes */
  .party-box{border-bottom:1px solid #000;padding:6px 8px}
  .party-lbl{font-size:9.5px;font-weight:700;text-decoration:underline}
  .party-name{font-weight:800;font-size:11.5px;margin-top:2px}
  .party-addr{font-size:10.5px;margin-top:1px;line-height:1.5}
  .party-row{display:flex;gap:4px;font-size:10.5px;margin-top:1px}
  .party-row .k{color:#555;min-width:80px}

  /* Items table */
  table.items th{border-top:1px solid #000;border-bottom:1px solid #000;padding:5px 5px;font-size:9.5px;text-transform:uppercase}
  table.items td{padding:4px 5px;font-size:10.5px;vertical-align:top}
  .item-name{display:block;font-weight:600}
  .item-sub{display:block;font-size:9px;color:#555;font-style:italic}
  .empty{text-align:center;color:#555;font-style:italic;padding:14px}
  .items-total-row td{border-top:1px solid #000;font-weight:700}
  .grand-row td{border-top:2px double #000;font-weight:800;font-size:12px;padding-top:5px}

  /* Words rows */
  .words-row{border-top:1px solid #000;padding:6px 8px;font-size:10.5px;position:relative}
  .words-row .eoe{position:absolute;right:8px;top:6px;font-size:9.5px;font-style:italic}
  .words-row .lbl{display:block;font-size:9px;color:#555}
  .words-row .amt{font-weight:700}

  /* QR + HSN summary row */
  .qr-summary-grid{display:grid;grid-template-columns:150px 1fr;border-top:1px solid #000}
  .qr-cell{border-right:1px solid #000;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
  .qr-box{width:100px;height:100px;border:1px dashed #999;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999;text-align:center}
  .qr-label{font-size:9.5px;color:#555}

  table.hsn th,table.hsn td{border:1px solid #000;padding:4px 5px;font-size:9.5px}
  table.hsn th{text-transform:uppercase;background:#f5f5f5}
  table.hsn tfoot td{font-weight:700}

  /* Bank details */
  .bank-box{border-top:1px solid #000;padding:8px}
  .bank-title{font-size:10px;font-weight:700;text-decoration:underline;margin-bottom:4px}
  .bank-row{display:flex;gap:6px;font-size:10.5px;margin-top:2px}
  .bank-row .k{color:#555;min-width:130px}

  /* Declaration + signatory */
  .decl-row{display:grid;grid-template-columns:1.6fr 1fr;border-top:1px solid #000}
  .decl-col{padding:8px;font-size:9.5px}
  .decl-col .h{font-weight:700;font-size:10px;text-decoration:underline;margin-bottom:3px}
  .sign-col{padding:8px;border-left:1px solid #000;display:flex;flex-direction:column;justify-content:space-between}
  .sign-for{font-size:10.5px;text-align:right}
  .sign-space{height:40px}
  .sign-label{font-size:10.5px;text-align:right;padding-top:4px;margin-top:4px}

  .foot-note{text-align:center;font-size:9.5px;padding:6px 0;border-top:1px solid #000}

  .actions{max-width:840px;margin:16px auto 0;display:flex;gap:12px;justify-content:center}
  .btn{padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none}
  .btn-primary{background:#1f2937;color:#fff}
  .btn-secondary{background:#fff;color:#555;border:1.5px solid #d1d5db}
  @media print{
    body{background:#fff;padding:0}
    .sheet{box-shadow:none;max-width:100%;border:1px solid #000}
    .actions{display:none}
  }
</style>
</head>
<body>
  <div class="sheet">

    <div class="title-row">
      Tax Invoice
      <span class="tag">(Buyer's Copy — Reconstructed)</span>
    </div>

    <!-- Seller + Invoice meta -->
    <div class="top-grid">
      <div class="seller-cell">
        <div class="logo-box">${supplierInitial}</div>
        <div>
          <div class="seller-name">${esc(supplier.name)}</div>
          <div class="seller-addr">${esc(supplier.address) || DASH}</div>
          <div class="seller-addr">GSTIN/UIN: ${supplier.gst_number ? esc(supplier.gst_number) : DASH}</div>
          <div class="seller-addr">State Name: ${supplier.state ? esc(supplier.state) : DASH}</div>
          <div class="seller-addr">E-Mail: ${supplier.email ? esc(supplier.email) : DASH}</div>
        </div>
      </div>
      <table class="meta-tbl">
        <tr>
          <td class="half"><span class="k">Invoice No.</span><br/><span class="v">${invoice_number ? esc(invoice_number) : DASH}</span></td>
          <td class="half"><span class="k">Dated</span><br/><span class="v">${formatDate(delivery_date)}</span></td>
        </tr>
        <tr>
          <td><span class="k">Delivery Note</span><br/>${DASH}</td>
          <td><span class="k">Mode/Terms of Payment</span><br/>${supplier.payment_terms ? esc(supplier.payment_terms) : DASH}</td>
        </tr>
        <tr>
          <td><span class="k">Reference No. &amp; Date</span><br/>${DASH}</td>
          <td><span class="k">Other References</span><br/>${DASH}</td>
        </tr>
        <tr>
          <td><span class="k">Buyer's Order No.</span><br/>${buyer_order_no ? esc(buyer_order_no) : DASH}</td>
          <td><span class="k">Dated</span><br/>${buyer_order_date ? formatDate(buyer_order_date) : DASH}</td>
        </tr>
        <tr>
          <td><span class="k">Dispatch Doc No.</span><br/>${DASH}</td>
          <td><span class="k">Delivery Note Date</span><br/>${DASH}</td>
        </tr>
        <tr>
          <td><span class="k">Dispatched through</span><br/>${dispatched_through ? esc(dispatched_through) : DASH}</td>
          <td><span class="k">Destination</span><br/>${destination ? esc(destination) : DASH}</td>
        </tr>
        <tr>
          <td><span class="k">Bill of Lading/LR-RR No.</span><br/>${lr_rr_no ? esc(lr_rr_no) : DASH}</td>
          <td><span class="k">Motor Vehicle No.</span><br/>${vehicle_no ? esc(vehicle_no) : DASH}</td>
        </tr>
        <tr>
          <td colspan="2"><span class="k">Terms of Delivery</span><br/>${notes ? esc(notes) : DASH}</td>
        </tr>
      </table>
    </div>

    <!-- Consignee (Ship to) -->
    <div class="party-box">
      <div class="party-lbl">Consignee (Ship to)</div>
      <div class="party-name">${esc(client.client_name)}</div>
      <div class="party-addr">${client.address ? esc(client.address) : DASH}</div>
      <div class="party-row"><span class="k">GSTIN/UIN</span><span>: ${client.gstin ? esc(client.gstin) : DASH}</span></div>
    </div>

    <!-- Buyer (Bill to) -->
    <div class="party-box">
      <div class="party-lbl">Buyer (Bill to)</div>
      <div class="party-name">${esc(client.client_name)}</div>
      <div class="party-addr">${client.address ? esc(client.address) : DASH}</div>
      <div class="party-row"><span class="k">GSTIN/UIN</span><span>: ${client.gstin ? esc(client.gstin) : DASH}</span></div>
    </div>

    <!-- Items -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:24px">Sl<br/>No.</th>
          <th class="tl">Description of Goods</th>
          <th>HSN/SAC</th>
          <th>Quantity</th>
          <th class="tr">Rate<br/>(Incl. of Tax)</th>
          <th class="tr">Rate</th>
          <th>per</th>
          <th class="tr">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRowsHtml}</tbody>
      <tfoot>
        <tr class="items-total-row">
          <td colspan="3"></td>
          <td class="tc">${totalQty.toLocaleString('en-IN')}</td>
          <td colspan="3"></td>
          <td class="tr">${formatAmt(taxableTotal)}</td>
        </tr>
        ${taxLineRows}
        ${roundOffRow}
        <tr class="grand-row">
          <td colspan="3" class="tl">Total</td>
          <td class="tc">${totalQty.toLocaleString('en-IN')} ${rows[0]?.unit || 'Nos'}</td>
          <td colspan="3"></td>
          <td class="tr">₹ ${formatAmt(roundedGrandTotal)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="words-row">
      <span class="eoe">E. &amp; O.E</span>
      <span class="lbl">Amount Chargeable (in words)</span>
      <span class="amt">${amountInWords(roundedGrandTotal)}</span>
    </div>

    <!-- QR (business's UPI ID from Shop Settings) + HSN summary -->
    <div class="qr-summary-grid">
      <div class="qr-cell">
        ${qrDataUrl
          ? `<img src="${qrDataUrl}" alt="Scan to Pay" style="width:100px;height:100px"/><span class="qr-label">Scan to Pay</span><span class="qr-label">${esc(upi_id)}</span>`
          : `<div class="qr-box">Scan to Pay<br/>(UPI ID not set)</div>`}
      </div>
      <div style="padding:6px;border-top:none">
        <table class="hsn">
          <thead>
            <tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable<br/>Value</th><th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th><th rowspan="2">Total<br/>Tax Amount</th></tr>
            <tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>${hsnSummaryHtml}</tbody>
          <tfoot>
            <tr><td>Total</td><td class="tr">${formatAmt(taxableTotal)}</td><td></td><td class="tr">${formatAmt(cgstTotal)}</td><td></td><td class="tr">${formatAmt(sgstTotal)}</td><td class="tr">${formatAmt(cgstTotal + sgstTotal)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="words-row">
      <span class="lbl">Tax Amount (in words)</span>
      <span class="amt">${amountInWords(cgstTotal + sgstTotal)}</span>
    </div>

    <!-- Bank details -->
    <div class="bank-box">
      <div class="bank-title">Company's Bank Details</div>
      <div class="bank-row"><span class="k">A/c Holder's Name</span><span>: ${supplier.bank_account_name ? esc(supplier.bank_account_name) : DASH}</span></div>
      <div class="bank-row"><span class="k">Bank Name</span><span>: ${supplier.bank_name ? esc(supplier.bank_name) : DASH}</span></div>
      <div class="bank-row"><span class="k">A/c No.</span><span>: ${supplier.bank_account_number ? esc(supplier.bank_account_number) : DASH}</span></div>
      <div class="bank-row"><span class="k">Branch &amp; IFS Code</span><span>: ${supplier.bank_ifsc_code ? esc(supplier.bank_ifsc_code) : DASH}</span></div>
    </div>

    <div class="decl-row">
      <div class="decl-col">
        <div class="h">Declaration</div>
        We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
      </div>
      <div class="sign-col">
        <div class="sign-for">for ${esc(supplier.name)}</div>
        <div class="sign-space"></div>
        <div class="sign-label">Authorised Signatory</div>
      </div>
    </div>

    <div class="foot-note">This is a Computer Generated Invoice</div>
  </div>

  <div class="actions">
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
    <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=900,height=1050,scrollbars=yes')
  if (!win) {
    toast.error('Popup blocked — please allow popups for this site to export the invoice.')
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

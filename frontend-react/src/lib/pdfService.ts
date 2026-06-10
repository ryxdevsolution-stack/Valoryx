/**
 * Valoryx — Professional Bill PDF Generator
 * uEngage-inspired receipt design:
 *   • White card, circular logo, brand colour accent bar
 *   • 2-column business info grid
 *   • Dashed section separators
 *   • Wavy SVG bottom edge on the main card
 *   • Festive loyalty-points panel below the card
 *
 * Uses Blob URLs (never document.write) for XSS safety.
 * Logo fetched as base64 so it renders inside the blob: window (no CORS issue).
 */

import { PrintableBill } from '@/types/billing'
import { toast } from '@/utils/toast'

export interface ClientInfoForPDF {
  client_name: string
  address: string
  address2?: string
  phone?: string
  email?: string
  gstin?: string
  logo_url?: string
  upi_id?: string
  receipt_footer?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return (
    '₹' +
    amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  const datePart = d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timePart = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart} | ${timePart}`
}

function parsePaymentLabel(paymentTypeStr: string): string {
  try {
    const splits = JSON.parse(paymentTypeStr)
    if (Array.isArray(splits)) {
      return splits
        .map(
          (s: { payment_name?: string; payment_type?: string }) =>
            s.payment_name || s.payment_type || 'Cash'
        )
        .join(' + ')
    }
  } catch {
    /* not JSON */
  }
  return paymentTypeStr || 'Cash'
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return phone
  const visible = phone.slice(-4)
  return '••••••' + visible
}

/** Escape user-supplied text to prevent HTML injection. */
function esc(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Fetch a remote image and return it as a base64 data-URL.
 * Required because blob: windows can't load cross-origin <img src>.
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateBillPDF(
  bill: PrintableBill,
  clientInfo: ClientInfoForPDF
): Promise<void> {
  const isGST = bill.type === 'gst'
  const grandTotal = isGST ? bill.final_amount : bill.total_amount
  const isPending = bill.payment_status === 'pending'
  const paymentLabel = parsePaymentLabel(bill.payment_type)

  // Pre-fetch logo as base64 so it works inside blob: windows
  let logoBase64: string | null = null
  if (clientInfo.logo_url) {
    logoBase64 = await fetchImageAsBase64(clientInfo.logo_url)
  }

  // ── Logo / fallback ──────────────────────────────────────────────────────
  const firstLetter = esc(clientInfo.client_name.charAt(0).toUpperCase())
  const logoInner = logoBase64
    ? `<img src="${logoBase64}" alt="Logo" class="logo-img" />`
    : `<div class="logo-letter">${firstLetter}</div>`

  // ── Address ──────────────────────────────────────────────────────────────
  const addressParts = [clientInfo.address, clientInfo.address2]
    .filter(Boolean)
    .map(esc)
  const cityLine = addressParts.join(', ')

  // ── Business info 2-column grid ──────────────────────────────────────────
  const bizLeft: string[] = []
  const bizRight: string[] = []
  if (clientInfo.gstin) {
    bizLeft.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${esc(clientInfo.gstin)}</span></div>`)
  }
  bizRight.push(`<div class="biz-row"><span class="biz-lbl">Legal Name</span><span class="biz-val">${esc(clientInfo.client_name)}</span></div>`)
  if (clientInfo.phone) {
    bizLeft.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${esc(clientInfo.phone)}</span></div>`)
  }
  if (clientInfo.email) {
    bizRight.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${esc(clientInfo.email)}</span></div>`)
  }
  if (bill.customer_gstin) {
    bizLeft.push(`<div class="biz-row"><span class="biz-lbl">Cust. GSTIN</span><span class="biz-val">${esc(bill.customer_gstin)}</span></div>`)
  }
  bizRight.push(`<div class="biz-row"><span class="biz-lbl">Bill Type</span><span class="biz-val">${isGST ? 'GST Invoice' : 'Invoice'}</span></div>`)

  const bizGridHtml = `
    <div class="biz-grid">
      <div class="biz-col">${bizLeft.join('')}</div>
      <div class="biz-col">${bizRight.join('')}</div>
    </div>`

  // ── Greeting ─────────────────────────────────────────────────────────────
  const customerFirstName =
    bill.customer_name && bill.customer_name !== 'Walk-in Customer'
      ? esc(bill.customer_name.split(' ')[0])
      : null
  const greetingLine = customerFirstName
    ? `Hi ${customerFirstName}, here's your bill!`
    : `Here's your bill!`

  // ── Bill meta row ────────────────────────────────────────────────────────
  const maskedPhone = bill.customer_phone ? maskPhone(bill.customer_phone) : null

  // ── GST column header ────────────────────────────────────────────────────
  const gstColHeader = isGST ? '<th class="tc gst-th">GST %</th>' : ''

  // ── Disc % column — only render when at least one line is discounted ───────
  const hasItemDiscount = bill.items.some(it => Number(it.discount_percentage || 0) > 0)
  const discColHeader = hasItemDiscount ? '<th class="tc">Disc %</th>' : ''

  // ── Items rows ───────────────────────────────────────────────────────────
  const itemRows = bill.items
    .map((item, i) => {
      const gstCell = isGST
        ? `<td class="tc muted">${item.gst_percentage}%</td>`
        : ''
      const disc = Number(item.discount_percentage || 0)
      const discCell = hasItemDiscount
        ? `<td class="tc muted">${disc > 0 ? `${disc}%` : '−'}</td>`
        : ''
      return `
      <tr class="${i % 2 === 0 ? '' : 'row-alt'}">
        <td class="item-td">
          <span class="item-name">${esc(item.product_name)}</span>
          ${item.item_code ? `<span class="item-code">${esc(item.item_code)}</span>` : ''}
        </td>
        <td class="tc">${item.quantity}</td>
        <td class="tr">${formatCurrency(item.rate)}</td>
        ${discCell}
        ${gstCell}
        <td class="tr fw">${formatCurrency(item.amount)}</td>
      </tr>`
    })
    .join('')

  // ── Totals ────────────────────────────────────────────────────────────────
  const discountAmount = bill.discount_amount || 0
  const negotiableAmount = bill.negotiable_amount || 0

  const totalRows: string[] = []
  totalRows.push(
    `<tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${formatCurrency(bill.subtotal || grandTotal)}</td></tr>`
  )
  if (discountAmount > 0) {
    const discLabel = bill.discount_percentage
      ? `Discount (${bill.discount_percentage}%)`
      : 'Discount'
    totalRows.push(
      `<tr><td class="tot-lbl">${discLabel}</td><td class="tot-val green">− ${formatCurrency(discountAmount)}</td></tr>`
    )
  } else if (negotiableAmount > 0) {
    totalRows.push(
      `<tr><td class="tot-lbl">Negotiated</td><td class="tot-val green">− ${formatCurrency(negotiableAmount)}</td></tr>`
    )
  }
  const membershipRedeemed = Number(bill.membership_redeemed) || 0
  if (membershipRedeemed > 0) {
    const ptsLabel = bill.membership?.points_redeemed
      ? `Points Redeemed (${bill.membership.points_redeemed} pts)`
      : 'Points Redeemed'
    totalRows.push(
      `<tr><td class="tot-lbl">${ptsLabel}</td><td class="tot-val green">− ${formatCurrency(membershipRedeemed)}</td></tr>`
    )
  }
  if (isGST) {
    totalRows.push(
      `<tr><td class="tot-lbl">CGST</td><td class="tot-val">${formatCurrency(bill.cgst)}</td></tr>`
    )
    totalRows.push(
      `<tr><td class="tot-lbl">SGST</td><td class="tot-val">${formatCurrency(bill.sgst)}</td></tr>`
    )
  }

  // ── Footer note ───────────────────────────────────────────────────────────
  const footerNote = clientInfo.receipt_footer
    ? `<p class="footer-note">${esc(clientInfo.receipt_footer)}</p>`
    : ''

  // ── Loyalty points panel (below card, festive) ────────────────────────────
  // Prefer the membership block (card program) over the legacy client-level points.
  const m = bill.membership
  const pointsPanel = m
    ? `<div class="points-panel">
         <div class="confetti-bg">
           <div class="points-inner">
             <div class="points-label">Member ${esc(m.card_number || '')}</div>
             <div class="points-value">+${m.points_earned} Points</div>
             <div class="points-sub">Balance: ${m.points_balance} pts &middot; T&amp;C applied</div>
           </div>
         </div>
       </div>`
    : bill.points_earned && bill.points_earned > 0
      ? `<div class="points-panel">
           <div class="confetti-bg">
             <div class="points-inner">
               <div class="points-label">You have earned</div>
               <div class="points-value">${bill.points_earned.toFixed(2)} Points</div>
               <div class="points-sub">T&amp;C applied</div>
             </div>
           </div>
         </div>`
      : ''

  // ── Pending banner ─────────────────────────────────────────────────────────
  const pendingBanner = isPending
    ? `<div class="pending-banner">⏳ &nbsp;PAYMENT PENDING — NOT YET COLLECTED</div>`
    : ''

  // ─── Full HTML ─────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${bill.bill_number} — ${esc(clientInfo.client_name)}</title>
<style>
/* ── Reset ─────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
:root{--brand:#6B0000;--brand-light:#fff5f5}   /* dark maroon; override per client if needed */

/* ── Page ──────────────────────────────────────────── */
body{
  font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
  background:#ebebeb;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:28px 16px 40px;
  color:#1a1a1a;
}

/* ── Card ──────────────────────────────────────────── */
.card{
  background:#fff;
  width:100%;
  max-width:500px;
  border-radius:16px 16px 0 0;   /* bottom rounded by SVG wave */
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.13);
}

/* ── Header (white bg, logo left, location right) ──── */
.hdr{
  background:#fff;
  padding:20px 22px 16px;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
}
.logo-circle{
  width:56px;height:56px;
  border-radius:50%;
  border:2.5px solid var(--brand);
  overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  background:var(--brand-light);
  flex-shrink:0;
}
.logo-img{width:100%;height:100%;object-fit:cover;display:block}
.logo-letter{font-size:22px;font-weight:800;color:var(--brand)}
.location-block{text-align:right;flex:1}
.location-line{font-size:12px;color:#555;display:flex;align-items:center;justify-content:flex-end;gap:4px}
.location-pin{font-size:13px}
.view-store{font-size:11px;font-weight:700;color:var(--brand);text-decoration:underline;margin-top:3px;cursor:pointer;display:block;text-align:right}

/* ── Brand bar ─────────────────────────────────────── */
.brand-bar{height:4px;background:var(--brand)}

/* ── Pending banner ────────────────────────────────── */
.pending-banner{
  background:#fef3c7;border-bottom:2px solid #f59e0b;
  color:#92400e;text-align:center;padding:9px;
  font-size:11.5px;font-weight:700;letter-spacing:1.2px;
}

/* ── Business info 2-col grid ──────────────────────── */
.biz-section{padding:14px 22px}
.biz-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.biz-col{}
.biz-row{margin-bottom:5px}
.biz-lbl{display:block;font-size:10px;color:#999;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
.biz-val{display:block;font-size:12px;color:#1a1a1a;font-weight:600;margin-top:1px}

/* ── Dashed separator ──────────────────────────────── */
.dash{
  border:none;
  border-top:1.5px dashed #d8d8d8;
  margin:0 22px;
}

/* ── Greeting ──────────────────────────────────────── */
.greeting-row{
  padding:12px 22px;
  display:flex;align-items:center;justify-content:space-between;
}
.greeting-text{font-size:13.5px;font-weight:600;color:#1a1a1a}
.dl-icon{font-size:16px;color:var(--brand)}

/* ── Amount hero row ───────────────────────────────── */
.amount-hero{padding:14px 22px}
.amount-row-top{display:flex;align-items:flex-start;justify-content:space-between}
.amount-main{font-size:26px;font-weight:900;color:#1a1a1a;letter-spacing:-0.5px}
.amount-payment{font-size:13px;color:#666;margin-top:2px;font-weight:500}
.status-chip{
  display:inline-block;font-size:9px;font-weight:800;letter-spacing:1.5px;
  padding:3px 10px;border-radius:20px;text-transform:uppercase;margin-left:6px;
  vertical-align:middle;
}
.chip-paid{background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7}
.chip-pending{background:#fef3c7;color:#92400e;border:1.5px solid #fcd34d}

.amount-meta{text-align:right}
.meta-date{font-size:11.5px;color:#555;font-weight:500}
.meta-items{font-size:11px;color:#999;margin-top:2px}

/* ── Bill # + phone row ────────────────────────────── */
.bill-meta-row{
  padding:0 22px 14px;
  display:flex;justify-content:space-between;align-items:center;
}
.meta-pill{
  font-size:11px;color:#666;
  background:#f5f5f5;border-radius:6px;padding:3px 10px;
}
.meta-pill strong{color:#1a1a1a;font-weight:700}
.cashier-note{font-size:10.5px;color:#aaa}

/* ── Items table ───────────────────────────────────── */
.items-section{padding:0 22px 0}
.items-label{
  font-size:9.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:1.5px;color:#aaa;
  margin-bottom:8px;
}
.items-tbl{border-collapse:collapse;width:100%}
.items-tbl th{
  font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.5px;color:#999;
  padding:6px 4px 8px;
  border-bottom:1px dashed #ddd;
}
.items-tbl td{
  padding:9px 4px;font-size:12.5px;color:#1a1a1a;
  border-bottom:1px dashed #f0f0f0;
}
.row-alt td{background:#fdfdfd}
.item-td{max-width:180px}
.item-name{display:block;font-weight:700;color:#111}
.item-code{display:block;font-size:9.5px;color:#ccc;margin-top:1px}
.gst-th{color:#bbb}
.muted{color:#bbb;font-size:11.5px}
.tc{text-align:center}
.tr{text-align:right}
.fw{font-weight:700}

/* ── Totals ────────────────────────────────────────── */
.totals-section{padding:12px 22px 14px}
.tot-tbl{border-collapse:collapse;width:100%}
.tot-lbl{font-size:12px;color:#777;padding:5px 0}
.tot-val{font-size:12px;color:#333;text-align:right;padding:5px 0;font-weight:500}
.green{color:#059669}
.grand-row td{padding-top:10px !important;border-top:2px solid #1a1a1a !important}
.grand-lbl{font-size:15px;font-weight:900;color:#1a1a1a}
.grand-val{font-size:22px;font-weight:900;color:var(--brand);text-align:right}

/* ── Footer inside card ────────────────────────────── */
.card-footer{padding:14px 22px 0;text-align:center}
.footer-note{font-size:11px;color:#888;margin-bottom:6px;line-height:1.6}

/* ── Wavy bottom SVG ───────────────────────────────── */
.wave-wrap{display:block;line-height:0;margin-top:12px}
.wave-wrap svg{display:block;width:100%}

/* ── Loyalty points panel (below card) ─────────────── */
.points-panel{
  width:100%;max-width:500px;
  border-radius:0 0 16px 16px;
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.13);
  margin-top:-1px;
}
.confetti-bg{
  background:linear-gradient(135deg,#fff9e6 0%,#fff3cc 40%,#fff9e6 100%);
  padding:18px 22px;
  text-align:center;
  position:relative;
  border-top:1px solid #ffe082;
}
.confetti-bg::before{
  content:'🎉 🎊 🎁 🎉 🎊';
  position:absolute;top:6px;left:0;right:0;
  font-size:11px;letter-spacing:8px;opacity:.4;
  text-align:center;
}
.points-inner{position:relative;z-index:1}
.points-label{font-size:12px;color:#a16207;font-weight:500;margin-bottom:2px}
.points-value{font-size:22px;font-weight:900;color:#92400e;letter-spacing:-0.5px}
.points-sub{font-size:10px;color:#b45309;margin-top:4px}

/* ── Actions (hidden on print) ─────────────────────── */
.actions{
  width:100%;max-width:500px;
  display:flex;gap:12px;justify-content:center;
  padding:18px 0 0;
}
.btn{
  padding:11px 32px;border-radius:10px;
  font-size:13px;font-weight:700;
  cursor:pointer;border:none;
  transition:all .15s ease;letter-spacing:.3px;
}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.15)}
.btn-primary{background:var(--brand);color:#fff}
.btn-secondary{background:#fff;color:#555;border:1.5px solid #ddd}

/* ── Powered by ─────────────────────────────────────── */
.powered-row{
  width:100%;max-width:500px;
  text-align:center;padding:12px 0 4px;
  font-size:10px;color:#bbb;
}
.powered-row strong{color:#555}

/* ── Print ──────────────────────────────────────────── */
@media print{
  body{background:#fff;padding:0}
  .card{box-shadow:none;border-radius:0;max-width:100%}
  .points-panel,.powered-row,.actions{max-width:100%}
  .actions{display:none}
}
</style>
</head>
<body>

<!-- ═══ CARD ════════════════════════════════════════════ -->
<div class="card">

  <!-- Header: logo + location -->
  <div class="hdr">
    <div class="logo-circle">${logoInner}</div>
    <div class="location-block">
      <div class="location-line">
        <span class="location-pin">📍</span>
        <span>${cityLine}</span>
      </div>
      <span class="view-store">${esc(clientInfo.client_name)}</span>
    </div>
  </div>

  <!-- Brand accent bar -->
  <div class="brand-bar"></div>

  ${pendingBanner}

  <!-- Business info 2-col -->
  <div class="biz-section">${bizGridHtml}</div>

  <hr class="dash"/>

  <!-- Greeting -->
  <div class="greeting-row">
    <span class="greeting-text">${greetingLine}</span>
    <span class="dl-icon">⬇</span>
  </div>

  <hr class="dash"/>

  <!-- Amount hero -->
  <div class="amount-hero">
    <div class="amount-row-top">
      <div>
        <div class="amount-main">
          ${formatCurrency(grandTotal)}
          <span class="${isPending ? 'status-chip chip-pending' : 'status-chip chip-paid'}">${isPending ? 'Pending' : 'Paid'}</span>
        </div>
        <div class="amount-payment">${esc(paymentLabel)}</div>
      </div>
      <div class="amount-meta">
        <div class="meta-date">${formatDate(bill.created_at)}</div>
        <div class="meta-items">${bill.items.length} item${bill.items.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  </div>

  <!-- Bill # + masked phone row -->
  <div class="bill-meta-row">
    <span class="meta-pill">Bill <strong>#${bill.bill_number}</strong></span>
    ${maskedPhone ? `<span class="meta-pill">Mobile <strong>${esc(maskedPhone)}</strong></span>` : `<span class="cashier-note">Cashier: ${esc(bill.user_name || 'Admin')}</span>`}
  </div>

  <hr class="dash"/>

  <!-- Items -->
  <div class="items-section">
    <div class="items-label">Items</div>
    <table class="items-tbl">
      <thead>
        <tr>
          <th style="text-align:left">Item</th>
          <th class="tc">Qty</th>
          <th class="tr">Rate</th>
          ${discColHeader}
          ${gstColHeader}
          <th class="tr">Amt</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <hr class="dash" style="margin-top:8px"/>

  <!-- Totals -->
  <div class="totals-section">
    <table class="tot-tbl">
      ${totalRows.join('')}
      <tr class="grand-row">
        <td class="grand-lbl">Grand Total</td>
        <td class="grand-val">${formatCurrency(grandTotal)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer note -->
  ${footerNote ? `<div class="card-footer">${footerNote}</div>` : ''}

  <!-- Wavy bottom SVG — colour matches page background (#ebebeb) -->
  <div class="wave-wrap">
    <svg viewBox="0 0 500 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 Q12.5,28 25,0 Q37.5,28 50,0 Q62.5,28 75,0 Q87.5,28 100,0 Q112.5,28 125,0 Q137.5,28 150,0 Q162.5,28 175,0 Q187.5,28 200,0 Q212.5,28 225,0 Q237.5,28 250,0 Q262.5,28 275,0 Q287.5,28 300,0 Q312.5,28 325,0 Q337.5,28 350,0 Q362.5,28 375,0 Q387.5,28 400,0 Q412.5,28 425,0 Q437.5,28 450,0 Q462.5,28 475,0 Q487.5,28 500,0 L500,28 L0,28 Z" fill="#ebebeb"/>
    </svg>
  </div>

</div>
<!-- ═══ END CARD ═════════════════════════════════════════ -->

<!-- Loyalty points panel (festive, below card) -->
${pointsPanel}

<!-- Powered by -->
<div class="powered-row">Powered by <strong>Valoryx</strong></div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn btn-secondary" onclick="window.close()">Close</button>
  <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
</div>

</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=580,height=900,scrollbars=yes')
  if (!win) {
    toast.error('Popup blocked — please allow popups for this site to generate PDFs.')
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

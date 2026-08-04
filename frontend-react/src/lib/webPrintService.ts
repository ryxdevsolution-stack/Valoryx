/**
 * Web Print Service - UNIFIED RECEIPT FORMAT
 * Single source of truth for browser-based receipt printing
 *
 * Configuration matches backend/utils/thermal_printer.py for consistency
 */

import QRCode from 'qrcode'
import { formatBillNo } from '@/lib/billNumber'
import { CURRENCY_SYMBOLS } from '@/lib/regions'

// ============================================================================
// CONFIGURATION - Keep in sync with thermal_printer.py
// ============================================================================
const RECEIPT_CONFIG = {
  PAPER_WIDTH: '58mm',      // Actual printable width for thermal printers
  FONT_SIZE: '8pt',         // Base font size (smaller, cleaner)
  FONT_SIZE_LARGE: '11pt',  // Headers
  FONT_SIZE_XLARGE: '13pt', // Business name
  FONT_SIZE_SMALL: '7pt',   // Details
  ITEM_NAME_MAX: 18,        // Max characters for item name
} as const;

// ============================================================================
// TYPES
// ============================================================================
export interface BillItem {
  product_name: string;
  quantity: number;
  rate: number;
  amount: number;
  mrp?: number;
  gst_percentage?: number;
  discount_percentage?: number;  // per-line customer discount %
}

export interface BillData {
  bill_number: number;
  bill_prefix?: string | null;
  bill_no_display?: string | null;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  items: BillItem[];
  subtotal: number;
  discount_percentage?: number;
  discount_amount?: number;
  negotiable_amount?: number;
  gst_amount?: number;
  gst_percentage?: number;
  final_amount: number;
  total_amount: number;
  /** ₹ knocked off this bill by membership point redemption. */
  membership_redeemed?: number | null;
  /** Membership receipt block (card number, earn/redeem, balance). */
  membership?: {
    card_number: string;
    points_earned: number;
    points_redeemed: number;
    redeemed_amount: number;
    points_balance: number;
  } | null;
  payment_type: string;
  /** v42 partial payment — when a balance is outstanding the receipt shows
   *  Paid Amount / Balance Due under it, and the total line is labelled
   *  "Net Payable" instead of "Total" — nothing is payable on a settled bill. */
  payment_status?: 'paid' | 'pending' | 'partial';
  paid_amount?: number | string;
  balance_due?: number | string;
  created_at: string;
  type: 'gst' | 'non-gst';
  user_name?: string;
  created_by?: string;
  /** Per-bill regional currency, frozen at create time. */
  currency_code?: string;
  currency_symbol?: string;
  /** Tax components for this bill, e.g. [{name:'CGST',amount}, {name:'SGST',amount}]. */
  tax_breakdown?: { name: string; amount: number }[];
}

export interface ClientInfo {
  client_name: string;
  address?: string;
  address2?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  logo_url?: string;
  upi_id?: string;
  receipt_footer?: string;
}

export interface PrintResult {
  success: boolean;
  method: 'browser';
  message: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function formatDate(dateString: string): string {
  // Ensure the dateString is treated as UTC by appending 'Z' if not present
  let utcString = dateString;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // If it's just a date without time, add time
    utcString = dateString + 'T00:00:00Z';
  } else if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+')) {
    // If it has time but no timezone, add Z
    utcString = dateString + 'Z';
  }

  const date = new Date(utcString);
  // Convert to Asia/Kolkata timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  const formatter = new Intl.DateTimeFormat('en-GB', options);
  return formatter.format(date);
}

function formatTime(dateString: string): string {
  // Ensure the dateString is treated as UTC by appending 'Z' if not present
  let utcString = dateString;
  if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+')) {
    utcString = dateString + 'Z';
  }

  const date = new Date(utcString);
  // Convert to Asia/Kolkata timezone and format in 12-hour format
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  return timeStr;
}

function truncate(text: string, maxLen: number): string {
  if (text.length > maxLen) {
    return text.substring(0, maxLen - 2) + '..';
  }
  return text;
}

function formatNumber(val: number): string {
  if (val < 100) {
    return val.toFixed(2);
  }
  return Math.round(val).toString();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Resolve the currency symbol for a bill without React hooks.
 * Order: explicit symbol on bill → code map on bill → client in localStorage → ₹.
 */
function resolveCurrencySymbol(bill: BillData): string {
  if (bill.currency_symbol) return bill.currency_symbol;
  if (bill.currency_code && CURRENCY_SYMBOLS[bill.currency_code]) {
    return CURRENCY_SYMBOLS[bill.currency_code];
  }
  try {
    const client = JSON.parse(localStorage.getItem('client') || '{}');
    if (client.currency_symbol) return client.currency_symbol;
    if (client.currency_code && CURRENCY_SYMBOLS[client.currency_code]) {
      return CURRENCY_SYMBOLS[client.currency_code];
    }
  } catch {
    /* localStorage unavailable / bad JSON */
  }
  return '₹';
}

/**
 * Resolve the tax label (e.g. "GST", "VAT") for a bill without React hooks.
 * Order: first tax_breakdown name → client tax_config name → GST.
 */
function resolveTaxLabel(bill: BillData): string {
  if (bill.tax_breakdown?.[0]?.name) return bill.tax_breakdown[0].name;
  try {
    const client = JSON.parse(localStorage.getItem('client') || '{}');
    if (client.tax_config?.name) return client.tax_config.name;
  } catch {
    /* localStorage unavailable / bad JSON */
  }
  return 'GST';
}

// ============================================================================
// RECEIPT HTML GENERATOR - UNIFIED FORMAT
// ============================================================================
export async function generateUpiQrDataUrl(
  upiId: string,
  shopName: string,
  amount?: number,
  billNumber?: number | string,
): Promise<string> {
  if (!upiId) return ''
  try {
    const params = [`pa=${upiId}`, `pn=${encodeURIComponent(shopName || 'Shop')}`]
    if (amount !== undefined && Number.isFinite(Number(amount)) && Number(amount) > 0) {
      params.push(`am=${Number(amount).toFixed(2)}`)
      params.push('cu=INR')
    }
    if (billNumber !== undefined && billNumber !== null && String(billNumber).trim() !== '') {
      params.push(`tn=${encodeURIComponent(`Bill ${billNumber}`)}`)
    }
    const upiUrl = `upi://pay?${params.join('&')}`
    return await QRCode.toDataURL(upiUrl, { width: 150, margin: 1, errorCorrectionLevel: 'M' })
  } catch {
    return ''
  }
}

export function generateReceiptHtml(
  bill: BillData,
  clientInfo: ClientInfo,
  showNoExchange: boolean = true,
  qrDataUrl?: string
): string {
  const { PAPER_WIDTH, FONT_SIZE, FONT_SIZE_LARGE, FONT_SIZE_XLARGE, FONT_SIZE_SMALL, ITEM_NAME_MAX } = RECEIPT_CONFIG;

  // Resolve regional currency/tax from the bill (with localStorage fallback).
  const currencySymbol = resolveCurrencySymbol(bill);
  const taxLabel = resolveTaxLabel(bill);

  // Calculate totals
  const totalItems = bill.items.length;
  const totalQty = bill.items.reduce((sum, item) => sum + Number(item.quantity), 0);

  const subtotal = Number(bill.subtotal) || 0;
  const gstAmount = Number(bill.gst_amount) || 0;
  const negotiable = Number(bill.negotiable_amount) || 0;
  const discount = Number(bill.discount_amount) || 0;
  const actualDiscount = negotiable > 0 ? negotiable : discount;

  // Calculate final amount — membership point redemption also reduces what the
  // customer pays (mirrors the server's final_amount).
  const membershipRedeemed = Number(bill.membership_redeemed) || 0;
  let finalAmount = 0;
  if (bill.type === 'gst') {
    finalAmount = subtotal + gstAmount - actualDiscount - membershipRedeemed;
  } else {
    finalAmount = subtotal - actualDiscount - membershipRedeemed;
  }
  finalAmount = Math.max(0, finalAmount);

  const grandTotal = Math.round(finalAmount);

  // v42 partial payment. Prefer the server's balance_due; fall back to
  // total - paid so a bill fetched by an older endpoint still prints right.
  // A fully-settled bill prints nothing extra (balanceDue === 0).
  const paidAmount = bill.paid_amount != null ? Number(bill.paid_amount)
    : (bill.payment_status === 'pending' ? 0 : grandTotal);
  const balanceDue = bill.balance_due != null ? Number(bill.balance_due)
    : Math.max(grandTotal - paidAmount, 0);

  // Calculate savings (MRP savings + discount)
  let totalSavings = 0;

  for (const item of bill.items) {
    const mrp = Number(item.mrp) > 0 ? Number(item.mrp) : Number(item.rate);
    const rate = Number(item.rate);
    const qty = Number(item.quantity);

    if (mrp > rate) {
      totalSavings += (mrp - rate) * qty;
    }
  }

  // Include discount + redeemed points in savings
  totalSavings += actualDiscount + membershipRedeemed;

  // Format payment info with amounts
  let paymentDisplay = '';
  try {
    const payments = JSON.parse(bill.payment_type);
    if (Array.isArray(payments) && payments.length > 0) {
      paymentDisplay = payments
        .map((p: { payment_type: string; amount: number }) =>
          `${p.payment_type}: ${parseFloat(String(p.amount)).toFixed(2)}`
        )
        .join(', ');
    } else {
      paymentDisplay = escapeHtml(bill.payment_type);
    }
  } catch {
    paymentDisplay = escapeHtml(bill.payment_type);
  }

  // Calculate total MRP and total rate
  let totalMrp = 0;
  let totalRate = 0;

  for (const item of bill.items) {
    const mrp = Number(item.mrp) > 0 ? Number(item.mrp) : Number(item.rate);
    const rate = Number(item.rate);
    const qty = Number(item.quantity);
    totalMrp += mrp * qty;
    totalRate += rate * qty;
  }

  // Build items HTML
  let itemsHtml = '';
  for (const item of bill.items) {
    const name = item.product_name;
    const mrp = Number(item.mrp) > 0 ? Number(item.mrp) : Number(item.rate);
    const rate = Number(item.rate);
    const qty = Number(item.quantity);
    const amt = Number(item.amount);
    const disc = Number(item.discount_percentage || 0);
    // Show the discount as a sub-line so a discounted line reads correctly
    // (the col-rate shows the list rate; amt is already net of the discount).
    const discNote = disc > 0
      ? `<div class="item-discount-note">${disc}% discount</div>`
      : '';

    itemsHtml += `
    <div class="item-row">
      <span class="col-product">${escapeHtml(name)}${discNote}</span>
      <span class="col-qty">${qty}</span>
      <span class="col-mrp">${formatNumber(mrp)}</span>
      <span class="col-rate">${formatNumber(rate)}</span>
      <span class="col-amt">${formatNumber(amt)}</span>
    </div>`;
  }

  // Build tax breakdown text (inline format like reference).
  // Prefer the bill's tax_breakdown components (region-aware); fall back to the
  // legacy CGST/SGST split when no breakdown is present.
  let gstBreakdownText = '';
  if (bill.type === 'gst' && gstAmount > 0) {
    const taxableAmount = subtotal;
    const components = bill.tax_breakdown && bill.tax_breakdown.length > 0
      ? bill.tax_breakdown
      : [
          { name: 'CGST', amount: gstAmount / 2 },
          { name: 'SGST', amount: gstAmount / 2 },
        ];
    const componentsText = components
      .map(c => `${c.name} = ${Number(c.amount).toFixed(2)}`)
      .join(' - ');
    gstBreakdownText = `${taxLabel} ${bill.gst_percentage || 18}% on ${taxableAmount.toFixed(2)} - ${componentsText}`;
  }

  // Build complete HTML - MATCHING REFERENCE RECEIPT EXACTLY
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${formatBillNo(bill)}</title>
  <style>
    @page { size: 80mm auto; margin: 0mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      body { width: ${PAPER_WIDTH} !important; margin: 0 auto !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      width: ${PAPER_WIDTH};
      max-width: ${PAPER_WIDTH};
      background: #fff;
      color: #000;
      font-size: ${FONT_SIZE};
      font-weight: 600;
      line-height: 1.3;
      padding: 1mm 0mm;
      margin: 0 auto;
      letter-spacing: -0.3px;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .dashed { border-bottom: 1px dashed #000; margin: 1.5mm 0; }
    .row { margin-bottom: 0.5mm; }
    .row-flex { display: flex; justify-content: space-between; margin-bottom: 0.5mm; }
    .item-header, .item-row {
      display: flex;
      font-size: ${FONT_SIZE_SMALL};
      margin-bottom: 0.5mm;
    }
    .item-header { font-weight: 700; }
    .col-product { flex: 1; min-width: 0; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; }
    .col-qty { width: 8mm; text-align: center; flex-shrink: 0; }
    .col-mrp { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-rate { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-amt { width: 12mm; text-align: right; font-weight: 700; flex-shrink: 0; }
    .item-discount-note { font-size: ${FONT_SIZE_SMALL}; font-style: italic; opacity: 0.75; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="center bold" style="font-size: ${FONT_SIZE_XLARGE}; margin-bottom: 1mm;">${escapeHtml(clientInfo.client_name || 'Business Name')}</div>
  ${clientInfo.address ? `<div class="center" style="font-size: ${FONT_SIZE_SMALL};">${escapeHtml(clientInfo.address).replace(/\n/g, '<br>')}</div>` : ''}
  ${clientInfo.address2 ? `<div class="center" style="font-size: ${FONT_SIZE_SMALL};">${escapeHtml(clientInfo.address2)}</div>` : ''}
  ${clientInfo.phone ? `<div class="center" style="font-size: ${FONT_SIZE_SMALL};">${escapeHtml(clientInfo.phone)}</div>` : ''}
  ${clientInfo.gstin ? `<div class="center bold" style="font-size: ${FONT_SIZE_SMALL};">GST NO : ${escapeHtml(clientInfo.gstin)}</div>` : ''}
  <div class="dashed"></div>

  <!-- Bill Info -->
  <div style="font-size: ${FONT_SIZE_SMALL};">
    <div class="row-flex"><span><strong>Bill No  :</strong> ${formatBillNo(bill)}</span><span>${paymentDisplay}</span></div>
    <div class="row"><strong>Date     :</strong> ${formatDate(bill.created_at)}</div>
    <div class="row"><strong>Time     :</strong> ${formatTime(bill.created_at)}</div>
  </div>
  <div class="dashed"></div>

  <!-- Items Header -->
  <div class="item-header">
    <span class="col-product">Product</span>
    <span class="col-qty">Qty</span>
    <span class="col-mrp">MRP</span>
    <span class="col-rate">Rate</span>
    <span class="col-amt">Amt</span>
  </div>
  <div class="dashed"></div>

  <!-- Items -->
  ${itemsHtml}
  <div class="dashed"></div>

  <!-- Totals Summary.
       "Total Rate" (sum of rate x qty) equals "Total Amount" (the subtotal) on
       an ordinary bill, so printing both showed the same figure twice. It is
       kept only when per-line discounts make them differ, where it genuinely
       shows the pre-discount value. The final line is "Grand Total" when
       settled and "Net Payable" only while money is still owed. -->
  <div style="font-size: ${FONT_SIZE_SMALL};">
    <div class="row-flex"><span>Total Items : ${totalItems}</span><span style="font-size: 14px; font-weight: 700;">Total Amount : ${subtotal.toFixed(2)}</span></div>
    <div class="row">Total Mrp : ${totalMrp.toFixed(2)}</div>
    ${Math.abs(totalRate - subtotal) > 0.01 ? `<div class="row">Total Rate : ${totalRate.toFixed(2)}</div>` : ''}
    ${actualDiscount > 0 ? `<div class="row"><span style="font-size: ${FONT_SIZE_LARGE}; font-weight: 700;">Total Discount : ${actualDiscount.toFixed(2)}</span></div>` : ''}
    ${membershipRedeemed > 0 ? `<div class="row"><span style="font-size: ${FONT_SIZE_LARGE}; font-weight: 700;">Points Redeemed${bill.membership ? ` (${bill.membership.points_redeemed} pts)` : ''} : -${membershipRedeemed.toFixed(2)}</span></div>` : ''}
    <div class="row"><span style="font-size: 14px; font-weight: 700;">${balanceDue > 0 ? 'Net Payable' : 'Grand Total'} : ${grandTotal.toFixed(2)}</span></div>
    ${balanceDue > 0 ? `
    <div class="row"><span style="font-size: 14px; font-weight: 700;">Paid Amount : ${paidAmount.toFixed(2)}</span></div>
    <div class="row"><span style="font-size: 14px; font-weight: 700;">Balance Due : ${balanceDue.toFixed(2)}</span></div>` : ''}
  </div>
  <div class="dashed"></div>

  <!-- Membership summary (earned this bill + balance after) -->
  ${bill.membership ? `
  <div class="center" style="font-size: ${FONT_SIZE_SMALL}; margin: 1mm 0;">
    Member ${escapeHtml(bill.membership.card_number || '')}
    &middot; Earned ${bill.membership.points_earned} pts
    &middot; Balance ${bill.membership.points_balance} pts
  </div>
  <div class="dashed"></div>` : ''}

  <!-- GST Breakdown (if GST bill) -->
  ${gstBreakdownText ? `<div class="center" style="font-size: ${FONT_SIZE_SMALL};">${gstBreakdownText}</div>` : ''}

  <!-- Savings Box -->
  ${totalSavings > 0 ? `
  <div style="text-align: center; margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000;">
    <div style="font-size: ${FONT_SIZE_SMALL};">TODAY'S SAVINGS</div>
    <div style="font-size: ${FONT_SIZE_LARGE}; font-weight: bold; margin: 0.5mm 0;">${currencySymbol}${totalSavings.toFixed(2)}</div>
    <div style="font-size: ${FONT_SIZE_SMALL};">You saved compared to MRP!</div>
  </div>` : ''}

  <!-- UPI QR Code -->
  ${qrDataUrl ? `
  <div style="text-align: center; margin: 2mm 0;">
    <div style="font-size: ${FONT_SIZE_SMALL}; font-weight: bold;">Scan to Pay ${currencySymbol}${grandTotal}</div>
    <img src="${qrDataUrl}" style="width: 18mm; height: 18mm; margin: 0.5mm 0;" />
    <div style="font-size: 6pt;">UPI: ${escapeHtml(clientInfo.upi_id || '')}</div>
  </div>
  ` : (clientInfo.upi_id ? `<div class="center" style="font-size: ${FONT_SIZE_SMALL}; margin-top: 1mm;">UPI: ${escapeHtml(clientInfo.upi_id)}</div>` : '')}

  <!-- Footer -->
  <div class="center bold" style="font-size: ${FONT_SIZE}; margin-top: 2mm;">${escapeHtml(clientInfo.receipt_footer || 'Sorry, No Exchange / No Refund')}</div>
</body>
</html>`;
}

// ============================================================================
// PRINT FUNCTIONS
// ============================================================================

/**
 * Print bill using browser's print dialog (iframe-based, no popup needed)
 */
export async function printBill(
  bill: BillData,
  clientInfo: ClientInfo,
  showNoExchange: boolean = true
): Promise<PrintResult> {
  try {
    // Generate UPI QR code data URL if UPI ID is set (with prefilled amount + bill no)
    const payAmount = bill.type === 'gst' ? Number(bill.final_amount) : Number(bill.total_amount)
    const qrDataUrl = clientInfo.upi_id
      ? await generateUpiQrDataUrl(clientInfo.upi_id, clientInfo.client_name || '', payAmount, bill.bill_number)
      : undefined
    const html = generateReceiptHtml(bill, clientInfo, showNoExchange, qrDataUrl);

    // Remove any existing print iframe
    const existingFrame = document.getElementById('print-iframe');
    if (existingFrame) {
      existingFrame.remove();
    }

    // Create hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      return {
        success: false,
        method: 'browser',
        message: 'Could not access iframe document for printing.',
      };
    }

    let printTriggered = false;
    const triggerPrint = () => {
      if (printTriggered) return;
      printTriggered = true;

      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Print error:', e);
      }

      setTimeout(() => {
        const frame = document.getElementById('print-iframe');
        if (frame) frame.remove();
      }, 5000);
    };

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    setTimeout(triggerPrint, 100);

    return {
      success: true,
      method: 'browser',
      message: 'Print dialog opened successfully',
    };
  } catch (error) {
    return {
      success: false,
      method: 'browser',
      message: error instanceof Error ? error.message : 'Print failed',
    };
  }
}

/**
 * Download receipt as PDF (opens in new tab for user to save)
 */
export function downloadPdf(
  bill: BillData,
  clientInfo: ClientInfo,
  showNoExchange: boolean = true
): PrintResult {
  try {
    const html = generateReceiptHtml(bill, clientInfo, showNoExchange);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const newTab = window.open(url, '_blank');
    if (!newTab) {
      return {
        success: false,
        method: 'browser',
        message: 'Could not open new tab. Please allow popups for this site.',
      };
    }

    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return {
      success: true,
      method: 'browser',
      message: 'PDF opened in new tab',
    };
  } catch (error) {
    return {
      success: false,
      method: 'browser',
      message: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }
}

/**
 * Share bill summary via WhatsApp
 */
export function shareWhatsApp(bill: BillData, clientInfo: ClientInfo): PrintResult {
  try {
    const finalAmount = bill.type === 'gst' ? bill.final_amount : bill.total_amount;
    const date = formatDate(bill.created_at);
    const currencySymbol = resolveCurrencySymbol(bill);

    // Partial payment: a shared summary saying only "Total: ₹5000" would hide
    // that the customer still owes money — state the balance explicitly.
    const shareTotal = Math.round(Number(finalAmount));
    const sharePaid = bill.paid_amount != null ? Number(bill.paid_amount)
      : (bill.payment_status === 'pending' ? 0 : shareTotal);
    const shareBalance = bill.balance_due != null ? Number(bill.balance_due)
      : Math.max(shareTotal - sharePaid, 0);

    const message = encodeURIComponent(
      `*${clientInfo.client_name || 'Bill'}*\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Bill No: ${formatBillNo(bill)}\n` +
      `Date: ${date}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Items: ${bill.items.length}\n` +
      `Total: ${currencySymbol}${shareTotal}\n` +
      (shareBalance > 0
        ? `Paid: ${currencySymbol}${sharePaid.toFixed(2)}\n` +
          `Balance Due: ${currencySymbol}${shareBalance.toFixed(2)}\n`
        : '') +
      `Payment: ${bill.payment_type}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Thank you for your purchase!`
    );

    const phone = bill.customer_phone ? bill.customer_phone.replace(/\D/g, '') : '';
    const whatsappUrl = phone
      ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(whatsappUrl, '_blank');

    return {
      success: true,
      method: 'browser',
      message: 'WhatsApp opened',
    };
  } catch (error) {
    return {
      success: false,
      method: 'browser',
      message: error instanceof Error ? error.message : 'WhatsApp share failed',
    };
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================
const webPrintService = {
  generateReceiptHtml,
  printBill,
  downloadPdf,
  shareWhatsApp,
  RECEIPT_CONFIG,
};

export default webPrintService;

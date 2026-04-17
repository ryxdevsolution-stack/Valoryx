/**
 * Web Print Service - UNIFIED RECEIPT FORMAT
 * Single source of truth for browser-based receipt printing
 *
 * Configuration matches backend/utils/thermal_printer.py for consistency
 */

import QRCode from 'qrcode'

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
}

export interface BillData {
  bill_number: number;
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
  payment_type: string;
  created_at: string;
  type: 'gst' | 'non-gst';
  user_name?: string;
  created_by?: string;
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

// ============================================================================
// RECEIPT HTML GENERATOR - UNIFIED FORMAT
// ============================================================================
export async function generateUpiQrDataUrl(
  upiId: string,
  shopName: string,
  amount?: number,
  billNumber?: string | number
): Promise<string> {
  if (!upiId) return ''
  try {
    const parts = [
      `pa=${upiId}`,
      `pn=${encodeURIComponent(shopName || 'Shop')}`,
      `cu=INR`,
    ]
    if (amount && amount > 0) parts.push(`am=${amount.toFixed(2)}`)
    if (billNumber) parts.push(`tn=${encodeURIComponent(`Bill ${billNumber}`)}`)
    const upiUrl = `upi://pay?${parts.join('&')}`
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

  // Calculate totals
  const totalItems = bill.items.length;
  const totalQty = bill.items.reduce((sum, item) => sum + Number(item.quantity), 0);

  const subtotal = Number(bill.subtotal) || 0;
  const gstAmount = Number(bill.gst_amount) || 0;
  const negotiable = Number(bill.negotiable_amount) || 0;
  const discount = Number(bill.discount_amount) || 0;
  const actualDiscount = negotiable > 0 ? negotiable : discount;

  // Calculate final amount
  let finalAmount = 0;
  if (bill.type === 'gst') {
    finalAmount = subtotal + gstAmount - actualDiscount;
  } else {
    finalAmount = subtotal - actualDiscount;
  }
  finalAmount = Math.max(0, finalAmount);

  const grandTotal = Math.round(finalAmount);

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

  // Include discount in savings
  totalSavings += actualDiscount;

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

    itemsHtml += `
    <div class="item-row">
      <span class="col-product">${escapeHtml(name)}</span>
      <span class="col-qty">${qty}</span>
      <span class="col-mrp">${formatNumber(mrp)}</span>
      <span class="col-rate">${formatNumber(rate)}</span>
      <span class="col-amt">${formatNumber(amt)}</span>
    </div>`;
  }

  // Build GST breakdown text (inline format like reference)
  let gstBreakdownText = '';
  if (bill.type === 'gst' && gstAmount > 0) {
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;
    const taxableAmount = subtotal;
    gstBreakdownText = `GST ${bill.gst_percentage || 18}% on ${taxableAmount.toFixed(2)} - CGST =${cgst.toFixed(2)} - SGST = ${sgst.toFixed(2)}`;
  }

  // Build complete HTML - MATCHING REFERENCE RECEIPT EXACTLY
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${bill.bill_number}</title>
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
    <div class="row-flex"><span><strong>Bill No  :</strong> ${bill.bill_number}</span><span>${paymentDisplay}</span></div>
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

  <!-- Totals Summary -->
  <div style="font-size: ${FONT_SIZE_SMALL};">
    <div class="row-flex"><span>Total Items : ${totalItems}</span><span style="font-size: 14px; font-weight: 700;">Total Amount : ${subtotal.toFixed(2)}</span></div>
    <div class="row">Total Mrp : ${totalMrp.toFixed(2)}</div>
    <div class="row">Total Rate : ${totalRate.toFixed(2)}</div>
    ${actualDiscount > 0 ? `<div class="row"><span style="font-size: ${FONT_SIZE_LARGE}; font-weight: 700;">Total Discount : ${actualDiscount.toFixed(2)}</span></div>` : ''}
  </div>
  <div class="dashed"></div>

  <!-- GST Breakdown (if GST bill) -->
  ${gstBreakdownText ? `<div class="center" style="font-size: ${FONT_SIZE_SMALL};">${gstBreakdownText}</div>` : ''}

  <!-- Savings Box -->
  ${totalSavings > 0 ? `
  <div style="text-align: center; margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000;">
    <div style="font-size: ${FONT_SIZE_SMALL};">TODAY'S SAVINGS</div>
    <div style="font-size: ${FONT_SIZE_LARGE}; font-weight: bold; margin: 0.5mm 0;">&#8377;${totalSavings.toFixed(2)}</div>
    <div style="font-size: ${FONT_SIZE_SMALL};">You saved compared to MRP!</div>
  </div>` : ''}

  <!-- UPI QR Code -->
  ${qrDataUrl ? `
  <div style="text-align: center; margin: 2mm 0;">
    <div style="font-size: ${FONT_SIZE_SMALL}; font-weight: bold; margin-bottom: 1mm;">Scan to Pay</div>
    <img src="${qrDataUrl}" style="width: 25mm; height: 25mm;" />
    <div style="font-size: ${FONT_SIZE_SMALL}; margin-top: 1mm;">UPI: ${escapeHtml(clientInfo.upi_id || '')}</div>
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
    // Generate UPI QR code data URL if UPI ID is set (with amount + bill no pre-filled)
    const qrAmount = Number(bill.final_amount ?? bill.total_amount) || 0
    const qrDataUrl = clientInfo.upi_id
      ? await generateUpiQrDataUrl(clientInfo.upi_id, clientInfo.client_name || '', qrAmount, bill.bill_number)
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

    const message = encodeURIComponent(
      `*${clientInfo.client_name || 'Bill'}*\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Bill No: ${bill.bill_number}\n` +
      `Date: ${date}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Items: ${bill.items.length}\n` +
      `Total: Rs. ${Math.round(Number(finalAmount))}\n` +
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

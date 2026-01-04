/**
 * Web Print Service - UNIFIED RECEIPT FORMAT
 * Single source of truth for browser-based receipt printing
 *
 * Configuration matches backend/utils/thermal_printer.py for consistency
 */

// ============================================================================
// CONFIGURATION - Keep in sync with thermal_printer.py
// ============================================================================
const RECEIPT_CONFIG = {
  PAPER_WIDTH: '72mm',      // Actual printable width (80mm - margins)
  FONT_SIZE: '9pt',         // Base font size
  FONT_SIZE_LARGE: '12pt',  // Headers
  FONT_SIZE_SMALL: '8pt',   // Details
  COL_QTY: '6mm',           // Quantity column
  COL_MRP: '11mm',          // MRP column
  COL_RATE: '11mm',         // Rate column
  COL_AMT: '12mm',          // Amount column
  ITEM_NAME_MAX: 20,        // Max characters for item name
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
  phone?: string;
  email?: string;
  gstin?: string;
  logo_url?: string;
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
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = (hours % 12 || 12).toString().padStart(2, '0');
  return `${displayHours}:${minutes}:${seconds} ${ampm}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length > maxLen) {
    return text.substring(0, maxLen - 2) + '..';
  }
  return text;
}

function formatNumber(val: number): string {
  // Format numbers compactly for large values
  if (val >= 1000) {
    return Math.round(val).toString();
  }
  return val.toFixed(2);
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
export function generateReceiptHtml(
  bill: BillData,
  clientInfo: ClientInfo,
  showNoExchange: boolean = true
): string {
  const { PAPER_WIDTH, FONT_SIZE, FONT_SIZE_LARGE, FONT_SIZE_SMALL, COL_QTY, COL_MRP, COL_RATE, COL_AMT, ITEM_NAME_MAX } = RECEIPT_CONFIG;

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

  const roundOff = Math.round(finalAmount) - finalAmount;
  const grandTotal = Math.round(finalAmount);

  // Calculate savings and GST breakdown
  let totalSavings = 0;
  const gstBreakdown: Record<number, { taxable: number; gst: number }> = {};

  for (const item of bill.items) {
    const mrp = Number(item.mrp) > 0 ? Number(item.mrp) : Number(item.rate);
    const rate = Number(item.rate);
    const qty = Number(item.quantity);

    if (mrp > rate) {
      totalSavings += (mrp - rate) * qty;
    }

    const gstPct = Number(item.gst_percentage) || 0;
    if (gstPct > 0) {
      const taxableAmt = qty * rate;
      const gstForItem = (taxableAmt * gstPct) / 100;
      if (!gstBreakdown[gstPct]) {
        gstBreakdown[gstPct] = { taxable: 0, gst: 0 };
      }
      gstBreakdown[gstPct].taxable += taxableAmt;
      gstBreakdown[gstPct].gst += gstForItem;
    }
  }

  // Include discount in savings
  totalSavings += actualDiscount;

  // Format payment info
  let paymentHtml = '';
  try {
    const payments = JSON.parse(bill.payment_type);
    if (Array.isArray(payments) && payments.length > 0) {
      paymentHtml = payments
        .map((p: { payment_type: string; amount: number }) =>
          `${p.payment_type}: Rs.${parseFloat(String(p.amount)).toFixed(2)}`
        )
        .join('<br>');
    } else {
      paymentHtml = escapeHtml(bill.payment_type);
    }
  } catch {
    paymentHtml = escapeHtml(bill.payment_type);
  }

  // User name
  let userName = bill.user_name || bill.created_by || 'Admin';
  if (userName.length > 15) {
    userName = userName.substring(0, 12) + '...';
  }

  // Build items HTML
  let itemsHtml = '';
  for (const item of bill.items) {
    const name = truncate(item.product_name, ITEM_NAME_MAX);
    const mrp = Number(item.mrp) > 0 ? Number(item.mrp) : Number(item.rate);
    const rate = Number(item.rate);
    const qty = Number(item.quantity);
    const amt = Number(item.amount);

    itemsHtml += `
    <div class="item-row">
      <span class="col-name">${escapeHtml(name)}</span>
      <span class="col-qty">${qty}</span>
      <span class="col-mrp">${formatNumber(mrp)}</span>
      <span class="col-rate">${formatNumber(rate)}</span>
      <span class="col-amt">${formatNumber(amt)}</span>
    </div>`;
  }

  // Build GST breakdown HTML
  let gstBreakdownHtml = '';
  if (bill.type === 'gst' && Object.keys(gstBreakdown).length > 0) {
    gstBreakdownHtml = `
    <div class="center small bold">GST BREAKDOWN</div>
    <table class="gst-table">
      <tr><th>Tax%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total</th></tr>`;
    for (const gstPct of Object.keys(gstBreakdown).map(Number).sort()) {
      const data = gstBreakdown[gstPct];
      const cgstAmt = data.gst / 2;
      gstBreakdownHtml += `
      <tr>
        <td>${gstPct}%</td>
        <td>${Math.round(data.taxable)}</td>
        <td>${cgstAmt.toFixed(2)}</td>
        <td>${cgstAmt.toFixed(2)}</td>
        <td>${data.gst.toFixed(2)}</td>
      </tr>`;
    }
    gstBreakdownHtml += '</table>';
  }

  // Build complete HTML
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${bill.bill_number}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      body { width: ${PAPER_WIDTH} !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', 'Consolas', monospace;
      width: ${PAPER_WIDTH};
      max-width: ${PAPER_WIDTH};
      background: #fff;
      color: #000;
      font-size: ${FONT_SIZE};
      font-weight: 600;
      line-height: 1.3;
      padding: 2mm;
      -webkit-font-smoothing: none;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .large { font-size: ${FONT_SIZE_LARGE}; font-weight: 900; }
    .small { font-size: ${FONT_SIZE_SMALL}; }
    .dashed { border-bottom: 1px dashed #000; margin: 2mm 0; }
    .solid { border-bottom: 2px solid #000; margin: 2mm 0; }
    .row { margin-bottom: 0.5mm; }
    .row-2col { display: flex; margin-bottom: 0.5mm; }
    .row-2col span { flex: 1; }
    .item-header, .item-row {
      display: flex;
      align-items: center;
      font-size: ${FONT_SIZE_SMALL};
    }
    .item-header { font-weight: 900; margin-bottom: 1mm; }
    .item-row { margin-bottom: 1mm; }
    .col-name { width: 22mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
    .col-qty { width: ${COL_QTY}; text-align: center; flex-shrink: 0; }
    .col-mrp { width: ${COL_MRP}; text-align: right; flex-shrink: 0; }
    .col-rate { width: ${COL_RATE}; text-align: right; flex-shrink: 0; }
    .col-amt { width: ${COL_AMT}; text-align: right; flex-shrink: 0; font-weight: 700; }
    .summary-row { display: flex; margin-bottom: 0.5mm; }
    .summary-row span { flex: 1; }
    .grand-total {
      border: 2px solid #000;
      padding: 2mm;
      margin: 2mm 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 900;
    }
    .grand-total-label { font-size: 10pt; }
    .grand-total-value { font-size: 14pt; }
    .savings-box {
      border: 2px double #000;
      padding: 2mm;
      margin: 2mm 0;
      text-align: center;
    }
    .gst-table {
      width: 100%;
      font-size: 7pt;
      border-collapse: collapse;
      margin: 2mm 0;
    }
    .gst-table th, .gst-table td {
      border: 1px solid #000;
      padding: 1mm;
      text-align: center;
    }
    .no-exchange {
      border: 1px dashed #000;
      padding: 1.5mm;
      margin: 2mm 0;
      text-align: center;
      font-weight: 700;
      font-size: ${FONT_SIZE_SMALL};
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="solid"></div>
  <div class="center" style="margin: 2mm 0;">
    <div class="large">${escapeHtml(clientInfo.client_name || 'Business Name')}</div>
    ${clientInfo.address ? `<div class="small">${escapeHtml(clientInfo.address).replace(/\n/g, '<br>')}</div>` : ''}
    ${clientInfo.phone ? `<div class="small">Ph: ${escapeHtml(clientInfo.phone)}</div>` : ''}
    ${clientInfo.gstin ? `<div class="small bold">GSTIN: ${escapeHtml(clientInfo.gstin)}</div>` : ''}
  </div>
  <div class="solid"></div>

  <!-- Bill Type -->
  <div class="center bold" style="margin: 1mm 0; font-size: 10pt;">
    *** ${bill.type === 'gst' ? 'TAX INVOICE' : 'RECEIPT'} ***
  </div>
  <div class="dashed"></div>

  <!-- Bill Info - 2 COLUMN LAYOUT -->
  <div class="small">
    <div class="row-2col"><span>Bill No: ${bill.bill_number}</span><span>Date: ${formatDate(bill.created_at)}</span></div>
    <div class="row-2col"><span>Time: ${formatTime(bill.created_at)}</span><span>User: ${escapeHtml(userName)}</span></div>
    ${bill.customer_name ? `<div class="row">Customer: ${escapeHtml(bill.customer_name)}</div>` : ''}
    ${bill.customer_phone ? `<div class="row">Phone: ${escapeHtml(bill.customer_phone)}</div>` : ''}
    ${bill.type === 'gst' && bill.customer_gstin ? `<div class="row">GSTIN: ${escapeHtml(bill.customer_gstin)}</div>` : ''}
  </div>
  <div class="dashed"></div>

  <!-- Items Header -->
  <div class="item-header">
    <span class="col-name">Item</span>
    <span class="col-qty">Qty</span>
    <span class="col-mrp">MRP</span>
    <span class="col-rate">Rate</span>
    <span class="col-amt">Amt</span>
  </div>
  <div class="dashed"></div>

  <!-- Items -->
  ${itemsHtml}
  <div class="dashed"></div>

  <!-- Summary - 2 COLUMN -->
  <div class="small">
    <div class="summary-row"><span>Items: ${totalItems} | Qty: ${totalQty}</span><span>Sub Total: ${subtotal.toFixed(2)}</span></div>
    ${actualDiscount > 0 || gstAmount > 0 ? `<div class="summary-row"><span>${actualDiscount > 0 ? `Discount: -${actualDiscount.toFixed(2)}` : ''}</span><span>${gstAmount > 0 ? `GST: +${gstAmount.toFixed(2)}` : ''}</span></div>` : ''}
    ${Math.abs(roundOff) >= 0.01 ? `<div class="row">Round Off: ${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</div>` : ''}
  </div>

  <!-- Grand Total -->
  <div class="grand-total">
    <span class="grand-total-label">GRAND TOTAL</span>
    <span class="grand-total-value">Rs.${grandTotal}</span>
  </div>

  ${gstBreakdownHtml}

  <div class="dashed"></div>
  <div class="small center">Payment: ${paymentHtml}</div>

  ${totalSavings > 0 ? `
  <div class="savings-box">
    <div class="bold">TODAY'S SAVINGS</div>
    <div class="large">Rs.${totalSavings.toFixed(2)}</div>
    <div class="small">You saved compared to MRP!</div>
  </div>` : ''}

  ${showNoExchange ? '<div class="no-exchange">Sorry, No Exchange / No Refund</div>' : ''}

  <div class="dashed"></div>
  <div class="center bold" style="margin: 2mm 0;">*** THANK YOU VISIT AGAIN ***</div>
  <div class="solid"></div>
</body>
</html>`;
}

// ============================================================================
// PRINT FUNCTIONS
// ============================================================================

/**
 * Print bill using browser's print dialog (iframe-based, no popup needed)
 */
export function printBill(
  bill: BillData,
  clientInfo: ClientInfo,
  showNoExchange: boolean = true
): PrintResult {
  try {
    const html = generateReceiptHtml(bill, clientInfo, showNoExchange);

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

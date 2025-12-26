/**
 * Web Print Service
 * Standalone print service for web/cloud deployments
 * Uses browser print dialog - completely separate from desktop printing
 */

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
  gst_amount?: number;
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
// RECEIPT HTML GENERATOR
// ============================================================================

/**
 * Generate HTML receipt optimized for 80mm thermal printers
 */
export function generateReceiptHtml(
  bill: BillData,
  clientInfo: ClientInfo,
  showNoExchange: boolean = false
): string {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const totalQty = bill.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalItems = bill.items.length;
  const finalAmount = Number(bill.type === 'gst' ? bill.final_amount : bill.total_amount) || 0;
  const roundOff = Math.round(finalAmount) - finalAmount;

  // Calculate savings
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
      paymentHtml = bill.payment_type;
    }
  } catch {
    paymentHtml = bill.payment_type;
  }

  const userName = bill.user_name || bill.created_by || 'Admin';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${bill.bill_number}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0mm 2mm;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 76mm !important;
        max-width: 76mm !important;
      }
      .no-print { display: none !important; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        box-sizing: border-box !important;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html {
      width: 80mm;
      max-width: 80mm;
    }
    body {
      font-family: 'Courier New', 'Lucida Console', monospace;
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      background: white;
      color: #000000;
      font-size: 10pt;
      font-weight: 600;
      line-height: 1.4;
      padding: 2mm;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
      overflow-x: hidden;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .large { font-size: 16pt; font-weight: 900; letter-spacing: 2px; }
    .small { font-size: 9pt; font-weight: 600; }
    .dashed { border-bottom: 2px dashed #000000; margin: 2mm 0; }
    .solid { border-bottom: 3px solid #000000; margin: 2mm 0; }
    .flex { display: flex; justify-content: space-between; flex-wrap: nowrap; }
    .grand-total { border: 3px solid #000000; padding: 3mm; margin: 2mm 0; font-size: 14pt; font-weight: 900; background: #f0f0f0; }
    .savings-box { border: 3px double #000000; padding: 2mm; margin: 2mm 0; text-align: center; font-weight: 700; }
    .no-exchange { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.5mm 0; margin: 2mm 0; text-align: center; font-weight: 900; font-size: 8pt; }
    .item-row { display: flex; flex-wrap: nowrap; width: 100%; }
    .item-row span { flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="solid"></div>
  <div class="center" style="margin: 2mm 0;">
    <div class="large bold">${clientInfo.client_name || 'Business Name'}</div>
    ${clientInfo.address ? `<div class="small">${clientInfo.address.replace(/\n/g, '<br>')}</div>` : ''}
    ${clientInfo.gstin ? `<div class="small">GSTIN: ${clientInfo.gstin}</div>` : ''}
  </div>
  <div class="solid"></div>

  <div class="center bold" style="margin: 1mm 0;">
    ${bill.type === 'gst' ? 'TAX INVOICE' : 'RECEIPT'}
  </div>
  <div class="dashed"></div>

  <div class="small">
    <div class="flex"><span>User: ${userName}</span><span>Time: ${formatTime(bill.created_at)}</span></div>
    <div class="flex"><span>Bill No: ${bill.bill_number}</span><span>Date: ${formatDate(bill.created_at)}</span></div>
    ${bill.customer_name ? `<div>Customer: ${bill.customer_name}</div>` : ''}
    ${bill.type === 'gst' && bill.customer_gstin ? `<div>GSTIN: ${bill.customer_gstin}</div>` : ''}
  </div>
  <div class="dashed"></div>

  <!-- Items Header -->
  <div class="small item-row" style="font-weight: bold; margin-bottom: 1mm;">
    <span style="flex: 1; min-width: 0; overflow: hidden;">Item</span>
    <span style="width: 7mm; text-align: center;">Qty</span>
    <span style="width: 11mm; text-align: right;">MRP</span>
    <span style="width: 11mm; text-align: right;">Rate</span>
    <span style="width: 13mm; text-align: right;">Amt</span>
  </div>
  <div class="dashed"></div>

  <!-- Items -->
  ${bill.items
    .map((item) => {
      const name =
        item.product_name.length > 14
          ? item.product_name.substring(0, 12) + '..'
          : item.product_name;
      const mrp = item.mrp && item.mrp > 0 ? item.mrp : item.rate;
      return `
    <div class="small item-row" style="margin-bottom: 1mm;">
      <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
      <span style="width: 7mm; text-align: center;">${item.quantity}</span>
      <span style="width: 11mm; text-align: right;">${Number(mrp).toFixed(2)}</span>
      <span style="width: 11mm; text-align: right;">${Number(item.rate).toFixed(2)}</span>
      <span style="width: 13mm; text-align: right; font-weight: bold;">${Number(item.amount).toFixed(2)}</span>
    </div>`;
    })
    .join('')}

  <div class="dashed"></div>
  <div class="small flex"><span>Items: ${totalItems} &nbsp; Total Qty: ${totalQty}</span><span>Sub Total: ${Number(bill.subtotal || 0).toFixed(2)}</span></div>
  ${Number(bill.discount_amount || 0) > 0 ? `<div class="small flex"><span>Discount (${bill.discount_percentage || 0}%):</span><span>-₹${Number(bill.discount_amount || 0).toFixed(2)}</span></div>` : ''}
  ${Number(bill.gst_amount || 0) > 0 ? `<div class="small flex"><span>GST Amount:</span><span>${Number(bill.gst_amount || 0).toFixed(2)}</span></div>` : ''}

  <div class="grand-total flex">
    <span>GRAND TOTAL</span>
    <span style="font-size: 16pt;">₹${Math.round(finalAmount).toFixed(2)}</span>
  </div>

  ${
    bill.type === 'gst' && Object.keys(gstBreakdown).length > 0
      ? `
  <div class="small flex" style="margin: 1mm 0;">
    <span>GST (${Object.keys(gstBreakdown)
      .map(Number)
      .sort()
      .map((gstPct) => `${gstPct}%: Rs.${gstBreakdown[gstPct].gst.toFixed(2)}`)
      .join(', ')})</span>
    <span><strong>Rs.${Object.values(gstBreakdown)
      .reduce((sum, d) => sum + d.gst, 0)
      .toFixed(2)}</strong></span>
  </div>
  `
      : ''
  }

  <div class="dashed"></div>
  <div class="small center">Payment: ${paymentHtml}</div>

  ${
    totalSavings > 0
      ? `
  <div class="savings-box">
    <div class="bold">TODAY'S SAVINGS</div>
    <div class="large bold">₹${totalSavings.toFixed(2)}</div>
    <div class="small" style="font-style: italic;">You saved compared to MRP!</div>
  </div>
  `
      : ''
  }

  <div class="no-exchange">Sorry, No Exchange / No Refund</div>
  <div class="center bold" style="margin: 2mm 0;">★★★ THANK YOU VISIT AGAIN ★★★</div>
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
  showNoExchange: boolean = false
): PrintResult {
  try {
    const html = generateReceiptHtml(bill, clientInfo, showNoExchange);

    // Remove any existing print iframe
    const existingFrame = document.getElementById('print-iframe');
    if (existingFrame) {
      existingFrame.remove();
    }

    // Create hidden iframe for printing (avoids popup blocker)
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

    // Track if print was already triggered to avoid double dialog
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

      // Remove iframe after a longer delay to ensure print dialog completes
      setTimeout(() => {
        const frame = document.getElementById('print-iframe');
        if (frame) frame.remove();
      }, 5000);
    };

    // Write content to iframe
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // For dynamically written content, onload may not fire
    // Use a short delay to ensure content is rendered
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
  showNoExchange: boolean = false
): PrintResult {
  try {
    const html = generateReceiptHtml(bill, clientInfo, showNoExchange);

    // Create a blob from HTML
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open in new tab for user to print/save as PDF
    const newTab = window.open(url, '_blank');
    if (!newTab) {
      return {
        success: false,
        method: 'browser',
        message: 'Could not open new tab. Please allow popups for this site.',
      };
    }

    // Clean up after a delay
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
    const date = new Date(bill.created_at).toLocaleDateString('en-IN');

    const message = encodeURIComponent(
      `*${clientInfo.client_name || 'Bill'}*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Bill No: ${bill.bill_number}\n` +
        `Date: ${date}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Items: ${bill.items.length}\n` +
        `Total: Rs. ${Math.round(Number(finalAmount)).toFixed(2)}\n` +
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
};

export default webPrintService;

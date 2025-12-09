/**
 * Browser Print Utilities
 * Handles printing for web/cloud deployments using browser print dialog
 */

// Types
interface BillItem {
  product_name: string;
  quantity: number;
  rate: number;
  amount: number;
  mrp?: number;
  gst_percentage?: number;
}

interface BillData {
  bill_number: number;
  customer_name?: string;
  customer_phone?: string;
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

interface ClientInfo {
  client_name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

/**
 * Generate HTML receipt for browser printing (optimized for 80mm thermal printers)
 */
export function generateReceiptHtml(bill: BillData, clientInfo: ClientInfo, showNoExchange: boolean = false): string {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
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
      const gstForItem = taxableAmt * gstPct / 100;
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
      paymentHtml = payments.map((p: any) => `${p.payment_type}: Rs.${parseFloat(p.amount).toFixed(2)}`).join('<br>');
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
    .large { font-size: 12pt; font-weight: 900; }
    .small { font-size: 9pt; font-weight: 600; }
    .dashed { border-bottom: 2px dashed #000000; margin: 2mm 0; }
    .solid { border-bottom: 3px solid #000000; margin: 2mm 0; }
    .flex { display: flex; justify-content: space-between; flex-wrap: nowrap; }
    .grand-total { border: 3px solid #000000; padding: 2mm; margin: 2mm 0; font-size: 12pt; font-weight: 900; }
    .savings-box { border: 3px double #000000; padding: 2mm; margin: 2mm 0; text-align: center; font-weight: 700; }
    .no-exchange { border: 2px solid #000000; padding: 1mm; margin: 2mm 0; text-align: center; font-weight: 900; }
    .item-row { display: flex; flex-wrap: nowrap; width: 100%; }
    .item-row span { flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="solid"></div>
  <div class="center" style="margin: 2mm 0;">
    <div class="large bold">${clientInfo.client_name || 'Business Name'}</div>
    ${clientInfo.address ? `<div class="small">${clientInfo.address.replace(/\n/g, '<br>')}</div>` : ''}
    ${clientInfo.phone ? `<div class="small">Ph: ${clientInfo.phone}</div>` : ''}
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
    ${bill.customer_phone ? `<div>Phone: ${bill.customer_phone}</div>` : ''}
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
  ${bill.items.map(item => {
    const name = item.product_name.length > 14 ? item.product_name.substring(0, 12) + '..' : item.product_name;
    const mrp = item.mrp && item.mrp > 0 ? item.mrp : item.rate;
    return `
    <div class="small item-row" style="margin-bottom: 1mm;">
      <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
      <span style="width: 7mm; text-align: center;">${item.quantity}</span>
      <span style="width: 11mm; text-align: right;">${mrp.toFixed(2)}</span>
      <span style="width: 11mm; text-align: right;">${item.rate.toFixed(2)}</span>
      <span style="width: 13mm; text-align: right; font-weight: bold;">${item.amount.toFixed(2)}</span>
    </div>`;
  }).join('')}

  <div class="dashed"></div>
  <div class="small flex"><span>Items: ${totalItems} &nbsp; Total Qty: ${totalQty}</span><span>Sub Total: ${Number(bill.subtotal || 0).toFixed(2)}</span></div>
  ${Number(bill.discount_amount || 0) > 0 ? `<div class="small flex"><span>Discount:</span><span>-${Number(bill.discount_amount || 0).toFixed(2)}</span></div>` : ''}
  ${Number(bill.gst_amount || 0) > 0 ? `<div class="small flex"><span>GST Amount:</span><span>${Number(bill.gst_amount || 0).toFixed(2)}</span></div>` : ''}
  ${Math.abs(roundOff) >= 0.01 ? `<div class="small flex"><span>Round Off:</span><span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span></div>` : ''}

  <div class="grand-total flex">
    <span>GRAND TOTAL:</span>
    <span>Rs. ${Math.round(finalAmount).toFixed(2)}</span>
  </div>

  ${bill.type === 'gst' && Object.keys(gstBreakdown).length > 0 ? `
  <div class="center small bold">GST BREAKDOWN</div>
  <table style="width: 100%; font-size: 7pt; border-collapse: collapse; margin: 2mm 0; table-layout: fixed;">
    <tr style="border: 1px solid #000;">
      <th style="border: 1px solid #000; padding: 0.5mm; width: 12mm;">Tax%</th>
      <th style="border: 1px solid #000; padding: 0.5mm;">Taxable</th>
      <th style="border: 1px solid #000; padding: 0.5mm;">CGST</th>
      <th style="border: 1px solid #000; padding: 0.5mm;">SGST</th>
      <th style="border: 1px solid #000; padding: 0.5mm;">Total</th>
    </tr>
    ${Object.keys(gstBreakdown).map(Number).sort().map(gstPct => {
      const data = gstBreakdown[gstPct];
      const cgst = data.gst / 2;
      return `
      <tr>
        <td style="border: 1px solid #000; padding: 0.5mm; text-align: center;">${gstPct}%</td>
        <td style="border: 1px solid #000; padding: 0.5mm; text-align: right;">${data.taxable.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 0.5mm; text-align: right;">${cgst.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 0.5mm; text-align: right;">${cgst.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 0.5mm; text-align: right;">${data.gst.toFixed(2)}</td>
      </tr>`;
    }).join('')}
  </table>
  ` : ''}

  <div class="dashed"></div>
  <div class="small center">Payment: ${paymentHtml}</div>

  ${showNoExchange ? '<div class="no-exchange">** NO EXCHANGE AVAILABLE **</div>' : ''}

  ${totalSavings > 0 ? `
  <div class="savings-box">
    <div class="bold">TODAY'S SAVINGS</div>
    <div class="large bold">Rs. ${totalSavings.toFixed(2)}</div>
  </div>
  ` : ''}

  <div class="dashed"></div>
  <div class="center bold" style="margin: 2mm 0;">THANK YOU VISIT AGAIN!</div>
  <div class="solid"></div>
</body>
</html>`;
}

/**
 * Print using browser's print dialog
 */
export function browserPrint(bill: BillData, clientInfo: ClientInfo, showNoExchange: boolean = false): void {
  const html = generateReceiptHtml(bill, clientInfo, showNoExchange);

  // Create a new window for printing
  const printWindow = window.open('', '_blank', 'width=320,height=600');
  if (!printWindow) {
    throw new Error('Could not open print window. Please allow popups for this site.');
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 100);
  };
}

/**
 * Generate PDF and download
 */
export async function downloadPdf(bill: BillData, clientInfo: ClientInfo, showNoExchange: boolean = false): Promise<void> {
  const html = generateReceiptHtml(bill, clientInfo, showNoExchange);

  // Create a blob from HTML
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // Open in new tab for user to print/save as PDF
  const newTab = window.open(url, '_blank');
  if (!newTab) {
    throw new Error('Could not open new tab. Please allow popups for this site.');
  }

  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Share bill via WhatsApp
 */
export function shareWhatsApp(bill: BillData, clientInfo: ClientInfo): void {
  const finalAmount = bill.type === 'gst' ? bill.final_amount : bill.total_amount;
  const date = new Date(bill.created_at).toLocaleDateString('en-IN');

  const message = encodeURIComponent(
    `*${clientInfo.client_name || 'Bill'}*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Bill No: ${bill.bill_number}\n` +
    `Date: ${date}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Items: ${bill.items.length}\n` +
    `Total: Rs. ${Math.round(finalAmount).toFixed(2)}\n` +
    `Payment: ${bill.payment_type}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Thank you for your purchase!`
  );

  const phone = bill.customer_phone ? bill.customer_phone.replace(/\D/g, '') : '';
  const whatsappUrl = phone
    ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${message}`
    : `https://wa.me/?text=${message}`;

  window.open(whatsappUrl, '_blank');
}

// Export types for external use
export type { BillData, ClientInfo, BillItem };

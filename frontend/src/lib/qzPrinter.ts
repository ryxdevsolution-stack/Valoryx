/**
 * QZ Tray Printer Service
 * Handles silent printing to thermal printers via QZ Tray
 *
 * QZ Tray must be installed on the client machine: https://qz.io/download/
 */

// QZ Tray types
declare const qz: any;

interface PrinterConfig {
  printerName: string | null;
  paperWidth: number; // in mm (typically 80 or 58 for thermal)
}

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

class QZPrinterService {
  private connected: boolean = false;
  private config: PrinterConfig = {
    printerName: null,
    paperWidth: 80
  };

  /**
   * Check if QZ Tray is available
   */
  isAvailable(): boolean {
    return typeof qz !== 'undefined';
  }

  /**
   * Connect to QZ Tray
   */
  async connect(): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('QZ Tray is not installed. Please download from https://qz.io/download/');
    }

    if (this.connected && qz.websocket.isActive()) {
      return true;
    }

    try {
      // Set up certificate for secure connection (use demo cert for development)
      qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
        // For production, replace with your own certificate
        // For development/testing, QZ Tray allows unsigned requests
        resolve('');
      });

      qz.security.setSignaturePromise(() => {
        return (resolve: (sig: string) => void) => {
          // For production, implement proper signing
          resolve('');
        };
      });

      await qz.websocket.connect();
      this.connected = true;
      console.log('[QZ Tray] Connected successfully');
      return true;
    } catch (error: any) {
      console.error('[QZ Tray] Connection failed:', error);
      this.connected = false;

      if (error.message?.includes('Unable to establish')) {
        throw new Error('QZ Tray is not running. Please start QZ Tray application.');
      }
      throw error;
    }
  }

  /**
   * Disconnect from QZ Tray
   */
  async disconnect(): Promise<void> {
    if (this.connected && qz.websocket.isActive()) {
      await qz.websocket.disconnect();
      this.connected = false;
      console.log('[QZ Tray] Disconnected');
    }
  }

  /**
   * Get list of available printers
   */
  async getPrinters(): Promise<string[]> {
    await this.connect();
    const printers = await qz.printers.find();
    return Array.isArray(printers) ? printers : [printers];
  }

  /**
   * Get default printer
   */
  async getDefaultPrinter(): Promise<string | null> {
    await this.connect();
    try {
      const printer = await qz.printers.getDefault();
      return printer;
    } catch {
      return null;
    }
  }

  /**
   * Set the printer to use
   */
  setPrinter(printerName: string): void {
    this.config.printerName = printerName;
    // Save to localStorage for persistence
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('qz_printer_name', printerName);
    }
  }

  /**
   * Get saved printer name
   */
  getSavedPrinter(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('qz_printer_name');
    }
    return null;
  }

  /**
   * Generate ESC/POS commands for thermal receipt
   */
  private generateEscPosCommands(bill: BillData, clientInfo: ClientInfo, showNoExchange: boolean = false): string[] {
    const commands: string[] = [];
    const W = 42; // Characters per line for 80mm paper

    // Helper functions
    const center = (text: string): string => {
      const padding = Math.max(0, Math.floor((W - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    const leftRight = (left: string, right: string): string => {
      const spaces = Math.max(1, W - left.length - right.length);
      return left + ' '.repeat(spaces) + right;
    };

    const line = (char: string = '-'): string => char.repeat(W);

    // ESC/POS Commands
    const ESC = '\x1B';
    const GS = '\x1D';

    // Initialize printer
    commands.push(ESC + '@'); // Initialize
    commands.push(ESC + 'a' + '\x01'); // Center alignment

    // Header
    commands.push(line('='));
    commands.push(ESC + 'E' + '\x01'); // Bold on
    commands.push(center(clientInfo.client_name || 'Business Name'));
    commands.push(ESC + 'E' + '\x00'); // Bold off

    if (clientInfo.address) {
      clientInfo.address.split('\n').forEach(addr => {
        if (addr.trim()) commands.push(center(addr.trim()));
      });
    }
    if (clientInfo.phone) {
      commands.push(center(`Ph: ${clientInfo.phone}`));
    }
    if (clientInfo.gstin) {
      commands.push(center(`GSTIN: ${clientInfo.gstin}`));
    }
    commands.push(line('='));

    // Bill type
    const billType = bill.type === 'gst' ? 'TAX INVOICE' : 'RECEIPT';
    commands.push(ESC + 'E' + '\x01'); // Bold on
    commands.push(center(billType));
    commands.push(ESC + 'E' + '\x00'); // Bold off
    commands.push(line('-'));

    // Bill info - left align
    commands.push(ESC + 'a' + '\x00'); // Left alignment

    const userName = bill.user_name || bill.created_by || 'Admin';
    const date = new Date(bill.created_at);
    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    commands.push(leftRight(`User: ${userName.substring(0, 12)}`, `Time: ${timeStr}`));
    commands.push(leftRight(`Bill No: ${bill.bill_number}`, `Date: ${dateStr}`));

    if (bill.customer_name) {
      commands.push(`Customer: ${bill.customer_name}`);
      if (bill.customer_phone) {
        commands.push(`Phone: ${bill.customer_phone}`);
      }
    }
    commands.push(line('-'));

    // Items header
    // Format: Item(14) Qty(4) MRP(8) Rate(8) Amt(8) = 42
    commands.push(`${'Item'.padEnd(14)}${'Qty'.padStart(4)}${'MRP'.padStart(8)}${'Rate'.padStart(8)}${'Amt'.padStart(8)}`);
    commands.push(line('-'));

    // Items
    let totalQty = 0;
    let totalSavings = 0;
    const gstBreakdown: Record<number, { taxable: number; gst: number }> = {};

    for (const item of bill.items) {
      let name = item.product_name.replace(/[\n\r]/g, ' ').trim();
      if (name.length > 14) name = name.substring(0, 11) + '...';

      const qty = item.quantity;
      const rate = item.rate;
      const mrp = item.mrp && item.mrp > 0 ? item.mrp : rate;
      const amt = item.amount;
      const gstPct = item.gst_percentage || 0;

      totalQty += qty;

      if (mrp > rate) {
        totalSavings += (mrp - rate) * qty;
      }

      // Track GST breakdown
      if (gstPct > 0) {
        const taxableAmt = qty * rate;
        const gstForItem = taxableAmt * gstPct / 100;
        if (!gstBreakdown[gstPct]) {
          gstBreakdown[gstPct] = { taxable: 0, gst: 0 };
        }
        gstBreakdown[gstPct].taxable += taxableAmt;
        gstBreakdown[gstPct].gst += gstForItem;
      }

      // Format numbers
      const fmtNum = (val: number, w: number): string => {
        const str = val >= 1000 ? val.toFixed(1) : val.toFixed(2);
        return str.padStart(w);
      };

      commands.push(`${name.padEnd(14)}${qty.toString().padStart(4)}${fmtNum(mrp, 8)}${fmtNum(rate, 8)}${fmtNum(amt, 8)}`);
    }

    commands.push(line('-'));

    // Summary
    const totalItems = bill.items.length;
    commands.push(leftRight(`Items:${totalItems} Qty:${totalQty}`, `SubTotal: ${bill.subtotal.toFixed(2)}`));

    // Discount
    const discountAmount = bill.discount_amount || 0;
    if (discountAmount > 0) {
      commands.push(leftRight('Discount:', `-${discountAmount.toFixed(2)}`));
    }

    // GST
    const gstAmount = bill.gst_amount || 0;
    if (gstAmount > 0) {
      commands.push(leftRight('GST Amount:', gstAmount.toFixed(2)));
    }

    // Final amount
    const finalAmount = bill.type === 'gst' ? bill.final_amount : bill.total_amount;
    const roundOff = Math.round(finalAmount) - finalAmount;
    if (Math.abs(roundOff) >= 0.01) {
      const sign = roundOff > 0 ? '+' : '';
      commands.push(leftRight('Round Off:', `${sign}${roundOff.toFixed(2)}`));
    }

    commands.push(line('='));
    commands.push(ESC + 'E' + '\x01'); // Bold on
    commands.push(GS + '!' + '\x11'); // Double height/width
    commands.push(leftRight('GRAND TOTAL:', `Rs.${Math.round(finalAmount).toFixed(2)}`));
    commands.push(GS + '!' + '\x00'); // Normal size
    commands.push(ESC + 'E' + '\x00'); // Bold off
    commands.push(line('='));

    // GST breakdown for tax invoice
    if (bill.type === 'gst' && Object.keys(gstBreakdown).length > 0) {
      commands.push('');
      commands.push(ESC + 'a' + '\x01'); // Center
      commands.push('GST BREAKDOWN');
      commands.push(ESC + 'a' + '\x00'); // Left
      commands.push(line('-'));
      commands.push(`${'Tax%'.padStart(5)}${'Taxable'.padStart(9)}${'CGST'.padStart(8)}${'SGST'.padStart(8)}${'Total'.padStart(8)}`);
      commands.push(line('-'));

      for (const gstPct of Object.keys(gstBreakdown).map(Number).sort()) {
        const data = gstBreakdown[gstPct];
        const cgst = data.gst / 2;
        const sgst = data.gst / 2;
        commands.push(
          `${(gstPct + '%').padStart(5)}` +
          `${data.taxable.toFixed(2).padStart(9)}` +
          `${cgst.toFixed(2).padStart(8)}` +
          `${sgst.toFixed(2).padStart(8)}` +
          `${data.gst.toFixed(2).padStart(8)}`
        );
      }
      commands.push(line('-'));
    }

    // Payment info
    commands.push('');
    commands.push(ESC + 'a' + '\x01'); // Center
    try {
      const payments = JSON.parse(bill.payment_type);
      if (Array.isArray(payments) && payments.length > 0) {
        commands.push('Payment:');
        for (const p of payments) {
          commands.push(`${p.payment_type}: Rs.${parseFloat(p.amount).toFixed(2)}`);
        }
      } else {
        commands.push(`Payment: ${bill.payment_type}`);
      }
    } catch {
      commands.push(`Payment: ${bill.payment_type}`);
    }

    // No exchange notice
    if (showNoExchange) {
      commands.push('');
      commands.push(line('-'));
      commands.push(ESC + 'E' + '\x01'); // Bold on
      commands.push(center('** NO EXCHANGE AVAILABLE **'));
      commands.push(ESC + 'E' + '\x00'); // Bold off
      commands.push(line('-'));
    }

    // Savings
    if (totalSavings > 0) {
      commands.push('');
      commands.push(line('*'));
      commands.push(ESC + 'E' + '\x01'); // Bold on
      commands.push(center(`TODAY'S SAVINGS: Rs.${totalSavings.toFixed(2)}`));
      commands.push(ESC + 'E' + '\x00'); // Bold off
      commands.push(line('*'));
    }

    // Footer
    commands.push('');
    commands.push(ESC + 'E' + '\x01'); // Bold on
    commands.push(center('THANK YOU VISIT AGAIN!'));
    commands.push(ESC + 'E' + '\x00'); // Bold off
    commands.push(line('='));

    // Cut paper
    commands.push('\n\n\n\n'); // Feed paper
    commands.push(GS + 'V' + '\x00'); // Full cut

    return commands;
  }

  /**
   * Print bill using QZ Tray
   */
  async printBill(bill: BillData, clientInfo: ClientInfo, showNoExchange: boolean = false): Promise<boolean> {
    try {
      await this.connect();

      // Get printer
      let printerName = this.config.printerName || this.getSavedPrinter();
      if (!printerName) {
        printerName = await this.getDefaultPrinter();
      }

      if (!printerName) {
        throw new Error('No printer configured. Please select a printer in settings.');
      }

      console.log(`[QZ Tray] Printing to: ${printerName}`);

      // Generate ESC/POS commands
      const commands = this.generateEscPosCommands(bill, clientInfo, showNoExchange);

      // Create print config
      const config = qz.configs.create(printerName, {
        encoding: 'UTF-8'
      });

      // Create print data
      const data = [
        {
          type: 'raw',
          format: 'plain',
          data: commands.join('\n')
        }
      ];

      // Print
      await qz.print(config, data);
      console.log('[QZ Tray] Print job sent successfully');

      return true;
    } catch (error: any) {
      console.error('[QZ Tray] Print failed:', error);
      throw error;
    }
  }

  /**
   * Open cash drawer (if connected to printer)
   */
  async openCashDrawer(): Promise<boolean> {
    try {
      await this.connect();

      let printerName = this.config.printerName || this.getSavedPrinter();
      if (!printerName) {
        printerName = await this.getDefaultPrinter();
      }

      if (!printerName) {
        throw new Error('No printer configured');
      }

      const config = qz.configs.create(printerName);

      // Standard cash drawer kick command (ESC/POS)
      const ESC = '\x1B';
      const data = [
        {
          type: 'raw',
          format: 'plain',
          data: ESC + 'p' + '\x00' + '\x19' + '\xFA' // Kick drawer pin 2
        }
      ];

      await qz.print(config, data);
      console.log('[QZ Tray] Cash drawer opened');
      return true;
    } catch (error) {
      console.error('[QZ Tray] Failed to open cash drawer:', error);
      return false;
    }
  }

  /**
   * Test print
   */
  async testPrint(printerName?: string): Promise<boolean> {
    try {
      await this.connect();

      const printer = printerName || this.config.printerName || this.getSavedPrinter() || await this.getDefaultPrinter();
      if (!printer) {
        throw new Error('No printer available');
      }

      const config = qz.configs.create(printer);
      const ESC = '\x1B';
      const GS = '\x1D';

      const testData = [
        ESC + '@', // Initialize
        ESC + 'a' + '\x01', // Center
        ESC + 'E' + '\x01', // Bold
        'QZ TRAY TEST PRINT',
        ESC + 'E' + '\x00', // Bold off
        '',
        `Printer: ${printer}`,
        `Date: ${new Date().toLocaleString()}`,
        '',
        '================================',
        'If you see this, QZ Tray is',
        'working correctly!',
        '================================',
        '',
        '\n\n\n',
        GS + 'V' + '\x00' // Cut
      ];

      const data = [{
        type: 'raw',
        format: 'plain',
        data: testData.join('\n')
      }];

      await qz.print(config, data);
      return true;
    } catch (error) {
      console.error('[QZ Tray] Test print failed:', error);
      throw error;
    }
  }
}

/**
 * Browser Print Utilities
 * Fallback methods when QZ Tray is not available (for cloud/SaaS deployments)
 */

/**
 * Generate HTML receipt for browser printing
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

  const totalQty = bill.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalItems = bill.items.length;
  const finalAmount = bill.type === 'gst' ? bill.final_amount : bill.total_amount;
  const roundOff = Math.round(finalAmount) - finalAmount;

  // Calculate savings
  let totalSavings = 0;
  const gstBreakdown: Record<number, { taxable: number; gst: number }> = {};

  for (const item of bill.items) {
    const mrp = item.mrp && item.mrp > 0 ? item.mrp : item.rate;
    if (mrp > item.rate) {
      totalSavings += (mrp - item.rate) * item.quantity;
    }
    const gstPct = item.gst_percentage || 0;
    if (gstPct > 0) {
      const taxableAmt = item.quantity * item.rate;
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
    @page { size: 80mm auto; margin: 0; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 80mm;
      max-width: 80mm;
      background: white;
      color: black;
      font-size: 9pt;
      line-height: 1.3;
      padding: 3mm;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 11pt; }
    .small { font-size: 8pt; }
    .dashed { border-bottom: 1px dashed #000; margin: 2mm 0; }
    .solid { border-bottom: 2px solid #000; margin: 2mm 0; }
    .flex { display: flex; justify-content: space-between; }
    .grand-total { border: 2px solid #000; padding: 2mm; margin: 2mm 0; font-size: 10pt; font-weight: bold; }
    .savings-box { border: 2px double #000; padding: 2mm; margin: 2mm 0; text-align: center; }
    .no-exchange { border: 1px solid #000; padding: 1mm; margin: 2mm 0; text-align: center; font-weight: bold; }
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
  <div class="small" style="display: flex; font-weight: bold; margin-bottom: 1mm;">
    <span style="flex: 2;">Item</span>
    <span style="width: 8mm; text-align: center;">Qty</span>
    <span style="width: 14mm; text-align: right;">MRP</span>
    <span style="width: 14mm; text-align: right;">Rate</span>
    <span style="width: 14mm; text-align: right;">Amt</span>
  </div>
  <div class="dashed"></div>

  <!-- Items -->
  ${bill.items.map(item => {
    const name = item.product_name.length > 18 ? item.product_name.substring(0, 15) + '...' : item.product_name;
    const mrp = item.mrp && item.mrp > 0 ? item.mrp : item.rate;
    return `
    <div class="small" style="display: flex; margin-bottom: 1mm;">
      <span style="flex: 2;">${name}</span>
      <span style="width: 8mm; text-align: center;">${item.quantity}</span>
      <span style="width: 14mm; text-align: right;">${mrp.toFixed(2)}</span>
      <span style="width: 14mm; text-align: right;">${item.rate.toFixed(2)}</span>
      <span style="width: 14mm; text-align: right; font-weight: bold;">${item.amount.toFixed(2)}</span>
    </div>`;
  }).join('')}

  <div class="dashed"></div>
  <div class="small flex"><span>Items: ${totalItems} &nbsp; Total Qty: ${totalQty}</span><span>Sub Total: ${bill.subtotal.toFixed(2)}</span></div>
  ${(bill.discount_amount || 0) > 0 ? `<div class="small flex"><span>Discount:</span><span>-${(bill.discount_amount || 0).toFixed(2)}</span></div>` : ''}
  ${(bill.gst_amount || 0) > 0 ? `<div class="small flex"><span>GST Amount:</span><span>${(bill.gst_amount || 0).toFixed(2)}</span></div>` : ''}
  ${Math.abs(roundOff) >= 0.01 ? `<div class="small flex"><span>Round Off:</span><span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span></div>` : ''}

  <div class="grand-total flex">
    <span>GRAND TOTAL:</span>
    <span>Rs. ${Math.round(finalAmount).toFixed(2)}</span>
  </div>

  ${bill.type === 'gst' && Object.keys(gstBreakdown).length > 0 ? `
  <div class="center small bold">GST BREAKDOWN</div>
  <table style="width: 100%; font-size: 7pt; border-collapse: collapse; margin: 2mm 0;">
    <tr style="border: 1px solid #000;">
      <th style="border: 1px solid #000; padding: 1mm;">Tax%</th>
      <th style="border: 1px solid #000; padding: 1mm;">Taxable</th>
      <th style="border: 1px solid #000; padding: 1mm;">CGST</th>
      <th style="border: 1px solid #000; padding: 1mm;">SGST</th>
      <th style="border: 1px solid #000; padding: 1mm;">Total</th>
    </tr>
    ${Object.keys(gstBreakdown).map(Number).sort().map(gstPct => {
      const data = gstBreakdown[gstPct];
      const cgst = data.gst / 2;
      return `
      <tr>
        <td style="border: 1px solid #000; padding: 1mm; text-align: center;">${gstPct}%</td>
        <td style="border: 1px solid #000; padding: 1mm; text-align: right;">${data.taxable.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 1mm; text-align: right;">${cgst.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 1mm; text-align: right;">${cgst.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 1mm; text-align: right;">${data.gst.toFixed(2)}</td>
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
    }, 250);
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

// Export singleton instance
export const qzPrinter = new QZPrinterService();

// Export types for external use
export type { BillData, ClientInfo, BillItem };

export default qzPrinter;

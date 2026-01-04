"""
Thermal Printer Service
Handles direct printing to thermal printers without browser dialog
"""

import os
import platform
from datetime import datetime
from typing import Dict, Any, List, Optional
import subprocess
import tempfile

# Cache for printer detection (avoids repeated slow PowerShell calls)
_printer_cache = {
    'default_printer': None,
    'printer_list': None,
    'cache_time': None
}
_CACHE_DURATION = 300  # Cache for 5 minutes

def _is_cache_valid():
    """Check if cache is still valid"""
    if _printer_cache['cache_time'] is None:
        return False
    return (datetime.now() - _printer_cache['cache_time']).total_seconds() < _CACHE_DURATION

class ThermalPrinter:
    """
    Thermal printer service for silent printing
    Supports multiple printer types and connection methods
    """

    def __init__(self, printer_name: Optional[str] = None):
        """
        Initialize thermal printer

        Args:
            printer_name: Name of the printer (optional, uses default if not provided)
        """
        self.system = platform.system()

        # Get printer name - either specified or default
        if printer_name:
            self.printer_name = printer_name
        else:
            self.printer_name = self._get_default_printer()

        print(f"[THERMAL_PRINTER] Initialized with printer: {self.printer_name}")

    def _get_default_printer(self) -> str:
        """Get the system's default printer (with caching for speed)"""
        global _printer_cache

        # Check cache first
        if _is_cache_valid() and _printer_cache['default_printer']:
            print(f"[THERMAL_PRINTER] Using cached printer: {_printer_cache['default_printer']}")
            return _printer_cache['default_printer']

        try:
            if self.system == "Windows":
                # Windows: Try pywin32 first (most reliable and FAST)
                try:
                    import win32print
                    printer = win32print.GetDefaultPrinter()
                    if printer:
                        print(f"[THERMAL_PRINTER] Default printer via win32print: {printer}")
                        _printer_cache['default_printer'] = printer
                        _printer_cache['cache_time'] = datetime.now()
                        return printer
                except ImportError:
                    print("[THERMAL_PRINTER] pywin32 not available, trying PowerShell...")
                except Exception as e:
                    print(f"[THERMAL_PRINTER] win32print failed: {e}, trying PowerShell...")

                # Fallback: PowerShell with Get-Printer (reduced timeout)
                result = subprocess.run(
                    ['powershell', '-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command',
                     'Get-Printer | Where-Object {$_.Default -eq $true} | Select-Object -ExpandProperty Name'],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                printer = result.stdout.strip()
                if printer:
                    print(f"[THERMAL_PRINTER] Default printer via PowerShell: {printer}")
                    _printer_cache['default_printer'] = printer
                    _printer_cache['cache_time'] = datetime.now()
                    return printer

                # Last fallback: WMI (older method, reduced timeout)
                result = subprocess.run(
                    ['powershell', '-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command',
                     'Get-WmiObject -Class Win32_Printer | Where-Object {$_.Default -eq $true} | Select-Object -ExpandProperty Name'],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                printer = result.stdout.strip()
                if printer:
                    print(f"[THERMAL_PRINTER] Default printer via WMI: {printer}")
                    _printer_cache['default_printer'] = printer
                    _printer_cache['cache_time'] = datetime.now()
                    return printer
            elif self.system == "Linux":
                # Linux: Get default printer using lpstat
                result = subprocess.run(
                    ['lpstat', '-d'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                # Output format: "system default destination: printer_name"
                if result.stdout and ':' in result.stdout:
                    printer = result.stdout.split(':')[-1].strip()
                    if printer:
                        return printer
            elif self.system == "Darwin":  # macOS
                # macOS: Get default printer
                result = subprocess.run(
                    ['lpstat', '-d'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.stdout and ':' in result.stdout:
                    printer = result.stdout.split(':')[-1].strip()
                    if printer:
                        return printer
        except Exception as e:
            print(f"[THERMAL_PRINTER] Error getting default printer: {e}")

        # If no default found, try to get first available printer
        printers = self.list_printers()
        if printers:
            print(f"[THERMAL_PRINTER] No default printer, using first available: {printers[0]}")
            return printers[0]

        print("[THERMAL_PRINTER] Warning: No printers found on system")
        return None

    def list_printers(self) -> List[str]:
        """List all available printers"""
        try:
            if self.system == "Windows":
                # Try pywin32 first
                try:
                    import win32print
                    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)
                    printer_names = [p[2] for p in printers]  # p[2] is the printer name
                    print(f"[THERMAL_PRINTER] Found {len(printer_names)} printers via win32print")
                    return printer_names
                except ImportError:
                    print("[THERMAL_PRINTER] pywin32 not available for listing printers")
                except Exception as e:
                    print(f"[THERMAL_PRINTER] win32print.EnumPrinters failed: {e}")

                # Fallback to PowerShell
                result = subprocess.run(
                    ['powershell', '-ExecutionPolicy', 'Bypass', '-Command',
                     'Get-Printer | Select-Object -ExpandProperty Name'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                printers = [p.strip() for p in result.stdout.split('\n') if p.strip()]
                print(f"[THERMAL_PRINTER] Found {len(printers)} printers via PowerShell")
                return printers
            elif self.system in ["Linux", "Darwin"]:
                result = subprocess.run(
                    ['lpstat', '-p'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                # Parse output: "printer printer_name is idle..."
                printers = []
                for line in result.stdout.split('\n'):
                    if line.startswith('printer '):
                        printers.append(line.split()[1])
                return printers
        except Exception as e:
            print(f"Error listing printers: {e}")
            return []

    def _generate_receipt_html(self, bill_data: Dict[str, Any], client_info: Dict[str, Any], show_no_exchange: bool = False) -> str:
        """
        Generate HTML for thermal receipt - UNIFIED FORMAT

        Paper: 80mm thermal paper
        Printable area: ~72mm (with margins)
        Column widths: Item(flex) + Qty(6mm) + MRP(11mm) + Rate(11mm) + Amt(12mm) = 40mm fixed
        """

        # ==================== CONFIGURATION ====================
        PAPER_WIDTH = "72mm"      # Actual printable width (80mm - margins)
        FONT_SIZE = "9pt"         # Base font size
        FONT_SIZE_LARGE = "12pt"  # Headers
        FONT_SIZE_SMALL = "8pt"   # Details
        COL_QTY = "6mm"
        COL_MRP = "11mm"
        COL_RATE = "11mm"
        COL_AMT = "12mm"
        ITEM_NAME_MAX = 20        # Max characters for item name
        # ========================================================

        # Extract data
        items = bill_data.get('items', [])
        total_items = len(items)
        total_qty = sum(item.get('quantity', 0) for item in items)

        # Calculate savings and GST breakdown
        total_savings = 0
        gst_breakdown = {}

        for item in items:
            mrp = float(item.get('mrp', 0)) if item.get('mrp') else float(item.get('rate', 0))
            rate = float(item.get('rate', 0))
            qty = int(item.get('quantity', 0))
            gst_pct = float(item.get('gst_percentage', 0))

            if mrp > rate:
                total_savings += (mrp - rate) * qty

            if gst_pct > 0:
                taxable_amt = qty * rate
                gst_for_item = taxable_amt * gst_pct / 100
                if gst_pct not in gst_breakdown:
                    gst_breakdown[gst_pct] = {'taxable': 0, 'gst': 0}
                gst_breakdown[gst_pct]['taxable'] += taxable_amt
                gst_breakdown[gst_pct]['gst'] += gst_for_item

        # Format date/time
        date_str = datetime.now().strftime('%d/%m/%Y')
        time_str = datetime.now().strftime('%I:%M:%S %p')
        user_name = bill_data.get('user_name', bill_data.get('created_by', 'Admin'))
        if len(user_name) > 15:
            user_name = user_name[:12] + "..."

        # Calculate totals
        subtotal = float(bill_data.get('subtotal', 0) or 0)
        discount = float(bill_data.get('discount_amount', 0) or 0)
        negotiable = float(bill_data.get('negotiable_amount', 0) or 0)
        gst_amount = float(bill_data.get('gst_amount', 0) or 0)

        # Use negotiable if set, otherwise use discount
        actual_discount = negotiable if negotiable > 0 else discount

        if bill_data.get('type', '').lower() == 'gst':
            final_amount = float(bill_data.get('final_amount', 0) or 0)
        else:
            final_amount = float(bill_data.get('total_amount', 0) or 0)

        round_off = round(final_amount) - final_amount
        grand_total = round(final_amount)

        # Build HTML with clean structure
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bill #{bill_data.get('bill_number', '')}</title>
    <style>
        @page {{ size: 80mm auto; margin: 2mm; }}
        @media print {{
            html, body {{ margin: 0 !important; padding: 0 !important; }}
            body {{ width: {PAPER_WIDTH} !important; }}
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Courier New', 'Consolas', monospace;
            width: {PAPER_WIDTH};
            max-width: {PAPER_WIDTH};
            background: #fff;
            color: #000;
            font-size: {FONT_SIZE};
            font-weight: 600;
            line-height: 1.3;
            padding: 2mm;
            -webkit-font-smoothing: none;
        }}
        .center {{ text-align: center; }}
        .bold {{ font-weight: 900; }}
        .large {{ font-size: {FONT_SIZE_LARGE}; font-weight: 900; }}
        .small {{ font-size: {FONT_SIZE_SMALL}; }}
        .dashed {{ border-bottom: 1px dashed #000; margin: 2mm 0; }}
        .solid {{ border-bottom: 2px solid #000; margin: 2mm 0; }}
        .row {{ margin-bottom: 0.5mm; }}
        .row-2col {{ display: flex; margin-bottom: 0.5mm; }}
        .row-2col span {{ flex: 1; }}
        .item-header, .item-row {{
            display: flex;
            align-items: center;
            font-size: {FONT_SIZE_SMALL};
        }}
        .item-header {{ font-weight: 900; margin-bottom: 1mm; }}
        .item-row {{ margin-bottom: 1mm; }}
        .col-name {{ width: 22mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }}
        .col-qty {{ width: {COL_QTY}; text-align: center; flex-shrink: 0; }}
        .col-mrp {{ width: {COL_MRP}; text-align: right; flex-shrink: 0; }}
        .col-rate {{ width: {COL_RATE}; text-align: right; flex-shrink: 0; }}
        .col-amt {{ width: {COL_AMT}; text-align: right; flex-shrink: 0; font-weight: 700; }}
        .summary-row {{ display: flex; margin-bottom: 0.5mm; }}
        .summary-row span {{ flex: 1; }}
        .grand-total {{
            border: 2px solid #000;
            padding: 2mm;
            margin: 2mm 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 900;
        }}
        .grand-total-label {{ font-size: 10pt; }}
        .grand-total-value {{ font-size: 14pt; }}
        .savings-box {{
            border: 2px double #000;
            padding: 2mm;
            margin: 2mm 0;
            text-align: center;
        }}
        .gst-table {{
            width: 100%;
            font-size: 7pt;
            border-collapse: collapse;
            margin: 2mm 0;
        }}
        .gst-table th, .gst-table td {{
            border: 1px solid #000;
            padding: 1mm;
            text-align: center;
        }}
        .no-exchange {{
            border: 1px dashed #000;
            padding: 1.5mm;
            margin: 2mm 0;
            text-align: center;
            font-weight: 700;
            font-size: {FONT_SIZE_SMALL};
        }}
    </style>
</head>
<body>
    <!-- Header -->
    <div class="solid"></div>
    <div class="center" style="margin: 2mm 0;">
        <div class="large">{client_info.get('client_name', 'Business Name')}</div>
        {f"<div class='small'>{client_info.get('address', '').replace(chr(10), '<br>')}</div>" if client_info.get('address') else ""}
        {f"<div class='small'>Ph: {client_info.get('phone', '')}</div>" if client_info.get('phone') else ""}
        {f"<div class='small bold'>GSTIN: {client_info.get('gstin', '')}</div>" if client_info.get('gstin') else ""}
    </div>
    <div class="solid"></div>

    <!-- Bill Type -->
    <div class="center bold" style="margin: 1mm 0; font-size: 10pt;">
        *** {'TAX INVOICE' if bill_data.get('type', '').upper() == 'GST' else 'RECEIPT'} ***
    </div>
    <div class="dashed"></div>

    <!-- Bill Info - 2 COLUMN LAYOUT -->
    <div class="small">
        <div class="row-2col"><span>Bill No: {bill_data.get('bill_number', 'N/A')}</span><span>Date: {date_str}</span></div>
        <div class="row-2col"><span>Time: {time_str}</span><span>User: {user_name}</span></div>
        {f"<div class='row'>Customer: {bill_data.get('customer_name', '')}</div>" if bill_data.get('customer_name') else ""}
        {f"<div class='row'>Phone: {bill_data.get('customer_phone', '')}</div>" if bill_data.get('customer_phone') else ""}
        {f"<div class='row'>GSTIN: {bill_data.get('customer_gstin', '')}</div>" if bill_data.get('type', '').upper() == 'GST' and bill_data.get('customer_gstin') else ""}
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

    <!-- Items -->"""

        # Add items
        for item in items:
            mrp = float(item.get('mrp', 0)) if item.get('mrp') else float(item.get('rate', 0))
            rate = float(item.get('rate', 0))
            qty = int(item.get('quantity', 0))
            amt = float(item.get('amount', 0))
            name = item.get('product_name', 'Item')
            if len(name) > ITEM_NAME_MAX:
                name = name[:ITEM_NAME_MAX-2] + ".."

            # Format numbers compactly
            mrp_str = f"{mrp:.0f}" if mrp >= 1000 else f"{mrp:.2f}"
            rate_str = f"{rate:.0f}" if rate >= 1000 else f"{rate:.2f}"
            amt_str = f"{amt:.0f}" if amt >= 1000 else f"{amt:.2f}"

            html += f"""
    <div class="item-row">
        <span class="col-name">{name}</span>
        <span class="col-qty">{qty}</span>
        <span class="col-mrp">{mrp_str}</span>
        <span class="col-rate">{rate_str}</span>
        <span class="col-amt">{amt_str}</span>
    </div>"""

        # Totals section - 2 COLUMN
        discount_cell = f"Discount: -{actual_discount:.2f}" if actual_discount > 0 else ""
        gst_cell = f"GST: +{gst_amount:.2f}" if gst_amount > 0 else ""

        html += f"""
    <div class="dashed"></div>

    <!-- Summary - 2 COLUMN -->
    <div class="small">
        <div class="summary-row"><span>Items: {total_items} | Qty: {total_qty}</span><span>Sub Total: {subtotal:.2f}</span></div>
        {f"<div class='summary-row'><span>{discount_cell}</span><span>{gst_cell}</span></div>" if actual_discount > 0 or gst_amount > 0 else ""}
        {f"<div class='row'>Round Off: {'+' if round_off > 0 else ''}{round_off:.2f}</div>" if abs(round_off) >= 0.01 else ""}
    </div>

    <!-- Grand Total -->
    <div class="grand-total">
        <span class="grand-total-label">GRAND TOTAL</span>
        <span class="grand-total-value">Rs.{grand_total}</span>
    </div>"""

        # GST breakdown for GST bills
        if bill_data.get('type', '').upper() == 'GST' and gst_breakdown:
            html += """
    <div class="center small bold">GST BREAKDOWN</div>
    <table class="gst-table">
        <tr><th>Tax%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total</th></tr>"""
            for gst_pct in sorted(gst_breakdown.keys()):
                data = gst_breakdown[gst_pct]
                taxable = data['taxable']
                total_gst = data['gst']
                cgst_amt = total_gst / 2
                html += f"""
        <tr>
            <td>{gst_pct:.0f}%</td>
            <td>{taxable:.0f}</td>
            <td>{cgst_amt:.2f}</td>
            <td>{cgst_amt:.2f}</td>
            <td>{total_gst:.2f}</td>
        </tr>"""
            html += """
    </table>"""

        # Payment info
        html += f"""
    <div class="dashed"></div>
    <div class="small center">Payment: {self._format_payment_type(bill_data.get('payment_type', 'Cash'))}</div>"""

        # Savings box
        total_savings += actual_discount  # Include discount in savings
        if total_savings > 0:
            html += f"""
    <div class="savings-box">
        <div class="bold">TODAY'S SAVINGS</div>
        <div class="large">Rs.{total_savings:.2f}</div>
        <div class="small">You saved compared to MRP!</div>
    </div>"""

        # No Exchange notice
        if show_no_exchange:
            html += """
    <div class="no-exchange">Sorry, No Exchange / No Refund</div>"""

        # Footer
        html += """
    <div class="dashed"></div>
    <div class="center bold" style="margin: 2mm 0;">*** THANK YOU VISIT AGAIN ***</div>
    <div class="solid"></div>

    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
        };
    </script>
</body>
</html>"""
        return html

    def _format_payment_type(self, payment_info) -> str:
        """Format payment type - handles both string and JSON array formats"""
        try:
            import json
            if isinstance(payment_info, str) and payment_info.startswith('['):
                payments = json.loads(payment_info)
                return ', '.join([f"{p['payment_type']}: {p['amount']}" for p in payments])
            else:
                return str(payment_info)
        except:
            return str(payment_info)

    def _generate_text_receipt(self, bill_data: Dict[str, Any], client_info: Dict[str, Any], show_no_exchange: bool = False) -> str:
        """
        Generate plain text receipt for Linux thermal printers - UNIFIED FORMAT

        Width: 38 characters (safe for all 58mm/80mm thermal printers)
        Columns: Item(12) + Qty(3) + MRP(7) + Rate(7) + Amt(9) = 38
        """
        import json

        # ==================== CONFIGURATION ====================
        W = 38              # Total receipt width (safe for all printers)
        COL_NAME = 12       # Item name column
        COL_QTY = 3         # Quantity column
        COL_MRP = 7         # MRP column
        COL_RATE = 7        # Rate column
        COL_AMT = 9         # Amount column
        # ========================================================

        lines = []

        def fmt_num(val, width):
            """Format number to fit in given width"""
            if val >= 10000:
                return f"{val:.0f}".rjust(width)
            elif val >= 1000:
                return f"{val:.1f}".rjust(width)
            else:
                return f"{val:.2f}".rjust(width)

        def truncate(text, max_len):
            """Truncate text with ellipsis if needed"""
            text = str(text).replace('\n', ' ').replace('\r', '').strip()
            if len(text) > max_len:
                return text[:max_len-2] + ".."
            return text

        # ==================== HEADER ====================
        lines.append("=" * W)
        lines.append(truncate(client_info.get('client_name', 'Business'), W).center(W))

        if client_info.get('address'):
            for addr_line in client_info['address'].split('\n'):
                if addr_line.strip():
                    lines.append(truncate(addr_line.strip(), W).center(W))

        if client_info.get('phone'):
            lines.append(f"Ph: {client_info['phone']}".center(W))

        if client_info.get('gstin'):
            lines.append(f"GSTIN: {client_info['gstin']}".center(W))

        lines.append("=" * W)

        # ==================== BILL TYPE ====================
        bill_type = "*** TAX INVOICE ***" if bill_data.get('type', '').upper() == 'GST' else "*** RECEIPT ***"
        lines.append(bill_type.center(W))
        lines.append("-" * W)

        # ==================== BILL INFO (2 COLUMN LAYOUT) ====================
        user_name = truncate(bill_data.get('user_name', bill_data.get('created_by', 'Admin')), 10)
        date_str = datetime.now().strftime('%d/%m/%Y')
        time_str = datetime.now().strftime('%I:%M %p')
        bill_no = str(bill_data.get('bill_number', 'N/A'))

        # 2-column format: left half + right half (19 chars each for W=38)
        half = W // 2
        lines.append(f"{'Bill No: ' + bill_no:<{half}}{'Date: ' + date_str:<{half}}")
        lines.append(f"{'Time: ' + time_str:<{half}}{'User: ' + user_name:<{half}}")

        if bill_data.get('customer_name'):
            lines.append(f"Customer: {truncate(bill_data['customer_name'], W-10)}")
        if bill_data.get('customer_phone'):
            lines.append(f"Phone: {bill_data['customer_phone']}")
        if bill_data.get('type', '').upper() == 'GST' and bill_data.get('customer_gstin'):
            lines.append(f"GSTIN: {bill_data['customer_gstin']}")

        lines.append("-" * W)

        # ==================== ITEMS HEADER ====================
        # Columns: Name(12) Qty(3) MRP(7) Rate(7) Amt(9) = 38
        header = f"{'Item':<{COL_NAME}}{'Qty':>{COL_QTY}}{'MRP':>{COL_MRP}}{'Rate':>{COL_RATE}}{'Amt':>{COL_AMT}}"
        lines.append(header)
        lines.append("-" * W)

        # ==================== ITEMS ====================
        items = bill_data.get('items', [])
        total_qty = 0
        total_savings = 0
        gst_breakdown = {}

        for item in items:
            name = truncate(item.get('product_name', 'Item'), COL_NAME)
            qty = int(item.get('quantity', 0))
            rate = float(item.get('rate', 0))
            mrp = float(item.get('mrp', 0)) if item.get('mrp') else rate
            amt = float(item.get('amount', 0))
            gst_pct = float(item.get('gst_percentage', 0))

            total_qty += qty

            if mrp > rate:
                total_savings += (mrp - rate) * qty

            if gst_pct > 0:
                taxable_amt = qty * rate
                gst_for_item = taxable_amt * gst_pct / 100
                if gst_pct not in gst_breakdown:
                    gst_breakdown[gst_pct] = {'taxable': 0, 'gst': 0}
                gst_breakdown[gst_pct]['taxable'] += taxable_amt
                gst_breakdown[gst_pct]['gst'] += gst_for_item

            row = f"{name:<{COL_NAME}}{qty:>{COL_QTY}}{fmt_num(mrp, COL_MRP)}{fmt_num(rate, COL_RATE)}{fmt_num(amt, COL_AMT)}"
            lines.append(row)

        lines.append("-" * W)

        # ==================== TOTALS (2 COLUMN) ====================
        total_items = len(items)
        subtotal = float(bill_data.get('subtotal', 0) or 0)
        discount = float(bill_data.get('discount_amount', 0) or 0)
        negotiable = float(bill_data.get('negotiable_amount', 0) or 0)
        gst_amount = float(bill_data.get('gst_amount', 0) or 0)
        actual_discount = negotiable if negotiable > 0 else discount

        # Row 1: Items/Qty + Sub Total
        left1 = f"Items:{total_items} Qty:{total_qty}"
        right1 = f"SubTot:{subtotal:.2f}"
        lines.append(f"{left1:<{half}}{right1:<{half}}")

        # Row 2: Discount + GST (if applicable)
        if actual_discount > 0 or gst_amount > 0:
            left2 = f"Disc:-{actual_discount:.2f}" if actual_discount > 0 else ""
            right2 = f"GST:+{gst_amount:.2f}" if gst_amount > 0 else ""
            lines.append(f"{left2:<{half}}{right2:<{half}}")

        # Final amount
        if bill_data.get('type', '').lower() == 'gst':
            final = float(bill_data.get('final_amount', 0) or 0)
        else:
            final = float(bill_data.get('total_amount', 0) or 0)

        round_off = round(final) - final
        if abs(round_off) >= 0.01:
            sign = "+" if round_off > 0 else ""
            lines.append(f"{'Round Off':<20}{sign}{round_off:>{W-21}.2f}")

        # ==================== GRAND TOTAL ====================
        grand_total = round(final)
        lines.append("=" * W)
        lines.append(f"GRAND TOTAL{' ' * 10}Rs.{grand_total:>11}")
        lines.append("=" * W)

        # ==================== GST BREAKDOWN ====================
        if bill_data.get('type', '').upper() == 'GST' and gst_breakdown:
            lines.append("GST BREAKDOWN".center(W))
            lines.append("-" * W)
            lines.append(f"{'Tax%':>5}{'Taxable':>10}{'CGST':>11}{'SGST':>11}")
            lines.append("-" * W)
            for gst_pct in sorted(gst_breakdown.keys()):
                data = gst_breakdown[gst_pct]
                taxable = data['taxable']
                total_gst = data['gst']
                cgst_amt = total_gst / 2
                lines.append(f"{gst_pct:>4.0f}%{taxable:>10.0f}{cgst_amt:>11.2f}{cgst_amt:>11.2f}")
            lines.append("-" * W)

        # ==================== PAYMENT ====================
        lines.append("")
        payment_info = bill_data.get('payment_type', 'Cash')
        try:
            if isinstance(payment_info, str) and payment_info.startswith('['):
                payments = json.loads(payment_info)
                parts = [f"{p.get('payment_type', 'Cash')}:{p.get('amount', 0)}" for p in payments]
                lines.append(f"Payment: {', '.join(parts)}")
            else:
                lines.append(f"Payment: {payment_info}".center(W))
        except:
            lines.append(f"Payment: {payment_info}".center(W))

        # ==================== SAVINGS ====================
        total_savings += actual_discount
        if total_savings > 0:
            lines.append("")
            lines.append("*" * W)
            lines.append(f"TODAY'S SAVINGS: Rs.{total_savings:.2f}".center(W))
            lines.append("*" * W)

        # ==================== NO EXCHANGE ====================
        if show_no_exchange:
            lines.append("-" * W)
            lines.append("No Exchange / No Refund".center(W))
            lines.append("-" * W)

        # ==================== FOOTER ====================
        lines.append("")
        lines.append("*** THANK YOU VISIT AGAIN ***".center(W))
        lines.append("=" * W)

        return '\n'.join(lines)

    def print_bill(self, bill_data: Dict[str, Any], client_info: Dict[str, Any], show_no_exchange: bool = False) -> bool:
        """
        Print bill to thermal printer

        Args:
            bill_data: Bill information
            client_info: Client/business information
            show_no_exchange: Whether to show "No Exchange Available" on the receipt

        Returns:
            True if print successful, False otherwise
        """
        try:
            # Check if printer is available
            if not self.printer_name:
                print("[THERMAL_PRINTER] ERROR: No printer configured")
                return False

            print(f"[THERMAL_PRINTER] Starting print job for bill #{bill_data.get('bill_number', 'N/A')}")

            # For Linux with thermal printers, ONLY use text-based printing
            if self.system == "Linux":
                try:
                    print("[THERMAL_PRINTER] Using text-based printing for thermal printer...")
                    # Generate text receipt
                    text_content = self._generate_text_receipt(bill_data, client_info, show_no_exchange)

                    # Create temporary text file
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
                        f.write(text_content)
                        temp_file = f.name

                    try:
                        # Print text file directly to thermal printer
                        print(f"[THERMAL_PRINTER] Sending plain text to printer: {self.printer_name}")

                        # Use raw printing for thermal printers
                        result = subprocess.run(
                            ['lp', '-d', self.printer_name, '-o', 'raw', temp_file],
                            timeout=10,
                            capture_output=True,
                            text=True
                        )
                        if result.returncode == 0:
                            print(f"[THERMAL_PRINTER] SUCCESS: Text receipt sent to {self.printer_name}")
                            return True
                        else:
                            error_msg = result.stderr.strip()
                            print(f"[THERMAL_PRINTER] ERROR: Text print failed - {error_msg}")
                            # For thermal printers, don't fall back to HTML
                            return False
                    finally:
                        # Clean up temp file
                        try:
                            os.unlink(temp_file)
                        except:
                            pass
                except Exception as e:
                    print(f"[THERMAL_PRINTER] ERROR: Text printing failed - {e}")
                    return False  # Don't fall back to HTML for thermal printers

            # For non-Linux systems (Windows/macOS), use persistent HTML file
            if self.system != "Linux":
                html_content = self._generate_receipt_html(bill_data, client_info)

                # Create persistent print file directory (won't be auto-deleted)
                import shutil
                persistent_temp_dir = os.path.join(tempfile.gettempdir(), 'ryx_billing_print')
                os.makedirs(persistent_temp_dir, exist_ok=True)

                # Create unique filename with timestamp
                bill_num = bill_data.get('bill_number', 'unknown')
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                persistent_file = os.path.join(persistent_temp_dir, f'receipt_{bill_num}_{timestamp}.html')

                # Write HTML to persistent file
                with open(persistent_file, 'w', encoding='utf-8') as f:
                    f.write(html_content)

                print(f"[THERMAL_PRINTER] Created persistent print file: {persistent_file}")

                try:
                    # Print based on OS
                    if self.system == "Windows":
                        self._print_windows(persistent_file)
                    elif self.system == "Darwin":
                        self._print_macos(persistent_file)
                    else:
                        raise Exception(f"Unsupported operating system: {self.system}")

                    # Clean up old print files (older than 1 hour) to prevent buildup
                    self._cleanup_old_print_files(persistent_temp_dir, max_age_seconds=3600)

                    return True
                except Exception as e:
                    print(f"[THERMAL_PRINTER] Print error: {e}")
                    # Don't delete the file - it might still be needed
                    raise

            # For Linux, we already handled printing above
            return True

        except Exception as e:
            print(f"[THERMAL_PRINTER] Print error: {e}")
            import traceback
            print("[THERMAL_PRINTER] Full traceback:")
            traceback.print_exc()
            return False

    def _cleanup_old_print_files(self, directory: str, max_age_seconds: int = 3600):
        """Clean up old print files to prevent buildup"""
        try:
            import time
            current_time = time.time()
            for filename in os.listdir(directory):
                filepath = os.path.join(directory, filename)
                if os.path.isfile(filepath):
                    file_age = current_time - os.path.getmtime(filepath)
                    if file_age > max_age_seconds:
                        try:
                            os.unlink(filepath)
                            print(f"[THERMAL_PRINTER] Cleaned up old file: {filename}")
                        except:
                            pass
        except Exception as e:
            print(f"[THERMAL_PRINTER] Cleanup error: {e}")

    def _print_windows(self, html_file: str):
        """Print on Windows using native print APIs"""
        try:
            # Method 1: Try using win32print (if pywin32 is installed)
            try:
                import win32print
                import win32api

                # Get the default printer
                printer_name = self.printer_name or win32print.GetDefaultPrinter()
                print(f"[THERMAL_PRINTER] Using win32api to print to: {printer_name}")

                # ShellExecute with "print" verb
                win32api.ShellExecute(0, "print", html_file, None, ".", 0)
                print("[THERMAL_PRINTER] Print command sent via ShellExecute")
                return
            except ImportError:
                print("[THERMAL_PRINTER] pywin32 not installed, trying alternative method...")
            except Exception as e:
                print(f"[THERMAL_PRINTER] win32api print failed: {e}, trying alternative...")

            # Method 2: Try using PowerShell with -Verb Print (fire and forget - don't wait)
            try:
                # Use PowerShell's Start-Process with -Verb Print - DON'T wait for completion
                ps_script = f'''
                try {{
                    Start-Process -FilePath "{html_file}" -Verb Print
                    Write-Output "SUCCESS"
                }} catch {{
                    Write-Output "FAILED: $($_.Exception.Message)"
                }}
                '''
                result = subprocess.run(
                    ['powershell', '-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command', ps_script],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if "SUCCESS" in result.stdout:
                    print("[THERMAL_PRINTER] Print command sent via PowerShell Start-Process")
                    return
                else:
                    print(f"[THERMAL_PRINTER] PowerShell print output: {result.stdout} {result.stderr}")
            except Exception as e:
                print(f"[THERMAL_PRINTER] PowerShell Start-Process failed: {e}")

            # Method 3: Open with default browser - file is already in persistent location
            try:
                import webbrowser

                # The html_file is already in a persistent location (ryx_billing_print folder)
                # So we can directly open it without worrying about deletion
                print(f"[THERMAL_PRINTER] Falling back to browser print dialog...")
                print(f"[THERMAL_PRINTER] Opening: {html_file}")

                # Open the file in browser - the HTML has auto-print JavaScript
                webbrowser.open(f'file:///{html_file}', new=2)
                print("[THERMAL_PRINTER] Opened in browser - auto-print will trigger")
                return
            except Exception as e:
                print(f"[THERMAL_PRINTER] Browser fallback failed: {e}")

            raise Exception("All Windows print methods failed")

        except subprocess.TimeoutExpired:
            print("[THERMAL_PRINTER] Print operation timed out")
            raise Exception("Print operation timed out")

    def _print_linux(self, html_file: str):
        """This method should not be called for Linux thermal printers"""
        # This method is kept for compatibility but should not be used
        # Linux thermal printers are handled directly in print_bill method
        raise Exception("Linux thermal printers should use text-only printing. This method should not be called.")

    def _print_macos(self, html_file: str):
        """Print on macOS using lp command"""
        # Similar to Linux
        if self.printer_name and self.printer_name != "default":
            subprocess.run(['lp', '-d', self.printer_name, '-o', 'media=Custom.80x297mm', html_file], timeout=10)
        else:
            subprocess.run(['lp', '-o', 'media=Custom.80x297mm', html_file], timeout=10)

    def print_labels(self, items: List[Dict[str, Any]]) -> bool:
        """
        Print barcode labels for items (50mm x 25mm labels)

        Args:
            items: List of items with item_code, product_name, rate, mrp, quantity
                   quantity determines how many labels to print for each item

        Returns:
            True if print successful, False otherwise
        """
        try:
            from utils.barcode_label import generate_labels_html, generate_text_labels

            # Check if printer is available
            if not self.printer_name:
                print("[THERMAL_PRINTER] ERROR: No printer configured for labels")
                return False

            total_labels = sum(int(item.get('quantity', 1)) for item in items)
            print(f"[THERMAL_PRINTER] Starting label print job - {total_labels} labels for {len(items)} items")

            # For Linux thermal printers, use ESC/POS commands for barcode printing
            if self.system == "Linux":
                try:
                    from utils.barcode_label import generate_escpos_labels

                    print("[THERMAL_PRINTER] Using ESC/POS barcode label printing for thermal printer...")
                    escpos_data = generate_escpos_labels(items)

                    # Create temporary binary file
                    with tempfile.NamedTemporaryFile(mode='wb', suffix='.bin', delete=False) as f:
                        f.write(escpos_data)
                        temp_file = f.name

                    try:
                        # Print binary ESC/POS data directly to thermal printer
                        print(f"[THERMAL_PRINTER] Sending {total_labels} ESC/POS barcode labels to printer: {self.printer_name}")

                        result = subprocess.run(
                            ['lp', '-d', self.printer_name, '-o', 'raw', temp_file],
                            timeout=30,
                            capture_output=True,
                            text=True
                        )

                        if result.returncode == 0:
                            print(f"[THERMAL_PRINTER] SUCCESS: {total_labels} barcode labels sent to {self.printer_name}")
                            return True
                        else:
                            error_msg = result.stderr.strip()
                            print(f"[THERMAL_PRINTER] ERROR: Label print failed - {error_msg}")
                            return False
                    finally:
                        try:
                            os.unlink(temp_file)
                        except:
                            pass

                except Exception as e:
                    print(f"[THERMAL_PRINTER] ERROR: ESC/POS label printing failed - {e}")
                    import traceback
                    traceback.print_exc()
                    return False

            # For Windows/macOS, use HTML labels
            html_content = generate_labels_html(items)

            # Create temporary HTML file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
                f.write(html_content)
                temp_file = f.name

            try:
                if self.system == "Windows":
                    self._print_windows(temp_file)
                elif self.system == "Darwin":
                    # Use custom size for 40mm x 30mm labels
                    if self.printer_name and self.printer_name != "default":
                        subprocess.run(['lp', '-d', self.printer_name, '-o', 'media=Custom.40x30mm', temp_file], timeout=30)
                    else:
                        subprocess.run(['lp', '-o', 'media=Custom.40x30mm', temp_file], timeout=30)

                print(f"[THERMAL_PRINTER] SUCCESS: {total_labels} labels printed")
                return True

            finally:
                try:
                    os.unlink(temp_file)
                except:
                    pass

        except Exception as e:
            print(f"[THERMAL_PRINTER] Label print error: {e}")
            import traceback
            traceback.print_exc()
            return False

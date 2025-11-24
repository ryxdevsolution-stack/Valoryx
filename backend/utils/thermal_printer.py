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
        """Get the system's default printer"""
        try:
            if self.system == "Windows":
                # Windows: Get default printer
                result = subprocess.run(
                    ['powershell', '-Command', 'Get-WmiObject -Class Win32_Printer | Where-Object {$_.Default -eq $true} | Select-Object -ExpandProperty Name'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                printer = result.stdout.strip()
                if printer:
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
                result = subprocess.run(
                    ['powershell', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return [p.strip() for p in result.stdout.split('\n') if p.strip()]
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

    def _generate_receipt_html(self, bill_data: Dict[str, Any], client_info: Dict[str, Any]) -> str:
        """Generate HTML for thermal receipt (80mm width)"""

        # Extract data
        items = bill_data.get('items', [])
        total_items = len(items)
        total_qty = sum(item.get('quantity', 0) for item in items)

        # Calculate savings if MRP exists
        total_mrp = sum(
            item.get('mrp', 0) * item.get('quantity', 0)
            for item in items if item.get('mrp', 0) > 0
        )
        total_selling = sum(
            item.get('rate', 0) * item.get('quantity', 0)
            for item in items
        )
        total_savings = total_mrp - total_selling if total_mrp > total_selling else 0
        savings_percentage = (total_savings / total_mrp * 100) if total_mrp > 0 else 0

        # Date formatting
        created_at = bill_data.get('created_at', datetime.now().isoformat())
        try:
            date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            date_str = date_obj.strftime('%d-%m-%Y')
            time_str = date_obj.strftime('%I:%M:%S %p')
        except:
            date_str = datetime.now().strftime('%d-%m-%Y')
            time_str = datetime.now().strftime('%I:%M:%S %p')

        # Build HTML
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page {{
            size: 80mm auto;
            margin: 0;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Courier New', monospace;
            width: 80mm;
            background: white;
            color: black;
            font-size: 9pt;
            line-height: 1.4;
            padding: 5mm;
        }}

        .center {{ text-align: center; }}
        .bold {{ font-weight: bold; }}
        .large {{ font-size: 12pt; }}
        .small {{ font-size: 7pt; }}
        .tiny {{ font-size: 6pt; }}
        .uppercase {{ text-transform: uppercase; }}
        .dashed {{ border-bottom: 2px dashed #000; margin: 2mm 0; }}
        .solid {{ border-bottom: 2px solid #000; }}
        .double {{ border: 3px double #000; }}

        .flex {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5mm;
        }}

        .logo {{
            width: 20mm;
            height: 20mm;
            margin: 0 auto 2mm;
        }}

        .item-row {{
            margin-bottom: 2mm;
        }}

        .item-name {{
            font-size: 8pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 0.5mm;
        }}

        .item-details {{
            display: flex;
            justify-content: space-between;
            padding-left: 5mm;
            font-size: 7pt;
        }}

        .savings-box {{
            border: 3px double #000;
            padding: 3mm 2mm;
            margin: 3mm 0;
            text-align: center;
            background: #f9f9f9;
        }}

        .grand-total {{
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
            padding: 2mm 0;
            margin: 2mm 0;
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
        }}
    </style>
</head>
<body>
    <!-- Star border top -->
    <div class="center small">★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★</div>

    <!-- Header -->
    <div class="center" style="margin: 3mm 0;">
        {"<img src='" + client_info.get('logo_url', '') + "' class='logo' />" if client_info.get('logo_url') else ""}
        <div class="large bold uppercase" style="letter-spacing: 1px; margin-bottom: 1mm;">
            {client_info.get('client_name', 'Business Name')}
        </div>
        {"<div class='small' style='line-height: 1.2; margin-bottom: 1mm;'>" + client_info.get('address', '').replace('\n', '<br>') + "</div>" if client_info.get('address') else ""}
        <div class="small">
            {"<div>Ph: " + client_info.get('phone', '') + "</div>" if client_info.get('phone') else ""}
            {"<div>GSTIN: " + client_info.get('gstin', '') + "</div>" if client_info.get('gstin') else ""}
        </div>
        <div class="bold" style="font-size: 9pt; margin-top: 2mm; text-transform: uppercase;">
            {bill_data.get('type', 'non-gst').upper() == 'GST' and 'TAX INVOICE' or 'CASH BILL'}
        </div>
    </div>

    <div class="dashed"></div>

    <!-- Bill Info -->
    <div class="small" style="margin-bottom: 2mm;">
        <div class="flex">
            <span>Bill No  : {bill_data.get('bill_number', 'N/A')}</span>
            <span><strong>Date  : {date_str}</strong></span>
        </div>
        <div class="flex">
            <span>Time : {time_str}</span>
            <span>Mode : {bill_data.get('type', 'NON-GST').upper()}</span>
        </div>
        {"<div style='margin-top: 2mm; border-top: 1px solid #ccc; padding-top: 1mm;'><div><strong>Customer:</strong> " + bill_data.get('customer_name', '') + "</div>" + ("<div><strong>Phone:</strong> " + bill_data.get('customer_phone', '') + "</div>" if bill_data.get('customer_phone') else "") + "</div>" if bill_data.get('customer_name') else ""}
    </div>

    <div class="dashed"></div>

    <!-- Items Header -->
    <div class="small flex bold" style="margin-bottom: 1mm;">
        <span style="flex: 1;">Description</span>
        <span style="width: 8mm; text-align: center;">Qty</span>
        <span style="width: 13mm; text-align: right;">MRP</span>
        <span style="width: 13mm; text-align: right;">Price</span>
        <span style="width: 15mm; text-align: right;">Amt</span>
    </div>

    <div class="dashed"></div>

    <!-- Items -->
"""

        # Add items
        for item in items:
            mrp = item.get('mrp', 0)
            rate = item.get('rate', 0)
            # Show GST info if available
            gst_info = ""
            if item.get('gst_percentage', 0) > 0:
                gst_info = f" (+{item.get('gst_percentage', 0)}% GST)"
            html += f"""
    <div class="item-row">
        <div class="item-name">{item.get('product_name', 'Item')}{gst_info}</div>
        <div class="item-details">
            <span style="flex: 1;"></span>
            <span style="width: 8mm; text-align: center;">{item.get('quantity', 0)}</span>
            <span style="width: 13mm; text-align: right;">{"<s>" + f"{mrp:.2f}" + "</s>" if mrp > rate else f"{mrp:.2f}" if mrp > 0 else "-"}</span>
            <span style="width: 13mm; text-align: right;">{rate:.2f}</span>
            <span style="width: 15mm; text-align: right; font-weight: bold;">{item.get('amount', 0):.2f}</span>
        </div>
    </div>
"""

        # Totals and footer
        # Calculate totals properly
        subtotal = bill_data.get('subtotal', 0)
        # Calculate discount amount if percentage is provided
        discount_percentage = bill_data.get('discount_percentage', 0)
        if discount_percentage > 0 and not bill_data.get('discount_amount'):
            discount = (subtotal * discount_percentage) / 100
        else:
            discount = bill_data.get('discount_amount', 0)

        gst_amount = bill_data.get('gst_amount', 0)

        # Calculate proper final amount
        if bill_data.get('type', '').lower() == 'gst':
            final_amount = bill_data.get('final_amount', 0)
            # Apply discount after GST
            if discount > 0:
                final_amount = subtotal + gst_amount - discount
        else:
            final_amount = bill_data.get('total_amount', 0)
            if discount > 0:
                final_amount = subtotal - discount

        round_off = round(final_amount) - final_amount

        # Calculate items total (with GST if applicable)
        items_total = sum(item.get('amount', 0) for item in items)

        html += f"""
    <div class="dashed"></div>

    <!-- Items summary -->
    <div class="small flex" style="margin-bottom: 2mm;">
        <span>Items: {total_items}  Total Qty: {total_qty}</span>
        <span class="bold">Items Total: {items_total:.2f}</span>
    </div>

    <div class="dashed"></div>

    <!-- Subtotal and GST breakdown -->
    <div class="small" style="margin-bottom: 2mm;">
        <div class="flex">
            <span>Taxable Amount :</span>
            <span>{subtotal:.2f}</span>
        </div>
        {"<div class='flex'><span>GST Amount :</span><span>+" + f"{gst_amount:.2f}" + "</span></div>" if gst_amount > 0 else ""}
        {"<div class='flex' style='margin-left: 10mm;'><span class='tiny'>CGST (9%) :</span><span class='tiny'>" + f"{(gst_amount/2):.2f}" + "</span></div>" if bill_data.get('type', '').lower() == 'gst' and gst_amount > 0 else ""}
        {"<div class='flex' style='margin-left: 10mm;'><span class='tiny'>SGST (9%) :</span><span class='tiny'>" + f"{(gst_amount/2):.2f}" + "</span></div>" if bill_data.get('type', '').lower() == 'gst' and gst_amount > 0 else ""}
        {"<div class='flex'><span>Discount" + (f" ({discount_percentage}%)" if discount_percentage > 0 else "") + " :</span><span>-" + f"{discount:.2f}" + "</span></div>" if discount > 0 else ""}
        {"<div class='flex'><span>Round Off :</span><span>" + (f"+{round_off:.2f}" if round_off > 0 else f"{round_off:.2f}") + "</span></div>" if round_off != 0 else ""}
    </div>

    <!-- Grand Total -->
    <div class="grand-total flex">
        <span>GRAND TOTAL :</span>
        <span>₹ {round(final_amount):.2f}</span>
    </div>

    <div class="dashed"></div>

    <!-- Payment Info -->
    <div class="small" style="margin-bottom: 2mm;">
        <div class="center" style="margin-bottom: 1mm;"><strong>Payment Mode:</strong></div>
        <div class="center">{self._format_payment_type(bill_data.get('payment_type', 'CASH'))}</div>
    </div>

    <div class="dashed"></div>

    <!-- Footer -->
    <div class="center" style="margin-top: 3mm;">
"""

        if total_savings > 0:
            html += f"""
        <div class="savings-box">
            <div style="font-size: 9pt; font-weight: bold; margin-bottom: 1mm; letter-spacing: 0.5px;">
                🎉 TODAY'S SAVINGS 🎉
            </div>
            <div style="font-size: 16pt; font-weight: bold; letter-spacing: 1px;">
                ₹{total_savings:.2f}
            </div>
            <div style="font-size: 8pt; font-weight: bold; margin-top: 1mm;">
                You saved {savings_percentage:.1f}% on MRP!
            </div>
            <div class="tiny" style="margin-top: 1mm; font-style: italic;">
                Total MRP: ₹{total_mrp:.2f} | You Pay: ₹{round(final_amount):.2f}
            </div>
        </div>
"""

        html += """
        <div style="font-size: 9pt; font-weight: bold; letter-spacing: 1px;">
            ★★★ THANK YOU VISIT AGAIN ★★★
        </div>
    </div>

    <!-- Star border bottom -->
    <div class="center small" style="margin-top: 2mm;">★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★</div>
</body>
</html>
"""
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

    def _generate_text_receipt(self, bill_data: Dict[str, Any], client_info: Dict[str, Any]) -> str:
        """Generate plain text receipt for thermal printer"""
        lines = []

        # Header
        lines.append("*" * 40)
        lines.append(client_info.get('client_name', 'Business Name').center(40))
        if client_info.get('address'):
            for addr_line in client_info['address'].split('\n'):
                lines.append(addr_line.center(40))
        if client_info.get('phone'):
            lines.append(f"Ph: {client_info['phone']}".center(40))
        if client_info.get('gstin'):
            lines.append(f"GSTIN: {client_info['gstin']}".center(40))

        bill_type = "TAX INVOICE" if bill_data.get('type', '').upper() == 'GST' else "CASH BILL"
        lines.append("")
        lines.append(bill_type.center(40))
        lines.append("-" * 40)

        # Bill info
        lines.append(f"Bill No: {bill_data.get('bill_number', 'N/A')}")

        created_at = bill_data.get('created_at', '')
        try:
            from datetime import datetime
            date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            date_str = date_obj.strftime('%d-%m-%Y %I:%M:%S %p')
        except:
            date_str = datetime.now().strftime('%d-%m-%Y %I:%M:%S %p')
        lines.append(f"Date: {date_str}")

        if bill_data.get('customer_name'):
            lines.append(f"Customer: {bill_data['customer_name']}")
            if bill_data.get('customer_phone'):
                lines.append(f"Phone: {bill_data['customer_phone']}")

        lines.append("-" * 40)
        lines.append("Item                     Qty  Rate   Amt")
        lines.append("-" * 40)

        # Items
        for item in bill_data.get('items', []):
            name = item.get('product_name', 'Item')[:20]
            qty = item.get('quantity', 0)
            rate = item.get('rate', 0)
            amt = item.get('amount', 0)
            lines.append(f"{name:<25}{qty:3} {rate:6.2f} {amt:7.2f}")

        lines.append("-" * 40)

        # Totals (convert strings to float)
        subtotal = bill_data.get('subtotal', 0)
        try:
            subtotal = float(subtotal)
        except:
            subtotal = 0
        lines.append(f"{'Subtotal:':<30} {subtotal:>9.2f}")

        discount_amount = bill_data.get('discount_amount', 0)
        try:
            discount_amount = float(discount_amount)
        except:
            discount_amount = 0
        if discount_amount > 0:
            lines.append(f"{'Discount:':<30} -{discount_amount:>8.2f}")

        lines.append("=" * 40)
        final = bill_data.get('final_amount', 0) if bill_data.get('type') == 'gst' else bill_data.get('total_amount', 0)
        # Convert to float if it's a string
        try:
            final = float(final)
        except:
            final = 0
        lines.append(f"{'GRAND TOTAL:':<30} {round(final):>9.2f}")
        lines.append("=" * 40)

        # Payment - handle both string and JSON array formats
        payment_info = bill_data.get('payment_type', 'CASH')
        try:
            # Try to parse if it's a JSON string
            import json
            if isinstance(payment_info, str) and payment_info.startswith('['):
                payments = json.loads(payment_info)
                payment_str = ', '.join([f"{p['payment_type']}: {p['amount']}" for p in payments])
                lines.append(f"Payment: {payment_str}")
            else:
                lines.append(f"Payment: {payment_info}")
        except:
            # If parsing fails, just use as is
            lines.append(f"Payment: {payment_info}")
        lines.append("")
        lines.append("THANK YOU VISIT AGAIN!".center(40))
        lines.append("*" * 40)

        return '\n'.join(lines)

    def print_bill(self, bill_data: Dict[str, Any], client_info: Dict[str, Any]) -> bool:
        """
        Print bill to thermal printer

        Args:
            bill_data: Bill information
            client_info: Client/business information

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
                    text_content = self._generate_text_receipt(bill_data, client_info)

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

            # For non-Linux systems, use HTML
            if self.system != "Linux":
                html_content = self._generate_receipt_html(bill_data, client_info)

                # Create temporary HTML file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
                    f.write(html_content)
                    temp_file = f.name

                try:
                    # Print based on OS
                    if self.system == "Windows":
                        self._print_windows(temp_file)
                    elif self.system == "Darwin":
                        self._print_macos(temp_file)
                    else:
                        raise Exception(f"Unsupported operating system: {self.system}")

                    return True
                finally:
                    # Clean up temp file
                    try:
                        os.unlink(temp_file)
                    except:
                        pass

            # For Linux, we already handled printing above
            return True

        except Exception as e:
            print(f"[THERMAL_PRINTER] Print error: {e}")
            import traceback
            print("[THERMAL_PRINTER] Full traceback:")
            traceback.print_exc()
            return False

    def _print_windows(self, html_file: str):
        """Print on Windows using default browser"""
        # Use PowerShell to print HTML file
        ps_script = f"""
        $IE = New-Object -ComObject InternetExplorer.Application
        $IE.Visible = $false
        $IE.Navigate('{html_file}')
        while($IE.Busy) {{ Start-Sleep -Milliseconds 100 }}
        Start-Sleep -Milliseconds 500
        $IE.ExecWB(6, 2)
        Start-Sleep -Milliseconds 1000
        $IE.Quit()
        """
        subprocess.run(['powershell', '-Command', ps_script], timeout=30)

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

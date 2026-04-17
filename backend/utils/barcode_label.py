"""
Barcode Label Generator
Generates barcode labels for thermal printing
"""

import barcode
from barcode.writer import SVGWriter, ImageWriter
import io
import base64
from typing import Dict, Any, List, Optional
from PIL import Image

# Configuration - Label size 50mm x 25mm
LABEL_CONFIG = {
    'width_mm': 50,           # Label width in mm
    'height_mm': 25,          # Label height in mm
    'char_width': 40,         # Characters per line (50mm ≈ 40 chars)
    'barcode_height': 50,     # Barcode height in pixels for image
    'barcode_width': 2,       # Barcode module width
    'print_width_dots': 384,  # Thermal printer width in dots (48mm printable @ 8 dots/mm)
}


def generate_barcode_svg(code: str) -> str:
    """
    Generate a barcode SVG and return as base64 data URI

    Args:
        code: The code to encode (item_code)

    Returns:
        Base64 encoded SVG data URI
    """
    try:
        # Clean the code - remove spaces and special characters that CODE128 doesn't support
        clean_code = ''.join(c for c in code if c.isalnum() or c in '-_')

        if not clean_code:
            clean_code = "NOCODE"

        # Generate CODE128 barcode (supports alphanumeric)
        code128 = barcode.get_barcode_class('code128')

        # Create custom writer options for smaller barcode
        writer = SVGWriter()

        # Generate barcode
        barcode_instance = code128(clean_code, writer=writer)

        # Write to buffer
        buffer = io.BytesIO()
        barcode_instance.write(buffer, options={
            'module_width': 0.25,  # Thinner bars for smaller labels
            'module_height': 8.0,   # Shorter height
            'font_size': 0,         # No text under barcode (we'll add it ourselves)
            'text_distance': 1,
            'quiet_zone': 2,
        })

        # Get SVG content
        svg_content = buffer.getvalue().decode('utf-8')

        # Encode as base64
        b64_svg = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')

        return f"data:image/svg+xml;base64,{b64_svg}"

    except Exception as e:
        print(f"[BARCODE] Error generating barcode for '{code}': {e}")
        # Return empty placeholder on error
        return ""


def generate_label_html(item: Dict[str, Any]) -> str:
    """
    Generate HTML for a single barcode label (40mm x 30mm)

    Args:
        item: Dictionary containing item_code, product_name, rate, mrp

    Returns:
        HTML string for the label
    """
    item_code = item.get('item_code', 'N/A')
    product_name = item.get('product_name', 'Unknown Product')
    rate = float(item.get('rate', 0) or 0)
    mrp = float(item.get('mrp', 0) or item.get('rate', 0) or 0)

    # Truncate product name if too long
    if len(product_name) > 20:
        product_name = product_name[:17] + "..."

    # Generate barcode SVG
    barcode_svg = generate_barcode_svg(item_code)

    # Format prices in Indian number format
    def format_price(price):
        return f"{price:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    label_html = f"""
    <div class="label">
        <div class="barcode-container">
            <img src="{barcode_svg}" alt="{item_code}" class="barcode-img" />
        </div>
        <div class="item-code">{item_code}</div>
        <div class="product-name">{product_name}</div>
        <div class="price-row">
            <span class="mrp">MRP: ₹{format_price(mrp)}</span>
        </div>
        <div class="price-row">
            <span class="rate">Rate: ₹{format_price(rate)}</span>
        </div>
    </div>
    """

    return label_html


def generate_labels_html(items: List[Dict[str, Any]], config: dict = None) -> str:
    """
    Generate HTML for multiple barcode labels
    Each item can specify 'quantity' to print multiple copies

    Args:
        items: List of items with item_code, product_name, rate, mrp, quantity
        config: Optional configuration override

    Returns:
        Complete HTML document ready for printing
    """
    cfg = config or LABEL_CONFIG
    width_mm = cfg.get('width_mm', 40)
    height_mm = cfg.get('height_mm', 30)

    # CSS for labels based on config
    html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page {{
            size: {width_mm}mm {height_mm}mm;
            margin: 0;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: Arial, sans-serif;
            background: white;
            color: black;
        }}

        .label {{
            width: {width_mm}mm;
            height: {height_mm}mm;
            padding: 1mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            page-break-after: always;
            border: 0.5px dotted #ccc;
        }}

        .label:last-child {{
            page-break-after: avoid;
        }}

        .barcode-container {{
            width: 100%;
            height: 10mm;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }}

        .barcode-img {{
            max-width: {width_mm - 4}mm;
            max-height: 10mm;
            object-fit: contain;
        }}

        .item-code {{
            font-size: 7pt;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            text-align: center;
            margin-top: 0.5mm;
            letter-spacing: 0.5px;
        }}

        .product-name {{
            font-size: 6pt;
            font-weight: bold;
            text-align: center;
            text-transform: uppercase;
            margin-top: 0.5mm;
            max-width: {width_mm - 2}mm;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }}

        .price-row {{
            font-size: 6pt;
            text-align: center;
            margin-top: 0.5mm;
        }}

        .mrp {{
            color: #666;
        }}

        .rate {{
            font-weight: bold;
            font-size: 7pt;
        }}

        @media print {{
            .label {{
                border: none;
            }}
        }}
    </style>
</head>
<body>
"""

    # Generate labels for each item based on quantity
    for item in items:
        quantity = int(item.get('quantity', 1))
        label = generate_label_html(item)

        # Print 'quantity' number of labels for this item
        for _ in range(quantity):
            html += label

    html += """
</body>
</html>
"""

    return html


# ──────────────────────────────────────────────────────────────────────────
# Apparel hang-tag label (50×100mm landscape) — hybrid CODE128 + QR
# Includes Legal Metrology fields: brand, size, MRP phrase, MFG, origin,
# importer, consumer care. Designed per UI spec at 203 DPI.
# ──────────────────────────────────────────────────────────────────────────

APPAREL_LABEL_CONFIG = {
    'width_mm': 100,
    'height_mm': 50,
}


def _format_inr(value) -> str:
    try:
        num = float(value or 0)
    except (TypeError, ValueError):
        num = 0.0
    if num == int(num):
        return f"{int(num):,}"
    return f"{num:,.2f}"


def _escape(s) -> str:
    if s is None:
        return ''
    return (
        str(s)
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
    )


def generate_qr_svg_data_uri(data: str, box_size: int = 6, border: int = 2) -> str:
    """Generate a QR code as a base64-encoded SVG data URI."""
    if not data:
        return ''
    try:
        import qrcode
        import qrcode.image.svg as qrsvg
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(image_factory=qrsvg.SvgImage)
        buf = io.BytesIO()
        img.save(buf)
        svg = buf.getvalue().decode('utf-8')
        b64 = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
        return f"data:image/svg+xml;base64,{b64}"
    except Exception as e:
        print(f"[APPAREL_LABEL] QR generation failed for {data!r}: {e}")
        return ''


def _resolve_label_field(item: Dict[str, Any], client_defaults: Dict[str, Any],
                        item_key: str, default_key: str) -> str:
    """Per-SKU value falls back to client-wide default if blank."""
    val = item.get(item_key)
    if val is None or (isinstance(val, str) and not val.strip()):
        val = client_defaults.get(default_key)
    return '' if val is None else str(val).strip()


def generate_apparel_label_html(item: Dict[str, Any],
                                 client_defaults: Optional[Dict[str, Any]] = None,
                                 qr_url_template: Optional[str] = None) -> str:
    """
    Generate HTML for a single 50×100mm apparel hang-tag label.

    item: expects brand_name, product_name, size_variant, colour, item_code,
          rate, mrp, manufacture_date, country_of_origin, importer_name,
          importer_address, consumer_care_phone, consumer_care_email
    client_defaults: fallback dict (label_importer_name, label_importer_address,
          label_origin_country, label_care_phone, label_care_email)
    qr_url_template: e.g. "https://valoryx.in/p/{sku}" — payload for QR code.
          If None, QR payload = item_code.
    """
    defaults = client_defaults or {}

    brand = _escape(item.get('brand_name') or '')
    product_name = _escape(item.get('product_name') or '')
    sku = str(item.get('item_code') or '')
    size_v = _escape(item.get('size_variant') or '')
    colour = _escape(item.get('colour') or '')
    mrp = item.get('mrp') or item.get('rate') or 0

    mfg = _resolve_label_field(item, defaults, 'manufacture_date', '')
    origin = _resolve_label_field(item, defaults, 'country_of_origin', 'label_origin_country') or 'India'
    imp_name = _resolve_label_field(item, defaults, 'importer_name', 'label_importer_name')
    imp_addr = _resolve_label_field(item, defaults, 'importer_address', 'label_importer_address')
    care_phone = _resolve_label_field(item, defaults, 'consumer_care_phone', 'label_care_phone')
    care_email = _resolve_label_field(item, defaults, 'consumer_care_email', 'label_care_email')

    # Meta row
    meta_parts = []
    if size_v:
        meta_parts.append(f"SIZE: {size_v}")
    if colour:
        meta_parts.append(f"COLOUR: {colour}")
    if sku:
        meta_parts.append(f"SKU: {_escape(sku)}")
    meta_row = '  |  '.join(meta_parts) or '&nbsp;'

    # Legal fine print (3 compact lines per design spec)
    line1_bits = []
    if mfg:
        line1_bits.append(f"Mfg: {_escape(mfg)}")
    if origin:
        line1_bits.append(f"Origin: {_escape(origin)}")
    line1_bits.append("Net Qty: 1 N")
    legal_line_1 = '  •  '.join(line1_bits)

    if imp_name:
        mkt_body = _escape(imp_name)
        if imp_addr:
            mkt_body += f", {_escape(imp_addr)}"
        legal_line_2 = f"Mkt by: {mkt_body}"
    else:
        legal_line_2 = ''

    care_bits = []
    if care_phone:
        care_bits.append(f"Care: {_escape(care_phone)}")
    if care_email:
        care_bits.append(_escape(care_email))
    care_bits.append("MRP incl. of all taxes")
    legal_line_3 = '  •  '.join(care_bits)

    # Barcode (CODE128) — existing generator
    barcode_svg = generate_barcode_svg(sku) if sku else ''

    # QR payload
    if qr_url_template:
        qr_payload = qr_url_template.replace('{sku}', sku)
    else:
        qr_payload = sku
    qr_svg = generate_qr_svg_data_uri(qr_payload) if qr_payload else ''

    # Hide legal line 2 entirely if no importer
    legal_line_2_html = (
        f'<div class="legal-line">{legal_line_2}</div>' if legal_line_2 else ''
    )

    return f"""
    <section class="apparel-label">
      <header class="al-head">
        <div class="al-brand">{brand}</div>
        <div class="al-mrp">MRP ₹{_format_inr(mrp)}</div>
      </header>
      <div class="al-product">{product_name}</div>
      <div class="al-meta">{meta_row}</div>
      <div class="al-body">
        <div class="al-body-left">
          <div class="al-legal">
            <div class="legal-line">{legal_line_1}</div>
            {legal_line_2_html}
            <div class="legal-line">{legal_line_3}</div>
          </div>
          <div class="al-barcode">
            {f'<img src="{barcode_svg}" alt="{_escape(sku)}" />' if barcode_svg else ''}
            <div class="al-barcode-digits">{_escape(sku)}</div>
          </div>
        </div>
        <div class="al-qr">
          {f'<img src="{qr_svg}" alt="QR" />' if qr_svg else ''}
          <div class="al-qr-caption">scan for details</div>
        </div>
      </div>
    </section>
    """


def generate_apparel_labels_html(items: List[Dict[str, Any]],
                                  client_defaults: Optional[Dict[str, Any]] = None,
                                  qr_url_template: Optional[str] = None) -> str:
    """
    Generate complete HTML document for 50×100mm apparel hang-tag printing.
    Each item's `quantity` controls how many labels are printed for that SKU.
    """
    cfg = APPAREL_LABEL_CONFIG
    W, H = cfg['width_mm'], cfg['height_mm']

    css = f"""
        @page {{ size: {W}mm {H}mm; margin: 0; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Inter', 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
                background: white; color: #000; -webkit-print-color-adjust: exact; }}
        .apparel-label {{
            width: {W}mm; height: {H}mm;
            padding: 2mm;
            display: flex; flex-direction: column; gap: 0.8mm;
            page-break-after: always;
            overflow: hidden;
        }}
        .apparel-label:last-child {{ page-break-after: avoid; }}
        .al-head {{ display: flex; justify-content: space-between; align-items: baseline;
                    border-bottom: 0.25mm solid #000; padding-bottom: 0.6mm; }}
        .al-brand {{ font-size: 9pt; font-weight: 800; letter-spacing: 0.5pt;
                     text-transform: uppercase; }}
        .al-mrp   {{ font-size: 14pt; font-weight: 900; }}
        .al-product {{ font-size: 16pt; font-weight: 800; line-height: 1.05;
                       text-transform: uppercase;
                       display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                       overflow: hidden; text-overflow: ellipsis; max-height: 10mm; }}
        .al-meta {{ font-size: 7pt; font-weight: 600; letter-spacing: 0.3pt;
                    text-transform: uppercase; color: #111; }}
        .al-body {{ display: flex; flex: 1; gap: 2mm; align-items: stretch; min-height: 0; }}
        .al-body-left {{ flex: 1; display: flex; flex-direction: column;
                          justify-content: space-between; min-width: 0; }}
        .al-legal {{ font-size: 5.5pt; font-weight: 400; line-height: 1.25; color: #000; }}
        .legal-line {{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
        .al-barcode {{ margin-top: 0.8mm; }}
        .al-barcode img {{ width: 100%; height: 8mm; object-fit: fill;
                            image-rendering: pixelated; image-rendering: crisp-edges; }}
        .al-barcode-digits {{ font-family: 'Courier New', monospace; font-size: 7pt;
                               font-weight: 700; text-align: center; margin-top: 0.3mm;
                               letter-spacing: 0.5pt; }}
        .al-qr {{ width: 22mm; display: flex; flex-direction: column;
                   align-items: center; justify-content: flex-end; flex-shrink: 0; }}
        .al-qr img {{ width: 20mm; height: 20mm; }}
        .al-qr-caption {{ font-size: 5pt; font-weight: 500; margin-top: 0.4mm;
                           text-align: center; color: #333; }}
        @media print {{
            body {{ margin: 0; }}
            .apparel-label {{ border: none; }}
        }}
    """

    body_html = ''
    for item in items:
        quantity = max(1, int(item.get('quantity', 1) or 1))
        label = generate_apparel_label_html(item, client_defaults, qr_url_template)
        for _ in range(quantity):
            body_html += label

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>{css}</style></head>
<body>
{body_html}
</body>
</html>"""


def generate_barcode_image(code: str, width: int = 384, height: int = 60) -> Image.Image:
    """
    Generate a barcode as a PIL Image

    Args:
        code: The code to encode
        width: Image width in pixels
        height: Barcode height in pixels

    Returns:
        PIL Image object (1-bit black and white)
    """
    # Clean code for barcode
    clean_code = ''.join(c for c in code if c.isalnum() or c in '-_.')
    if not clean_code:
        clean_code = "NOCODE"

    if len(clean_code) > 20:
        clean_code = clean_code[:20]

    # Generate CODE128 barcode as PNG
    # Settings optimized for 58mm thermal printer (384 dots @ 8 dots/mm)
    code128 = barcode.get_barcode_class('code128')
    writer = ImageWriter()

    barcode_instance = code128(clean_code, writer=writer)

    # Write to buffer with scanner-optimized settings
    buffer = io.BytesIO()
    barcode_instance.write(buffer, options={
        'module_width': 0.5,       # Wider bars for better scan reliability
        'module_height': 15,       # Taller bars for easier scanning
        'font_size': 0,            # No text (we add it separately)
        'text_distance': 0,
        'quiet_zone': 6,           # Adequate quiet zone for scanner
        'write_text': False,       # Don't include text in barcode image
    })

    # Load image
    buffer.seek(0)
    img = Image.open(buffer)

    # Convert to high-contrast black and white for thermal printer
    img = img.convert('L')  # Grayscale first
    img = img.point(lambda x: 0 if x < 180 else 255, '1')  # Higher threshold for sharper edges

    # Resize to fit printer width - don't shrink too much for scannability
    original_width = img.width
    if original_width > width:
        # Scale down proportionally
        aspect = img.height / img.width
        img = img.resize((width, int(width * aspect)), Image.Resampling.NEAREST)
    # If smaller than width, keep original size (centered by printer)

    return img


def image_to_escpos_raster(img: Image.Image) -> bytes:
    """
    Convert a PIL Image to ESC/POS raster format

    Args:
        img: PIL Image (should be 1-bit black and white)

    Returns:
        Bytes containing ESC/POS raster commands
    """
    # Ensure image is 1-bit
    if img.mode != '1':
        img = img.convert('1')

    width = img.width
    height = img.height

    # Width must be multiple of 8
    if width % 8 != 0:
        new_width = ((width // 8) + 1) * 8
        new_img = Image.new('1', (new_width, height), 1)  # White background
        new_img.paste(img, (0, 0))
        img = new_img
        width = new_width

    bytes_per_row = width // 8

    commands = bytearray()

    # Center alignment
    commands.extend(b'\x1b\x61\x01')

    # GS v 0 - Print raster bit image
    # Format: GS v 0 m xL xH yL yH d1...dk
    # m = 0 (normal), xL xH = width in bytes, yL yH = height in dots
    commands.extend(b'\x1d\x76\x30\x00')
    commands.append(bytes_per_row & 0xFF)  # xL
    commands.append((bytes_per_row >> 8) & 0xFF)  # xH
    commands.append(height & 0xFF)  # yL
    commands.append((height >> 8) & 0xFF)  # yH

    # Convert image to bytes (1 = black, 0 = white in ESC/POS, but PIL uses opposite)
    pixels = img.load()
    for y in range(height):
        for x in range(0, width, 8):
            byte = 0
            for bit in range(8):
                if x + bit < width:
                    # PIL: 0 = black, 255 = white; ESC/POS: 1 = black, 0 = white
                    if pixels[x + bit, y] == 0:
                        byte |= (1 << (7 - bit))
            commands.append(byte)

    return bytes(commands)


def generate_escpos_barcode(code: str, config: dict = None) -> bytes:
    """
    Generate ESC/POS commands for printing a barcode as raster image

    Args:
        code: The code to encode
        config: Optional configuration override

    Returns:
        Bytes containing ESC/POS raster image commands
    """
    cfg = config or LABEL_CONFIG
    print_width = cfg.get('print_width_dots', 384)

    # Generate barcode image
    img = generate_barcode_image(code, width=print_width, height=60)

    # Convert to ESC/POS raster
    return image_to_escpos_raster(img)


def generate_escpos_labels(items: List[Dict[str, Any]], config: dict = None) -> bytes:
    """
    Generate ESC/POS commands for barcode labels with actual barcodes

    Args:
        items: List of items with item_code, product_name, rate, mrp, quantity
        config: Optional configuration override

    Returns:
        Bytes containing ESC/POS commands for all labels
    """
    cfg = config or LABEL_CONFIG
    W = cfg.get('char_width', 32)  # Characters per line

    commands = bytearray()

    # Initialize printer
    commands.extend(b'\x1b\x40')  # ESC @ - Initialize

    for item in items:
        quantity = int(item.get('quantity', 1))
        item_code = item.get('item_code', 'N/A')
        product_name = item.get('product_name', 'Unknown')
        rate = float(item.get('rate', 0) or 0)
        mrp = float(item.get('mrp', 0) or item.get('rate', 0) or 0)

        # Truncate product name based on width
        max_name_len = W - 2
        if len(product_name) > max_name_len:
            product_name = product_name[:max_name_len - 3] + "..."

        for _ in range(quantity):
            # Center alignment
            commands.extend(b'\x1b\x61\x01')  # ESC a 1 - Center

            # Print barcode (HRI text shows item_code below barcode automatically)
            commands.extend(generate_escpos_barcode(item_code, cfg))

            # Product name (bold)
            commands.extend(b'\x1b\x45\x01')  # Bold on
            commands.extend(product_name.center(W).encode('ascii', errors='replace'))
            commands.extend(b'\x0a')
            commands.extend(b'\x1b\x45\x00')  # Bold off

            # MRP and Rate on same line
            price_text = f"MRP:{mrp:.0f}  Rate:{rate:.0f}"
            commands.extend(price_text.center(W).encode('ascii', errors='replace'))
            commands.extend(b'\x0a')

            # Separator
            commands.extend(b'-' * W)
            commands.extend(b'\x0a')

    # Cut paper (partial cut)
    commands.extend(b'\x1d\x56\x01')  # GS V 1 - Partial cut

    return bytes(commands)


def generate_text_labels(items: List[Dict[str, Any]], config: dict = None) -> str:
    """
    Generate plain text labels for thermal printers that don't support graphics
    Falls back to text-only output with item code prominently displayed

    Args:
        items: List of items with item_code, product_name, rate, mrp, quantity
        config: Optional configuration override

    Returns:
        Plain text string ready for printing
    """
    cfg = config or LABEL_CONFIG
    W = cfg.get('char_width', 32)

    lines = []

    for item in items:
        quantity = int(item.get('quantity', 1))
        item_code = item.get('item_code', 'N/A')
        product_name = item.get('product_name', 'Unknown')
        rate = float(item.get('rate', 0) or 0)
        mrp = float(item.get('mrp', 0) or item.get('rate', 0) or 0)

        # Truncate product name if too long
        max_name_len = W - 2
        if len(product_name) > max_name_len:
            product_name = product_name[:max_name_len - 3] + "..."

        # Print 'quantity' number of labels
        for _ in range(quantity):
            lines.append("=" * W)
            lines.append(f"*{item_code.center(W-2)}*")
            lines.append(f" {product_name.center(W-2)} ")
            lines.append(f" MRP: Rs.{mrp:.2f} ".center(W))
            lines.append(f" Rate: Rs.{rate:.2f} ".center(W))
            lines.append("=" * W)
            lines.append("")  # Blank line between labels

    return '\n'.join(lines)

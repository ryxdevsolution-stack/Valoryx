from decimal import Decimal


def title_case(text):
    """
    Convert text to title case (first letter of each word capitalized).
    Handles names professionally.

    Examples:
        "john doe" -> "John Doe"
        "JOHN DOE" -> "John Doe"
        "john" -> "John"
    """
    if not text or not isinstance(text, str):
        return text

    # Strip extra spaces and convert to title case
    return text.strip().title()


def calculate_gst_amount(subtotal, gst_percentage):
    """Calculate GST amount from subtotal and percentage"""
    subtotal_decimal = Decimal(str(subtotal))
    gst_percentage_decimal = Decimal(str(gst_percentage))

    gst_amount = (subtotal_decimal * gst_percentage_decimal) / Decimal('100')
    return round(gst_amount, 2)


def calculate_final_amount(subtotal, gst_amount):
    """Calculate final amount (subtotal + GST)"""
    subtotal_decimal = Decimal(str(subtotal))
    gst_amount_decimal = Decimal(str(gst_amount))

    final_amount = subtotal_decimal + gst_amount_decimal
    return round(final_amount, 2)


def build_tax_breakdown(tax_amount, tax_config):
    """Split a total tax amount into named components per the client's tax_config.

    tax_config shape:
        {"name": "GST", "mode": "split"|"single"|"none", "default_rate": 18,
         "inclusive": false, "components": [{"name": "CGST", "ratio": 0.5}, ...]}

    Returns a list of {"name": str, "amount": float}. The amounts always sum to
    `tax_amount` (rounding remainder folded into the last component). Falls back to
    the India GST CGST/SGST 50-50 split when tax_config is missing/empty, so legacy
    bills behave exactly as before.

    Examples:
        India GST 18 on ₹100 → [{"name":"CGST","amount":9.0},{"name":"SGST","amount":9.0}]
        UAE  VAT 5  (single) → [{"name":"VAT","amount":5.0}]
        mode "none"          → []
    """
    total = Decimal(str(tax_amount or 0))

    # Fallback: legacy India GST split when no usable config is supplied.
    if not isinstance(tax_config, dict) or not tax_config:
        tax_config = {
            "mode": "split",
            "components": [{"name": "CGST", "ratio": 0.5}, {"name": "SGST", "ratio": 0.5}],
        }

    mode = tax_config.get("mode", "split")
    if mode == "none" or total == 0:
        return []

    components = tax_config.get("components") or []
    if mode == "single" or not components:
        name = (components[0].get("name") if components else None) or tax_config.get("name") or "Tax"
        return [{"name": name, "amount": float(round(total, 2))}]

    # Split mode: allocate by ratio, fold the rounding remainder into the last component.
    result = []
    allocated = Decimal("0")
    for comp in components[:-1]:
        ratio = Decimal(str(comp.get("ratio", 0)))
        amount = (total * ratio).quantize(Decimal("0.01"))
        allocated += amount
        result.append({"name": comp.get("name") or "Tax", "amount": float(amount)})
    last = components[-1]
    result.append({"name": last.get("name") or "Tax", "amount": float(round(total - allocated, 2))})
    return result


def validate_items(items):
    """Validate billing items structure"""
    if not isinstance(items, list) or len(items) == 0:
        return False, "Items must be a non-empty array"

    required_fields = ['product_id', 'product_name', 'quantity', 'rate', 'amount']

    for item in items:
        for field in required_fields:
            if field not in item:
                return False, f"Item missing required field: {field}"

        # Validate types
        if not isinstance(item['quantity'], (int, float)) or item['quantity'] <= 0:
            return False, "Quantity must be a positive number"

        if not isinstance(item['rate'], (int, float)) or item['rate'] < 0:
            return False, "Rate must be a non-negative number"

        if not isinstance(item['amount'], (int, float)) or item['amount'] < 0:
            return False, "Amount must be a non-negative number"

    return True, None

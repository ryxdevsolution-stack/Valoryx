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

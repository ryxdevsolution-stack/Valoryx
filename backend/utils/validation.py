"""
RYX Billing - Input Validation Utilities
Provides reusable validation for request data across all routes
"""
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Dict, List, Optional, Union, Callable
from functools import wraps
from flask import request, g

from .response_helpers import validation_error


# ============================================================================
# VALIDATION EXCEPTIONS
# ============================================================================

class ValidationError(Exception):
    """Raised when validation fails"""

    def __init__(self, message: str, field: str = None, value: Any = None):
        self.message = message
        self.field = field
        self.value = value
        super().__init__(message)


# ============================================================================
# FIELD VALIDATORS
# ============================================================================

def validate_required(value: Any, field_name: str) -> Any:
    """Validate that a field is present and not empty"""
    if value is None:
        raise ValidationError(f"'{field_name}' is required", field=field_name)

    if isinstance(value, str) and value.strip() == "":
        raise ValidationError(f"'{field_name}' cannot be empty", field=field_name)

    return value


def validate_string(value: Any, field_name: str, min_length: int = None,
                    max_length: int = None, pattern: str = None) -> str:
    """Validate string value with optional constraints"""
    if value is None:
        return None

    if not isinstance(value, str):
        raise ValidationError(
            f"'{field_name}' must be a string",
            field=field_name, value=value
        )

    value = value.strip()

    if min_length is not None and len(value) < min_length:
        raise ValidationError(
            f"'{field_name}' must be at least {min_length} characters",
            field=field_name, value=value
        )

    if max_length is not None and len(value) > max_length:
        raise ValidationError(
            f"'{field_name}' must be at most {max_length} characters",
            field=field_name, value=value
        )

    if pattern and not re.match(pattern, value):
        raise ValidationError(
            f"'{field_name}' has invalid format",
            field=field_name, value=value
        )

    return value


def validate_email(value: Any, field_name: str = "email") -> str:
    """Validate email format"""
    if value is None:
        return None

    value = validate_string(value, field_name, max_length=255)

    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, value):
        raise ValidationError(
            f"'{field_name}' must be a valid email address",
            field=field_name, value=value
        )

    return value.lower()


def validate_phone(value: Any, field_name: str = "phone") -> str:
    """Validate phone number (Indian format or international)"""
    if value is None:
        return None

    value = validate_string(value, field_name)

    # Remove common separators
    cleaned = re.sub(r'[\s\-\(\)\.]', '', value)

    # Allow Indian format (10 digits) or international (+XX...)
    if not re.match(r'^(\+\d{10,15}|\d{10})$', cleaned):
        raise ValidationError(
            f"'{field_name}' must be a valid phone number",
            field=field_name, value=value
        )

    return cleaned


def validate_integer(value: Any, field_name: str, min_value: int = None,
                     max_value: int = None) -> int:
    """Validate integer value with optional range"""
    if value is None:
        return None

    try:
        int_value = int(value)
    except (ValueError, TypeError):
        raise ValidationError(
            f"'{field_name}' must be a valid integer",
            field=field_name, value=value
        )

    if min_value is not None and int_value < min_value:
        raise ValidationError(
            f"'{field_name}' must be at least {min_value}",
            field=field_name, value=value
        )

    if max_value is not None and int_value > max_value:
        raise ValidationError(
            f"'{field_name}' must be at most {max_value}",
            field=field_name, value=value
        )

    return int_value


def validate_decimal(value: Any, field_name: str, min_value: float = None,
                     max_value: float = None, precision: int = 2) -> Decimal:
    """Validate decimal value for monetary amounts"""
    if value is None:
        return None

    try:
        if isinstance(value, str):
            dec_value = Decimal(value.strip())
        else:
            dec_value = Decimal(str(value))

        # Round to specified precision
        dec_value = round(dec_value, precision)

    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError(
            f"'{field_name}' must be a valid decimal number",
            field=field_name, value=value
        )

    if min_value is not None and dec_value < Decimal(str(min_value)):
        raise ValidationError(
            f"'{field_name}' must be at least {min_value}",
            field=field_name, value=value
        )

    if max_value is not None and dec_value > Decimal(str(max_value)):
        raise ValidationError(
            f"'{field_name}' must be at most {max_value}",
            field=field_name, value=value
        )

    return dec_value


def validate_positive_amount(value: Any, field_name: str) -> Decimal:
    """Validate positive monetary amount"""
    return validate_decimal(value, field_name, min_value=0)


def validate_date(value: Any, field_name: str, format: str = "%Y-%m-%d") -> date:
    """Validate date value"""
    if value is None:
        return None

    if isinstance(value, date):
        return value

    if isinstance(value, datetime):
        return value.date()

    try:
        # Try ISO format first
        if isinstance(value, str):
            # Handle ISO format with time
            if 'T' in value:
                return datetime.fromisoformat(value.replace('Z', '+00:00')).date()
            return datetime.strptime(value, format).date()
    except ValueError:
        pass

    raise ValidationError(
        f"'{field_name}' must be a valid date (format: {format})",
        field=field_name, value=value
    )


def validate_date_range(start_date: Any, end_date: Any,
                        start_field: str = "start_date",
                        end_field: str = "end_date") -> tuple:
    """Validate that start_date is before end_date"""
    start = validate_date(start_date, start_field)
    end = validate_date(end_date, end_field)

    if start and end and start > end:
        raise ValidationError(
            f"'{start_field}' must be before or equal to '{end_field}'",
            field=start_field
        )

    return start, end


def validate_enum(value: Any, field_name: str, allowed_values: List[str]) -> str:
    """Validate that value is in allowed list"""
    if value is None:
        return None

    if value not in allowed_values:
        raise ValidationError(
            f"'{field_name}' must be one of: {', '.join(allowed_values)}",
            field=field_name, value=value
        )

    return value


def validate_uuid(value: Any, field_name: str) -> str:
    """Validate UUID format"""
    if value is None:
        return None

    value = validate_string(value, field_name)

    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if not re.match(uuid_pattern, value.lower()):
        raise ValidationError(
            f"'{field_name}' must be a valid UUID",
            field=field_name, value=value
        )

    return value.lower()


def validate_gstin(value: Any, field_name: str = "gstin") -> str:
    """Validate Indian GSTIN format"""
    if value is None:
        return None

    value = validate_string(value, field_name)
    value = value.upper()

    # GSTIN pattern: 2 state code + 10 PAN + 1 entity + 1 check
    gstin_pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
    if not re.match(gstin_pattern, value):
        raise ValidationError(
            f"'{field_name}' must be a valid 15-character GSTIN",
            field=field_name, value=value
        )

    return value


# ============================================================================
# BILLING ITEM VALIDATION
# ============================================================================

def validate_billing_item(item: Dict, index: int) -> Dict:
    """
    Validate a single billing item.

    Required fields:
        - product_name: string
        - quantity: positive integer
        - rate: positive decimal

    Optional fields:
        - product_id: uuid
        - category: string
        - unit: string
        - gst_percentage: decimal (0-100)
    """
    if not isinstance(item, dict):
        raise ValidationError(f"Item {index + 1}: must be an object")

    validated = {}

    # Required fields
    validated['product_name'] = validate_required(
        validate_string(item.get('product_name'), f'item[{index}].product_name', max_length=255),
        f'item[{index}].product_name'
    )

    validated['quantity'] = validate_required(
        validate_integer(item.get('quantity'), f'item[{index}].quantity', min_value=1),
        f'item[{index}].quantity'
    )

    validated['rate'] = validate_required(
        validate_positive_amount(item.get('rate'), f'item[{index}].rate'),
        f'item[{index}].rate'
    )

    # Optional fields
    if item.get('product_id'):
        # Allow temp-xxx and nosave-xxx IDs for new products
        product_id = item.get('product_id')
        if not (product_id.startswith('temp-') or product_id.startswith('nosave-')):
            validated['product_id'] = validate_uuid(product_id, f'item[{index}].product_id')
        else:
            validated['product_id'] = product_id

    if item.get('category'):
        validated['category'] = validate_string(
            item.get('category'), f'item[{index}].category', max_length=100
        )

    if item.get('unit'):
        validated['unit'] = validate_string(
            item.get('unit'), f'item[{index}].unit', max_length=20
        )

    if item.get('gst_percentage') is not None:
        validated['gst_percentage'] = validate_decimal(
            item.get('gst_percentage'), f'item[{index}].gst_percentage',
            min_value=0, max_value=100
        )

    return validated


def validate_billing_items(items: List) -> List[Dict]:
    """Validate a list of billing items"""
    if not items or not isinstance(items, list):
        raise ValidationError("'items' must be a non-empty list", field="items")

    if len(items) == 0:
        raise ValidationError("At least one item is required", field="items")

    validated_items = []
    for i, item in enumerate(items):
        validated_items.append(validate_billing_item(item, i))

    return validated_items


# ============================================================================
# REQUEST VALIDATION DECORATOR
# ============================================================================

def validate_request(schema: Dict[str, Dict]):
    """
    Decorator to validate request JSON body against a schema.

    Schema format:
        {
            "field_name": {
                "type": "string|integer|decimal|email|phone|date|uuid",
                "required": True|False,
                "min_length": int,
                "max_length": int,
                "min_value": number,
                "max_value": number,
                "pattern": regex string,
                "enum": [list of allowed values],
            }
        }

    Usage:
        @app.route('/api/users', methods=['POST'])
        @validate_request({
            "email": {"type": "email", "required": True},
            "name": {"type": "string", "required": True, "min_length": 2},
            "age": {"type": "integer", "min_value": 0},
        })
        def create_user():
            data = g.validated_data  # Access validated data
            # Your code here
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                data = request.get_json() or {}
                validated = {}

                for field_name, rules in schema.items():
                    value = data.get(field_name)
                    field_type = rules.get('type', 'string')
                    required = rules.get('required', False)

                    # Check required
                    if required and (value is None or value == ''):
                        raise ValidationError(
                            f"'{field_name}' is required",
                            field=field_name
                        )

                    # Skip validation if not required and not provided
                    if value is None or value == '':
                        validated[field_name] = None
                        continue

                    # Type-specific validation
                    if field_type == 'string':
                        validated[field_name] = validate_string(
                            value, field_name,
                            min_length=rules.get('min_length'),
                            max_length=rules.get('max_length'),
                            pattern=rules.get('pattern')
                        )
                    elif field_type == 'integer':
                        validated[field_name] = validate_integer(
                            value, field_name,
                            min_value=rules.get('min_value'),
                            max_value=rules.get('max_value')
                        )
                    elif field_type == 'decimal':
                        validated[field_name] = validate_decimal(
                            value, field_name,
                            min_value=rules.get('min_value'),
                            max_value=rules.get('max_value')
                        )
                    elif field_type == 'email':
                        validated[field_name] = validate_email(value, field_name)
                    elif field_type == 'phone':
                        validated[field_name] = validate_phone(value, field_name)
                    elif field_type == 'date':
                        validated[field_name] = validate_date(value, field_name)
                    elif field_type == 'uuid':
                        validated[field_name] = validate_uuid(value, field_name)
                    elif field_type == 'gstin':
                        validated[field_name] = validate_gstin(value, field_name)
                    else:
                        validated[field_name] = value

                    # Enum validation
                    if rules.get('enum') and validated[field_name]:
                        validated[field_name] = validate_enum(
                            validated[field_name], field_name, rules['enum']
                        )

                # Store validated data in g for route access
                g.validated_data = validated

                return func(*args, **kwargs)

            except ValidationError as e:
                return validation_error(e.message, field=e.field, value=e.value)

        return wrapper
    return decorator


# ============================================================================
# PAGINATION HELPERS
# ============================================================================

def get_pagination_params(default_per_page: int = 50, max_per_page: int = 200) -> tuple:
    """
    Extract and validate pagination parameters from request args.

    Returns:
        tuple: (page, per_page, offset)
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', default_per_page, type=int)

    # Validate ranges
    page = max(1, page)
    per_page = min(max(1, per_page), max_per_page)

    offset = (page - 1) * per_page

    return page, per_page, offset


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    'ValidationError',
    'validate_required',
    'validate_string',
    'validate_email',
    'validate_phone',
    'validate_integer',
    'validate_decimal',
    'validate_positive_amount',
    'validate_date',
    'validate_date_range',
    'validate_enum',
    'validate_uuid',
    'validate_gstin',
    'validate_billing_item',
    'validate_billing_items',
    'validate_request',
    'get_pagination_params',
]

"""
RYX Billing - Standardized Response Helpers
Provides consistent API response formatting across all routes
"""
from flask import jsonify
from functools import wraps
import traceback
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# RESPONSE FORMATTERS
# ============================================================================

def success_response(data=None, message="Success", status_code=200, meta=None):
    """
    Create a standardized success response.

    Args:
        data: The response payload (dict, list, or None)
        message: Human-readable success message
        status_code: HTTP status code (default 200)
        meta: Optional metadata (pagination info, etc.)

    Returns:
        tuple: (response_json, status_code)

    Example:
        return success_response(
            data={"user": user.to_dict()},
            message="User created successfully",
            status_code=201
        )
    """
    response = {
        "success": True,
        "message": message,
        "data": data
    }

    if meta:
        response["meta"] = meta

    return jsonify(response), status_code


def error_response(error_code, message, details=None, status_code=400):
    """
    Create a standardized error response.

    Args:
        error_code: Machine-readable error code (e.g., "VALIDATION_ERROR")
        message: Human-readable error message
        details: Optional additional error details (dict)
        status_code: HTTP status code (default 400)

    Returns:
        tuple: (response_json, status_code)

    Example:
        return error_response(
            error_code="VALIDATION_ERROR",
            message="Invalid email format",
            details={"field": "email", "value": user_input},
            status_code=400
        )
    """
    response = {
        "success": False,
        "error": error_code,
        "message": message
    }

    if details:
        response["details"] = details

    return jsonify(response), status_code


def paginated_response(items, page, per_page, total, message="Success"):
    """
    Create a standardized paginated response.

    Args:
        items: List of items for current page
        page: Current page number (1-indexed)
        per_page: Items per page
        total: Total number of items across all pages
        message: Success message

    Returns:
        tuple: (response_json, status_code)
    """
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0

    return success_response(
        data=items,
        message=message,
        meta={
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
    )


# ============================================================================
# ERROR CODES
# ============================================================================

class ErrorCodes:
    """Standard error codes for consistent error handling"""

    # Validation errors (400)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    MISSING_FIELD = "MISSING_FIELD"
    INVALID_FORMAT = "INVALID_FORMAT"
    INVALID_VALUE = "INVALID_VALUE"

    # Authentication errors (401)
    UNAUTHORIZED = "UNAUTHORIZED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_INVALID = "TOKEN_INVALID"

    # Authorization errors (403)
    FORBIDDEN = "FORBIDDEN"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    ACCOUNT_INACTIVE = "ACCOUNT_INACTIVE"

    # Not found errors (404)
    NOT_FOUND = "NOT_FOUND"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"

    # Conflict errors (409)
    CONFLICT = "CONFLICT"
    DUPLICATE_ENTRY = "DUPLICATE_ENTRY"
    ALREADY_EXISTS = "ALREADY_EXISTS"

    # Business logic errors (422)
    INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK"
    INVALID_OPERATION = "INVALID_OPERATION"
    BUSINESS_RULE_VIOLATION = "BUSINESS_RULE_VIOLATION"

    # Server errors (500)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def validation_error(message, field=None, value=None):
    """Shorthand for validation errors"""
    details = {}
    if field:
        details["field"] = field
    if value is not None:
        details["value"] = str(value)[:100]  # Truncate for safety

    return error_response(
        error_code=ErrorCodes.VALIDATION_ERROR,
        message=message,
        details=details if details else None,
        status_code=400
    )


def not_found_error(resource_type, identifier=None):
    """Shorthand for not found errors"""
    message = f"{resource_type} not found"
    if identifier:
        message = f"{resource_type} with ID '{identifier}' not found"

    return error_response(
        error_code=ErrorCodes.NOT_FOUND,
        message=message,
        status_code=404
    )


def unauthorized_error(message="Authentication required"):
    """Shorthand for authentication errors"""
    return error_response(
        error_code=ErrorCodes.UNAUTHORIZED,
        message=message,
        status_code=401
    )


def forbidden_error(message="You don't have permission to perform this action"):
    """Shorthand for authorization errors"""
    return error_response(
        error_code=ErrorCodes.FORBIDDEN,
        message=message,
        status_code=403
    )


def conflict_error(message, details=None):
    """Shorthand for conflict errors (duplicate entries, etc.)"""
    return error_response(
        error_code=ErrorCodes.CONFLICT,
        message=message,
        details=details,
        status_code=409
    )


def internal_error(message="An unexpected error occurred", log_exception=True):
    """
    Shorthand for internal server errors.
    Optionally logs the full exception traceback.
    """
    if log_exception:
        logger.error(f"Internal error: {message}\n{traceback.format_exc()}")

    return error_response(
        error_code=ErrorCodes.INTERNAL_ERROR,
        message=message,
        status_code=500
    )


# ============================================================================
# DECORATOR FOR STANDARDIZED ERROR HANDLING
# ============================================================================

def handle_exceptions(func):
    """
    Decorator that catches exceptions and returns standardized error responses.

    Usage:
        @app.route('/api/users')
        @handle_exceptions
        def get_users():
            # Your code here
            pass
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValueError as e:
            return validation_error(str(e))
        except PermissionError as e:
            return forbidden_error(str(e))
        except FileNotFoundError as e:
            return not_found_error("Resource", str(e))
        except Exception as e:
            logger.exception(f"Unhandled exception in {func.__name__}")
            return internal_error(
                message="An unexpected error occurred. Please try again later."
            )

    return wrapper


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    'success_response',
    'error_response',
    'paginated_response',
    'ErrorCodes',
    'validation_error',
    'not_found_error',
    'unauthorized_error',
    'forbidden_error',
    'conflict_error',
    'internal_error',
    'handle_exceptions',
]

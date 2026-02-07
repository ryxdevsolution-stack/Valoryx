"""
Type Converters - PostgreSQL ↔ SQLite Type Mapping
Phase 1: Handles type differences between databases

Converts data types between PostgreSQL and SQLite to ensure compatibility.
"""

import json
import uuid
from datetime import datetime, date
from decimal import Decimal


class TypeConverter:
    """
    Handles type conversions between PostgreSQL and SQLite.

    PostgreSQL → SQLite:
    - UUID → TEXT
    - JSONB → TEXT (JSON string)
    - NUMERIC(12,2) → REAL
    - TIMESTAMP → TEXT (ISO format)

    SQLite → PostgreSQL:
    - TEXT → UUID (parse)
    - TEXT → JSONB (parse JSON)
    - REAL → NUMERIC
    - TEXT → TIMESTAMP (parse ISO)
    """

    @staticmethod
    def to_sqlite(value, column_type):
        """
        Convert PostgreSQL value to SQLite-compatible format.

        Args:
            value: The value to convert
            column_type (str): PostgreSQL column type ('UUID', 'JSONB', etc.)

        Returns:
            Converted value suitable for SQLite
        """
        if value is None:
            return None

        column_type = column_type.upper()

        if column_type == 'UUID':
            # UUID → TEXT
            return str(value) if not isinstance(value, str) else value

        elif column_type in ['JSONB', 'JSON']:
            # JSONB → TEXT (JSON string)
            if isinstance(value, str):
                return value
            return json.dumps(value)

        elif column_type.startswith('NUMERIC') or column_type.startswith('DECIMAL'):
            # NUMERIC → REAL
            if isinstance(value, Decimal):
                return float(value)
            return value

        elif column_type in ['TIMESTAMP', 'TIMESTAMPTZ']:
            # TIMESTAMP → TEXT (ISO format)
            if isinstance(value, datetime):
                return value.isoformat()
            return value

        elif column_type == 'DATE':
            # DATE → TEXT
            if isinstance(value, date):
                return value.isoformat()
            return value

        elif column_type == 'BOOLEAN':
            # BOOLEAN → INTEGER (0 or 1)
            return 1 if value else 0

        else:
            # No conversion needed
            return value

    @staticmethod
    def from_sqlite(value, column_type):
        """
        Convert SQLite value to PostgreSQL-compatible format.

        Args:
            value: The value to convert
            column_type (str): Target PostgreSQL column type

        Returns:
            Converted value suitable for PostgreSQL
        """
        if value is None:
            return None

        column_type = column_type.upper()

        if column_type == 'UUID':
            # TEXT → UUID
            if isinstance(value, str):
                return uuid.UUID(value)
            return value

        elif column_type in ['JSONB', 'JSON']:
            # TEXT → JSONB (keep as string for PostgreSQL)
            # PostgreSQL will handle the JSON parsing
            if isinstance(value, str):
                return value
            # If it's already a dict/list, convert to JSON string
            return json.dumps(value)

        elif column_type.startswith('NUMERIC') or column_type.startswith('DECIMAL'):
            # REAL → NUMERIC
            if isinstance(value, float):
                return Decimal(str(value))
            return value

        elif column_type in ['TIMESTAMP', 'TIMESTAMPTZ']:
            # TEXT → TIMESTAMP
            if isinstance(value, str):
                return datetime.fromisoformat(value)
            return value

        elif column_type == 'DATE':
            # TEXT → DATE
            if isinstance(value, str):
                return datetime.fromisoformat(value).date()
            return value

        elif column_type == 'BOOLEAN':
            # INTEGER → BOOLEAN
            return bool(value)

        else:
            # No conversion needed
            return value

    @staticmethod
    def convert_dict_to_sqlite(data_dict, column_types):
        """
        Convert entire dictionary from PostgreSQL to SQLite format.

        Args:
            data_dict (dict): Data to convert
            column_types (dict): Mapping of column names to types

        Returns:
            dict: Converted data
        """
        converted = {}
        for key, value in data_dict.items():
            if key in column_types:
                converted[key] = TypeConverter.to_sqlite(value, column_types[key])
            else:
                converted[key] = value
        return converted

    @staticmethod
    def convert_dict_from_sqlite(data_dict, column_types):
        """
        Convert entire dictionary from SQLite to PostgreSQL format.

        Args:
            data_dict (dict): Data to convert
            column_types (dict): Mapping of column names to types

        Returns:
            dict: Converted data
        """
        converted = {}
        for key, value in data_dict.items():
            if key in column_types:
                converted[key] = TypeConverter.from_sqlite(value, column_types[key])
            else:
                converted[key] = value
        return converted


# Column type mappings for common tables
BILLING_COLUMN_TYPES = {
    'bill_id': 'UUID',
    'client_id': 'UUID',
    'created_by': 'UUID',
    'product_id': 'UUID',
    'customer_id': 'UUID',
    'items': 'JSONB',
    'subtotal': 'NUMERIC',
    'gst_percentage': 'NUMERIC',
    'gst_amount': 'NUMERIC',
    'final_amount': 'NUMERIC',
    'total_amount': 'NUMERIC',
    'amount_received': 'NUMERIC',
    'discount_percentage': 'NUMERIC',
    'discount_amount': 'NUMERIC',
    'negotiable_amount': 'NUMERIC',
    'balance_due': 'NUMERIC',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP',
    'local_created_at': 'TIMESTAMP'
}

STOCK_COLUMN_TYPES = {
    'product_id': 'UUID',
    'client_id': 'UUID',
    'rate': 'NUMERIC',
    'cost_price': 'NUMERIC',
    'mrp': 'NUMERIC',
    'pricing': 'NUMERIC',
    'gst_percentage': 'NUMERIC',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

CUSTOMER_COLUMN_TYPES = {
    'customer_id': 'UUID',
    'client_id': 'UUID',
    'total_spent': 'NUMERIC',
    'last_purchase_date': 'TIMESTAMP',
    'first_purchase_date': 'TIMESTAMP',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Payment Type column types
PAYMENT_TYPE_COLUMN_TYPES = {
    'payment_type_id': 'UUID',
    'client_id': 'UUID',
    'is_active': 'BOOLEAN',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Expense column types
EXPENSE_COLUMN_TYPES = {
    'expense_id': 'UUID',
    'client_id': 'UUID',
    'created_by': 'UUID',
    'amount': 'NUMERIC',
    'expense_date': 'DATE',
    'extra_data': 'JSONB',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Expense Summary column types
EXPENSE_SUMMARY_COLUMN_TYPES = {
    'summary_id': 'UUID',
    'client_id': 'UUID',
    'period_start': 'DATE',
    'period_end': 'DATE',
    'total_expenses': 'NUMERIC',
    'category_breakdown': 'JSONB',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Bulk Stock Order column types
BULK_ORDER_COLUMN_TYPES = {
    'order_id': 'UUID',
    'client_id': 'UUID',
    'created_by': 'UUID',
    'order_date': 'TIMESTAMP',
    'expected_delivery_date': 'TIMESTAMP',
    'received_at': 'TIMESTAMP',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Bulk Stock Order Item column types
BULK_ORDER_ITEM_COLUMN_TYPES = {
    'item_id': 'UUID',
    'order_id': 'UUID',
    'product_id': 'UUID',
    'cost_price': 'NUMERIC',
    'selling_price': 'NUMERIC',
    'mrp': 'NUMERIC',
    'gst_percentage': 'NUMERIC',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# User column types
USER_COLUMN_TYPES = {
    'user_id': 'UUID',
    'client_id': 'UUID',
    'created_by': 'UUID',
    'updated_by': 'UUID',
    'is_super_admin': 'BOOLEAN',
    'is_active': 'BOOLEAN',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'last_login': 'TIMESTAMP',
    'deleted_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# User Permissions column types
USER_PERMISSION_COLUMN_TYPES = {
    'id': 'UUID',
    'user_id': 'UUID',
    'permission_id': 'UUID',
    'granted_by': 'UUID',
    'granted_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Report column types
REPORT_COLUMN_TYPES = {
    'report_id': 'UUID',
    'client_id': 'UUID',
    'generated_by': 'UUID',
    'date_from': 'DATE',
    'date_to': 'DATE',
    'total_gst_amount': 'NUMERIC',
    'total_non_gst_amount': 'NUMERIC',
    'total_revenue': 'NUMERIC',
    'payment_breakdown': 'JSONB',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Notes column types
NOTES_COLUMN_TYPES = {
    'note_id': 'UUID',
    'user_id': 'UUID',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP',
    'expires_at': 'TIMESTAMP',
    'synced_at': 'TIMESTAMP'
}

# Sync Metadata column types
SYNC_METADATA_COLUMN_TYPES = {
    'id': 'UUID',
    'client_id': 'UUID',
    'last_upload_time': 'TIMESTAMP',
    'last_download_time': 'TIMESTAMP',
    'last_full_sync_time': 'TIMESTAMP',
    'last_error_time': 'TIMESTAMP',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP'
}

# Sync Log column types
SYNC_LOG_COLUMN_TYPES = {
    'log_id': 'UUID',
    'client_id': 'UUID',
    'started_at': 'TIMESTAMP',
    'completed_at': 'TIMESTAMP'
}

# Combined mapping for all tables
ALL_COLUMN_TYPES = {
    'gst_billing': BILLING_COLUMN_TYPES,
    'non_gst_billing': BILLING_COLUMN_TYPES,
    'stock_entry': STOCK_COLUMN_TYPES,
    'customer': CUSTOMER_COLUMN_TYPES,
    'payment_type': PAYMENT_TYPE_COLUMN_TYPES,
    'expense': EXPENSE_COLUMN_TYPES,
    'expense_summary': EXPENSE_SUMMARY_COLUMN_TYPES,
    'bulk_stock_order': BULK_ORDER_COLUMN_TYPES,
    'bulk_stock_order_item': BULK_ORDER_ITEM_COLUMN_TYPES,
    'users': USER_COLUMN_TYPES,
    'user_permissions': USER_PERMISSION_COLUMN_TYPES,
    'report': REPORT_COLUMN_TYPES,
    'notes': NOTES_COLUMN_TYPES,
    'sync_metadata': SYNC_METADATA_COLUMN_TYPES,
    'sync_log': SYNC_LOG_COLUMN_TYPES
}

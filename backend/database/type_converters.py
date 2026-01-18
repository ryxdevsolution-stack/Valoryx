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
            # TEXT → JSONB (parse JSON)
            if isinstance(value, str):
                return json.loads(value)
            return value

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
    'gst_amount': 'NUMERIC',
    'final_amount': 'NUMERIC',
    'total_amount': 'NUMERIC',
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
    'gst_percentage': 'NUMERIC',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP'
}

CUSTOMER_COLUMN_TYPES = {
    'customer_id': 'UUID',
    'client_id': 'UUID',
    'total_spent': 'NUMERIC',
    'created_at': 'TIMESTAMP',
    'updated_at': 'TIMESTAMP'
}

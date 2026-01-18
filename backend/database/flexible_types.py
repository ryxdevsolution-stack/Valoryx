"""
Flexible column types that work with both PostgreSQL and SQLite
Automatically uses the correct type based on the database backend
"""
from sqlalchemy import TypeDecorator, String, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
import json


class FlexibleUUID(TypeDecorator):
    """
    UUID type that works with both PostgreSQL and SQLite.

    PostgreSQL: Uses native UUID type
    SQLite: Uses TEXT and converts to/from string
    """
    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == 'postgresql':
            return value
        else:
            # Convert UUID to string for SQLite
            if isinstance(value, uuid.UUID):
                return str(value)
            return value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if dialect.name == 'postgresql':
            return value
        else:
            # Convert string back to UUID for SQLite
            if isinstance(value, str):
                return uuid.UUID(value)
            return value


class FlexibleJSON(TypeDecorator):
    """
    JSON type that works with both PostgreSQL and SQLite.

    PostgreSQL: Uses native JSONB type
    SQLite: Uses TEXT and converts to/from JSON string
    """
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(JSONB)
        else:
            return dialect.type_descriptor(Text)

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == 'postgresql':
            return value
        else:
            # Convert dict/list to JSON string for SQLite
            if isinstance(value, (dict, list)):
                return json.dumps(value)
            return value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if dialect.name == 'postgresql':
            return value
        else:
            # Convert JSON string back to dict/list for SQLite
            if isinstance(value, str):
                try:
                    return json.loads(value)
                except:
                    return value
            return value


class FlexibleNumeric(TypeDecorator):
    """
    Numeric type that works with both PostgreSQL and SQLite.

    PostgreSQL: Uses NUMERIC with precision
    SQLite: Uses REAL (float)

    Note: SQLite doesn't have exact decimal precision, so there might be
    small rounding differences. For financial calculations, consider using
    integers (cents instead of dollars).
    """
    impl = Numeric(10, 2)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(Numeric(10, 2))
        else:
            # SQLite uses REAL (float)
            return dialect.type_descriptor(Numeric(10, 2))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return float(value) if value is not None else None

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return float(value) if value is not None else None

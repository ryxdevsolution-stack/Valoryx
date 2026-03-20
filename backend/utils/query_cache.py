"""Request-scoped query cache using Flask's g object.

Avoids re-fetching the same data multiple times within a single HTTP request.
The cache is automatically cleared when the request ends (g is request-local).
"""
from flask import g
from models.payment_model import PaymentType


def get_payment_types(client_id):
    """Get payment types for a client, cached per-request in Flask g."""
    cache_key = f'_payment_types_{client_id}'
    cached = getattr(g, cache_key, None)
    if cached is not None:
        return cached

    types = PaymentType.query.filter_by(client_id=client_id).all()
    setattr(g, cache_key, types)
    return types


def get_payment_type_map(client_id):
    """Get {payment_type_id: payment_name} dict, cached per-request."""
    cache_key = f'_payment_type_map_{client_id}'
    cached = getattr(g, cache_key, None)
    if cached is not None:
        return cached

    types = get_payment_types(client_id)
    type_map = {str(pt.payment_type_id): pt.payment_name for pt in types}
    setattr(g, cache_key, type_map)
    return type_map

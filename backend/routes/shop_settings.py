import logging
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.client_model import ClientEntry
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager

logger = logging.getLogger(__name__)

shop_settings_bp = Blueprint('shop_settings', __name__)

_SHOP_SETTINGS_TTL = 300  # 5 min — shop settings rarely change

# Fields that can be read/written via shop-settings endpoints.
# Maps API field name → ClientEntry column attribute name.
_SETTINGS_FIELDS = {
    'shop_name': 'client_name',
    'address1': 'address',
    'address2': 'address2',
    'phone': 'phone',
    'upi_id': 'upi_id',
    'gst_number': 'gst_number',
    'receipt_footer': 'receipt_footer',
    'logo_url': 'logo_url',
    'points_per_100': 'points_per_100',
    # Apparel label defaults (v13)
    'label_importer_name': 'label_importer_name',
    'label_importer_address': 'label_importer_address',
    'label_origin_country': 'label_origin_country',
    'label_care_phone': 'label_care_phone',
    'label_care_email': 'label_care_email',
}

# Fields that are read-only (returned in GET but cannot be set via PUT)
_READ_ONLY_FIELDS = {'logo_url'}


@shop_settings_bp.route('', methods=['GET'])
@authenticate
@require_permission('view_shop_settings')
def get_shop_settings():
    """
    GET /api/shop-settings
    Returns receipt / shop display settings for the logged-in client.
    Any authenticated user can read.
    """
    try:
        client_id = g.user['client_id']
        cache     = get_cache_manager()
        cache_key = f"shop:settings:{client_id}"

        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        client = ClientEntry.query.filter_by(client_id=client_id).first()
        if not client:
            return jsonify({'success': False, 'error': 'Client not found'}), 404

        data = {}
        for api_field, col_attr in _SETTINGS_FIELDS.items():
            data[api_field] = getattr(client, col_attr, None) or ''

        response = {'success': True, 'data': data}
        cache.set(cache_key, response, _SHOP_SETTINGS_TTL)
        return jsonify(response), 200

    except Exception as e:
        logger.exception('Failed to fetch shop settings')
        return jsonify({'success': False, 'error': 'Failed to fetch shop settings'}), 500


@shop_settings_bp.route('', methods=['PUT'])
@authenticate
@require_permission('edit_shop_settings')
def update_shop_settings():
    """
    PUT /api/shop-settings
    Update receipt / shop display settings.
    """
    try:
        client_id = g.user['client_id']

        client = ClientEntry.query.filter_by(client_id=client_id).first()
        if not client:
            return jsonify({'success': False, 'error': 'Client not found'}), 404

        body = request.get_json()
        if not body:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        # Store old data for audit
        old_data = {}
        for api_field, col_attr in _SETTINGS_FIELDS.items():
            old_data[api_field] = getattr(client, col_attr, None) or ''

        # Apply updates (skip read-only and unknown fields)
        updated_fields = []
        for api_field, col_attr in _SETTINGS_FIELDS.items():
            if api_field in _READ_ONLY_FIELDS:
                continue
            if api_field in body:
                value = body[api_field]
                # Sanitise: strip strings, convert empty to None for nullable cols
                if isinstance(value, str):
                    value = value.strip()
                setattr(client, col_attr, value or None)
                updated_fields.append(api_field)

        if not updated_fields:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400

        db.session.commit()
        get_cache_manager().delete(f"shop:settings:{client_id}")

        # Build new data for audit
        new_data = {}
        for api_field, col_attr in _SETTINGS_FIELDS.items():
            new_data[api_field] = getattr(client, col_attr, None) or ''

        log_action('UPDATE', 'shop_settings', client_id, old_data, new_data)

        return jsonify({
            'success': True,
            'message': 'Settings updated',
            'data': new_data,
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.exception('Failed to update shop settings')
        return jsonify({'success': False, 'error': 'Failed to update shop settings'}), 500

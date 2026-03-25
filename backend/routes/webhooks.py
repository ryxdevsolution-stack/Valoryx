"""
Webhook endpoint management routes.

All routes are scoped to the authenticated user's client_id.
Only owner / admin roles may manage webhooks.

POST   /api/webhooks            — register a new endpoint (returns secret once)
GET    /api/webhooks            — list endpoints
GET    /api/webhooks/<id>       — get endpoint detail
PATCH  /api/webhooks/<id>       — update url / events / description / is_active
DELETE /api/webhooks/<id>       — delete endpoint
GET    /api/webhooks/<id>/deliveries — paginated delivery history
POST   /api/webhooks/<id>/test  — send a test ping
"""
import secrets as _secrets
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.webhook_model import WebhookEndpoint, WebhookDelivery
from utils.auth_middleware import authenticate

webhooks_bp = Blueprint('webhooks', __name__)

_ALLOWED_ROLES = {'owner', 'admin'}
_MAX_ENDPOINTS = 10


def _require_manager():
    """Return a 403 response tuple if the user lacks manager-level role."""
    role = g.user.get('role', '')
    if role not in _ALLOWED_ROLES:
        return jsonify({'error': 'Insufficient permissions — owner or admin required'}), 403
    return None


@webhooks_bp.route('', methods=['POST'])
@authenticate
def create_endpoint():
    deny = _require_manager()
    if deny:
        return deny

    client_id = g.user['client_id']
    count = WebhookEndpoint.query.filter_by(client_id=client_id).count()
    if count >= _MAX_ENDPOINTS:
        return jsonify({'error': f'Maximum {_MAX_ENDPOINTS} webhook endpoints allowed per account'}), 400

    data = request.get_json() or {}
    url = (data.get('url') or '').strip()
    if not url.startswith(('http://', 'https://')):
        return jsonify({'error': 'A valid https:// URL is required'}), 400

    events = (data.get('events') or '*').strip() or '*'
    secret = _secrets.token_hex(32)

    ep = WebhookEndpoint(
        client_id=client_id,
        url=url,
        secret=secret,
        description=(data.get('description') or '').strip() or None,
        events=events,
        is_active=True,
    )
    db.session.add(ep)
    db.session.commit()

    from utils.cache_helper import get_cache_manager
    get_cache_manager().delete(f"webhooks:list:{client_id}")

    result = ep.to_dict(include_secret=True)
    result['_note'] = 'Save the secret now — it will not be shown again.'
    return jsonify({'success': True, 'endpoint': result}), 201


@webhooks_bp.route('', methods=['GET'])
@authenticate
def list_endpoints():
    client_id = g.user['client_id']
    from utils.cache_helper import get_cache_manager
    cache = get_cache_manager()
    cache_key = f"webhooks:list:{client_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached), 200
    endpoints = WebhookEndpoint.query.filter_by(client_id=client_id).order_by(
        WebhookEndpoint.created_at.desc()
    ).all()
    result = {'success': True, 'endpoints': [e.to_dict() for e in endpoints]}
    cache.set(cache_key, result, 60)
    return jsonify(result), 200


@webhooks_bp.route('/<endpoint_id>', methods=['GET'])
@authenticate
def get_endpoint(endpoint_id):
    ep = WebhookEndpoint.query.filter_by(
        endpoint_id=endpoint_id, client_id=g.user['client_id']
    ).first_or_404()
    return jsonify({'success': True, 'endpoint': ep.to_dict()}), 200


@webhooks_bp.route('/<endpoint_id>', methods=['PATCH'])
@authenticate
def update_endpoint(endpoint_id):
    deny = _require_manager()
    if deny:
        return deny

    ep = WebhookEndpoint.query.filter_by(
        endpoint_id=endpoint_id, client_id=g.user['client_id']
    ).first_or_404()

    data = request.get_json() or {}
    if 'url' in data:
        url = (data['url'] or '').strip()
        if not url.startswith(('http://', 'https://')):
            return jsonify({'error': 'A valid https:// URL is required'}), 400
        ep.url = url
    if 'events' in data:
        ep.events = (data['events'] or '*').strip() or '*'
    if 'description' in data:
        ep.description = (data['description'] or '').strip() or None
    if 'is_active' in data:
        ep.is_active = bool(data['is_active'])

    db.session.commit()
    from utils.cache_helper import get_cache_manager
    get_cache_manager().delete(f"webhooks:list:{g.user['client_id']}")
    return jsonify({'success': True, 'endpoint': ep.to_dict()}), 200


@webhooks_bp.route('/<endpoint_id>', methods=['DELETE'])
@authenticate
def delete_endpoint(endpoint_id):
    deny = _require_manager()
    if deny:
        return deny

    ep = WebhookEndpoint.query.filter_by(
        endpoint_id=endpoint_id, client_id=g.user['client_id']
    ).first_or_404()

    db.session.delete(ep)
    db.session.commit()
    from utils.cache_helper import get_cache_manager
    get_cache_manager().delete(f"webhooks:list:{g.user['client_id']}")
    return jsonify({'success': True, 'message': 'Webhook endpoint deleted'}), 200


@webhooks_bp.route('/<endpoint_id>/deliveries', methods=['GET'])
@authenticate
def list_deliveries(endpoint_id):
    ep = WebhookEndpoint.query.filter_by(
        endpoint_id=endpoint_id, client_id=g.user['client_id']
    ).first_or_404()

    page = max(1, request.args.get('page', 1, type=int))
    per_page = min(50, request.args.get('per_page', 20, type=int))
    paginated = (
        WebhookDelivery.query
        .filter_by(endpoint_id=ep.endpoint_id)
        .order_by(WebhookDelivery.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify({
        'success': True,
        'deliveries': [d.to_dict() for d in paginated.items],
        'total': paginated.total,
        'page': page,
        'per_page': per_page,
    }), 200


@webhooks_bp.route('/<endpoint_id>/test', methods=['POST'])
@authenticate
def test_endpoint(endpoint_id):
    """Fire a synthetic ping event to test the endpoint."""
    from flask import current_app
    from services.webhook_service import dispatch_event

    ep = WebhookEndpoint.query.filter_by(
        endpoint_id=endpoint_id, client_id=g.user['client_id']
    ).first_or_404()

    if not ep.is_active:
        return jsonify({'error': 'Endpoint is disabled'}), 400

    dispatch_event(
        current_app._get_current_object(),
        g.user['client_id'],
        'webhook.test',
        {
            'event': 'webhook.test',
            'endpoint_id': endpoint_id,
            'message': 'This is a test ping from Valoryx.',
        },
    )

    return jsonify({'success': True, 'message': 'Test ping dispatched. Check deliveries shortly.'}), 200

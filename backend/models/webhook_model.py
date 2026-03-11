import uuid
from datetime import datetime
from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON


class WebhookEndpoint(db.Model):
    """A registered webhook URL belonging to a client."""
    __tablename__ = 'webhook_endpoints'

    endpoint_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id', ondelete='CASCADE'), nullable=False, index=True)

    url = db.Column(db.String(2048), nullable=False)
    secret = db.Column(db.String(64), nullable=False)  # HMAC-SHA256 signing secret (shown once)
    description = db.Column(db.String(255), nullable=True)

    # Comma-separated event filter, e.g. "user.created,user.updated" or "*" for all
    events = db.Column(db.Text, nullable=False, default='*')

    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    deliveries = db.relationship('WebhookDelivery', backref='endpoint', lazy=True,
                                 cascade='all, delete-orphan')

    def to_dict(self, include_secret=False):
        d = {
            'endpoint_id': self.endpoint_id,
            'client_id': self.client_id,
            'url': self.url,
            'description': self.description,
            'events': self.events,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_secret:
            d['secret'] = self.secret
        return d


class WebhookDelivery(db.Model):
    """Record of a single webhook delivery attempt."""
    __tablename__ = 'webhook_deliveries'

    delivery_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    endpoint_id = db.Column(FlexibleUUID, db.ForeignKey('webhook_endpoints.endpoint_id', ondelete='CASCADE'), nullable=False, index=True)
    client_id = db.Column(FlexibleUUID, nullable=False, index=True)

    event_type = db.Column(db.String(100), nullable=False)
    payload = db.Column(FlexibleJSON, nullable=False)

    attempt = db.Column(db.Integer, default=1, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending | success | failed | retrying
    response_status = db.Column(db.Integer, nullable=True)
    response_body = db.Column(db.Text, nullable=True)
    error = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    delivered_at = db.Column(db.DateTime, nullable=True)
    next_retry_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'delivery_id': self.delivery_id,
            'endpoint_id': self.endpoint_id,
            'event_type': self.event_type,
            'attempt': self.attempt,
            'status': self.status,
            'response_status': self.response_status,
            'error': self.error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'delivered_at': self.delivered_at.isoformat() if self.delivered_at else None,
        }

"""Membership card model — one per customer (1:1).

membership_number is the typed number AND the QR/barcode payload; it is
server-generated (prefixed + zero-padded) and unique per client.
"""
from extensions import db
from database.flexible_types import FlexibleUUID
from datetime import datetime
import pytz


def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)


# Card status values
STATUS_ACTIVE    = 'active'
STATUS_EXPIRED   = 'expired'
STATUS_CANCELLED = 'cancelled'


class MembershipCard(db.Model):
    """A single customer's membership card. 1:1 with customer."""
    __tablename__ = 'membership_card'

    __table_args__ = (
        db.Index('idx_mcard_client', 'client_id'),
        db.Index('idx_mcard_client_number', 'client_id', 'membership_number'),
        db.Index('idx_mcard_client_customer', 'client_id', 'customer_id'),
        db.Index('idx_mcard_client_status', 'client_id', 'status'),
    )

    card_id           = db.Column(FlexibleUUID, primary_key=True)
    client_id         = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    customer_id       = db.Column(FlexibleUUID, db.ForeignKey('customer.customer_id'), nullable=False, unique=True)
    membership_number = db.Column(db.String(50), nullable=False, unique=True, index=True)
    tier_id           = db.Column(FlexibleUUID, db.ForeignKey('membership_tier.tier_id'), nullable=False)

    redeemable_points = db.Column(db.Integer, default=0, nullable=False)  # spendable balance
    lifetime_points   = db.Column(db.Integer, default=0, nullable=False)  # monotonic; drives upgrades

    enrolled_at = db.Column(db.DateTime, default=get_current_time)
    expires_at  = db.Column(db.DateTime, nullable=True)  # NULL = never expires
    status      = db.Column(db.String(20), default=STATUS_ACTIVE, nullable=False)

    created_at = db.Column(db.DateTime, default=get_current_time)
    updated_at = db.Column(db.DateTime, default=get_current_time, onupdate=get_current_time)
    synced_at  = db.Column(db.DateTime, nullable=True)

    def is_expired(self, now=None):
        """True if a paid card has passed its expiry."""
        if not self.expires_at:
            return False
        ref = now or get_current_time()
        exp = self.expires_at
        # Compare in a tz-naive-safe way (SQLite stores naive datetimes).
        if exp.tzinfo and not ref.tzinfo:
            ref = pytz.timezone('Asia/Kolkata').localize(ref)
        elif ref.tzinfo and not exp.tzinfo:
            exp = pytz.timezone('Asia/Kolkata').localize(exp)
        return exp < ref

    def to_dict(self):
        return {
            'card_id':           self.card_id,
            'client_id':         self.client_id,
            'customer_id':       self.customer_id,
            'membership_number': self.membership_number,
            'tier_id':           self.tier_id,
            'redeemable_points': self.redeemable_points or 0,
            'lifetime_points':   self.lifetime_points or 0,
            'enrolled_at':       self.enrolled_at.isoformat() if self.enrolled_at else None,
            'expires_at':        self.expires_at.isoformat() if self.expires_at else None,
            'status':            self.status,
            'created_at':        self.created_at.isoformat() if self.created_at else None,
            'updated_at':        self.updated_at.isoformat() if self.updated_at else None,
        }

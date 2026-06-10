"""Membership ledger model — append-only event log.

Source of truth for all computed figures (monthly/yearly spend, points,
negotiable used). Never updated in place; reversals are new `adjust` rows.
Idempotency on bill finalize is enforced by checking for existing rows with
the same (bill_id, event_type) before writing.
"""
from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleNumeric
from datetime import datetime
import pytz


def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)


# Event types
EVENT_EARN     = 'earn'
EVENT_REDEEM   = 'redeem'
EVENT_NEGOTIATE = 'negotiate'
EVENT_UPGRADE  = 'upgrade'
EVENT_ENROLL   = 'enroll'
EVENT_ADJUST   = 'adjust'

EVENT_TYPES = {
    EVENT_EARN, EVENT_REDEEM, EVENT_NEGOTIATE,
    EVENT_UPGRADE, EVENT_ENROLL, EVENT_ADJUST,
}


class MembershipLedger(db.Model):
    """Append-only ledger line. One row per earn/redeem/negotiate/upgrade/enroll/adjust."""
    __tablename__ = 'membership_ledger'

    __table_args__ = (
        db.Index('idx_mledger_card_created', 'card_id', 'created_at'),
        db.Index('idx_mledger_bill_event', 'bill_id', 'event_type'),
        db.Index('idx_mledger_client', 'client_id'),
    )

    ledger_id  = db.Column(FlexibleUUID, primary_key=True)
    client_id  = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    card_id    = db.Column(FlexibleUUID, db.ForeignKey('membership_card.card_id'), nullable=False)
    bill_id    = db.Column(FlexibleUUID, nullable=True)  # bill that caused the event; idempotency key
    event_type = db.Column(db.String(20), nullable=False)
    points_delta = db.Column(db.Integer, default=0, nullable=False)
    amount_delta = db.Column(FlexibleNumeric, default=0, nullable=False)
    note       = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_current_time)
    synced_at  = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'ledger_id':    self.ledger_id,
            'client_id':    self.client_id,
            'card_id':      self.card_id,
            'bill_id':      self.bill_id,
            'event_type':   self.event_type,
            'points_delta': self.points_delta or 0,
            'amount_delta': round(float(self.amount_delta), 2) if self.amount_delta is not None else 0.0,
            'note':         self.note,
            'created_at':   self.created_at.isoformat() if self.created_at else None,
        }

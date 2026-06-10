"""Membership tier model — owner-defined loyalty card types.

Every benefit column is NULLABLE: NULL = the tier does not offer that benefit.
Mirrors the customer_model.py / supplier_model.py style (FlexibleUUID,
FlexibleNumeric, Asia/Kolkata timestamps, soft toggle, to_dict, synced_at).
"""
from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleNumeric
from datetime import datetime
import pytz


def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)


class MembershipTier(db.Model):
    """Owner-defined membership card tier. Benefit columns nullable = not offered."""
    __tablename__ = 'membership_tier'

    __table_args__ = (
        db.Index('idx_mtier_client', 'client_id'),
        db.Index('idx_mtier_client_active', 'client_id', 'is_active'),
    )

    tier_id   = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    name        = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    color       = db.Column(db.String(20), nullable=True)

    # All benefit columns are nullable — NULL means "not offered" by this tier.
    discount_percentage       = db.Column(FlexibleNumeric, nullable=True)  # auto-discount at billing
    points_per_100            = db.Column(FlexibleNumeric, nullable=True)  # points earned per ₹100 spent
    redemption_rate           = db.Column(FlexibleNumeric, nullable=True)  # ₹ value per point
    monthly_negotiable_budget = db.Column(FlexibleNumeric, nullable=True)  # ₹ negotiation cap / period
    # Budget window: 'monthly' (calendar month, default) or 'yearly' (calendar year)
    negotiable_budget_period  = db.Column(db.String(10), nullable=True, default='monthly')
    upgrade_threshold_points  = db.Column(db.Integer, nullable=True)       # lifetime pts to auto-promote
    upgrade_to_tier_id        = db.Column(FlexibleUUID, db.ForeignKey('membership_tier.tier_id'), nullable=True)
    enrollment_fee            = db.Column(FlexibleNumeric, nullable=True)  # NULL/0 = free
    validity_days             = db.Column(db.Integer, nullable=True)       # NULL = never expires

    is_active  = db.Column(db.Boolean, default=True, nullable=False)
    sort_order = db.Column(db.Integer, default=0)

    created_at = db.Column(db.DateTime, default=get_current_time)
    updated_at = db.Column(db.DateTime, default=get_current_time, onupdate=get_current_time)
    synced_at  = db.Column(db.DateTime, nullable=True)

    @staticmethod
    def _num(value):
        """Serialize a nullable numeric, preserving NULL (not-offered) semantics."""
        if value is None:
            return None
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return None

    def to_dict(self):
        return {
            'tier_id':                   self.tier_id,
            'client_id':                 self.client_id,
            'name':                      self.name,
            'description':               self.description,
            'color':                     self.color,
            'discount_percentage':       self._num(self.discount_percentage),
            'points_per_100':            self._num(self.points_per_100),
            'redemption_rate':           self._num(self.redemption_rate),
            'monthly_negotiable_budget': self._num(self.monthly_negotiable_budget),
            'negotiable_budget_period':  self.negotiable_budget_period or 'monthly',
            'upgrade_threshold_points':  self.upgrade_threshold_points,
            'upgrade_to_tier_id':        self.upgrade_to_tier_id,
            'enrollment_fee':            self._num(self.enrollment_fee),
            'validity_days':             self.validity_days,
            'is_active':                 self.is_active,
            'sort_order':                self.sort_order or 0,
            'created_at':                self.created_at.isoformat() if self.created_at else None,
            'updated_at':                self.updated_at.isoformat() if self.updated_at else None,
        }

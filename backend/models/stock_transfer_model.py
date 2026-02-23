from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID


class StockTransfer(db.Model):
    """Stock transfer request between branches with approval workflow"""
    __tablename__ = 'stock_transfers'

    __table_args__ = (
        db.Index('idx_transfers_client_status', 'client_id', 'status'),
    )

    transfer_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    from_branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=False)
    to_branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    notes = db.Column(db.Text, nullable=True)
    requested_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=False)
    approved_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    from_branch = db.relationship('Branch', foreign_keys=[from_branch_id])
    to_branch = db.relationship('Branch', foreign_keys=[to_branch_id])
    requester = db.relationship('User', foreign_keys=[requested_by])
    approver = db.relationship('User', foreign_keys=[approved_by])
    items = db.relationship('StockTransferItem', backref='transfer', lazy='joined', cascade='all, delete-orphan')

    def to_dict(self, include_items=True):
        result = {
            'transfer_id': str(self.transfer_id) if self.transfer_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'from_branch_id': str(self.from_branch_id) if self.from_branch_id else None,
            'to_branch_id': str(self.to_branch_id) if self.to_branch_id else None,
            'from_branch_name': self.from_branch.name if self.from_branch else None,
            'to_branch_name': self.to_branch.name if self.to_branch else None,
            'status': self.status,
            'notes': self.notes,
            'requested_by': str(self.requested_by) if self.requested_by else None,
            'requester_name': self.requester.full_name if self.requester else None,
            'approved_by': str(self.approved_by) if self.approved_by else None,
            'approver_name': self.approver.full_name if self.approver else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_items:
            result['items'] = [item.to_dict() for item in self.items]
        return result


class StockTransferItem(db.Model):
    """Individual product line item in a stock transfer"""
    __tablename__ = 'stock_transfer_items'

    id = db.Column(FlexibleUUID, primary_key=True)
    transfer_id = db.Column(FlexibleUUID, db.ForeignKey('stock_transfers.transfer_id'), nullable=False)
    product_id = db.Column(FlexibleUUID, db.ForeignKey('stock_entry.product_id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    # Relationship
    product = db.relationship('StockEntry')

    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'transfer_id': str(self.transfer_id) if self.transfer_id else None,
            'product_id': str(self.product_id) if self.product_id else None,
            'product_name': self.product.product_name if self.product else None,
            'item_code': self.product.item_code if self.product else None,
            'unit': self.product.unit if self.product else None,
            'quantity': self.quantity,
        }

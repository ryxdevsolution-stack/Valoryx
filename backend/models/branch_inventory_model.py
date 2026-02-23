from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID


class BranchInventory(db.Model):
    """Per-branch stock quantities — links products (stock_entry) to branches"""
    __tablename__ = 'branch_inventory'

    __table_args__ = (
        db.UniqueConstraint('branch_id', 'product_id', name='uq_branch_product'),
        db.Index('idx_branch_inv_client_branch', 'client_id', 'branch_id'),
    )

    id = db.Column(FlexibleUUID, primary_key=True)
    branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=False)
    product_id = db.Column(FlexibleUUID, db.ForeignKey('stock_entry.product_id'), nullable=False)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    low_stock_alert = db.Column(db.Integer, default=10)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    branch = db.relationship('Branch', backref=db.backref('inventory_items', lazy='dynamic'))
    product = db.relationship('StockEntry', backref=db.backref('branch_quantities', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'branch_id': str(self.branch_id) if self.branch_id else None,
            'product_id': str(self.product_id) if self.product_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'quantity': self.quantity,
            'low_stock_alert': self.low_stock_alert,
            'product_name': self.product.product_name if self.product else None,
            'category': self.product.category if self.product else None,
            'rate': float(self.product.rate) if self.product else None,
            'cost_price': float(self.product.cost_price) if self.product and self.product.cost_price else None,
            'mrp': float(self.product.mrp) if self.product and self.product.mrp else None,
            'unit': self.product.unit if self.product else None,
            'item_code': self.product.item_code if self.product else None,
            'barcode': self.product.barcode if self.product else None,
            'is_low_stock': self.quantity <= self.low_stock_alert,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

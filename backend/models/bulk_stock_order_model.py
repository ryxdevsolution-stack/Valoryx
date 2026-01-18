from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime

class BulkStockOrder(db.Model):
    """Bulk stock order management for client purchase requests"""
    __tablename__ = 'bulk_stock_order'

    __table_args__ = (
        db.Index('idx_order_client', 'client_id'),
        db.Index('idx_order_status', 'status'),
    )

    order_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False)  # e.g., ORD-2025-001
    supplier_name = db.Column(db.String(255), nullable=True)
    supplier_contact = db.Column(db.String(100), nullable=True)
    order_date = db.Column(db.DateTime, default=datetime.utcnow)
    expected_delivery_date = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default='pending')  # pending, received, partial, cancelled
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(FlexibleUUID, nullable=True)  # user_id who created the order
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    received_at = db.Column(db.DateTime, nullable=True)  # When order was marked as received

    # Relationship
    items = db.relationship('BulkStockOrderItem', backref='order', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'order_id': self.order_id,
            'client_id': self.client_id,
            'order_number': self.order_number,
            'supplier_name': self.supplier_name,
            'supplier_contact': self.supplier_contact,
            'order_date': self.order_date.isoformat() if self.order_date else None,
            'expected_delivery_date': self.expected_delivery_date.isoformat() if self.expected_delivery_date else None,
            'status': self.status,
            'notes': self.notes,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'items': [item.to_dict() for item in self.items.all()]
        }


class BulkStockOrderItem(db.Model):
    """Individual items in a bulk stock order"""
    __tablename__ = 'bulk_stock_order_item'

    __table_args__ = (
        db.Index('idx_order_item_order', 'order_id'),
        db.Index('idx_order_item_product', 'product_id'),
    )

    item_id = db.Column(FlexibleUUID, primary_key=True)
    order_id = db.Column(FlexibleUUID, db.ForeignKey('bulk_stock_order.order_id'), nullable=False)
    product_id = db.Column(FlexibleUUID, db.ForeignKey('stock_entry.product_id'), nullable=True)  # Can be null for new products
    product_name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    quantity_ordered = db.Column(db.Integer, nullable=False)
    quantity_received = db.Column(db.Integer, default=0)
    unit = db.Column(db.String(20), default='pcs')
    cost_price = db.Column(FlexibleNumeric, nullable=True)  # Purchase price
    selling_price = db.Column(FlexibleNumeric, nullable=True)  # Rate to sell at
    mrp = db.Column(FlexibleNumeric, nullable=True)
    barcode = db.Column(db.String(100), nullable=True)
    item_code = db.Column(db.String(50), nullable=True)
    gst_percentage = db.Column(FlexibleNumeric, default=0)
    hsn_code = db.Column(db.String(20), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'item_id': self.item_id,
            'order_id': self.order_id,
            'product_id': self.product_id,
            'product_name': self.product_name,
            'category': self.category,
            'quantity_ordered': self.quantity_ordered,
            'quantity_received': self.quantity_received,
            'unit': self.unit,
            'cost_price': float(self.cost_price) if self.cost_price else None,
            'selling_price': float(self.selling_price) if self.selling_price else None,
            'mrp': float(self.mrp) if self.mrp else None,
            'barcode': self.barcode,
            'item_code': self.item_code,
            'gst_percentage': float(self.gst_percentage) if self.gst_percentage else 0,
            'hsn_code': self.hsn_code,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

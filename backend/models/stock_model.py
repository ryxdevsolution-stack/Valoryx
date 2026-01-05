from extensions import db
from datetime import datetime

class StockEntry(db.Model):
    """Product inventory management with client isolation"""
    __tablename__ = 'stock_entry'

    # Performance indexes for common query patterns
    __table_args__ = (
        db.Index('idx_stock_client_product', 'client_id', 'product_name'),  # For duplicate checking
        db.Index('idx_stock_client_itemcode', 'client_id', 'item_code'),    # For item code lookups
    )

    product_id = db.Column(db.String(36), primary_key=True)
    client_id = db.Column(db.String(36), db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    product_name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100))
    quantity = db.Column(db.Integer, nullable=False, default=0)
    rate = db.Column(db.Numeric(10, 2), nullable=False)
    cost_price = db.Column(db.Numeric(10, 2), nullable=True)  # Cost price for profit calculation
    mrp = db.Column(db.Numeric(10, 2), nullable=True)  # Maximum Retail Price (for display on print)
    pricing = db.Column(db.Numeric(10, 2), nullable=True, default=None)  # Pricing field from stock updation
    unit = db.Column(db.String(20), default='pcs')
    low_stock_alert = db.Column(db.Integer, default=10)
    item_code = db.Column(db.String(50), nullable=True, index=True)  # Added index
    barcode = db.Column(db.String(100), unique=True, nullable=True, index=True)
    gst_percentage = db.Column(db.Numeric(5, 2), default=0)
    hsn_code = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'product_id': str(self.product_id) if self.product_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'product_name': self.product_name,
            'category': self.category,
            'quantity': self.quantity,
            'rate': float(self.rate),
            'cost_price': float(self.cost_price) if self.cost_price else None,
            'mrp': float(self.mrp) if self.mrp else None,
            'pricing': float(self.pricing) if self.pricing else None,
            'unit': self.unit,
            'low_stock_alert': self.low_stock_alert,
            'item_code': self.item_code,
            'barcode': self.barcode,
            'gst_percentage': float(self.gst_percentage) if self.gst_percentage else 0,
            'hsn_code': self.hsn_code,
            'is_low_stock': self.quantity <= self.low_stock_alert,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

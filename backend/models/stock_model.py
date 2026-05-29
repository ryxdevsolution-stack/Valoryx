from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID, FlexibleNumeric

class StockEntry(db.Model):
    """Product inventory management with client isolation"""
    __tablename__ = 'stock_entry'

    # Performance indexes for common query patterns
    __table_args__ = (
        db.Index('idx_stock_client_product', 'client_id', 'product_name'),  # For duplicate checking
        db.Index('idx_stock_client_itemcode', 'client_id', 'item_code'),    # For item code lookups
        db.UniqueConstraint('client_id', 'barcode', name='uq_stock_client_barcode'),  # Barcode unique per client
    )

    product_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    product_name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100))
    quantity = db.Column(db.Integer, nullable=False, default=0)
    rate = db.Column(FlexibleNumeric, nullable=False)
    cost_price = db.Column(FlexibleNumeric, nullable=True)  # Cost price for profit calculation
    mrp = db.Column(FlexibleNumeric, nullable=True)  # Maximum Retail Price (for display on print)
    pricing = db.Column(FlexibleNumeric, nullable=True, default=None)  # Pricing field from stock updation
    # Optional percentage discounts (v25). Purchase = supplier discount (profit calc only,
    # cost_price stays gross). Selling = customer discount that auto-fills the bill line.
    purchase_discount_percentage = db.Column(FlexibleNumeric, nullable=True, default=0)
    selling_discount_percentage = db.Column(FlexibleNumeric, nullable=True, default=0)
    unit = db.Column(db.String(20), default='pcs')
    low_stock_alert = db.Column(db.Integer, default=10)
    item_code = db.Column(db.String(50), nullable=True, index=True)  # Added index
    barcode = db.Column(db.String(100), nullable=True, index=True)
    gst_percentage = db.Column(FlexibleNumeric, default=0)
    hsn_code = db.Column(db.String(20))

    # Apparel hang-tag / Legal Metrology fields (v13)
    brand_name = db.Column(db.String(120), nullable=True)
    size_variant = db.Column(db.String(20), nullable=True)
    colour = db.Column(db.String(40), nullable=True)
    country_of_origin = db.Column(db.String(60), nullable=True)
    manufacture_date = db.Column(db.String(7), nullable=True)  # YYYY-MM
    importer_name = db.Column(db.String(160), nullable=True)
    importer_address = db.Column(db.Text, nullable=True)
    consumer_care_phone = db.Column(db.String(20), nullable=True)
    consumer_care_email = db.Column(db.String(120), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = db.Column(db.DateTime, nullable=True)  # Phase 1: Track sync to Supabase
    created_by = db.Column(FlexibleUUID, nullable=True)  # User who added this stock; NULL for legacy rows
    added_by_label = db.Column(db.String(120), nullable=True)  # User-typed display name for shared-login attribution

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
            'purchase_discount_percentage': float(self.purchase_discount_percentage) if self.purchase_discount_percentage else 0,
            'selling_discount_percentage': float(self.selling_discount_percentage) if self.selling_discount_percentage else 0,
            'unit': self.unit,
            'low_stock_alert': self.low_stock_alert,
            'item_code': self.item_code,
            'barcode': self.barcode,
            'gst_percentage': float(self.gst_percentage) if self.gst_percentage else 0,
            'hsn_code': self.hsn_code,
            'brand_name': self.brand_name,
            'size_variant': self.size_variant,
            'colour': self.colour,
            'country_of_origin': self.country_of_origin,
            'manufacture_date': self.manufacture_date,
            'importer_name': self.importer_name,
            'importer_address': self.importer_address,
            'consumer_care_phone': self.consumer_care_phone,
            'consumer_care_email': self.consumer_care_email,
            'created_by': str(self.created_by) if self.created_by else None,
            'created_by_name': self._lookup_creator_name(),
            'added_by_label': self.added_by_label,
            'is_low_stock': self.quantity <= self.low_stock_alert,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def _lookup_creator_name(self):
        """Resolve created_by user_id → display name. Returns None for legacy rows."""
        if not self.created_by:
            return None
        from models.user_model import User
        user = User.query.filter_by(user_id=self.created_by).first()
        if not user:
            return None
        return user.full_name or user.email or None

from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleNumeric
from datetime import datetime


class Supplier(db.Model):
    """Vendor/supplier master record per client"""
    __tablename__ = 'suppliers'

    __table_args__ = (
        db.Index('idx_suppliers_client', 'client_id'),
        db.Index('idx_suppliers_client_active', 'client_id', 'is_active'),
    )

    supplier_id    = db.Column(FlexibleUUID, primary_key=True)
    client_id      = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    name           = db.Column(db.String(255), nullable=False)
    contact_person = db.Column(db.String(255), nullable=True)
    phone          = db.Column(db.String(20),  nullable=True)
    email          = db.Column(db.String(255), nullable=True)
    address        = db.Column(db.Text,        nullable=True)
    gst_number     = db.Column(db.String(15),  nullable=True)
    transport_fee  = db.Column(FlexibleNumeric, default=0)   # default freight/delivery charge
    payment_terms  = db.Column(db.String(100), nullable=True)  # COD, Net 30, Advance, etc.
    notes          = db.Column(db.Text,        nullable=True)
    is_active      = db.Column(db.Boolean, default=True, nullable=False)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    deliveries = db.relationship('SupplierDelivery', backref='supplier', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'supplier_id':    self.supplier_id,
            'client_id':      self.client_id,
            'name':           self.name,
            'contact_person': self.contact_person,
            'phone':          self.phone,
            'email':          self.email,
            'address':        self.address,
            'gst_number':     self.gst_number,
            'transport_fee':  float(self.transport_fee) if self.transport_fee else 0,
            'payment_terms':  self.payment_terms,
            'notes':          self.notes,
            'is_active':      self.is_active,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
            'updated_at':     self.updated_at.isoformat() if self.updated_at else None,
        }


class SupplierDelivery(db.Model):
    """
    A single delivery received from a supplier.
    Flow:
      draft  → (add items, notes)
      confirmed → (products_confirmed = True, delivery note uploaded)
      completed → (stock updated)
    """
    __tablename__ = 'supplier_deliveries'

    __table_args__ = (
        db.Index('idx_sdel_client',        'client_id'),
        db.Index('idx_sdel_supplier',      'supplier_id'),
        db.Index('idx_sdel_client_status', 'client_id', 'status'),
    )

    delivery_id           = db.Column(FlexibleUUID, primary_key=True)
    client_id             = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    supplier_id           = db.Column(FlexibleUUID, db.ForeignKey('suppliers.supplier_id'),  nullable=False)
    branch_id             = db.Column(FlexibleUUID, nullable=True)        # which branch receives stock
    invoice_number        = db.Column(db.String(100), nullable=True)
    delivery_date         = db.Column(db.Date, nullable=True)
    transport_fee         = db.Column(FlexibleNumeric, default=0)         # actual fee for this delivery
    notes                 = db.Column(db.Text, nullable=True)
    status                = db.Column(db.String(20), default='draft')     # draft | confirmed | completed
    # Step 3: product confirmation
    products_confirmed    = db.Column(db.Boolean, default=False)
    confirmed_by          = db.Column(FlexibleUUID, nullable=True)        # user_id
    confirmed_at          = db.Column(db.DateTime, nullable=True)
    # Delivery note file
    delivery_note_filename = db.Column(db.String(255), nullable=True)     # original filename shown to user
    delivery_note_path     = db.Column(db.String(500), nullable=True)     # server filesystem path
    delivery_note_type     = db.Column(db.String(10),  nullable=True)     # 'image' | 'pdf'
    # Completion
    completed_by          = db.Column(FlexibleUUID, nullable=True)
    completed_at          = db.Column(db.DateTime, nullable=True)
    created_at            = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at            = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship('SupplierDeliveryItem', backref='delivery', lazy='joined', cascade='all, delete-orphan')

    def to_dict(self, include_supplier=False):
        data = {
            'delivery_id':            self.delivery_id,
            'client_id':              self.client_id,
            'supplier_id':            self.supplier_id,
            'branch_id':              self.branch_id,
            'invoice_number':         self.invoice_number,
            'delivery_date':          self.delivery_date.isoformat() if self.delivery_date else None,
            'transport_fee':          float(self.transport_fee) if self.transport_fee else 0,
            'notes':                  self.notes,
            'status':                 self.status,
            'products_confirmed':     self.products_confirmed,
            'confirmed_by':           self.confirmed_by,
            'confirmed_at':           self.confirmed_at.isoformat() if self.confirmed_at else None,
            'delivery_note_filename': self.delivery_note_filename,
            'has_delivery_note':      bool(self.delivery_note_path),
            'delivery_note_type':     self.delivery_note_type,
            'completed_by':           self.completed_by,
            'completed_at':           self.completed_at.isoformat() if self.completed_at else None,
            'created_at':             self.created_at.isoformat() if self.created_at else None,
            'updated_at':             self.updated_at.isoformat() if self.updated_at else None,
            'items':                  [item.to_dict() for item in self.items],
        }
        if include_supplier and self.supplier:
            data['supplier'] = self.supplier.to_dict()
        return data


class SupplierDeliveryItem(db.Model):
    """One product line in a supplier delivery"""
    __tablename__ = 'supplier_delivery_items'

    __table_args__ = (
        db.Index('idx_sdel_item_delivery', 'delivery_id'),
        db.Index('idx_sdel_item_product',  'product_id'),
    )

    id           = db.Column(FlexibleUUID, primary_key=True)
    delivery_id  = db.Column(FlexibleUUID, db.ForeignKey('supplier_deliveries.delivery_id'), nullable=False)
    product_id   = db.Column(FlexibleUUID, db.ForeignKey('stock_entry.product_id'), nullable=True)   # null = new product
    product_name = db.Column(db.String(255), nullable=False)
    category     = db.Column(db.String(100), nullable=True)
    quantity     = db.Column(db.Integer,     nullable=False, default=1)
    cost_price   = db.Column(FlexibleNumeric, nullable=True)   # purchase price from supplier
    selling_price= db.Column(FlexibleNumeric, nullable=True)   # rate to sell at
    mrp          = db.Column(FlexibleNumeric, nullable=True)
    unit         = db.Column(db.String(20),  default='pcs')
    barcode      = db.Column(db.String(100), nullable=True)
    item_code    = db.Column(db.String(50),  nullable=True)
    gst_percentage = db.Column(FlexibleNumeric, default=0)
    hsn_code     = db.Column(db.String(20),  nullable=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':            self.id,
            'delivery_id':   self.delivery_id,
            'product_id':    self.product_id,
            'product_name':  self.product_name,
            'category':      self.category,
            'quantity':      self.quantity,
            'cost_price':    float(self.cost_price)    if self.cost_price    else None,
            'selling_price': float(self.selling_price) if self.selling_price else None,
            'mrp':           float(self.mrp)           if self.mrp           else None,
            'unit':          self.unit,
            'barcode':       self.barcode,
            'item_code':     self.item_code,
            'gst_percentage':float(self.gst_percentage) if self.gst_percentage else 0,
            'hsn_code':      self.hsn_code,
            'created_at':    self.created_at.isoformat() if self.created_at else None,
        }

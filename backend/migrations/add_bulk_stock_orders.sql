-- Migration: Add Bulk Stock Order Tables
-- Description: Create tables for bulk stock order management
-- Date: 2025-11-24

-- Create bulk_stock_order table
CREATE TABLE IF NOT EXISTS bulk_stock_order (
    order_id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36) NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(255),
    supplier_contact VARCHAR(100),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_at TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES client_entry(client_id) ON DELETE CASCADE
);

-- Create bulk_stock_order_item table
CREATE TABLE IF NOT EXISTS bulk_stock_order_item (
    item_id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36),
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'pcs',
    cost_price DECIMAL(10, 2),
    selling_price DECIMAL(10, 2),
    mrp DECIMAL(10, 2),
    barcode VARCHAR(100),
    item_code VARCHAR(50),
    gst_percentage DECIMAL(5, 2) DEFAULT 0,
    hsn_code VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES bulk_stock_order(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES stock_entry(product_id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_client ON bulk_stock_order(client_id);
CREATE INDEX IF NOT EXISTS idx_order_status ON bulk_stock_order(status);
CREATE INDEX IF NOT EXISTS idx_order_item_order ON bulk_stock_order_item(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_product ON bulk_stock_order_item(product_id);

-- Comments for documentation
COMMENT ON TABLE bulk_stock_order IS 'Stores bulk stock purchase orders from suppliers';
COMMENT ON TABLE bulk_stock_order_item IS 'Stores individual items in bulk stock orders';
COMMENT ON COLUMN bulk_stock_order.status IS 'Order status: pending, received, partial, cancelled';
COMMENT ON COLUMN bulk_stock_order_item.quantity_received IS 'Quantity actually received (can be partial)';

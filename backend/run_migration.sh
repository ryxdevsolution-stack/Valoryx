#!/bin/bash
echo "========================================"
echo "RYX Billing - Customer Table Migration"
echo "========================================"
echo ""

# Navigate to backend directory
cd "$(dirname "$0")"

echo "Checking Python environment..."
python3 --version || python --version
echo ""

echo "Running migration script..."
python3 migrate_customer.py || python migrate_customer.py

echo ""
echo "Migration complete!"

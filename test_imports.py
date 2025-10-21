#!/usr/bin/env python3
"""
Test script to verify all imports work correctly
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

print("Testing imports...")

try:
    print("Testing config import...")
    from config import Config
    print("✓ Config imported successfully")
except ImportError as e:
    print(f"✗ Config import failed: {e}")

try:
    print("Testing extensions import...")
    from extensions import db
    print("✓ Extensions imported successfully")
except ImportError as e:
    print(f"✗ Extensions import failed: {e}")

try:
    print("Testing routes imports...")
    from routes.auth import auth_bp
    from routes.billing import billing_bp
    from routes.stock import stock_bp
    print("✓ Routes imported successfully")
except ImportError as e:
    print(f"✗ Routes import failed: {e}")

try:
    print("Testing app creation...")
    from app import create_app
    app = create_app()
    print("✓ App created successfully")
except Exception as e:
    print(f"✗ App creation failed: {e}")

print("Import test completed!")

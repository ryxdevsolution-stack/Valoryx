#!/bin/bash

echo "Starting Railway Python build..."

# Ensure we're in the right directory
cd /app

# Upgrade pip
pip install --upgrade pip

# Install requirements
pip install --no-cache-dir -r backend/requirements.txt

echo "Build completed successfully!"

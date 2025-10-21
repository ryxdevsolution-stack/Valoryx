#!/bin/bash

echo "Starting Railway deployment..."

# Railway should set PORT environment variable
# Use eval to properly expand it
eval "exec gunicorn --bind 0.0.0.0:\$PORT --workers 4 backend.app:app"

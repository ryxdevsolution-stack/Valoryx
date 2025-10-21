#!/bin/bash

# Railway-specific startup script
echo "Starting Railway deployment..."

# Railway automatically handles port assignment
# Just start gunicorn and let Railway handle the port
exec gunicorn --bind 0.0.0.0 --workers 4 backend.app:app

#!/bin/bash

# Railway automatically sets PORT environment variable
# Use it directly without fallback
echo "Starting application on port ${PORT}"

# Start gunicorn with Railway's assigned port
exec gunicorn --bind 0.0.0.0:${PORT} --workers 4 backend.app:app

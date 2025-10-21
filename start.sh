#!/bin/bash

# Get port from environment variable, default to 8000
PORT=${PORT:-8000}

# Start gunicorn with the correct port
exec gunicorn --bind 0.0.0.0:$PORT --workers 4 backend.app:app

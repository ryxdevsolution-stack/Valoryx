#!/bin/bash

# MJ-Billing Backend Stop Script

echo "🛑 Stopping MJ-Billing Backend"
echo "=============================="

# Kill all Gunicorn processes
pkill -f gunicorn

# Wait a moment
sleep 2

# Check if stopped
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Some processes still running. Forcing shutdown..."
    pkill -9 -f gunicorn
    sleep 1
fi

# Verify
if ! lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Backend stopped successfully!"
else
    echo "❌ Failed to stop backend. Try manually:"
    echo "   sudo pkill -9 gunicorn"
fi
#!/usr/bin/env python3
"""
Railway startup script that properly handles PORT environment variable
"""
import os
import subprocess
import sys

def main():
    # Get port from Railway environment
    port = os.environ.get('PORT', '8000')
    
    print(f"Starting Railway deployment on port {port}")
    
    # Build gunicorn command
    cmd = [
        'gunicorn',
        '--bind', f'0.0.0.0:{port}',
        '--workers', '4',
        'backend.app:app'
    ]
    
    print(f"Running command: {' '.join(cmd)}")
    
    # Start gunicorn
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error starting gunicorn: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("Shutting down...")
        sys.exit(0)

if __name__ == '__main__':
    main()

"""
Optimized Gunicorn configuration for MJ-Billing Backend
"""

import multiprocessing
import os

# Bind to all interfaces on port 5000
bind = "0.0.0.0:5000"

# Number of worker processes (2-4 x CPU cores)
workers = min(multiprocessing.cpu_count() * 2 + 1, 8)

# Worker class - using sync for stability (can change to gevent for async)
worker_class = "sync"

# Number of worker connections (for async workers)
worker_connections = 1000

# Maximum number of requests a worker will process before restarting
max_requests = 1000
max_requests_jitter = 50

# Timeout settings
timeout = 30  # Worker timeout in seconds
graceful_timeout = 30  # Graceful shutdown timeout
keepalive = 2  # Keepalive connections

# Threading
threads = 4  # Number of threads per worker

# Logging
accesslog = "-"  # Log to stdout
errorlog = "-"  # Log errors to stdout
loglevel = "info"

# Process naming
proc_name = "mj-billing-backend"

# Preload application for better memory usage
preload_app = True

# Enable stats
statsd_host = None  # Set to "localhost:8125" if using StatsD

# Restart workers gracefully
max_worker_restart_frequency = 100

def worker_int(worker):
    """Handle worker interrupt gracefully"""
    worker.log.info("Worker received INT or QUIT signal")

def pre_fork(server, worker):
    """Called just before a worker is forked"""
    server.log.info(f"Worker spawned (pid: {worker.pid})")

def post_fork(server, worker):
    """Called just after a worker has been forked"""
    server.log.info(f"Worker {worker.pid} ready")

def when_ready(server):
    """Called just after the server is started"""
    server.log.info("Server is ready. Spawning workers")

def worker_abort(worker):
    """Called just after a worker exited on SIGABRT signal"""
    worker.log.info(f"Worker {worker.pid} aborted")
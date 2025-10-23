# This file makes the backend directory a Python package
# Expose the app for easier imports when deployed
from .app import app, create_app

__all__ = ['app', 'create_app']

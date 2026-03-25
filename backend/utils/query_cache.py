"""Request-scoped query cache using Flask's g object.

Avoids re-fetching the same data multiple times within a single HTTP request.
The cache is automatically cleared when the request ends (g is request-local).
"""

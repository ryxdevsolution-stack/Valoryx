"""
Supabase Storage utility for file uploads
Handles logo uploads to Supabase Storage bucket
"""

import os
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from typing import Optional, Tuple

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL')
# Use service_role key for storage operations (server-side only!)
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Configuration for client logos
BUCKET_NAME = 'client-logos'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'svg', 'webp'}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_file_size(file_bytes: bytes) -> bool:
    """Check if file size is within limits"""
    return len(file_bytes) <= MAX_FILE_SIZE

def upload_logo(file, client_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Upload client logo to Supabase Storage

    Args:
        file: File object from request.files
        client_id: UUID of the client

    Returns:
        Tuple of (success: bool, public_url: str, error_message: str)
    """
    try:
        # Validate file
        if not file:
            return False, None, "No file provided"

        filename = secure_filename(file.filename)

        if not allowed_file(filename):
            return False, None, f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"

        # Read file content
        file_bytes = file.read()

        # Validate size
        if not validate_file_size(file_bytes):
            return False, None, f"File size exceeds maximum of {MAX_FILE_SIZE / (1024 * 1024)}MB"

        # Generate unique filename
        file_extension = filename.rsplit('.', 1)[1].lower()
        timestamp = int(datetime.utcnow().timestamp())
        unique_filename = f"logo-{timestamp}.{file_extension}"

        # Storage path: client-logos/{client_id}/logo-{timestamp}.ext
        storage_path = f"{client_id}/{unique_filename}"

        # Upload to Supabase Storage
        response = supabase.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type}
        )

        # Get public URL
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(storage_path)

        return True, public_url, None

    except Exception as e:
        return False, None, f"Upload failed: {str(e)}"

def delete_logo(logo_url: str, client_id: str) -> Tuple[bool, Optional[str]]:
    """
    Delete client logo from Supabase Storage

    Args:
        logo_url: Public URL of the logo
        client_id: UUID of the client

    Returns:
        Tuple of (success: bool, error_message: str)
    """
    try:
        # Extract storage path from URL
        # URL format: https://{project}.supabase.co/storage/v1/object/public/client-logos/{client_id}/logo-{timestamp}.ext
        if not logo_url:
            return True, None  # Nothing to delete

        # Extract path from URL
        parts = logo_url.split(f"{BUCKET_NAME}/")
        if len(parts) < 2:
            return False, "Invalid logo URL format"

        storage_path = parts[1]

        # Verify path belongs to this client (security check)
        if not storage_path.startswith(f"{client_id}/"):
            return False, "Unauthorized: Logo does not belong to this client"

        # Delete from storage
        supabase.storage.from_(BUCKET_NAME).remove([storage_path])

        return True, None

    except Exception as e:
        return False, f"Delete failed: {str(e)}"

def replace_logo(old_logo_url: Optional[str], new_file, client_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Replace existing logo with new one

    Args:
        old_logo_url: URL of existing logo (will be deleted)
        new_file: New file object
        client_id: UUID of the client

    Returns:
        Tuple of (success: bool, new_public_url: str, error_message: str)
    """
    # Upload new logo
    success, new_url, error = upload_logo(new_file, client_id)

    if not success:
        return False, None, error

    # Delete old logo if it exists
    if old_logo_url:
        delete_logo(old_logo_url, client_id)

    return True, new_url, None

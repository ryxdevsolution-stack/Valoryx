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

# Supabase client is created lazily: the packaged desktop app runs without
# cloud credentials, so module import must never require them. Env vars are
# also read lazily so dotenv loading order cannot break configuration.
_supabase_client: Optional[Client] = None


def _get_client() -> Client:
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv('SUPABASE_URL')
        # Use service_role key for storage operations (server-side only!)
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
        if not url or not key:
            raise RuntimeError(
                'Supabase storage is not configured '
                '(SUPABASE_URL / SUPABASE_KEY are not set)'
            )
        _supabase_client = create_client(url, key)
    return _supabase_client

# Configuration for client logos
BUCKET_NAME = 'client-logos'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'svg', 'webp'}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB


# Signatures are drawn into the invoice PDF by ReportLab, which cannot rasterise
# SVG — an SVG signature would silently render as nothing. Raster formats only.
SIGNATURE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}


def allowed_file(filename: str, extensions: Optional[set] = None) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in (extensions or ALLOWED_EXTENSIONS)

def validate_file_size(file_bytes: bytes) -> bool:
    """Check if file size is within limits"""
    return len(file_bytes) <= MAX_FILE_SIZE

def _upload_image(file, client_id: str, prefix: str,
                  extensions: Optional[set] = None) -> Tuple[bool, Optional[str], Optional[str]]:
    """Upload one image to this client's folder in Supabase Storage.

    Shared by the logo and the signature — they differ only in the filename
    prefix and which extensions are acceptable, so the validation and the
    per-client path live here once.

    The stored name is always prefix-<timestamp>.<ext>: a fresh path per upload
    means a replaced image can never be served from a CDN cache of the old one.

    Returns (success, public_url, error_message).
    """
    try:
        if not file or not getattr(file, 'filename', ''):
            return False, None, "No file provided"

        filename = secure_filename(file.filename)
        allowed = extensions or ALLOWED_EXTENSIONS
        if not allowed_file(filename, allowed):
            return False, None, f"File type not allowed. Allowed types: {', '.join(sorted(allowed))}"

        file_bytes = file.read()
        if not file_bytes:
            return False, None, "The file is empty"
        if not validate_file_size(file_bytes):
            return False, None, f"File size exceeds maximum of {MAX_FILE_SIZE / (1024 * 1024)}MB"

        file_extension = filename.rsplit('.', 1)[1].lower()
        timestamp = int(datetime.utcnow().timestamp())
        storage_path = f"{client_id}/{prefix}-{timestamp}.{file_extension}"

        client = _get_client()
        client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type}
        )
        public_url = client.storage.from_(BUCKET_NAME).get_public_url(storage_path)
        return True, public_url, None

    except Exception as e:
        return False, None, f"Upload failed: {str(e)}"


def upload_logo(file, client_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Upload a client logo. Returns (success, public_url, error_message)."""
    return _upload_image(file, client_id, 'logo')


def upload_signature(file, client_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Upload an authorised-signature image for the invoice footer.

    Goes to the same public bucket as the logo on purpose: the invoice PDF
    renderer only fetches images from the configured Supabase host, so a
    signature stored anywhere else would be refused and silently omitted.
    """
    return _upload_image(file, client_id, 'signature', SIGNATURE_EXTENSIONS)

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
        _get_client().storage.from_(BUCKET_NAME).remove([storage_path])

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

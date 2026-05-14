import os
import io
import uuid
import mimetypes
from fastapi import UploadFile, HTTPException, status
from PIL import Image
from core.logger import get_logger

logger = get_logger("Medisync.UploadValidator")

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_IMAGE_DIMENSION = 5000

ALLOWED_MIMES = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/pdf": [".pdf"],
    # Audio types for voice chat
    "audio/m4a": [".m4a"],
    "audio/webm": [".webm"],
    "audio/mp4": [".mp4", ".m4a"],
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/x-wav": [".wav"]
}

FORBIDDEN_EXTENSIONS = {".exe", ".sh", ".bat", ".cmd", ".msi", ".vbs", ".zip", ".tar", ".gz", ".rar", ".svg", ".heic"}

async def validate_upload(file: UploadFile) -> tuple[UploadFile, bytes]:
    """
    Validates an uploaded file.
    Reads the file incrementally to enforce max size, checks MIME types,
    image dimensions, and runs an antivirus hook.
    Returns the file and the file content as bytes.
    """
    
    # 1. Normalize Filename
    original_ext = os.path.splitext(file.filename or "")[1].lower()
    
    if original_ext in FORBIDDEN_EXTENSIONS:
        logger.warning(f"Upload rejected: forbidden extension {original_ext}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File type not allowed.")
        
    normalized_filename = f"{uuid.uuid4().hex}{original_ext}"
    
    # Check MIME type
    if file.content_type not in ALLOWED_MIMES:
        logger.warning(f"Upload rejected: forbidden MIME type {file.content_type}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file format.")
        
    # Check if extension matches MIME
    if original_ext and original_ext not in ALLOWED_MIMES.get(file.content_type, []):
        logger.warning(f"Upload rejected: extension {original_ext} does not match MIME {file.content_type}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File extension does not match content type.")

    # 2. Read Incrementally for Size Validation
    file_bytes = b""
    chunk_size = 1024 * 1024 # 1 MB
    
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        file_bytes += chunk
        if len(file_bytes) > MAX_FILE_SIZE:
            logger.warning(f"Upload rejected: size exceeds {MAX_FILE_SIZE} bytes")
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large. Maximum size is 10MB.")

    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    # 3. Image Dimension Validation
    if file.content_type.startswith("image/"):
        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                width, height = img.size
                if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
                    logger.warning(f"Upload rejected: dimensions {width}x{height} exceed {MAX_IMAGE_DIMENSION}")
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Image dimensions exceed maximum allowed ({MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}).")
        except Exception as e:
            logger.warning(f"Upload rejected: invalid image format: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image file.")

    # 4. Antivirus Placeholder Hook
    if not _antivirus_scan(file_bytes):
        logger.error(f"Upload rejected: malware detected in file {normalized_filename}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File rejected by security scanner.")

    # Reset file pointer if someone else wants to read it, but we also return bytes
    await file.seek(0)
    
    # Update filename to safe version
    # Since UploadFile in FastAPI doesn't easily allow setting filename in older versions,
    # we just attach it as an attribute if needed.
    file.filename = normalized_filename

    return file, file_bytes

def _antivirus_scan(data: bytes) -> bool:
    """
    Placeholder for Antivirus (e.g. ClamAV).
    Returns True if clean, False if malware detected.
    """
    # TODO: Integrate ClamAV or cloud scanning API
    return True

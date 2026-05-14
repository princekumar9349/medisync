import hashlib

def compute_image_hash(image_bytes: bytes) -> str:
    """
    Computes a SHA-256 hash of the uploaded image bytes.
    Used for aggressive OCR caching to prevent reprocessing
    the exact same prescription slip.
    """
    return hashlib.sha256(image_bytes).hexdigest()

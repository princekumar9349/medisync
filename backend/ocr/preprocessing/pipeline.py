import io
import cv2
import numpy as np
from PIL import Image, ImageOps
import logging

logger = logging.getLogger("Medisync.OCR.Preprocessing")

def detect_blur(image_bytes: bytes, threshold: float = 100.0) -> bool:
    """
    Detects if an image is too blurry using OpenCV Laplacian variance.
    Returns True if the image is blurry, False otherwise.
    A higher variance means sharper edges. Handwritten prescriptions 
    need decent variance (default 100.0 is a standard baseline).
    """
    try:
        # Decode image bytes to numpy array
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
        
        if img is None:
            logger.warning("Failed to decode image for blur detection.")
            return False # Fail open if we can't decode, let Gemini handle it
            
        variance = cv2.Laplacian(img, cv2.CV_64F).var()
        logger.info(f"Image blur variance: {variance:.2f}")
        
        return variance < threshold
    except Exception as e:
        logger.error(f"Error during blur detection: {e}")
        return False

def preprocess_image(image_bytes: bytes, max_size: int = 1500) -> bytes:
    """
    Optimizes the image for Gemini Vision:
    1. Fixes EXIF orientation.
    2. Resizes if the longest edge > max_size (saves tokens & bandwidth).
    3. Converts to Grayscale to reduce color noise.
    4. Applies slight contrast enhancement.
    Returns the processed image bytes (JPEG format).
    """
    try:
        # Load image via PIL
        img = Image.open(io.BytesIO(image_bytes))
        
        # 1. Fix Orientation
        img = ImageOps.exif_transpose(img)
        
        # 2. Convert to Grayscale
        img = img.convert("L")
        
        # 3. Resize if too large
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # 4. Enhance Contrast using CLAHE via OpenCV (optional but good for handwriting)
        # Convert PIL to CV2
        cv_img = np.array(img)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(cv_img)
        
        # Convert back to PIL
        final_img = Image.fromarray(enhanced)
        
        # Save back to bytes
        out_io = io.BytesIO()
        final_img.save(out_io, format="JPEG", quality=85)
        
        processed_bytes = out_io.getvalue()
        logger.info(f"Image preprocessed successfully. Old size: {len(image_bytes)}, New size: {len(processed_bytes)}")
        return processed_bytes
    except Exception as e:
        logger.error(f"Error during image preprocessing: {e}")
        # If preprocessing fails, return original to avoid catastrophic failure
        return image_bytes

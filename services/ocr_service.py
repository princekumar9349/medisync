"""
services/ocr_service.py — PaddleOCR image processing for Medisync.

Provides:
  - preprocess_image(): OpenCV enhancement optimized for handwritten prescriptions
  - run_ocr(): PaddleOCR with MD5 hash-based in-memory caching. Returns (text, confidence)
"""

import hashlib
import logging
import os
from typing import Dict, Tuple

import cv2
import numpy as np

# ── Disable OneDNN/MKL-DNN before PaddlePaddle is imported ──────────────────
# Prevents: "ConvertPirAttribute2RuntimeAttribute not support
#            [pir::ArrayAttribute<pir::DoubleAttribute>]" on CPUs whose
# OneDNN support is incomplete (common on Linux with older microarchitectures).
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("PADDLE_DISABLE_MKLDNN", "1")

# Lazy load PaddleOCR to avoid massive import times blocking startup unless needed
_paddle_ocr = None

logger = logging.getLogger("Medisync.OCR")

# ─── In-Memory OCR Cache (image hash → (extracted text, confidence)) ──────────
_ocr_cache: Dict[str, Tuple[str, float]] = {}


def get_ocr_model():
    """Singleton getter for PaddleOCR model."""
    global _paddle_ocr
    if _paddle_ocr is None:
        logger.info("🔍 Loading PaddleOCR model (first load may take a moment)...")
        from paddleocr import PaddleOCR
        # use_angle_cls=True  → handles rotated prescriptions
        # enable_mkldnn=False → avoids OneDNN runtime errors on incompatible CPUs
        _paddle_ocr = PaddleOCR(use_angle_cls=True, lang='en', enable_mkldnn=False)
        logger.info(" PaddleOCR ready.")
    return _paddle_ocr


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    Convert raw image bytes to a preprocessed NumPy array for PaddleOCR.

     IMPORTANT: PaddleOCR expects a COLOR (BGR) or GRAYSCALE image.
    Do NOT pass a hard-binarized (black & white) image — it destroys
    the ink strokes that the recognition model relies on.

    Steps:
      1. Decode bytes → BGR image
      2. Upscale if too small (helps OCR on phone photos)
      3. CLAHE contrast enhancement (improves faded/uneven handwriting)
      4. Light sharpening via unsharp mask
      5. Return enhanced BGR image (NOT binary) for OCR

    Args:
        image_bytes: Raw bytes from an uploaded file

    Returns:
        Enhanced BGR NumPy array ready for PaddleOCR
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError(
            "Could not decode the uploaded file as a valid image. "
            "Supported formats: JPEG, PNG, BMP, TIFF."
        )

    h, w = img.shape[:2]

    # ── 1. Upscale small images (phone thumbs, etc.) ──────────────
    # PaddleOCR detection works poorly on images < 800px wide
    if w < 1000:
        scale = 1000 / w
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # ── 2. Fast denoising — bilateral filter (50x faster than nlmeans) ──
    # Preserves edges (ink strokes) while smoothing camera noise
    img = cv2.bilateralFilter(img, d=5, sigmaColor=40, sigmaSpace=40)

    # ── 3. CLAHE contrast enhancement on L channel (LAB) ──────────
    # Boosts faded handwriting without blowing out dark ink
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge([l, a, b])
    img = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)

    # ── 4. Mild unsharp mask to sharpen text edges ─────────────────
    blurred = cv2.GaussianBlur(img, (0, 0), 2.0)
    img = cv2.addWeighted(img, 1.5, blurred, -0.5, 0)

    return img   # Return enhanced COLOR image — NOT binary


def run_ocr(image_bytes: bytes) -> Tuple[str, float, list]:
    """
    Extract text, average confidence, and raw bounding boxes from image using PaddleOCR.

    Args:
        image_bytes: Raw image bytes from an uploaded file

    Returns:
        Tuple: (extracted_text, average_confidence_score, raw_results)
    """
    # ── 1. Hash check ──────────────────────────────────────────────
    img_hash = hashlib.md5(image_bytes).hexdigest()

    if img_hash in _ocr_cache:
        logger.info(f" OCR cache hit — hash: {img_hash[:8]}...")
        text, conf = _ocr_cache[img_hash]
        return text, conf, []

    # ── 2. Preprocess ──────────────────────────────────────────────
    logger.info("Preprocessing image for PaddleOCR...")
    try:
        processed = preprocess_image(image_bytes)
    except Exception as pre_err:
        logger.warning(f" Preprocessing failed ({pre_err}), using raw image")
        nparr = np.frombuffer(image_bytes, np.uint8)
        processed = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # ── 3. Run PaddleOCR ──────────────────────────────────────────
    logger.info("🔍 Running PaddleOCR...")
    ocr_model = get_ocr_model()

    # PaddleOCR returns: [[ [bbox, ('text', confidence)], ... ]]
    result = ocr_model.ocr(processed)

    # Handle None result or empty pages
    if not result or result[0] is None or len(result[0]) == 0:
        # Try again with raw undecoded image as fallback
        logger.warning("No text found on preprocessed image — retrying with raw image")
        nparr = np.frombuffer(image_bytes, np.uint8)
        raw_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        result = ocr_model.ocr(raw_img)

    if not result or result[0] is None or len(result[0]) == 0:
        raise ValueError("No readable text found in the uploaded image.")

    raw_results = result[0]

    extracted_lines = []
    total_confidence = 0.0
    count = 0

    for res in raw_results:
        # res = [[[x,y],[x,y],[x,y],[x,y]], ('text', confidence)]
        try:
            text = res[1][0]
            confidence = res[1][1]
            if text and text.strip():
                extracted_lines.append(text)
                total_confidence += confidence
                count += 1
        except (IndexError, TypeError):
            continue

    if not extracted_lines:
        raise ValueError("OCR ran but could not extract any text from the image.")

    extracted_text = " \n ".join(extracted_lines).strip()
    avg_confidence = total_confidence / count if count > 0 else 0.0

    logger.info(f" OCR extracted {len(extracted_text)} chars, {count} lines. Avg confidence: {avg_confidence:.2f}")

    # ── 4. Cache & return ─────────────────────────────────────────
    _ocr_cache[img_hash] = (extracted_text, avg_confidence)
    return extracted_text, avg_confidence, raw_results


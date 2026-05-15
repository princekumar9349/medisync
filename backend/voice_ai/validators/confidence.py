from voice_ai.demo_config import get_voice_confidence_threshold

def is_confident(confidence: float) -> bool:
    """
    Validates if the speech-to-text transcription confidence meets the threshold.
    Returns True if confident, False otherwise.
    """
    threshold = get_voice_confidence_threshold()
    return confidence >= threshold

import re

def classify_intent(transcript: str) -> str:
    """
    Tightly-scoped intent classifier for medication adherence.
    Maps transcript to: MEDICATION_TAKEN, MEDICATION_NOT_TAKEN, UNCLEAR_RESPONSE
    """
    transcript = transcript.lower().strip()
    
    # Positive keywords
    positive_patterns = [
        r'\bhaan\b', r'\byes\b', r'\bha le li\b', r'\bdawa le li\b', r'\bmedicine le li\b', 
        r'\bdone\b', r'\bhaa\b', r'\ble liya\b', r'\bji haan\b', r'\bhaanji\b'
    ]
    
    # Negative keywords
    negative_patterns = [
        r'\bnahi\b', r'\bno\b', r'\babhi nahi\b', r'\bbaad me\b', r'\bskip\b', r'\bnai\b', r'\bna\b'
    ]
    
    for pattern in positive_patterns:
        if re.search(pattern, transcript):
            return "MEDICATION_TAKEN"
            
    for pattern in negative_patterns:
        if re.search(pattern, transcript):
            return "MEDICATION_NOT_TAKEN"
            
    return "UNCLEAR_RESPONSE"

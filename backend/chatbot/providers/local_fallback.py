"""
Local Emergency Responses.
These are returned when all LLM providers (Gemini, Groq) are down.
They maintain a calm, supportive, and safe tone.
"""

import re
from typing import Dict, Any

EMERGENCY_TEMPLATES = [
    {
        "keywords": ["missed", "forgot", "late"],
        "response": "If you have missed a dose, take it as soon as you remember. However, if it is almost time for your next dose, skip the missed dose and resume your regular schedule. Do not double the dose. Please log this in your MediSync app."
    },
    {
        "keywords": ["when", "time", "schedule"],
        "response": "Please check the 'Pillbox' tab in the MediSync app for your exact medication schedule for today. It has your most up-to-date timings."
    },
    {
        "keywords": ["emergency", "chest pain", "breathing", "bleeding", "severe"],
        "response": "URGENT: If you are experiencing a medical emergency, severe pain, or difficulty breathing, please seek immediate medical attention or call emergency services right away."
    },
    {
        "keywords": ["side effect", "pain", "hurt", "nausea", "dizzy"],
        "response": "If you are experiencing severe or concerning side effects, please contact your doctor or caregiver immediately. Do not stop taking your medication without medical advice unless instructed to do so by a healthcare professional."
    }
]

GENERAL_FALLBACK = "I'm currently running in offline mode and cannot process complex requests. Please check your Pillbox for your schedule, or contact your caregiver or doctor if you need immediate medical advice."

def get_fallback_response(query: str, expect_json: bool = False, json_schema_hint: str = "") -> Any:
    """
    Returns a safe local response based on keyword matching.
    If JSON is expected, returns an empty/safe JSON structure.
    """
    if expect_json:
        # For structured tasks (like OCR/scan), return empty/safe structures
        if "patient_summary" in json_schema_hint: # intelligence schema
            return {
                "patient_summary": {"probable_conditions": [], "symptoms": [], "medical_advice": [], "follow_up": "", "risk_flags": []},
                "medicines": [],
                "tests_recommended": [],
                "doctor_notes": [],
                "patient_memory": {"active_conditions": [], "chronic_conditions": [], "medicine_history": [], "allergies": [], "health_risks": [], "important_notes": []}
            }
        elif "report_text" in json_schema_hint: # smart report schema
            return {
                "report_text": "I am operating in offline mode. Please refer to your dashboard charts for adherence data.",
                "critical_alerts": ["Offline Mode: Full report unavailable"],
                "confidence_score": 0.0
            }
        else:
            return {}

    # Standard conversational fallback
    query_lower = query.lower()
    for template in EMERGENCY_TEMPLATES:
        if any(keyword in query_lower for keyword in template["keywords"]):
            return template["response"]
            
    return GENERAL_FALLBACK

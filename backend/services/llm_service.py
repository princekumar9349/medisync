"""
services/llm_service.py — Compatibility Layer

All Chatbot and LLM logic has been moved to the `backend/chatbot/` domain.
This file temporarily re-exports the required functions to prevent breaking existing routers.
"""

from chatbot.providers.llm_client import call_gemini, call_groq
from chatbot.handlers.chat_handler import chat_with_gemini
from chatbot.handlers.scan_handler import (
    fallback_parse_medicines,
    parse_insights,
    analyze_prescription_deep,
    scan_prescription_with_vision
)
from chatbot.handlers.report_handler import generate_smart_adherence_report
from core.utils.time_utils import normalize_schedule, calculate_expiry

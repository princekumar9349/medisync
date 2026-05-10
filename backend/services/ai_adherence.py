"""
services/ai_adherence.py
Handles Smart AI Missed Dose Logic and Adherence optimization.
"""
from datetime import datetime
import logging
from .llm_service import call_llm
from .emergency import emergency_service

logger = logging.getLogger(__name__)

async def analyze_missed_dose(patient_profile: dict, medicine_name: str, delay_minutes: int) -> dict:
    """
    AI analyzes a missed or delayed dose and provides safe, medical context.
    """
    prompt = f"""
    You are an AI Healthcare Assistant named MediSync.
    The patient {patient_profile.get('name', 'User')} missed their dose of {medicine_name}.
    They are currently late by {delay_minutes} minutes.
    
    Patient Age: {patient_profile.get('age')}
    Patient Conditions: {patient_profile.get('condition')}
    
    Provide a VERY SHORT, caring, and medically safe message (max 2 sentences).
    Do NOT give dangerous medical advice. Add a disclaimer if needed.
    Example: "You missed your morning dose of Amlodipine. Please take it as soon as possible, but do not double dose."
    """
    
    try:
        response = call_llm(prompt)
    except Exception as e:
        logger.error(f"Failed to generate AI missed dose advice: {e}")
        response = f"You missed your dose of {medicine_name}. Please check your prescription instructions."
        
    # Check if caregiver should be alerted
    alert_triggered = False
    if delay_minutes > 120 and patient_profile.get("caregiver_phone"):
        await emergency_service.send_caregiver_alert(
            patient_profile["caregiver_phone"],
            patient_profile.get("caregiver_name", "Caregiver"),
            patient_profile.get("name", "User"),
            f"Missed dose of {medicine_name} by over 2 hours."
        )
        alert_triggered = True

    return {
        "advice": response,
        "caregiver_alerted": alert_triggered
    }

async def generate_smart_schedule(adherence_logs: list, medicines: list) -> str:
    """
    Analyzes historical logs and suggests better reminder times.
    """
    prompt = f"""
    You are MediSync AI. Analyze these adherence logs and suggest better scheduling.
    Medicines: {[m.get('name') for m in medicines]}
    Logs: {adherence_logs[-5:]} # Just passing last 5 logs for context
    
    Provide a 1-sentence friendly suggestion if they are consistently late.
    Example: "You usually take your morning medicine late. Should we move your reminder to 9:30 AM?"
    """
    try:
        return call_llm(prompt)
    except Exception:
        return "Your adherence looks good!"

async def check_drug_interactions(medicines: list) -> str:
    """
    Analyzes a list of medicines and detects risky interactions using the LLM.
    """
    if len(medicines) < 2:
        return "No known interactions."
        
    med_names = [m.get("name") for m in medicines if m.get("name")]
    prompt = f"""
    You are MediSync, a healthcare AI assistant.
    Analyze the following list of medications for potential drug interactions or duplicate therapies:
    {med_names}
    
    If there are any known dangerous interactions, provide a VERY SHORT warning (1-2 sentences).
    If there are no major interactions, return "No known major interactions detected."
    ALWAYS append this disclaimer at the end: "*Disclaimer: Always consult your doctor before making changes to your medication.*"
    """
    try:
        return call_llm(prompt)
    except Exception as e:
        logger.error(f"Failed to check drug interactions: {e}")
        return "Unable to verify interactions at this time. *Disclaimer: Always consult your doctor.*"



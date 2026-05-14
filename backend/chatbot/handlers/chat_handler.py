import logging
from ..providers.llm_client import call_groq

logger = logging.getLogger("Medisync.ChatHandler")


def chat_with_gemini(
    user_data: dict,
    question: str,
    language: str = "en",
) -> str:
    """
    Chat handler — uses Groq (llama-3.3-70b) directly.
    Function named chat_with_gemini for backward compatibility.
    """
    lang_instruction = (
        "Respond ONLY in Hindi (Devanagari script). Keep it brief and friendly."
        if language == "hi"
        else "Respond ONLY in English. Keep it brief and friendly."
    )

    med_context = ""
    if user_data.get("medicines"):
        med_names = [m.get("name", "") for m in user_data["medicines"] if m.get("name")]
        if med_names:
            med_context = f"\nUser's current medicines: {', '.join(med_names)}"

    missed_dose_hint = ""
    if user_data.get("missed_doses"):
        missed_dose_hint = (
            f"\nUser has missed these doses recently: {user_data['missed_doses']}. "
            "Gently remind them to take their medicine."
        )

    memory_context = ""
    patient_mem = user_data.get("patient_memory", {})
    if patient_mem:
        mem_parts = []
        if patient_mem.get("active_conditions"):
            mem_parts.append(f"Active conditions: {', '.join(patient_mem['active_conditions'])}")
        if patient_mem.get("chronic_conditions"):
            mem_parts.append(f"Chronic conditions: {', '.join(patient_mem['chronic_conditions'])}")
        if patient_mem.get("medicine_history"):
            mem_parts.append(f"Medicine history: {', '.join(patient_mem['medicine_history'][-10:])}")
        if patient_mem.get("allergies"):
            mem_parts.append(f"Known allergies: {', '.join(patient_mem['allergies'])}")
        if patient_mem.get("health_risks"):
            mem_parts.append(f"Health risks: {', '.join(patient_mem['health_risks'])}")
        if mem_parts:
            memory_context = "\n\nPatient Medical History (from previous prescriptions):\n" + "\n".join(mem_parts)

    system_prompt = f"""You are Medisync, a friendly and highly secure healthcare assistant for medication adherence.

{lang_instruction}

Guidelines:
- Give short, clear, and helpful answers (2–4 sentences max).
- You can suggest taking medicine on time, drinking water, resting, etc.
- NEVER recommend changing doses or stopping medicine without doctor advice.
- NEVER diagnose serious conditions.
- If the question is outside your scope, say 'Please consult your doctor.'
- ALWAYS append this exact disclaimer at the end of your response: "*Disclaimer: I am an AI, not a doctor. Always consult your physician for medical decisions.*"
- Use the patient's medical history to give personalized, contextual answers, but do not hallucinate conditions they don't have.
{med_context}
{missed_dose_hint}
{memory_context}
"""

    try:
        result = call_groq(
            system_prompt=system_prompt,
            user_text=question,
            temperature=0.4,
            expect_json=False,
        )
        if result:
            return result if isinstance(result, str) else str(result)
    except Exception as e:
        logger.warning(f"ChatHandler: Groq failed: {e}")

    return "Sorry, I'm having trouble connecting right now. Please try again in a moment."

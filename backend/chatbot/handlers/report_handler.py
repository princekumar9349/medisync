import json
from ..gateway.router import AIGateway

def generate_smart_adherence_report(analytics_data: dict, patient_memory: dict) -> dict:
    prompt = """You are a highly intelligent healthcare AI assistant.
Your job is to analyze the patient's adherence analytics and their medical history to generate a smart report.

Analyze the data for:
1. Irregular patterns
2. Most missed critical medicines (especially antibiotics or chronic condition meds)
3. Timing issues
4. Overall risks

Return a JSON with this structure:
{
  "report_text": "A friendly, easy-to-read summary paragraph analyzing their adherence.",
  "critical_alerts": ["Alert 1", "Alert 2"],
  "confidence_score": 0.95
}
"""
    user_text = f"Analytics Data: {json.dumps(analytics_data)}\n\nPatient Memory: {json.dumps(patient_memory)}"
    
    result = AIGateway.generate(
        system_prompt=prompt,
        user_text=user_text,
        temperature=0.3,
        expect_json=True
    )
    
    if result and isinstance(result, dict):
        return result
    return {
        "report_text": "Unable to generate smart report at this time.",
        "critical_alerts": [],
        "confidence_score": 0.0
    }

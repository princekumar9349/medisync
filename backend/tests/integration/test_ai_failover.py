import pytest
from unittest.mock import patch
from chatbot.gateway.router import AIGateway
from chatbot.gateway.circuit_breaker import breaker

def setup_module():
    # Ensure cache is clean
    from chatbot.gateway.cache import cache
    cache._store.clear()
    
    # Reset breakers
    breaker.state["gemini"] = {"failures": 0, "next_retry": 0.0}
    breaker.state["groq"] = {"failures": 0, "next_retry": 0.0}

@patch("chatbot.gateway.router.call_gemini")
@patch("chatbot.gateway.router.call_groq")
def test_ai_gateway_failover_to_local(mock_groq, mock_gemini, mock_mongo):
    """
    Test that if both Gemini and Groq fail, the gateway gracefully falls back
    to the local offline templates.
    """
    mock_gemini.side_effect = Exception("Gemini 429 Too Many Requests")
    mock_groq.side_effect = Exception("Groq Timeout")
    
    res = AIGateway.generate(
        system_prompt="You are a medical assistant.",
        user_text="What is paracetamol?",
        expect_json=False
    )
    
    assert res is not None
    assert "I'm currently running in offline mode" in res or len(res) > 0
    
    # Assert breakers recorded failures
    assert breaker.state["gemini"]["failures"] > 0
    assert breaker.state["groq"]["failures"] > 0

@patch("chatbot.gateway.router.call_gemini")
def test_ai_gateway_circuit_breaker_trips(mock_gemini, mock_mongo):
    """
    Test that consecutive failures trip the circuit breaker.
    """
    mock_gemini.side_effect = Exception("Gemini 500 Internal Error")
    
    # Reset
    breaker.state["gemini"] = {"failures": 0, "next_retry": 0.0}
    
    # Trip it
    for _ in range(5):
        AIGateway.generate(
            system_prompt="You are a medical assistant.",
            user_text="Hello",
            expect_json=False
        )
        
    assert not breaker.is_available("gemini")
    assert breaker.state["gemini"]["failures"] >= breaker.threshold

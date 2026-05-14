import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, call
from core.constants.escalation_levels import EscalationLevel

# Assuming we have a mock for `_execute_notification` and `database`
from escalation.engine import evaluate_dose

@pytest.fixture
def base_time():
    return datetime(2025, 1, 1, 9, 0, 0) # Slot is at 9:00 AM

@patch("escalation.engine._execute_notification")
@patch("escalation.history.EscalationHistory.check_already_triggered")
@patch("escalation.history.EscalationHistory.log_escalation")
def test_escalation_timing_windows(mock_log, mock_check, mock_notify, mock_mongo, base_time):
    """
    Test that the escalation engine correctly classifies doses based on T-15, T-5, T+10 triggers.
    """
    # Setup mocks
    mock_check.return_value = False
    mock_notify.return_value = True
    mock_log.return_value = "507f1f77bcf86cd799439011"
    
    db = mock_mongo["medisync_db"]
    # Provide a dose_logs collection for the engine to check idempotency against "taken"
    # mock_mongo automatically overrides database.py
    
    user_id = "test_user"
    med_name = "aspirin"
    slot = "morning"
    med_id = "aspirin_id"
    
    test_cases = [
        # (offset_minutes, expected_level)
        (-15, EscalationLevel.SAFE),
        (-5, EscalationLevel.DUE_SOON),
        (0, EscalationLevel.CRITICAL),
        (10, EscalationLevel.MISSED),
        (15, EscalationLevel.ESCALATED_SOFT),
        (30, EscalationLevel.ESCALATED_HIGH),
    ]
    
    for offset, expected_level in test_cases:
        now = base_time + timedelta(minutes=offset)
        
        # Call evaluate_dose
        evaluate_dose(
            user_id=user_id,
            med_name=med_name,
            slot=slot,
            med_id=med_id,
            slot_time=base_time,
            now=now,
            is_critical=False,
            caregiver_phone="",
            expo_push_token="",
            fcm_tokens=[]
        )
        
        # Verify the correct level was evaluated and logged
        mock_log.assert_called_with(user_id, med_id, med_name, slot, expected_level, now)

@patch("escalation.engine._execute_notification")
@patch("escalation.history.EscalationHistory.check_already_triggered")
@patch("escalation.history.EscalationHistory.log_escalation")
def test_escalation_critical_skips_soft(mock_log, mock_check, mock_notify, mock_mongo, base_time):
    """
    Test that if a medicine is marked as critical, it skips ESCALATED_SOFT at T+15
    and goes straight to ESCALATED_HIGH.
    """
    mock_check.return_value = False
    mock_log.return_value = "507f1f77bcf86cd799439011"
    
    now = base_time + timedelta(minutes=15)
    
    evaluate_dose(
        user_id="u1", med_name="m1", slot="s1", med_id="i1",
        slot_time=base_time, now=now,
        is_critical=True, # Critical medicine
        caregiver_phone="", expo_push_token="", fcm_tokens=[]
    )
    
    # Should be HIGH instead of SOFT
    mock_log.assert_called_with("u1", "i1", "m1", "s1", EscalationLevel.ESCALATED_HIGH, now)

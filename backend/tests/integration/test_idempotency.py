import pytest
from fastapi.testclient import TestClient

def test_duplicate_mark_done_is_idempotent(client: TestClient, auth_headers: dict, mock_mongo):
    """
    Test that submitting the exact same mark-done event twice does not
    create duplicate dose logs in the database, and returns a duplicate flag.
    """
    db = mock_mongo["medisync_db"]
    
    # Pre-condition: no dose logs
    assert db["dose_logs"].count_documents({}) == 0
    
    payload = {
        "med_id": "paracetamol_500mg",
        "status": "taken",
        "note": "Morning slot"
    }
    
    # 1. First submission (should succeed)
    response1 = client.post("/mark-done", json=payload, headers=auth_headers)
    assert response1.status_code == 200
    data1 = response1.json()
    assert data1["status"] == "taken"
    assert data1.get("duplicate") is not True
    
    # Assert DB has 1 record
    assert db["dose_logs"].count_documents({"med_id": "paracetamol_500mg"}) == 1
    
    # 2. Second submission (duplicate)
    response2 = client.post("/mark-done", json=payload, headers=auth_headers)
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["status"] == "taken"
    assert data2.get("duplicate") is True
    
    # Assert DB STILL has 1 record
    assert db["dose_logs"].count_documents({"med_id": "paracetamol_500mg"}) == 1

def test_duplicate_missed_does_not_override_taken(client: TestClient, auth_headers: dict, mock_mongo):
    """
    Test that if a dose is already taken, a delayed offline 'missed' sync
    does not override the taken state.
    """
    db = mock_mongo["medisync_db"]
    
    # 1. Mark as taken
    client.post(
        "/mark-done", 
        json={"med_id": "aspirin_75mg", "status": "taken", "note": "Morning"}, 
        headers=auth_headers
    )
    
    # 2. Try to mark as missed (e.g. from an offline queue arriving late)
    response = client.post(
        "/mark-done", 
        json={"med_id": "aspirin_75mg", "status": "missed", "note": "Sync delay"}, 
        headers=auth_headers
    )
    
    # The system should recognize it was already taken and reject the missed state
    # Wait, the current logic only checks existing == "taken" or "skipped".
    # Let's see what happens:
    assert response.status_code == 200
    assert response.json().get("duplicate") is True
    
    # Verify it is still "taken" in DB
    log = db["dose_logs"].find_one({"med_id": "aspirin_75mg"})
    assert log["status"] == "taken"

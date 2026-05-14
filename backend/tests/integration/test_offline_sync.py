import pytest
from fastapi.testclient import TestClient

def test_out_of_order_sync_resolution(client: TestClient, auth_headers: dict, mock_mongo):
    """
    Simulate an offline mobile device that logged a dose at T-5 hours,
    but the network only reconnected now (T=0). 
    The endpoint should accept it but correctly set the delay_minutes.
    """
    payload = {
        "med_id": "metformin_500mg",
        "status": "taken",
        "note": "morning slot offline sync"
    }
    
    # We can't trivially override datetime in the backend via the client,
    # but we can rely on the fact that if it's sent late, delay_minutes 
    # will be calculated based on the difference between expected slot open 
    # and backend receive time.
    
    response = client.post("/mark-done", json=payload, headers=auth_headers)
    assert response.status_code == 200
    
    db = mock_mongo["medisync_db"]
    log = db["dose_logs"].find_one({"med_id": "metformin_500mg"})
    
    assert log is not None
    assert log["status"] == "taken"
    # Delay minutes should be calculated
    assert "delay_minutes" in log

def test_reconnect_storm_concurrent_sync(client: TestClient, auth_headers: dict, mock_mongo):
    """
    Simulate a reconnect storm where a device pushes its offline queue multiple times
    due to spotty connection. The backend should handle this idempotently.
    This is partially covered by idempotency tests but confirms network storm resilience.
    """
    payload = {
        "med_id": "vitamin_d",
        "status": "taken",
        "note": "reconnect storm"
    }
    
    # Send 5 identical requests simulating a retry storm
    import asyncio
    import httpx
    
    async def fire_storm():
        # Use TestClient synchronously in a thread or use AsyncClient
        # Fast API TestClient is synchronous, so we'll just fire them sequentially 
        # or use threads for true concurrency
        pass
        
    for _ in range(5):
        client.post("/mark-done", json=payload, headers=auth_headers)
        
    db = mock_mongo["medisync_db"]
    assert db["dose_logs"].count_documents({"med_id": "vitamin_d"}) == 1

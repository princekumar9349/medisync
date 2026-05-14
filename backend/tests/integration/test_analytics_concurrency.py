import pytest
import asyncio
from analytics.snapshots.manager import increment_dose_taken, increment_dose_missed

@pytest.mark.asyncio
async def test_concurrent_dose_increments(mock_mongo):
    """
    Simulate 100 concurrent DOSE_TAKEN events and 50 DOSE_MISSED events.
    Verify that MongoDB $inc safely handles the concurrency without losing increments.
    """
    db = mock_mongo["medisync_db"]
    col = db["analytics_snapshots"]
    user_id = "concurrent_user_123"
    
    assert col.count_documents({"user_id": user_id}) == 0
    
    # Define tasks
    # Note: increment_dose_taken and missed are currently synchronous functions
    # using synchronous PyMongo. To test actual asyncio concurrency against the sync
    # driver, we can use run_in_executor, or just threads, but mongomock might have
    # its own concurrency caveats. Let's use asyncio.to_thread.
    
    tasks = []
    
    # 100 Taken
    for _ in range(100):
        tasks.append(asyncio.to_thread(increment_dose_taken, user_id))
        
    # 50 Missed
    for _ in range(50):
        tasks.append(asyncio.to_thread(increment_dose_missed, user_id))
        
    # Execute all concurrently
    await asyncio.gather(*tasks)
    
    # Assert perfectly consistent state
    snapshot = col.find_one({"user_id": user_id})
    assert snapshot is not None
    
    # 100 taken -> total_7d = +100
    # 50 missed -> total_7d = +50
    # Expected total_7d = 150
    assert snapshot["adherence"]["taken_7d"] == 100
    assert snapshot["risk"]["missed_7d"] == 50
    assert snapshot["adherence"]["total_7d"] == 150

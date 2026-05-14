import pytest
import mongomock
from typing import Generator
from fastapi.testclient import TestClient

# Must set before importing main to prevent it connecting to real DB or checking real config
import os
os.environ["ENV"] = "testing"
os.environ["MONGO_URI"] = "mongodb://localhost:27017"
os.environ["JWT_SECRET_KEY"] = "test_secret_do_not_use_in_prod"
os.environ["GEMINI_API_KEY"] = "fake_gemini_key"
os.environ["GROQ_API_KEY"] = "fake_groq_key"
os.environ["SCHEDULER_ENABLED"] = "false"

from main import app
from db import database

@pytest.fixture(autouse=True)
def mock_mongo(monkeypatch) -> mongomock.MongoClient:
    """
    Globally mocks MongoDB using mongomock for all tests.
    Replaces the internal _db variable in db/database.py.
    """
    client = mongomock.MongoClient()
    db = client["medisync_db"]
    
    # Override the _db variable in the database module
    monkeypatch.setattr(database, "_db", db)
    monkeypatch.setattr(database, "_client", client)
    monkeypatch.setattr(database, "MONGO_AVAILABLE", True)
    
    # Prevent main.py lifespan from overwriting our mock
    monkeypatch.setattr(database, "connect", lambda: None)
    
    # Initialize some required indexes (mongomock supports a subset of index operations)
    db["users"].create_index("email", unique=True)
    db["sessions"].create_index("session_id", unique=True)
    
    return client

@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Provides a FastAPI TestClient."""
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def auth_headers(mock_mongo) -> dict:
    """Provides valid authorization headers for a test user."""
    from services.auth_service import create_access_token
    
    user_id = "507f1f77bcf86cd799439011"
    
    # Insert mock user
    db = mock_mongo["medisync_db"]
    db["users"].insert_one({
        "_id": user_id,
        "email": "test@medisync.app",
        "role": "patient",
        "patient_id": "P-123456"
    })
    
    token = create_access_token({
        "sub": user_id,
        "email": "test@medisync.app",
        "role": "patient"
    })
    
    return {"Authorization": f"Bearer {token}"}

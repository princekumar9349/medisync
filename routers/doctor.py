"""
routers/doctor.py — Doctor Chat endpoints for Medisync.

Routes:
  POST /doctor/message  — Patient sends a message to their doctor  [PROTECTED]
  GET  /doctor/messages — Fetch the full patient-doctor thread      [PROTECTED]

Messages are persisted in the `doctor_chats` MongoDB collection.
Unread count is tracked per-thread for future push-notification hooks.

Smart switching:
  If the patient's message contains any of the SERIOUS_KEYWORDS the system
  automatically appends a 'system' advisory message suggesting they
  contact their doctor urgently.
"""

import logging
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from db import database
from models.schemas import (
    DoctorMessageCreate,
    DoctorMessageOut,
    DoctorThreadResponse,
    TokenData,
)
from services.auth_service import get_current_user

logger = logging.getLogger("Medisync.Doctor")
router = APIRouter(prefix="/doctor", tags=["Doctor Chat"])

# ─── Serious keyword detection ────────────────────────────────────────────────
# If the patient mentions any of these the system appends a safety advisory.
SERIOUS_KEYWORDS = {
    "chest pain", "shortness of breath", "can't breathe", "unconscious",
    "seizure", "stroke", "heart attack", "bleeding", "severe pain",
    "allergic reaction", "swelling", "anaphylaxis", "overdose", "faint",
    "paralysis", "vision loss", "sudden headache", "high fever", "vomiting blood",
    # Hindi equivalents
    "सांस नहीं", "छाती में दर्द", "बेहोश", "दौरा", "तेज़ बुखार",
}


def _is_serious(message: str) -> bool:
    """Return True if any serious keyword appears in the message."""
    m = message.lower()
    return any(kw in m for kw in SERIOUS_KEYWORDS)


def _serialize(doc: dict) -> DoctorMessageOut:
    """Convert a MongoDB document to DoctorMessageOut."""
    return DoctorMessageOut(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        doctor_id=doc.get("doctor_id"),
        message=doc["message"],
        sender=doc["sender"],
        read=doc.get("read", False),
        timestamp=doc["timestamp"],
    )


# ─── POST /doctor/message ─────────────────────────────────────────────────────

@router.post(
    "/message",
    response_model=DoctorThreadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message to your doctor",
)
def send_doctor_message(
    payload: DoctorMessageCreate,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Store a patient message in the doctor-chat thread.

    - Message is persisted in `doctor_chats` collection with sender='user'
    - If the message contains serious health keywords, a safety advisory
      system message is also stored and returned automatically.
    - Returns the full updated thread (most recent 50 messages).

    Request body:
    ```json
    { "message": "I've been having chest pain since this morning." }
    ```
    """
    col = database.get_doctor_chats()
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    now = datetime.utcnow()
    user_doc = {
        "user_id": current_user.user_id,
        "doctor_id": None,           # will be set when a doctor is assigned
        "message": payload.message.strip(),
        "sender": "user",
        "read": False,               # doctor hasn't read it yet
        "timestamp": now,
    }
    col.insert_one(user_doc)
    logger.info(
        f"💬 Doctor message from user {current_user.user_id[:8]}... "
        f"({len(payload.message)} chars)"
    )

    # ── Smart safety advisory ─────────────────────────────────────
    if _is_serious(payload.message):
        advisory_doc = {
            "user_id": current_user.user_id,
            "doctor_id": None,
            "message": (
                "⚠️ Your message mentions a potentially serious symptom. "
                "Please seek immediate medical attention or call your doctor right away. "
                "If it's an emergency, call 112 (India) or your local emergency number."
            ),
            "sender": "system",
            "read": True,
            "timestamp": datetime.utcnow(),
        }
        col.insert_one(advisory_doc)
        logger.info(
            f"⚠️  Serious keyword detected — advisory injected for user "
            f"{current_user.user_id[:8]}..."
        )

    return _build_thread_response(col, current_user.user_id)


# ─── GET /doctor/messages ─────────────────────────────────────────────────────

@router.get(
    "/messages",
    response_model=DoctorThreadResponse,
    summary="Fetch your doctor-chat thread",
)
def get_doctor_messages(
    limit: int = Query(50, ge=1, le=200, description="Max messages to return"),
    skip:  int = Query(0,  ge=0,         description="Pagination offset"),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Retrieve the patient's full doctor-chat thread, sorted oldest-first.

    Also marks all unread messages as read (simulating the patient viewing them).

    Returns:
    ```json
    {
      "messages": [...],
      "unread_count": 0,
      "total": 12
    }
    ```
    """
    col = database.get_doctor_chats()
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    # Count unread BEFORE marking as read (for the badge indicator)
    unread_count = col.count_documents(
        {"user_id": current_user.user_id, "read": False, "sender": {"$ne": "user"}}
    )

    # Mark non-user messages as read (patient is now viewing the thread)
    col.update_many(
        {"user_id": current_user.user_id, "sender": {"$ne": "user"}, "read": False},
        {"$set": {"read": True}},
    )

    return _build_thread_response(col, current_user.user_id, limit=limit, skip=skip)


# ─── Shared helper ────────────────────────────────────────────────────────────

def _build_thread_response(
    col,
    user_id: str,
    limit: int = 50,
    skip: int = 0,
) -> DoctorThreadResponse:
    """Build a DoctorThreadResponse from the DB collection."""
    total = col.count_documents({"user_id": user_id})
    unread = col.count_documents(
        {"user_id": user_id, "read": False, "sender": {"$ne": "user"}}
    )

    docs = list(
        col.find({"user_id": user_id})
        .sort("timestamp", 1)        # oldest first
        .skip(skip)
        .limit(limit)
    )

    return DoctorThreadResponse(
        messages=[_serialize(d) for d in docs],
        unread_count=unread,
        total=total,
    )

# ─── Doctor Endpoints (For Doctor Role) ───────────────────────────────────────

from pydantic import BaseModel
from services.insights_service import analyze_adherence
from datetime import timedelta

class DoctorReplyCreate(BaseModel):
    patient_id: str
    message: str

@router.post("/reply", response_model=DoctorThreadResponse, summary="Doctor sends a message to patient")
def doctor_reply(payload: DoctorReplyCreate, current_user: TokenData = Depends(get_current_user)):
    col = database.get_doctor_chats()
    if col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
        
    doc = {
        "user_id": payload.patient_id,
        "doctor_id": current_user.user_id,
        "message": payload.message.strip(),
        "sender": "doctor",
        "read": False,
        "timestamp": datetime.utcnow()
    }
    col.insert_one(doc)
    return _build_thread_response(col, payload.patient_id)

from models.schemas import PatientListResponse, PatientListOut, PatientProfileOut, AdherenceStats, GraphData, DoctorInboxResponse, DoctorInboxThread

@router.get("/inbox", response_model=DoctorInboxResponse, summary="Get doctor's inbox threads")
def get_doctor_inbox(current_user: TokenData = Depends(get_current_user)):
    chats_col = database.get_doctor_chats()
    users_col = database.get_users()
    if chats_col is None or users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    pipeline = [
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$user_id",
            "latest_message": {"$first": "$message"},
            "timestamp": {"$first": "$timestamp"},
            "unread_count": {
                "$sum": {
                    "$cond": [{"$and": [{"$eq": ["$read", False]}, {"$eq": ["$sender", "user"]}]}, 1, 0]
                }
            }
        }},
        {"$sort": {"timestamp": -1}}
    ]
    
    cursor = chats_col.aggregate(pipeline)
    threads = []
    for doc in cursor:
        patient_id = doc["_id"]
        try:
            user = users_col.find_one({"_id": ObjectId(patient_id)})
        except Exception:
            user = users_col.find_one({"patient_id": patient_id})
            
        if user:
            threads.append(DoctorInboxThread(
                patient_id=str(user["_id"]),
                patient_name=user.get("name", "Unknown"),
                latest_message=doc["latest_message"],
                timestamp=doc["timestamp"],
                unread_count=doc["unread_count"]
            ))
            
    return DoctorInboxResponse(threads=threads)


@router.get("/patients", response_model=PatientListResponse, summary="List all patients for the doctor")
def get_doctor_patients(current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    prescriptions_col = database.get_prescriptions()
    insights_col = database.get_insights()

    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    patients = []
    # Only return patients assigned to this doctor
    cursor = users_col.find({
        "role": {"$in": ["patient", None, ""]}, 
        "assigned_doctors": current_user.user_id
    })
    for user in cursor:
        user_id = str(user["_id"])
        name = user.get("name", "Unknown Patient")
        
        condition = "General"
        if prescriptions_col is not None:
            latest_rx = prescriptions_col.find_one({"user_id": user_id}, sort=[("created_at", -1)])
            if latest_rx and latest_rx.get("possible_condition"):
                condition = latest_rx["possible_condition"]
                
        status = "active"
        if insights_col is not None:
            insight = insights_col.find_one({"user_id": user_id})
            if insight:
                risk = insight.get("risk_level", "low")
                if risk == "high":
                    status = "critical"
                elif risk == "medium":
                    status = "active"
                else:
                    status = "stable"
                    
        patients.append(PatientListOut(
            id=user_id,
            name=name,
            age=user.get("age", 45),
            condition=condition,
            avatar="👤",
            status=status
        ))
        
    return PatientListResponse(patients=patients)

@router.get("/patient/{patient_id}", response_model=PatientProfileOut, summary="Get patient profile")
def get_patient_profile(patient_id: str, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    prescriptions_col = database.get_prescriptions()
    dose_logs_col = database.get_dose_logs()
    chats_col = database.get_doctor_chats()

    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        user = users_col.find_one({"_id": ObjectId(patient_id)})
    except Exception:
        user = None
        
    if not user:
        user = users_col.find_one({"patient_id": patient_id})

    if not user:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Ensure patient_id used downstream is the _id string if we searched by custom ID
    actual_patient_id = str(user["_id"])

    # ── Doctor-Patient Linking ──
    # Assign this patient to the calling doctor if not already assigned
    assigned = user.get("assigned_doctors", [])
    if current_user.user_id not in assigned:
        assigned.append(current_user.user_id)
        users_col.update_one({"_id": user["_id"]}, {"$set": {"assigned_doctors": assigned}})

    name = user.get("name", "Unknown Patient")
    age = user.get("age", 45)
    
    medicines = []
    condition = "General"
    if prescriptions_col is not None:
        latest_rx = prescriptions_col.find_one({"user_id": actual_patient_id}, sort=[("created_at", -1)])
        if latest_rx:
            medicines = latest_rx.get("medicines", [])
            condition = latest_rx.get("possible_condition", condition)

    insight = analyze_adherence(actual_patient_id)
    risk_level = insight.risk_level
    recommendations = insight.recommendations
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = today - timedelta(days=7)
    
    today_taken = 0
    today_missed = 0
    daily_stats = { (today - timedelta(days=i)).strftime("%a"): {"taken": 0, "missed": 0} for i in range(7) }
    time_slots = {"morning": 0, "afternoon": 0, "night": 0}
    missed_vs_taken = {"taken": 0, "missed": 0}
    missed_medicines_today = []
    
    if dose_logs_col is not None:
        logs = list(dose_logs_col.find({"user_id": actual_patient_id, "timestamp": {"$gte": seven_days_ago}}))
        for log in logs:
            ts = log["timestamp"]
            status = log["status"]
            day_str = ts.strftime("%a")
            
            if ts >= today:
                if status == "taken":
                    today_taken += 1
                elif status in ["missed", "skipped"]:
                    today_missed += 1
                    med_name = log.get("medicine_name") or log.get("med_id")
                    if med_name and med_name not in missed_medicines_today:
                        missed_medicines_today.append(med_name)
                    
            if status == "taken":
                missed_vs_taken["taken"] += 1
            elif status in ["missed", "skipped"]:
                missed_vs_taken["missed"] += 1
                
            hour = ts.hour
            if 5 <= hour < 12:
                time_slots["morning"] += (1 if status == "taken" else 0)
            elif 12 <= hour < 17:
                time_slots["afternoon"] += (1 if status == "taken" else 0)
            else:
                time_slots["night"] += (1 if status == "taken" else 0)
                
            if day_str in daily_stats:
                if status == "taken":
                    daily_stats[day_str]["taken"] += 1
                elif status in ["missed", "skipped"]:
                    daily_stats[day_str]["missed"] += 1
                    
    daily_adherence = []
    for i in range(6, -1, -1):
        dt = today - timedelta(days=i)
        day_str = dt.strftime("%a")
        st = daily_stats[day_str]
        tot = st["taken"] + st["missed"]
        pct = (st["taken"] / tot * 100) if tot > 0 else 0
        daily_adherence.append({"day": day_str, "percentage": round(pct)})

    adherence_stats = AdherenceStats(
        today_taken=today_taken,
        today_missed=today_missed,
        weekly_percentage=round(insight.adherence_rate * 100, 1),
        missed_medicines_today=missed_medicines_today
    )
    
    graph_data = GraphData(
        daily_adherence=daily_adherence,
        missed_vs_taken=missed_vs_taken,
        time_slot_adherence=time_slots
    )
    
    # ── Real Symptoms ──
    symptoms = []
    symptoms_col = database.get_symptoms()
    if symptoms_col is not None:
        recent_symptoms = list(symptoms_col.find(
            {"user_id": actual_patient_id},
            sort=[("timestamp", -1)],
            limit=10
        ))
        for sym in recent_symptoms:
            val = sym.get("symptom", "").title()
            if val and val not in symptoms:
                symptoms.append(val)
                
    if not symptoms:
        symptoms = ["None reported"]

    return PatientProfileOut(
        patient_id=actual_patient_id,
        name=name,
        age=age,
        condition=condition,
        medicines=medicines,
        adherence_stats=adherence_stats,
        symptoms=symptoms,
        risk_level=risk_level,
        graph_data=graph_data,
        recommendations=recommendations
    )


# ─── All Patients Search (Doctor browses / searches) ─────────────────────────

@router.get("/all-patients", summary="Search all patients by name or patient_id")
def get_all_patients(
    q: str = Query("", description="Search query — name or patient_id"),
    limit: int = Query(20, ge=1, le=100),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns a list of all patients matching the search query.
    Doctors use this to find and link patients to their panel.
    Searching is case-insensitive and matches name or patient_id.
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    query_filter: dict = {"role": {"$in": ["patient", None, ""]}}

    if q.strip():
        query_filter["$or"] = [
            {"name": {"$regex": q.strip(), "$options": "i"}},
            {"patient_id": {"$regex": q.strip(), "$options": "i"}},
        ]

    cursor = users_col.find(query_filter, {"password_hash": 0}).limit(limit)
    results = []
    for user in cursor:
        results.append({
            "user_id": str(user["_id"]),
            "patient_id": user.get("patient_id", ""),
            "name": user.get("name", "Unknown"),
            "age": user.get("age", 0),
            "gender": user.get("gender", ""),
            "is_assigned": current_user.user_id in user.get("assigned_doctors", []),
        })

    return {"patients": results, "total": len(results), "query": q}


# ─── Doctor Assign Patient ────────────────────────────────────────────────────

class AssignPatientPayload(BaseModel):
    patient_user_id: str


@router.post("/assign-patient", summary="Doctor links a patient to their panel")
def assign_patient(
    payload: AssignPatientPayload,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Add a patient to this doctor's panel by the patient's user_id.
    Sets `assigned_doctors` on the patient document.
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_user_id)})
    except Exception:
        patient = None

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    assigned = patient.get("assigned_doctors", [])
    if current_user.user_id not in assigned:
        assigned.append(current_user.user_id)
        users_col.update_one(
            {"_id": patient["_id"]},
            {"$set": {"assigned_doctors": assigned}}
        )
        logger.info(
            f"🔗 Doctor {current_user.user_id[:8]} assigned patient "
            f"{payload.patient_user_id[:8]}"
        )
        return {"message": "Patient added to your panel successfully.", "assigned": True}
    else:
        return {"message": "Patient already in your panel.", "assigned": True}


# ─── Patient: Register Doctor ─────────────────────────────────────────────────

class RegisterDoctorPayload(BaseModel):
    doctor_patient_id: str   # The P-/D- style ID of the doctor


@router.post("/register-doctor", summary="Patient links themselves to a doctor")
def patient_register_doctor(
    payload: RegisterDoctorPayload,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Patient provides their doctor's unique ID (D-xxxxxx) to link themselves.
    This assigns the current patient to the doctor's panel automatically.
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    doctor = users_col.find_one({
        "patient_id": payload.doctor_patient_id.strip().upper(),
        "role": "doctor"
    })
    if not doctor:
        doctor = users_col.find_one({
            "patient_id": payload.doctor_patient_id.strip(),
            "role": "doctor"
        })

    if not doctor:
        raise HTTPException(
            status_code=404,
            detail="Doctor not found. Please check the Doctor ID."
        )

    doctor_id = str(doctor["_id"])
    patient = users_col.find_one({"_id": ObjectId(current_user.user_id)})
    assigned = patient.get("assigned_doctors", []) if patient else []

    if doctor_id not in assigned:
        assigned.append(doctor_id)
        users_col.update_one(
            {"_id": ObjectId(current_user.user_id)},
            {"$set": {"assigned_doctors": assigned}}
        )

    logger.info(
        f"🔗 Patient {current_user.user_id[:8]} registered "
        f"doctor {doctor_id[:8]}"
    )
    return {
        "message": f"Successfully connected to Dr. {doctor.get('name', 'Unknown')}.",
        "doctor_name": doctor.get("name"),
        "doctor_id": doctor_id,
    }


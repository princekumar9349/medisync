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

    # ── FCM push + inbox notification to patient ──────────────────
    try:
        doctor_name = "Your Doctor"
        users_col = database.get_users()
        if users_col is not None:
            doc_user = users_col.find_one({"_id": ObjectId(current_user.user_id)}, {"name": 1})
            if doc_user:
                doctor_name = doc_user.get("name", "Your Doctor")
        from services.push_service import doctor_message_push
        doctor_message_push(
            patient_user_id=payload.patient_id,
            doctor_name=doctor_name,
            message_preview=payload.message.strip(),
            thread_id=current_user.user_id,
        )
    except Exception as e:
        logger.warning(f"[doctor_reply] Push notification failed (non-fatal): {e}")

    return _build_thread_response(col, payload.patient_id)

class BroadcastAlertPayload(BaseModel):
    message: str
    severity: str = "info"

@router.post("/broadcast", summary="Doctor broadcasts an alert to all assigned patients")
def broadcast_alert(payload: BroadcastAlertPayload, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    chats_col = database.get_doctor_chats()
    if users_col is None or chats_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    assigned_patients = list(users_col.find({"assigned_doctors": current_user.user_id}, {"_id": 1}))
    if not assigned_patients:
        return {"message": "No patients assigned to broadcast"}

    docs = []
    now = datetime.utcnow()
    for p in assigned_patients:
        docs.append({
            "user_id": str(p["_id"]),
            "doctor_id": current_user.user_id,
            "message": payload.message.strip(),
            "sender": "doctor",
            "read": False,
            "timestamp": now
        })
    
    if docs:
        chats_col.insert_many(docs)

    return {"message": f"Alert broadcasted to {len(docs)} patients", "count": len(docs)}

from models.schemas import PatientListResponse, PatientListOut, PatientProfileOut, AdherenceStats, GraphData, DoctorInboxResponse, DoctorInboxThread

@router.get("/inbox", response_model=DoctorInboxResponse, summary="Get doctor's inbox (assigned patients only)")
def get_doctor_inbox(current_user: TokenData = Depends(get_current_user)):
    chats_col = database.get_doctor_chats()
    users_col = database.get_users()
    if chats_col is None or users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # SECURITY FIX: Only fetch threads for patients assigned to this doctor
    assigned_cursor = users_col.find(
        {"assigned_doctors": current_user.user_id},
        {"_id": 1, "name": 1}
    )
    assigned_map = {str(u["_id"]): u.get("name", "Unknown") for u in assigned_cursor}
    if not assigned_map:
        return DoctorInboxResponse(threads=[])

    pipeline = [
        {"$match": {"user_id": {"$in": list(assigned_map.keys())}}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$user_id",
            "latest_message": {"$first": "$message"},
            "latest_sender": {"$first": "$sender"},
            "timestamp": {"$first": "$timestamp"},
            "unread_count": {
                "$sum": {
                    "$cond": [{"$and": [{"$eq": ["$read", False]}, {"$eq": ["$sender", "user"]}]}, 1, 0]
                }
            }
        }},
        {"$sort": {"timestamp": -1}}
    ]

    threads = []
    for doc in chats_col.aggregate(pipeline):
        pid = doc["_id"]
        if pid in assigned_map:
            threads.append(DoctorInboxThread(
                patient_id=pid,
                patient_name=assigned_map[pid],
                latest_message=doc["latest_message"],
                timestamp=doc["timestamp"],
                unread_count=doc["unread_count"]
            ))

    return DoctorInboxResponse(threads=threads)


@router.get("/patient-thread/{patient_id}", response_model=DoctorThreadResponse, summary="Doctor fetches a patient's full chat thread")
def get_patient_thread(patient_id: str, current_user: TokenData = Depends(get_current_user)):
    """
    Returns the full message thread for a specific patient.
    Security: patient must be assigned to the calling doctor.
    """
    chats_col = database.get_doctor_chats()
    users_col  = database.get_users()
    if chats_col is None or users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Security: verify this patient belongs to the doctor
    try:
        patient = users_col.find_one({"_id": ObjectId(patient_id)})
    except Exception:
        patient = None
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized for this patient")

    # Auto-mark patient messages as read when doctor opens the thread
    chats_col.update_many(
        {"user_id": patient_id, "sender": "user", "read": False},
        {"$set": {"read": True, "seen_at": datetime.utcnow()}}
    )

    return _build_thread_response(chats_col, patient_id)


class MarkSeenPayload(BaseModel):
    patient_id: str

@router.post("/mark-seen", summary="Doctor marks all messages from a patient as read")
def mark_messages_seen(payload: MarkSeenPayload, current_user: TokenData = Depends(get_current_user)):
    """Mark all unread patient messages in a thread as seen. Called when doctor opens chat."""
    chats_col = database.get_doctor_chats()
    users_col  = database.get_users()
    if chats_col is None or users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_id)})
    except Exception:
        patient = None
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    result = chats_col.update_many(
        {"user_id": payload.patient_id, "sender": "user", "read": False},
        {"$set": {"read": True, "seen_at": datetime.utcnow()}}
    )
    return {"marked_seen": result.modified_count}


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


# ─── Doctor Dashboard Stats ───────────────────────────────────────────────────

@router.get("/dashboard", summary="Get doctor dashboard summary stats")
def get_doctor_dashboard(current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    chats_col = database.get_doctor_chats()
    dose_logs_col = database.get_dose_logs()
    insights_col = database.get_insights()
    symptoms_col = database.get_symptoms()

    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    from datetime import timedelta
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    assigned_patients = list(users_col.find(
        {"assigned_doctors": current_user.user_id},
        {"_id": 1, "name": 1}
    ))
    total_patients = len(assigned_patients)
    assigned_ids = [str(p["_id"]) for p in assigned_patients]

    critical_count = 0
    if insights_col is not None:
        critical_count = insights_col.count_documents({
            "user_id": {"$in": assigned_ids},
            "risk_level": "high"
        })

    unread_messages = 0
    if chats_col is not None:
        unread_messages = chats_col.count_documents({
            "user_id": {"$in": assigned_ids},
            "sender": "user",
            "read": False
        })

    # ── Missed Today: IST-aware today boundary (UTC+5:30 = 330 min offset) ──
    from datetime import timedelta as td
    IST_OFFSET = td(hours=5, minutes=30)
    now_ist = datetime.utcnow() + IST_OFFSET
    today_ist_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0) - IST_OFFSET  # back to UTC

    missed_today = 0
    if dose_logs_col is not None and assigned_ids:
        missed_today = dose_logs_col.count_documents({
            "user_id": {"$in": assigned_ids},
            "status": "missed",   # strictly missed only, not skipped
            "timestamp": {"$gte": today_ist_start}
        })

    # ── High risk patients ──────────────────────────────────────────────────
    high_risk_count = 0
    if insights_col is not None and assigned_ids:
        high_risk_count = insights_col.count_documents({
            "user_id": {"$in": assigned_ids},
            "risk_level": "high"
        })

    recent_alerts = []
    if symptoms_col is not None:
        sym_cursor = symptoms_col.find(
            {"user_id": {"$in": assigned_ids}, "severity": {"$gte": 4}},
            sort=[("timestamp", -1)], limit=5
        )
        for s in sym_cursor:
            pid = s.get("user_id", "")
            pname = next((p["name"] for p in assigned_patients if str(p["_id"]) == pid), "Unknown")
            recent_alerts.append({
                "patient_id": pid,
                "patient_name": pname,
                "symptom": s.get("symptom", ""),
                "severity": s.get("severity", 3),
                "timestamp": s.get("timestamp", datetime.utcnow()).isoformat()
            })

    weekly_adherence = 0.0
    if dose_logs_col is not None and assigned_ids:
        week_ago = today - timedelta(days=7)
        logs = list(dose_logs_col.find({
            "user_id": {"$in": assigned_ids},
            "timestamp": {"$gte": week_ago}
        }))
        if logs:
            taken = sum(1 for l in logs if l.get("status") == "taken")
            weekly_adherence = round((taken / len(logs)) * 100, 1)

    activity_feed = []
    if chats_col is not None:
        recent_msgs = list(chats_col.find(
            {"user_id": {"$in": assigned_ids}, "sender": "user"},
            sort=[("timestamp", -1)], limit=5
        ))
        for m in recent_msgs:
            pid = m.get("user_id", "")
            pname = next((p["name"] for p in assigned_patients if str(p["_id"]) == pid), "Unknown")
            activity_feed.append({
                "patient_id": pid,
                "patient_name": pname,
                "type": "message",
                "content": m.get("message", "")[:80],
                "timestamp": m.get("timestamp", datetime.utcnow()).isoformat()
            })

    return {
        "total_patients": total_patients,
        "critical_patients": critical_count,
        "high_risk_patients": high_risk_count,
        "unread_messages": unread_messages,
        "missed_doses_today": missed_today,
        "weekly_adherence": weekly_adherence,
        "recent_alerts": recent_alerts,
        "activity_feed": activity_feed,
        "_meta": {
            "scope": "assigned_patients_only",
            "patient_count": total_patients,
            "ist_today_boundary": today_ist_start.isoformat()
        }
    }


# ─── Medicine Management ──────────────────────────────────────────────────────

class AddMedicinePayload(BaseModel):
    patient_id: str
    name: str
    dosage: str = ""
    timing: str = ""
    morning: bool = False
    afternoon: bool = False
    night: bool = False
    duration: str = ""
    instructions: str = ""
    is_critical: bool = False

class EditMedicinePayload(BaseModel):
    patient_id: str
    medicine_index: int
    name: str
    dosage: str = ""
    timing: str = ""
    morning: bool = False
    afternoon: bool = False
    night: bool = False
    duration: str = ""
    instructions: str = ""
    is_critical: bool = False

class DeleteMedicinePayload(BaseModel):
    patient_id: str
    medicine_index: int

@router.post("/medicine/add", summary="Doctor adds medicine to patient prescription")
def add_medicine(payload: AddMedicinePayload, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    prescriptions_col = database.get_prescriptions()
    if users_col is None or prescriptions_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Verify doctor-patient assignment
    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_id)})
    except Exception:
        patient = None
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized for this patient")

    med = {
        "name": payload.name, "dosage": payload.dosage, "timing": payload.timing,
        "morning": payload.morning, "afternoon": payload.afternoon, "night": payload.night,
        "duration": payload.duration, "instructions": payload.instructions,
        "is_critical": payload.is_critical, "added_by_doctor": current_user.user_id,
        "added_at": datetime.utcnow().isoformat()
    }

    rx = prescriptions_col.find_one({"user_id": payload.patient_id}, sort=[("created_at", -1)])
    if rx:
        prescriptions_col.update_one({"_id": rx["_id"]}, {"$push": {"medicines": med}})
    else:
        prescriptions_col.insert_one({
            "user_id": payload.patient_id, "medicines": [med],
            "possible_condition": "Doctor Added", "created_at": datetime.utcnow()
        })

    _log_audit(current_user.user_id, payload.patient_id, "add_medicine", f"Added {payload.name}")
    return {"message": "Medicine added successfully"}


@router.put("/medicine/edit", summary="Doctor edits medicine in patient prescription")
def edit_medicine(payload: EditMedicinePayload, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    prescriptions_col = database.get_prescriptions()
    if users_col is None or prescriptions_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_id)})
    except Exception:
        patient = None
    if not patient or current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")

    rx = prescriptions_col.find_one({"user_id": payload.patient_id}, sort=[("created_at", -1)])
    if not rx:
        raise HTTPException(status_code=404, detail="No prescription found")

    meds = rx.get("medicines", [])
    if payload.medicine_index >= len(meds):
        raise HTTPException(status_code=400, detail="Invalid medicine index")

    meds[payload.medicine_index] = {
        "name": payload.name, "dosage": payload.dosage, "timing": payload.timing,
        "morning": payload.morning, "afternoon": payload.afternoon, "night": payload.night,
        "duration": payload.duration, "instructions": payload.instructions,
        "is_critical": payload.is_critical, "edited_by_doctor": current_user.user_id,
        "edited_at": datetime.utcnow().isoformat()
    }
    prescriptions_col.update_one({"_id": rx["_id"]}, {"$set": {"medicines": meds}})
    _log_audit(current_user.user_id, payload.patient_id, "edit_medicine", f"Edited {payload.name}")
    return {"message": "Medicine updated successfully"}


@router.delete("/medicine/delete", summary="Doctor removes medicine from patient prescription")
def delete_medicine(payload: DeleteMedicinePayload, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    prescriptions_col = database.get_prescriptions()
    if users_col is None or prescriptions_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_id)})
    except Exception:
        patient = None
    if not patient or current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")

    rx = prescriptions_col.find_one({"user_id": payload.patient_id}, sort=[("created_at", -1)])
    if not rx:
        raise HTTPException(status_code=404, detail="No prescription found")

    meds = rx.get("medicines", [])
    if payload.medicine_index >= len(meds):
        raise HTTPException(status_code=400, detail="Invalid medicine index")

    removed = meds.pop(payload.medicine_index)
    prescriptions_col.update_one({"_id": rx["_id"]}, {"$set": {"medicines": meds}})
    _log_audit(current_user.user_id, payload.patient_id, "delete_medicine", f"Removed {removed.get('name','?')}")
    return {"message": "Medicine removed successfully"}


# ─── Clinical Notes ───────────────────────────────────────────────────────────

class ClinicalNotePayload(BaseModel):
    patient_id: str
    note: str
    is_private: bool = True

@router.post("/notes/add", summary="Doctor adds a private clinical note")
def add_clinical_note(payload: ClinicalNotePayload, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_id)})
    except Exception:
        patient = None
    if not patient or current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")

    notes_col = database._db["clinical_notes"] if database._db is not None else None
    if notes_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    notes_col.insert_one({
        "doctor_id": current_user.user_id,
        "patient_id": payload.patient_id,
        "note": payload.note,
        "is_private": payload.is_private,
        "timestamp": datetime.utcnow()
    })
    _log_audit(current_user.user_id, payload.patient_id, "add_note", "Added clinical note")
    return {"message": "Note saved"}

@router.get("/notes/{patient_id}", summary="Doctor fetches clinical notes for a patient")
def get_clinical_notes(patient_id: str, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        patient = users_col.find_one({"_id": ObjectId(patient_id)})
    except Exception:
        patient = None
    if not patient or current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")

    notes_col = database._db["clinical_notes"] if database._db is not None else None
    notes = []
    if notes_col is not None:
        cursor = notes_col.find(
            {"doctor_id": current_user.user_id, "patient_id": patient_id},
            sort=[("timestamp", -1)]
        )
        for n in cursor:
            notes.append({
                "id": str(n["_id"]),
                "note": n.get("note", ""),
                "is_private": n.get("is_private", True),
                "timestamp": n.get("timestamp", datetime.utcnow()).isoformat()
            })
    return {"notes": notes}


# ─── Follow-up Reminders ──────────────────────────────────────────────────────

class FollowUpPayload(BaseModel):
    patient_id: str
    note: str
    follow_up_date: str  # ISO format date string

@router.post("/followup/add", summary="Doctor schedules a follow-up for a patient")
def add_followup(payload: FollowUpPayload, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        patient = users_col.find_one({"_id": ObjectId(payload.patient_id)})
    except Exception:
        patient = None
    if not patient or current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")

    followups_col = database._db["followups"] if database._db is not None else None
    if followups_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    followups_col.insert_one({
        "doctor_id": current_user.user_id,
        "patient_id": payload.patient_id,
        "patient_name": patient.get("name", "Unknown"),
        "note": payload.note,
        "follow_up_date": payload.follow_up_date,
        "status": "pending",
        "created_at": datetime.utcnow()
    })
    return {"message": "Follow-up scheduled"}

@router.get("/followups", summary="Doctor fetches all pending follow-ups")
def get_followups(current_user: TokenData = Depends(get_current_user)):
    followups_col = database._db["followups"] if database._db is not None else None
    if followups_col is None:
        return {"followups": []}

    cursor = followups_col.find(
        {"doctor_id": current_user.user_id, "status": "pending"},
        sort=[("follow_up_date", 1)]
    )
    results = []
    for f in cursor:
        results.append({
            "id": str(f["_id"]),
            "patient_id": f.get("patient_id", ""),
            "patient_name": f.get("patient_name", "Unknown"),
            "note": f.get("note", ""),
            "follow_up_date": f.get("follow_up_date", ""),
            "status": f.get("status", "pending"),
        })
    return {"followups": results}


# ─── Doctor Profile Update ────────────────────────────────────────────────────

class DoctorProfileUpdate(BaseModel):
    specialization: Optional[str] = None
    clinic_name: Optional[str] = None
    clinic_address: Optional[str] = None
    availability_status: Optional[str] = None  # available|busy|emergency_only|offline
    emergency_available: Optional[bool] = None
    consultation_timings: Optional[str] = None

@router.put("/profile", summary="Doctor updates their profile and availability")
def update_doctor_profile(payload: DoctorProfileUpdate, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    update_data = {k: v for k, v in payload.dict().items() if v is not None}
    if not update_data:
        return {"message": "No changes provided"}

    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": update_data}
    )
    return {"message": "Profile updated successfully"}

@router.get("/profile", summary="Doctor fetches their own profile")
def get_doctor_profile(current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        doc = users_col.find_one({"_id": ObjectId(current_user.user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")

    return {
        "name": doc.get("name", ""),
        "email": doc.get("email", ""),
        "patient_id": doc.get("patient_id", ""),
        "specialization": doc.get("specialization", "General Physician"),
        "clinic_name": doc.get("clinic_name", ""),
        "clinic_address": doc.get("clinic_address", ""),
        "availability_status": doc.get("availability_status", "available"),
        "emergency_available": doc.get("emergency_available", True),
        "consultation_timings": doc.get("consultation_timings", "9 AM - 5 PM"),
        "total_patients": 0,
    }


# ─── Audit Trail ─────────────────────────────────────────────────────────────

def _log_audit(doctor_id: str, patient_id: str, action: str, detail: str = ""):
    try:
        audit_col = database._db["audit_logs"]
        audit_col.insert_one({
            "doctor_id": doctor_id,
            "patient_id": patient_id,
            "action": action,
            "detail": detail,
            "timestamp": datetime.utcnow()
        })
    except Exception:
        pass

@router.get("/audit/{patient_id}", summary="Get audit trail for a patient")
def get_audit_trail(patient_id: str, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        return {"logs": []}

    try:
        patient = users_col.find_one({"_id": ObjectId(patient_id)})
    except Exception:
        patient = None
    if not patient or current_user.user_id not in patient.get("assigned_doctors", []):
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        audit_col = database._db["audit_logs"]
        cursor = audit_col.find(
            {"patient_id": patient_id},
            sort=[("timestamp", -1)], limit=50
        )
        logs = [{"action": l.get("action"), "detail": l.get("detail"), "timestamp": l.get("timestamp", datetime.utcnow()).isoformat()} for l in cursor]
    except Exception:
        logs = []

    return {"logs": logs}


# ─── Emergency SOS System ─────────────────────────────────────────────────────
# Routes:
#   POST /doctor/emergency/trigger  — Patient triggers SOS
#   GET  /doctor/emergency/status   — Patient polls emergency state
#   PUT  /doctor/emergency/accept   — Doctor accepts emergency
#   PUT  /doctor/emergency/resolve  — Doctor resolves emergency
#   GET  /doctor/emergency/active   — Doctor sees all pending emergencies

from models.schemas import EmergencyCreate, EmergencyOut, EmergencyStatusResponse, EmergencyResolvePayload

def _serialize_emergency(doc: dict) -> EmergencyOut:
    return EmergencyOut(
        emergency_id=str(doc["_id"]),
        user_id=doc["user_id"],
        status=doc.get("status", "pending"),
        note=doc.get("note"),
        location=doc.get("location"),
        responder_id=doc.get("responder_id"),
        responder_name=doc.get("responder_name"),
        created_at=doc["created_at"],
        updated_at=doc.get("updated_at", doc["created_at"]),
        resolved_at=doc.get("resolved_at"),
        retry_count=doc.get("retry_count", 0),
    )


@router.post("/emergency/trigger", summary="Patient triggers SOS emergency")
def trigger_emergency(
    payload: EmergencyCreate,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Patient triggers an emergency SOS. If an active emergency already exists
    for this patient, increments the retry_count and returns the existing record
    to prevent duplicate emergencies.
    """
    emergencies_col = database.get_emergencies()
    users_col = database.get_users()
    if emergencies_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    now = datetime.utcnow()

    # Check for existing active emergency (prevent duplicates)
    existing = emergencies_col.find_one({
        "user_id": current_user.user_id,
        "status": {"$in": ["pending", "accepted"]},
    })
    if existing:
        # Increment retry counter and update timestamp
        emergencies_col.update_one(
            {"_id": existing["_id"]},
            {"$inc": {"retry_count": 1}, "$set": {"updated_at": now}},
        )
        existing["retry_count"] = existing.get("retry_count", 0) + 1
        existing["updated_at"] = now
        logger.info(f"🆘 Emergency retry #{existing['retry_count']} for {current_user.user_id[:8]}")
        return {
            "message": "Emergency already active — escalated.",
            "emergency": _serialize_emergency(existing),
            "is_duplicate": True,
        }

    # Create new emergency record
    patient_name = "Unknown Patient"
    if users_col:
        try:
            u = users_col.find_one({"_id": ObjectId(current_user.user_id)}, {"name": 1})
            if u:
                patient_name = u.get("name", "Unknown Patient")
        except Exception:
            pass

    doc = {
        "user_id":      current_user.user_id,
        "patient_name": patient_name,
        "status":       "pending",
        "note":         payload.note,
        "location":     payload.location,
        "responder_id":   None,
        "responder_name": None,
        "created_at":   now,
        "updated_at":   now,
        "resolved_at":  None,
        "retry_count":  0,
    }
    result = emergencies_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    emergency_id = str(result.inserted_id)

    logger.info(f"🆘 Emergency triggered by {patient_name} ({current_user.user_id[:8]})")

    # ── Push MAX-priority alert to assigned doctors ────────────────
    try:
        from services.push_service import emergency_push
        if users_col:
            patient_doc = users_col.find_one(
                {"_id": ObjectId(current_user.user_id)},
                {"assigned_doctors": 1},
            )
            assigned = patient_doc.get("assigned_doctors", []) if patient_doc else []
            for doctor_uid in assigned:
                emergency_push(
                    doctor_user_id=doctor_uid,
                    patient_name=patient_name,
                    emergency_id=emergency_id,
                    note=payload.note or "",
                )
        if not assigned:
            logger.warning(f"[Emergency] No assigned doctors to push for patient {current_user.user_id[:8]}")
    except Exception as e:
        logger.warning(f"[Emergency] FCM push failed (non-fatal): {e}")

    return {
        "message": "Emergency SOS sent. Help is on the way.",
        "emergency": _serialize_emergency(doc),
        "is_duplicate": False,
    }


@router.get("/emergency/status", response_model=EmergencyStatusResponse, summary="Patient polls their emergency status")
def get_emergency_status(current_user: TokenData = Depends(get_current_user)):
    """Returns the patient's current active emergency if any."""
    emergencies_col = database.get_emergencies()
    if emergencies_col is None:
        return EmergencyStatusResponse(has_active=False)

    doc = emergencies_col.find_one(
        {"user_id": current_user.user_id, "status": {"$in": ["pending", "accepted"]}},
        sort=[("created_at", -1)],
    )
    if not doc:
        return EmergencyStatusResponse(has_active=False)

    return EmergencyStatusResponse(has_active=True, emergency=_serialize_emergency(doc))


@router.put("/emergency/accept", summary="Doctor accepts an emergency")
def accept_emergency(
    emergency_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """Doctor marks emergency as accepted. Sets responder info."""
    emergencies_col = database.get_emergencies()
    users_col = database.get_users()
    if emergencies_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    try:
        doc = emergencies_col.find_one({"_id": ObjectId(emergency_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid emergency ID.")

    if not doc:
        raise HTTPException(status_code=404, detail="Emergency not found.")
    if doc["status"] not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Emergency already in state: {doc['status']}.")

    responder_name = "Doctor"
    if users_col:
        try:
            dr = users_col.find_one({"_id": ObjectId(current_user.user_id)}, {"name": 1})
            if dr:
                responder_name = dr.get("name", "Doctor")
        except Exception:
            pass

    now = datetime.utcnow()
    emergencies_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status":         "accepted",
            "responder_id":   current_user.user_id,
            "responder_name": responder_name,
            "updated_at":     now,
        }},
    )
    logger.info(f"✅ Emergency {emergency_id[:8]} accepted by Dr. {responder_name}")
    return {"message": "Emergency accepted.", "responder": responder_name}


@router.put("/emergency/resolve", summary="Doctor resolves an emergency")
def resolve_emergency(
    payload: EmergencyResolvePayload,
    current_user: TokenData = Depends(get_current_user),
):
    """Doctor marks emergency as resolved."""
    emergencies_col = database.get_emergencies()
    if emergencies_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    try:
        doc = emergencies_col.find_one({"_id": ObjectId(payload.emergency_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid emergency ID.")

    if not doc:
        raise HTTPException(status_code=404, detail="Emergency not found.")

    now = datetime.utcnow()
    emergencies_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status":      "resolved",
            "resolved_at": now,
            "updated_at":  now,
            "resolve_note": payload.note,
        }},
    )
    logger.info(f"✅ Emergency {payload.emergency_id[:8]} resolved")
    return {"message": "Emergency resolved."}


@router.get("/emergency/active", summary="Doctor sees all pending/accepted emergencies for their patients")
def get_active_emergencies(current_user: TokenData = Depends(get_current_user)):
    """Returns all active emergencies for patients assigned to this doctor."""
    emergencies_col = database.get_emergencies()
    users_col = database.get_users()
    if emergencies_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    assigned_ids = []
    if users_col:
        cursor = users_col.find({"assigned_doctors": current_user.user_id}, {"_id": 1})
        assigned_ids = [str(u["_id"]) for u in cursor]

    if not assigned_ids:
        return {"emergencies": []}

    docs = list(emergencies_col.find(
        {"user_id": {"$in": assigned_ids}, "status": {"$in": ["pending", "accepted"]}},
        sort=[("created_at", -1)],
    ))
    return {"emergencies": [_serialize_emergency(d) for d in docs]}

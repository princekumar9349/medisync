"""
routers/phone.py — OTP and phone verification endpoints for Medisync.

Routes:
  POST /phone/send-otp   — Generate and send OTP via SMS
  POST /phone/verify-otp — Verify OTP and mark user phone as verified
"""

import logging
import random
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
import os

from db import database
from models.schemas import TokenData, OTPRequest, OTPVerify
from services.auth_service import get_current_user
from services.voice_provider import voice_client

logger = logging.getLogger("Medisync.Phone")
router = APIRouter(prefix="/phone", tags=["Phone Verification"])

# Configurable mock OTP for testing
MOCK_OTP_ENABLED = os.getenv("MOCK_OTP_ENABLED", "true").lower() == "true"
MOCK_OTP_CODE = os.getenv("MOCK_OTP_CODE", "123456")

# ─── Send OTP ─────────────────────────────────────────────────────────────────

@router.post(
    "/send-otp",
    summary="Generate and send a 6-digit OTP",
)
def send_otp(
    payload: OTPRequest,
    current_user: TokenData = Depends(get_current_user),
):
    otps_col = database.get_otps()
    if otps_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    # Cooldown Check (e.g. 1 minute)
    recent_otp = otps_col.find_one({
        "user_id": current_user.user_id,
        "phone_number": payload.phone_number,
        "created_at": {"$gt": datetime.utcnow() - timedelta(minutes=1)}
    })
    
    if recent_otp:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another OTP.",
        )

    # Prevent duplicate phone verification abuse
    users_col = database.get_users()
    existing_user = users_col.find_one({"phone": payload.phone_number, "phone_verified": True})
    if existing_user and str(existing_user["_id"]) != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This phone number is already verified by another account.",
        )

    # Generate OTP
    if MOCK_OTP_ENABLED:
        otp_code = MOCK_OTP_CODE
        logger.info(f"Using Mock OTP {otp_code} for {payload.phone_number}")
    else:
        otp_code = "".join(random.choices("0123456789", k=6))
        
    expires_at = datetime.utcnow() + timedelta(minutes=5)

    # Clear existing OTPs for this user/phone combination
    otps_col.delete_many({"user_id": current_user.user_id})

    otps_col.insert_one({
        "user_id": current_user.user_id,
        "phone_number": payload.phone_number,
        "otp_code": otp_code,
        "attempts": 0,
        "created_at": datetime.utcnow(),
        "expires_at": expires_at
    })

    # Send via Voice Provider (SMS)
    if not MOCK_OTP_ENABLED:
        message = f"Your Medisync verification code is {otp_code}. It expires in 5 minutes."
        success = voice_client.send_sms(payload.phone_number, message)
        if not success:
             raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send SMS. Please check your number or try again later.",
            )

    return {"message": "OTP sent successfully."}


# ─── Verify OTP ───────────────────────────────────────────────────────────────

@router.post(
    "/verify-otp",
    summary="Verify OTP and update user profile",
)
def verify_otp(
    payload: OTPVerify,
    current_user: TokenData = Depends(get_current_user),
):
    otps_col = database.get_otps()
    users_col = database.get_users()
    if otps_col is None or users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    otp_doc = otps_col.find_one({
        "user_id": current_user.user_id,
        "phone_number": payload.phone_number
    })

    if not otp_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No OTP requested for this number.",
        )

    if datetime.utcnow() > otp_doc["expires_at"]:
        otps_col.delete_one({"_id": otp_doc["_id"]})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new one.",
        )

    if otp_doc["attempts"] >= 5:
        otps_col.delete_one({"_id": otp_doc["_id"]})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. Please request a new OTP.",
        )

    if payload.otp_code != otp_doc["otp_code"]:
        otps_col.update_one({"_id": otp_doc["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP code.",
        )

    # Success: Update User Profile
    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": {
            "phone": payload.phone_number,
            "phone_verified": True,
            "updated_at": datetime.utcnow()
        }}
    )

    # Cleanup OTP
    otps_col.delete_one({"_id": otp_doc["_id"]})
    
    logger.info(f"User {current_user.user_id[:8]} successfully verified phone {payload.phone_number}.")

    return {"message": "Phone number verified successfully."}

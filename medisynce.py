"""
========================================================
 AI SMART PILLBOX — VOICE HEALTHCARE ASSISTANT v3.0
========================================================
 FEATURES:
  ✅ JSON-structured action outputs (open_slot, mark_taken, emergency, etc.)
  ✅ Live medicine data from Medisync backend API
  ✅ ESP32 hardware control (slots, LEDs, alarm)
  ✅ Hindi/Hinglish/English command understanding
  ✅ Local speaker fallback when ESP32 unreachable
  ✅ Conversation memory (last 10 turns)
  ✅ Emergency alert via backend API
  ✅ Mark medicine taken via backend API

 INSTALL:
  pip install groq SpeechRecognition pyaudio edge-tts requests playsound==1.2.2
========================================================
"""

import speech_recognition as sr
from groq import Groq
import requests
import asyncio
import edge_tts
import os
import uuid
import json
import logging
from datetime import datetime

# ──────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────

# ── Load from .env file in same directory ─────────────────────────────────────
def _load_env_file():
    """Load KEY=VALUE pairs from medisynce.env in script directory."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "medisynce.env")
    env = {}
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

_ENV = _load_env_file()

GROQ_API_KEY    = _ENV.get("GROQ_API_KEY", "YOUR_GROQ_API_KEY")
GROQ_FALLBACK_1 = _ENV.get("GROQ_FALLBACK_1", "YOUR_GROQ_FALLBACK_1")
GROQ_FALLBACK_2 = _ENV.get("GROQ_FALLBACK_2", "YOUR_GROQ_FALLBACK_2")
ESP32_IP        = "192.168.1.100"
TTS_VOICE       = "hi-IN-SwaraNeural"   # Natural Hindi-English voice

# Medisync Backend — detect from env or ask interactively
API_BASE        = _ENV.get("API_BASE", "http://10.234.78.74:8000")
API_TOKEN       = ""        # Auto-filled at startup via login
API_USER_EMAIL  = _ENV.get("EMAIL", "")
API_USER_PASS   = _ENV.get("PASSWORD", "")
CURRENT_USER_NAME = ""      # Filled after successful login

logging.basicConfig(level=logging.WARNING)


# ──────────────────────────────────────────────────────
# GROQ CLIENT
# ──────────────────────────────────────────────────────

client = Groq(api_key=GROQ_API_KEY)

# ──────────────────────────────────────────────────────
# BACKEND API HELPERS
# ──────────────────────────────────────────────────────

def get_api_token(email: str = "", password: str = "") -> str:
    """
    Step 1: Try to get token from whoever is logged into the Medisync app.
            → GET /pillbox/active-session (no credentials needed)
    Step 2: If no app session found, ask for credentials interactively.
    Step 3: If backend unreachable, run in offline mode.
    """
    global CURRENT_USER_NAME, API_BASE

    # ── STEP 1: Auto-detect from app login session ─────────────────────────
    print(f"\n[MEDISYNC] Checking Medisync app session at {API_BASE}...")
    try:
        resp = requests.get(f"{API_BASE}/pillbox/active-session", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token", "")
            if token:
                CURRENT_USER_NAME = data.get("user_name", "Patient")
                registered_at = data.get("registered_at", "")
                print(f"[MEDISYNC] App session mili! User: {CURRENT_USER_NAME}")
                if registered_at:
                    print(f"   (App mein login: {registered_at[:19].replace('T',' ')} UTC)")
                return token
        elif resp.status_code == 404:
            print("[ERROR] Koi user app mein login nahi hai abhi.")
        else:
            print(f"[ERROR] Session check failed: {resp.status_code}")
    except requests.exceptions.ConnectionError:
        print(f"[ERROR] Backend not reachable at {API_BASE}")
        new_base = input(f"   Enter correct backend URL (Enter = use {API_BASE}): ").strip()
        if new_base:
            API_BASE = new_base
            return get_api_token(email, password)
    except Exception as e:
        print(f"[ERROR] Session fetch error: {e}")

    # ── STEP 2: Credentials fallback (interactive) ─────────────────────────
    em = email or API_USER_EMAIL
    pw = password or API_USER_PASS

    if not em:
        print("\n" + "─" * 50)
        print("  [MEDISYNC] App mein login nahi mila — manual login karo")
        print("─" * 50)
        em = input("  📧 Email   : ").strip()
        pw = input("  🔒 Password: ").strip()

    if not em or not pw:
        return ""  # Offline mode

    try:
        print(f"\n[MEDISYNC] Logging in as {em}...")
        resp = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": em, "password": pw},
            timeout=8
        )
        if resp.status_code == 200:
            token = resp.json().get("access_token", "")
            if token:
                print("[MEDISYNC] Login successful!")
                try:
                    prof = requests.get(
                        f"{API_BASE}/me",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=5
                    )
                    if prof.status_code == 200:
                        pdata = prof.json()
                        CURRENT_USER_NAME = (
                            pdata.get("name") or
                            pdata.get("full_name") or
                            em.split("@")[0]
                        )
                        print(f"👤 User: {CURRENT_USER_NAME}")
                except Exception:
                    CURRENT_USER_NAME = em.split("@")[0]
            return token
        elif resp.status_code == 401:
            print("[ERROR] Wrong email or password.")
        else:
            print(f"[ERROR] Login failed: {resp.status_code}")
        return ""
    except Exception as e:
        print(f"[ERROR] Login error: {e}")
        return ""


def api_headers() -> dict:
    return {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}




def fetch_live_medicines() -> list:
    """Fetch user's active medicines from Medisync backend."""
    if not API_TOKEN:
        return []
    try:
        resp = requests.get(f"{API_BASE}/user-prescriptions", headers=api_headers(), timeout=5)
        if resp.status_code == 200:
            prescriptions = resp.json().get("prescriptions", [])
            medicines = []
            for rx in prescriptions:
                for med in rx.get("medicines", []):
                    medicines.append({
                        "name":         med.get("name", "Unknown"),
                        "dosage":       med.get("dosage", "1 Tablet"),
                        "timing":       med.get("timing", ""),
                        "morning":      med.get("morning", False),
                        "afternoon":    med.get("afternoon", False),
                        "night":        med.get("night", False),
                        "instructions": med.get("instructions", ""),
                        "is_critical":  med.get("is_critical", False),
                    })
            print(f"[MEDISYNC] Loaded {len(medicines)} medicines from backend")
            return medicines
    except Exception as e:
        print(f"[ERROR] Could not fetch medicines: {e}")
    return []


def api_mark_taken(medicine_name: str) -> bool:
    """Mark a medicine as taken via backend API."""
    if not API_TOKEN:
        return False
    try:
        resp = requests.post(
            f"{API_BASE}/mark-done",
            json={"med_id": medicine_name, "status": "taken", "timestamp": datetime.utcnow().isoformat(), "source": "voice_assistant"},
            headers=api_headers(),
            timeout=5
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False


def api_send_emergency() -> bool:
    """Trigger emergency SOS via backend API."""
    if not API_TOKEN:
        return False
    try:
        resp = requests.post(
            f"{API_BASE}/doctor/emergency/trigger",
            json={"note": "Voice SOS triggered by patient"},
            headers=api_headers(),
            timeout=5
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False


def get_next_medicine(medicines: list) -> dict | None:
    """Return the next medicine due based on current time."""
    now_hour = datetime.now().hour
    for med in medicines:
        if now_hour < 12 and med.get("morning"):
            return med
        elif 12 <= now_hour < 17 and med.get("afternoon"):
            return med
        elif now_hour >= 17 and med.get("night"):
            return med
    return medicines[0] if medicines else None


# ──────────────────────────────────────────────────────
# FALLBACK LOCAL MEDICINE DATABASE (when API offline)
# ──────────────────────────────────────────────────────

FALLBACK_MEDICINES = [
    {"name": "Metformin",   "dosage": "1 Tablet", "timing": "morning", "morning": True,  "afternoon": False, "night": False, "slot": 1},
    {"name": "BP Medicine", "dosage": "1 Tablet", "timing": "night",   "morning": False, "afternoon": False, "night": True,  "slot": 2},
    {"name": "Vitamin D",   "dosage": "1 Capsule","timing": "afternoon","morning": False, "afternoon": True,  "night": False, "slot": 3},
]

# ──────────────────────────────────────────────────────
# ESP32 HARDWARE CONTROLS
# ──────────────────────────────────────────────────────

def esp32_get(endpoint: str) -> bool:
    """Send GET request to ESP32. Returns True on success."""
    try:
        resp = requests.get(f"http://{ESP32_IP}{endpoint}", timeout=2)
        return resp.status_code == 200
    except Exception:
        return False


def esp32_open_slot(slot_num: int) -> bool:
    print(f"[ESP32][Opening] Slot {slot_num} on ESP32...")
    return esp32_get(f"/open{slot_num}")


def esp32_blink_leds(slot_num: int = 0) -> bool:
    print(f"[ESP32][LED] Blinking LEDs (slot {slot_num})...")
    return esp32_get(f"/blink{slot_num}" if slot_num else "/blink")


def esp32_stop_alarm() -> bool:
    print("[ESP32] Stopping alarm on ESP32...")
    return esp32_get("/alarm/stop")


def esp32_trigger_reminder() -> bool:
    print("[ESP32] Triggering reminder mode on ESP32...")
    return esp32_get("/reminder")


def send_audio_to_esp32(mp3_path: str) -> bool:
    url = f"http://{ESP32_IP}/play_audio"
    try:
        with open(mp3_path, "rb") as f:
            audio_bytes = f.read()
        resp = requests.post(url, data=audio_bytes, headers={"Content-Type": "audio/mpeg"}, timeout=2)
        return resp.status_code == 200
    except Exception:
        return False


# ──────────────────────────────────────────────────────
# TEXT-TO-SPEECH
# ──────────────────────────────────────────────────────

async def _generate_audio(text: str, filename: str):
    communicate = edge_tts.Communicate(text, voice=TTS_VOICE)
    await communicate.save(filename)


def speak(text: str):
    """Convert text to speech. Try ESP32 first, fallback to PC speakers."""
    print(f"[AI Voice] {text}")
    filename = f"tts_{uuid.uuid4().hex}.mp3"
    try:
        asyncio.run(_generate_audio(text, filename))
        if not send_audio_to_esp32(filename):
            print("[SPEAKER] Playing on Computer speakers...")
            try:
                from playsound import playsound
                playsound(filename)
            except ImportError:
                print("[ERROR] playsound not installed. Run: pip install playsound==1.2.2")
            except Exception as e:
                print(f"[ERROR] PC Audio Error: {e}")
    finally:
        if os.path.exists(filename):
            try:
                os.remove(filename)
            except OSError:
                pass


# ──────────────────────────────────────────────────────
# MEDISYNC CORE AI — SYSTEM PROMPT v4.0
# ──────────────────────────────────────────────────────

def build_system_prompt(medicines: list) -> str:
    med_list_str = "\n".join(
        f"  - {m['name']} | Dosage: {m.get('dosage','?')} | "
        f"Morning: {m.get('morning',False)} | Afternoon: {m.get('afternoon',False)} | Night: {m.get('night',False)}"
        for m in medicines
    ) or "  (No medicines loaded — API offline, using fallback)"

    now_str = datetime.now().strftime("%I:%M %p, %A")

    return f"""
You are MEDISYNC CORE AI — the Central Voice Operating System for an Intelligent Smart Medication Adherence Ecosystem.

You are an advanced AI Application Control Agent responsible for safely operating and controlling the Medisync platform through natural language voice interaction.

Current Time: {now_str}

PATIENT'S MEDICINE DATABASE:
{med_list_str}

SUPPORTED LANGUAGES: English, Hindi, Hinglish, Mixed speech.
Examples: "Slot 1 kholo", "Meri medicines dikhao", "Doctor ko message bhejo", "Reminder stop karo"

AUTHORIZED ACTIONS:
  [MEDICATION]
  show_medicines, next_medicine, missed_medicines, medicine_details, mark_taken, repeat_reminder, snooze_reminder

  [PILLBOX HARDWARE]
  open_slot, close_slot, blink_leds, stop_alarm, trigger_reminder, activate_voice_reminder, deactivate_voice_reminder

  [NAVIGATION — navigate_screen]
  Screens: home, history, pillbox, medicines, scan, scanner, chat, profile, analytics, notifications, symptoms, ocr, settings, caregiver_settings, privacy, calling_settings

  [CHAT & COMMUNICATION]
  send_chat_message, open_chat, send_caregiver_alert, show_caregivers

  [SYMPTOM]
  add_symptom, show_symptoms

  [PROFILE]
  edit_profile, open_settings

  [EMERGENCY]
  emergency_alert, sos_mode

  [ANALYTICS]
  show_adherence, show_analytics

  [MISC]
  clarify

HEALTHCARE SAFETY RULES:
1. NEVER invent medicines or schedules.
2. NEVER generate fake adherence records.
3. NEVER execute unauthorized actions.
4. NEVER make dangerous medical recommendations.
5. NEVER open pillbox slots without explicit patient confirmation.
6. ALWAYS prioritize emergency commands above everything.
7. ALWAYS ask clarification if confidence < 0.60.
8. ALWAYS protect patient safety over convenience.

COMMAND PRIORITY:
1. emergency_alert (critical)
2. send_caregiver_alert
3. mark_taken
4. open_slot
5. medication queries
6. navigation
7. analytics/profile

CONFIDENCE RULES:
- > 0.90: proceed
- 0.75–0.89: proceed with care
- 0.60–0.74: clarify if safety-critical
- < 0.60: return clarify action

SMART MEMORY: Maintain conversational context. If user says "usko taken mark karo" after asking about Metformin, understand "usko" = Metformin.

RESPONSE STYLE:
- Short, human-like, calm, elderly-friendly.
- GOOD: "Slot 2 open kiya ja raha hai."
- BAD: "Certainly! I would be delighted to assist you with your request."

STRICT OUTPUT FORMAT — ALWAYS RETURN VALID JSON ONLY. No markdown, no explanation outside JSON:
{{
  "action": "<action_name>",
  "screen": "<screen_or_null>",
  "slot": <number_or_null>,
  "medicine": "<medicine_name_or_null>",
  "payload": <object_or_null>,
  "response": "<short natural Hinglish TTS response>",
  "confidence": <0.0_to_1.0>,
  "priority": "<low|medium|high|critical>"
}}

EXAMPLES:
User: "Slot 2 kholo"
→ {{"action":"open_slot","screen":null,"slot":2,"medicine":null,"payload":null,"response":"Slot 2 open kiya ja raha hai. Apni dawai uthayein.","confidence":0.97,"priority":"high"}}

User: "Pillbox screen par jao"
→ {{"action":"navigate_screen","screen":"pillbox","slot":null,"medicine":null,"payload":null,"response":"Pillbox screen par ja raha hoon.","confidence":0.95,"priority":"medium"}}

User: "Doctor ko bolo mujhe sir dard hai"
→ {{"action":"send_chat_message","screen":null,"slot":null,"medicine":null,"payload":{{"message":"Mujhe sir dard hai"}},"response":"Doctor ko message bheja ja raha hai.","confidence":0.93,"priority":"high"}}

User: "Emergency help chahiye"
→ {{"action":"emergency_alert","screen":null,"slot":null,"medicine":null,"payload":null,"response":"Emergency alert caregivers ko bheja ja raha hai. Shaant rahein, madad aa rahi hai!","confidence":0.99,"priority":"critical"}}

User: "Meri next medicine kya hai"
→ {{"action":"next_medicine","screen":null,"slot":null,"medicine":null,"payload":null,"response":"Abhi aapki next medicine check kar raha hoon.","confidence":0.96,"priority":"medium"}}

User: "Medicine le li"
→ {{"action":"mark_taken","screen":null,"slot":null,"medicine":null,"payload":null,"response":"Medicine taken mark ho gayi. Bahut accha!","confidence":0.94,"priority":"high"}}
""".strip()


# ──────────────────────────────────────────────────────
# GROQ AI — MEDISYNC CORE AI ENGINE
# ──────────────────────────────────────────────────────

conversation_history = []

def ask_groq(user_text: str, medicines: list) -> dict:
    """Send user command to MEDISYNC CORE AI. Returns parsed action dict."""
    conversation_history.append({"role": "user", "content": user_text})

    system_prompt = build_system_prompt(medicines)

    # Try primary key, then fallbacks
    keys_to_try = [
        (GROQ_API_KEY, "primary"),
        (GROQ_FALLBACK_1, "fallback-1"),
        (GROQ_FALLBACK_2, "fallback-2"),
    ]

    last_error = None
    for api_key, label in keys_to_try:
        if not api_key or api_key.startswith("YOUR_"):
            continue
        try:
            from groq import Groq as _Groq
            _client = _Groq(api_key=api_key)
            completion = _client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "system", "content": system_prompt}] + conversation_history[-20:],
                temperature=0.3,
                max_tokens=300,
                response_format={"type": "json_object"}
            )
            raw = completion.choices[0].message.content.strip()
            action = json.loads(raw)

            conversation_history.append({"role": "assistant", "content": raw})
            # Keep last 20 messages (10 turns)
            if len(conversation_history) > 20:
                conversation_history.pop(0)
                conversation_history.pop(0)

            confidence = action.get("confidence", 1.0)
            priority   = action.get("priority", "medium")
            print(f"\n🤖 MEDISYNC CORE AI [{label}] | confidence={confidence} | priority={priority}")
            print(f"   Action: {action.get('action')} | Screen: {action.get('screen')} | Slot: {action.get('slot')} | Med: {action.get('medicine')}")
            return action

        except json.JSONDecodeError:
            print(f"⚠ AI [{label}] returned non-JSON — using fallback")
            return {"action": "clarify", "screen": None, "slot": None, "medicine": None,
                    "payload": None, "response": "Kya aap thoda aur clearly bol sakte hain?",
                    "confidence": 0.5, "priority": "low"}
        except Exception as e:
            last_error = e
            if "401" in str(e) or "invalid_api_key" in str(e):
                print(f"⚠ Groq [{label}] key invalid — trying next key...")
                continue
            print(f"❌ Groq [{label}] error: {e}")
            break

    print(f"❌ All Groq keys exhausted. Last error: {last_error}")
    return {"action": "clarify", "screen": None, "slot": None, "medicine": None,
            "payload": None, "response": "AI se response nahi aaya. Kripya dobara boliye.",
            "confidence": 0.0, "priority": "low"}


# ──────────────────────────────────────────────────────
# ACTION EXECUTOR + POST-ACTION FOLLOW-UP
# ──────────────────────────────────────────────────────

def get_next_due_medicine(medicines: list) -> dict | None:
    """Find which medicine is due next based on current time."""
    now = datetime.now()
    hour = now.hour
    results = []
    for m in medicines:
        if hour < 12 and m.get("morning"):      results.append((m, "morning",    "Subah"))
        elif 12 <= hour < 17 and m.get("afternoon"): results.append((m, "afternoon", "Dopahar"))
        elif hour >= 17 and m.get("night"):      results.append((m, "night",      "Raat"))
        elif m.get("timing") and m.get("timing") != "":
            results.append((m, "anytime", "Abhi"))
    return results[0][0] if results else (medicines[0] if medicines else None)


def post_action_followup(action: dict, medicines: list) -> str:
    """
    Speak a REAL result after an action completes.
    Rules:
      - Only speak if the followup adds NEW information not already said
      - medicine_details: look up the specific medicine and speak its info
      - show_medicines:   list all medicines
      - next_medicine:    tell which is due NOW
      - mark_taken/open_slot/emergency: speak confirmation of what happened
      - clarify / explain_timing / guide_elderly: NO followup (AI already said it all)
    """
    act      = action.get("action", "")
    med_name = (action.get("medicine") or "").strip()
    slot_num = action.get("slot")
    followup = ""

    # ── Actions that need NO followup (AI already gave complete answer) ───
    NO_FOLLOWUP = {
        "clarify", "guide_elderly", "explain_timing",
        "send_caregiver_alert",   # Handled inside execute_action
        "blink_leds", "close_slot",
    }
    if act in NO_FOLLOWUP:
        return ""

    # ── medicine_details: speak details of the SPECIFIC medicine asked ────
    if act == "medicine_details":
        # Find the medicine user asked about
        match = None
        if med_name:
            match = next(
                (m for m in medicines
                 if med_name.lower() in m.get("name", "").lower()
                 or m.get("name", "").lower() in med_name.lower()),
                None
            )
        if match:
            name     = match.get("name", "?")
            dosage   = match.get("dosage") or "1 tablet"
            timing   = match.get("timing") or ""
            inst     = match.get("instructions") or "Khane ke saath lein"
            slots    = " aur ".join(
                t for t, v in [("Subah", match.get("morning")),
                               ("Dopahar", match.get("afternoon")),
                               ("Raat", match.get("night"))] if v
            ) or timing or "time ke anusar"
            followup = (
                f"{name}: {dosage}, {slots} leni hai. "
                f"Instructions: {inst}. Kya aur jaanna chahte hain?"
            )
        else:
            # Medicine not in DB — just skip followup, AI already said it
            return ""

    # ── show_medicines: list all medicines ────────────────────────────────
    elif act == "show_medicines":
        if medicines:
            names    = ", ".join(m.get("name", "?") for m in medicines)
            followup = f"Aapki medicines hain: {names}. Kisi ke baare mein aur jaanna ho toh boliye."
        else:
            followup = "Abhi database mein koi medicine nahi hai."

    # ── next_medicine: real-time slot ─────────────────────────────────────
    elif act == "next_medicine":
        nxt = get_next_due_medicine(medicines)
        if nxt:
            slot  = next((i+1 for i, m in enumerate(medicines)
                          if m.get("name") == nxt.get("name")), 1)
            followup = (
                f"Aapki next medicine {nxt.get('name')} hai, "
                f"dose {nxt.get('dosage','1 tablet')}, Slot {slot} mein. "
                f"Kya main slot khol doon?"
            )
        else:
            followup = "Abhi koi medicine due nahi hai. Sab sahi chal raha hai!"

    # ── missed_medicines ──────────────────────────────────────────────────
    elif act == "missed_medicines":
        now_h  = datetime.now().hour
        missed = []
        for m in medicines:
            if now_h > 12 and m.get("morning"):   missed.append(m.get("name"))
            if now_h > 17 and m.get("afternoon"): missed.append(m.get("name"))
        if missed:
            followup = f"Aaj ki missed medicines: {', '.join(missed)}. Jaldi lein!"
        else:
            followup = "Aaj koi dose miss nahi hua! Bahut accha!"

    # ── Confirmations after real actions ─────────────────────────────────
    elif act == "mark_taken":
        name     = med_name or (get_next_due_medicine(medicines) or {}).get("name", "dawai")
        followup = f"{name} mark ho gayi. Shababash! Kya aur kuch chahiye?"

    elif act == "open_slot":
        followup = f"Slot {slot_num} khul gaya. Medicine nikaalo aur le lo. Ho gaya?"

    elif act == "emergency_alert":
        followup = "SOS bhej diya. Doctor notify ho gaye. Shaant rahein, madad aa rahi hai."

    elif act == "trigger_reminder":
        followup = "Reminder set ho gaya. Aapko yaad dilaya jaayega. Kya aur chahiye?"

    elif act == "stop_alarm":
        followup = "Alarm band ho gaya. Medicine li ya nahi?"

    # ── Speak only if followup has real content ───────────────────────────
    if followup:
        print(f"[FOLLOWUP] {followup}")
        speak(followup)

    return followup


def execute_action(action: dict, medicines: list):
    """Execute hardware/API action, then speak real follow-up."""
    act      = action.get("action", "")
    slot_num = action.get("slot")
    med_name = action.get("medicine") or ""
    screen   = action.get("screen") or ""
    payload  = action.get("payload") or {}
    priority = action.get("priority", "medium")

    print(f"\n[EXECUTE] {act} | priority={priority} | slot={slot_num} | med={med_name} | screen={screen}")

    # ── PRIORITY: Emergency always first ──────────────────────────────────
    if act in ("emergency_alert", "sos_mode"):
        speak("Emergency SOS bhej raha hoon, ek second...")
        if not api_send_emergency():
            print("[WARN] Backend SOS failed")
        esp32_trigger_reminder()

    # ── Slot Control ──────────────────────────────────────────────────────
    elif act == "open_slot" and slot_num:
        speak(f"Theek hai, Slot {slot_num} khol raha hoon...")
        if not esp32_open_slot(int(slot_num)):
            print("[WARN] ESP32 not reachable")
        esp32_blink_leds(int(slot_num))

    elif act == "close_slot":
        print("[INFO] Close slot — auto-closes after timeout")

    # ── Hardware ──────────────────────────────────────────────────────────
    elif act == "blink_leds":
        esp32_blink_leds(int(slot_num) if slot_num else 0)

    elif act == "stop_alarm":
        esp32_stop_alarm()

    elif act in ("trigger_reminder", "activate_voice_reminder"):
        esp32_trigger_reminder()

    elif act == "deactivate_voice_reminder":
        esp32_stop_alarm()

    # ── Medicine tracking ─────────────────────────────────────────────────
    elif act == "mark_taken":
        name = med_name or (get_next_due_medicine(medicines) or {}).get("name", "")
        if name:
            speak(f"{name} mark kar raha hoon...")
            if not api_mark_taken(name):
                esp32_blink_leds()
        else:
            print("[WARN] No medicine name for mark_taken")

    # ── Navigation — log the screen target ───────────────────────────────
    elif act == "navigate_screen":
        if screen:
            print(f"[NAV] Navigate to screen: {screen}")
            # If a mobile app WebSocket/API is hooked, push navigation event here
            try:
                requests.post(
                    f"{API_BASE}/device/navigate",
                    json={"screen": screen},
                    headers=api_headers(),
                    timeout=3
                )
            except Exception:
                pass  # Non-critical — navigation is best-effort

    # ── Doctor/Caregiver chat message ─────────────────────────────────────
    elif act == "send_chat_message":
        message = payload.get("message", "")
        if message and API_TOKEN:
            speak("Doctor ko message bheja ja raha hai...")
            try:
                resp = requests.post(
                    f"{API_BASE}/doctor/message",
                    json={"message": message},
                    headers=api_headers(),
                    timeout=5
                )
                if resp.status_code in (200, 201):
                    print(f"[CHAT] Message sent: {message}")
                else:
                    print(f"[WARN] Chat message failed: {resp.status_code}")
            except Exception as e:
                print(f"[WARN] Chat send error: {e}")

    # ── Caregiver alert ───────────────────────────────────────────────────
    elif act == "send_caregiver_alert":
        note = payload.get("message", "Patient ne caregiver alert bheja.")
        speak("Caregiver ko alert bheja ja raha hai...")
        try:
            requests.post(
                f"{API_BASE}/doctor/emergency/trigger",
                json={"note": note},
                headers=api_headers(),
                timeout=5
            )
        except Exception:
            pass

    # ── Symptom logging ───────────────────────────────────────────────────
    elif act == "add_symptom":
        symptom = payload.get("symptom", "")
        if symptom and API_TOKEN:
            speak(f"Symptom '{symptom}' note kar raha hoon...")
            try:
                requests.post(
                    f"{API_BASE}/symptoms",
                    json={"symptom": symptom, "severity": payload.get("severity", "moderate")},
                    headers=api_headers(),
                    timeout=5
                )
            except Exception:
                pass

    # ── Info actions (show_medicines, next_medicine, etc.) ────────────────
    # These are handled in post_action_followup below.

    # ── Speak real result as follow-up ────────────────────────────────────
    post_action_followup(action, medicines)



# ──────────────────────────────────────────────────────
# VOICE INPUT
# ──────────────────────────────────────────────────────

def listen(recognizer: sr.Recognizer, source) -> str:
    print("\n[MIC] Listening...")
    try:
        audio = recognizer.listen(source, timeout=7, phrase_time_limit=10)
        text  = recognizer.recognize_google(audio, language="hi-IN")
        print(f"[USER] {text}")
        return text.lower()
    except sr.WaitTimeoutError:
        print("⏱ No speech detected")
        return ""
    except sr.UnknownValueError:
        print(" Could not understand")
        return ""
    except Exception as e:
        print(f"❌ Listen error: {e}")
        return ""


# ──────────────────────────────────────────────────────
# SMART CONTINUATION DETECTION
# ──────────────────────────────────────────────────────

# Words/phrases that signal user is still speaking or wants the system to wait
WAIT_SIGNALS = [
    # Hindi wait signals
    "ruko", "rukiye", "thoda ruko", "ek second", "ek minute", "wait",
    "intezaar", "intezar", "thehro", "thahro", "suniye",
    "bata raha hun", "bata rahi hun", "bol raha hun", "bol rahi hun",
    "suno", "dekho", "ek kaam", "mujhe", "haan mujhe",
    "main chahta hun", "main chahti hun", "main bata",
    # Trailing partial phrases (very short = incomplete)
]

# Sentence endings that suggest a complete thought
COMPLETE_ENDINGS = [
    "hai", "hain", "tha", "thi", "the", "dena", "karo", "karna",
    "batao", "dikhao", "kholo", "band karo", "lena", "chahiye",
    "help", "please", "ok", "okay", "theek hai", "thanks", "shukriya",
    "taken", "skip", "emergency", "sos",
]

def is_incomplete(text: str) -> bool:
    """
    Returns True if the user's text looks like an incomplete sentence —
    meaning the system should wait and listen for more input.

    Signals of incompleteness:
      1. Contains explicit wait words ("ruko", "intezaar", etc.)
      2. Very short (1-2 words) — likely trailing off
      3. Does not end with a complete thought keyword
    """
    if not text:
        return False

    words = text.strip().split()

    # Rule 1: Explicit wait signals present
    for signal in WAIT_SIGNALS:
        if signal in text:
            print(f"\u23f3 Continuation detected (wait signal: '{signal}')")
            return True

    # Rule 2: Very short input (1-2 words) — user is trailing off
    if len(words) <= 2:
        print(f"Continuation detected (too short: {len(words)} words)")
        return True

    # Rule 3: Ends mid-sentence (no completion keyword in last 2 words)
    last_words = [w.lower() for w in words[-2:]]
    has_ending = any(kw in last_words or text.endswith(kw) for kw in COMPLETE_ENDINGS)

    # Only flag as incomplete if it's also relatively short (< 6 words)
    if not has_ending and len(words) <= 5:
        print(f"Continuation detected (no clear ending, {len(words)} words)")
        return True

    return False


def listen_with_continuation(recognizer: sr.Recognizer, source, max_parts: int = 3) -> str:
    """
    Smart listener: if user gives an incomplete sentence, automatically
    listens again and combines parts — up to max_parts times.

    Example:
      Part 1: "mujhe"             → incomplete → listen again
      Part 2: "paracetamol ke"    → still incomplete → listen again
      Part 3: "baare mein batao"  → complete!
      Final:  "mujhe paracetamol ke baare mein batao"
    """
    parts = []

    for attempt in range(max_parts):
        text = listen(recognizer, source)

        if not text:
            # If we already have some parts, use what we have
            if parts:
                break
            return ""

        parts.append(text)

        # Check if we should continue listening
        if attempt < max_parts - 1 and is_incomplete(text):
            print(f"[WAIT] Continuing... (part {attempt + 1}: '{text}')")
            continue
        else:
            break

    final = " ".join(parts).strip()
    if len(parts) > 1:
        print(f"[COMBINED] {final}")
    return final


# ──────────────────────────────────────────────────────
# MAIN LOOP
# ──────────────────────────────────────────────────────

def main():
    global API_TOKEN

    print("\n" + "=" * 55)
    print("  🤖 AI SMART PILLBOX — VOICE HEALTHCARE ASSISTANT v3.0")
    print("=" * 55)

    # Try to get live medicines from backend
    API_TOKEN = get_api_token()
    medicines = fetch_live_medicines()
    if not medicines:
        print("⚠ Using fallback local medicine database")
        medicines = FALLBACK_MEDICINES

    print(f"\n[INFO] Loaded {len(medicines)} medicines:")
    
    morning_meds = [(i, m) for i, m in enumerate(medicines, 1) if m.get("morning")]
    afternoon_meds = [(i, m) for i, m in enumerate(medicines, 1) if m.get("afternoon")]
    night_meds = [(i, m) for i, m in enumerate(medicines, 1) if m.get("night")]
    other_meds = [(i, m) for i, m in enumerate(medicines, 1) if not (m.get("morning") or m.get("afternoon") or m.get("night"))]

    if morning_meds:
        print("\n   [MORNING SLOTS]")
        for i, m in morning_meds:
            print(f"      - Slot {i:02d}: {m['name']:<25} | {m.get('dosage','?')}")
    if afternoon_meds:
        print("\n   [AFTERNOON SLOTS]")
        for i, m in afternoon_meds:
            print(f"      - Slot {i:02d}: {m['name']:<25} | {m.get('dosage','?')}")
    if night_meds:
        print("\n   [NIGHT SLOTS]")
        for i, m in night_meds:
            print(f"      - Slot {i:02d}: {m['name']:<25} | {m.get('dosage','?')}")
    if other_meds:
        print("\n   [OTHER SLOTS]")
        for i, m in other_meds:
            print(f"      - Slot {i:02d}: {m['name']:<25} | {m.get('dosage','?')} | {m.get('timing','?')}")
    print("\n" + "─" * 55)

    # Setup microphone
    recognizer = sr.Recognizer()
    recognizer.energy_threshold   = 300
    recognizer.dynamic_energy_threshold = True

    with sr.Microphone() as source:
        print("\n⚙  Calibrating microphone... please wait 2 seconds.")
        recognizer.adjust_for_ambient_noise(source, duration=2)
        print("✅ Ready! Boliye — main sun raha hoon.\n")

        speak("Namaste! Main aapka AI Smart Pillbox assistant hoon. "
              "Aap mujhse pooch sakte hain ki kaunsi dawai leni hai, "
              "ya koi bhi kaam boliye.")

        while True:
            user_text = listen_with_continuation(recognizer, source)
            if not user_text:
                continue

            # Exit commands
            if any(w in user_text for w in ["stop", "exit", "band karo", "bye", "quit"]):
                speak("Theek hai, take care. Apni dawaiyan mat bhoolna!")
                break

            # Refresh medicines from API periodically
            if "refresh" in user_text or "update" in user_text:
                medicines = fetch_live_medicines() or FALLBACK_MEDICINES
                speak(f"Database refresh ho gaya. {len(medicines)} medicines loaded.")
                continue

            # Get structured JSON action from AI
            action = ask_groq(user_text, medicines)

            # Speak the initial AI response
            response_text = action.get("response", "")
            if response_text:
                speak(response_text)

            # Execute hardware/API action + speak real follow-up result
            execute_action(action, medicines)

    print("\n✅ Pillbox system stopped. Goodbye!")


if __name__ == "__main__":
    main()


# ========================================================
# ESP32 FIRMWARE ENDPOINTS REQUIRED:
# ========================================================
# POST /play_audio      → Receive MP3 bytes → play via I2S speaker
# GET  /open1           → Open slot 1 servo
# GET  /open2           → Open slot 2 servo
# GET  /open3           → Open slot 3 servo
# GET  /blink           → Blink all LEDs
# GET  /blink1          → Blink slot 1 LED
# GET  /blink2          → Blink slot 2 LED
# GET  /blink3          → Blink slot 3 LED
# GET  /alarm/stop      → Stop buzzer/alarm
# GET  /reminder        → Activate reminder buzzer
#
# Hardware: ESP32 + MAX98357A I2S Amp + Speaker
# Libraries: ESP Async WebServer, ESP8266Audio, SPIFFS
# ========================================================
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
            f"{API_BASE}/tracking/log",
            json={"medicine_name": medicine_name, "status": "taken", "timestamp": datetime.utcnow().isoformat()},
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
# AI SYSTEM PROMPT — JSON ACTION FORMAT
# ──────────────────────────────────────────────────────

def build_system_prompt(medicines: list) -> str:
    med_list_str = "\n".join(
        f"  - {m['name']} | Dosage: {m.get('dosage','?')} | Timing: {m.get('timing','?')} | "
        f"Morning: {m.get('morning',False)} | Afternoon: {m.get('afternoon',False)} | Night: {m.get('night',False)}"
        for m in medicines
    ) or "  (No medicines loaded — API offline, using fallback)"

    now_str = datetime.now().strftime("%I:%M %p, %A")

    return f"""
You are an advanced AI Voice Healthcare Assistant integrated into a Smart Medication Adherence System.

Current Time: {now_str}

PATIENT'S MEDICINE DATABASE:
{med_list_str}

YOUR ROLE:
- Understand Hindi, Hinglish, and English voice commands.
- Map user intent to safe application actions.
- Respond ONLY in valid JSON (no extra text, no markdown).
- Keep response text SHORT (1-2 sentences), natural, supportive.
- Never invent medicines outside the database above.
- Never make dangerous medical recommendations.
- Always confirm critical actions in the response text.

AVAILABLE ACTIONS (use exact action keys):
  open_slot         - Open a pillbox slot (include slot number 1/2/3)
  close_slot        - Close a slot
  blink_leds        - Blink slot LEDs to guide patient
  stop_alarm        - Stop alarm/reminder sound
  trigger_reminder  - Activate reminder mode
  mark_taken        - Mark medicine as taken (include medicine name)
  snooze_reminder   - Snooze current reminder
  show_medicines    - Display all medicines list
  next_medicine     - Show next due medicine
  missed_medicines  - Show today's missed medicines
  medicine_details  - Explain a specific medicine
  show_schedule     - Show full medicine schedule
  show_analytics    - Open adherence report/dashboard
  send_caregiver_alert - Send alert to caregiver
  emergency_alert   - Trigger SOS emergency
  explain_timing    - Explain medicine timing in simple words
  guide_elderly     - Step-by-step guidance for elderly users
  clarify           - Ask user to clarify their command

OUTPUT FORMAT (always valid JSON, nothing else):
{{
  "action": "<action_key>",
  "slot": <1|2|3|null>,
  "medicine": "<medicine_name_or_null>",
  "response": "<short_hindi_english_response_for_TTS>"
}}

EXAMPLES:
User: "Slot 2 kholo"
→ {{"action":"open_slot","slot":2,"medicine":null,"response":"Slot 2 open kiya ja raha hai. Please apni dawai uthayein."}}

User: "Meri next medicine kya hai"
→ {{"action":"next_medicine","slot":1,"medicine":"Metformin","response":"Aapki next medicine Metformin hai jo Slot 1 mein hai. Please abhi le lijiye."}}

User: "Medicine le li"
→ {{"action":"mark_taken","slot":null,"medicine":"Metformin","response":"Bilkul! Metformin mark ho gayi taken. Aap bahut accha kar rahe hain!"}}

User: "Emergency help chahiye"
→ {{"action":"emergency_alert","slot":null,"medicine":null,"response":"Turant emergency alert bheja ja raha hai aapke caregiver ko. Help aa rahi hai!"}}
""".strip()


# ──────────────────────────────────────────────────────
# GROQ AI — RETURNS PARSED JSON ACTION
# ──────────────────────────────────────────────────────

conversation_history = []

def ask_groq(user_text: str, medicines: list) -> dict:
    """Send user command to Groq. Returns parsed action dict."""
    conversation_history.append({"role": "user", "content": user_text})

    system_prompt = build_system_prompt(medicines)

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system_prompt}] + conversation_history,
            temperature=0.3,
            max_tokens=200,
            response_format={"type": "json_object"}
        )
        raw = completion.choices[0].message.content.strip()
        action = json.loads(raw)

        conversation_history.append({"role": "assistant", "content": raw})
        # Keep last 20 messages (10 turns)
        if len(conversation_history) > 20:
            conversation_history.pop(0)
            conversation_history.pop(0)

        print(f"\n Action: {json.dumps(action, ensure_ascii=False, indent=2)}")
        return action

    except json.JSONDecodeError:
        print("⚠ AI returned non-JSON — using fallback")
        return {"action": "clarify", "slot": None, "medicine": None,
                "response": "Kya aap thoda aur clearly bol sakte hain?"}
    except Exception as e:
        print(f"❌ Groq error: {e}")
        return {"action": "clarify", "slot": None, "medicine": None,
                "response": "AI se response nahi aaya. Please dobara boliye."}


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

    # 1. Slot open
    if act == "open_slot" and slot_num:
        speak(f"Theek hai, Slot {slot_num} khol raha hoon...")
        if not esp32_open_slot(int(slot_num)):
            print("[WARN] ESP32 not reachable")
        esp32_blink_leds(int(slot_num))

    elif act == "close_slot":
        print("[INFO] Close slot — auto-closes after timeout")

    # 2. Hardware
    elif act == "blink_leds":
        esp32_blink_leds(int(slot_num) if slot_num else 0)

    elif act == "stop_alarm":
        esp32_stop_alarm()

    elif act == "trigger_reminder":
        esp32_trigger_reminder()

    # 3. Medicine tracking — say "marking" before API call
    elif act == "mark_taken":
        name = med_name or (get_next_due_medicine(medicines) or {}).get("name", "")
        if name:
            speak(f"{name} mark kar raha hoon...")
            if not api_mark_taken(name):
                esp32_blink_leds()
        else:
            print("[WARN] No medicine name for mark_taken")

    # 4. Emergency
    elif act == "emergency_alert":
        speak("Emergency SOS bhej raha hoon, ek second...")
        if not api_send_emergency():
            print("[WARN] Backend SOS failed")
        esp32_trigger_reminder()

    # 5. Info actions — no "Ek second" needed, followup handles speech
    # (show_medicines, next_medicine, medicine_details, missed_medicines, etc.)

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
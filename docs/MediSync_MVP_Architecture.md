# MediSync: MVP Architecture & System Design Document

## 1. Executive Summary
MediSync is an intelligent medication adherence ecosystem designed to solve the critical healthcare challenge of non-adherence, which leads to poor treatment outcomes and high hospital readmission rates. This document outlines the Phase 1 MVP (Minimum Viable Product) architecture, establishing a robust, scalable, and secure foundation. By prioritizing a seamless event-driven core, offline-first mobile experience, and basic IoT pillbox integration, MediSync ensures real-time visibility for patients, caregivers, and doctors. This solid base must be built before introducing complex AI layers.

## 2. System Goals
*   **Healthcare-Grade Reliability:** 99.9% uptime for medication reminders and tracking.
*   **Offline-First Strategy:** The mobile app must function without internet access and sync gracefully when online.
*   **Interoperability Readiness:** Data structures must be designed with future FHIR/HL7 compliance in mind.
*   **Low-Latency IoT:** Instant feedback loop from the ESP32 smart pillbox to the backend and mobile apps.
*   **Role-Based Access Control (RBAC):** Strict security and data isolation between Patients, Doctors, and Caregivers.

## 3. Technical Architecture

### Tech Stack Recommendations
*   **Mobile Apps (Patient/Doctor/Caregiver):** React Native with Expo. Enables fast cross-platform iteration, a premium UI (e.g., Glassmorphism), and robust offline capabilities (via WatermelonDB or SQLite).
*   **Backend API:** FastAPI (Python). High-performance, asynchronous out-of-the-box, excellent for WebSockets (IoT), and provides a native bridge for future Python-based AI models.
*   **Database:** PostgreSQL. Healthcare data is highly relational (Doctors -> Patients -> Prescriptions -> Schedules -> Logs). PostgreSQL offers robust ACID compliance and complex querying that NoSQL solutions (like Firebase) struggle with at scale.
*   **IoT Hardware:** ESP32. Low cost, built-in WiFi/BLE, and supports MQTT.
*   **Message Broker / Cache:** Redis. Essential for managing the high-frequency event bus, celery task queues, and rate-limiting.
*   **Infrastructure:** GCP (Google Cloud Run, Cloud SQL) or AWS (ECS, RDS) for scalable, containerized deployments.

### Recommended Folder Structure
```text
medisync/
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── api/              # REST & WebSocket routes
│   │   ├── core/             # Config, security, JWT auth
│   │   ├── models/           # SQLAlchemy DB models
│   │   ├── schemas/          # Pydantic validation schemas
│   │   ├── services/         # Business logic (scheduling, adherence)
│   │   └── worker/           # Background tasks (Celery/Redis)
├── mobile/                   # React Native / Expo App
│   ├── src/
│   │   ├── components/       # Reusable UI (Glassmorphism, buttons)
│   │   ├── screens/          # Role-based views (Patient, Doctor, Caretaker)
│   │   ├── navigation/       # React Navigation routers
│   │   ├── store/            # State management (Zustand/Redux)
│   │   └── services/         # API clients, SQLite offline sync
├── hardware/                 # ESP32 Firmware
│   ├── src/                  # C++ / Arduino logic
│   └── include/              # Headers for MQTT, Sensors
└── docs/                     # Architecture & API documentation
```

## 4. Database Design (PostgreSQL Schema)

*Avoid NoSQL for core records. Use a relational model for data integrity.*

1.  **`users`**: `id`, `role` [patient, doctor, caregiver], `name`, `email`, `password_hash`, `fcm_token`, `created_at`
2.  **`patients`**: `user_id` (FK), `doctor_id` (FK), `caregiver_id` (FK), `emergency_contact`, `timezone`
3.  **`medications`**: `id`, `patient_id` (FK), `name`, `dosage`, `form_factor` (pill, liquid), `total_quantity`, `rx_number`
4.  **`prescriptions`**: `id`, `patient_id` (FK), `doctor_id` (FK), `instructions`, `valid_from`, `valid_until`, `status`
5.  **`schedules`**: `id`, `medication_id` (FK), `time_of_day` (HH:MM), `frequency` (daily, custom), `start_date`, `end_date`
6.  **`adherence_logs`**: `id`, `schedule_id` (FK), `patient_id` (FK), `status` [taken, missed, skipped, late], `taken_at`, `source` [app, iot]
7.  **`iot_devices`**: `id`, `patient_id` (FK), `mac_address`, `status`, `battery_level`, `last_ping`

## 5. API Design

RESTful endpoints with FastAPI, documented automatically via Swagger/OpenAPI.

*   **Authentication:**
    *   `POST /api/v1/auth/login`
    *   `POST /api/v1/auth/register`
*   **Medication Management:**
    *   `GET /api/v1/medications/{patient_id}`
    *   `POST /api/v1/medications`
*   **Scheduling & Tracking:**
    *   `GET /api/v1/schedules/today`
    *   `PUT /api/v1/schedules/{id}`
    *   `POST /api/v1/adherence/log` (Designed to accept bulk arrays for offline sync recovery)
*   **Analytics:**
    *   `GET /api/v1/analytics/adherence/{patient_id}`
*   **IoT (Real-time Bridge):**
    *   `WS /ws/iot/{device_id}` or via MQTT Broker forwarding to webhook `POST /api/v1/iot/webhook`

## 6. Mobile App Modules & Screen Hierarchy

**1. Patient Module (The Daily Companion)**
*   **Home Dashboard:** Dynamic, live timeline of today's medications. Premium glassmorphism UI.
*   **Medicine Cabinet:** Visual inventory of active prescriptions and refill warnings.
*   **Analytics:** Simple, encouraging weekly adherence ring charts.

**2. Doctor Module (The Clinical Portal)**
*   **Triage Dashboard:** Patient list sorted by risk level (lowest adherence at the top).
*   **Prescription Engine:** Form to assign new medications, generating schedules automatically.
*   **Patient Detail:** Deep dive into specific missed doses and longitudinal adherence trends.

**3. Caregiver Module (The Safety Net)**
*   *PIN Protected Entry*
*   **Live Monitor:** Read-only view of the patient's daily timeline.
*   **Alert Center:** High-priority push notifications for missed critical doses.

## 7. Backend Modules

1.  **Medication Scheduling Engine:** Translates prescription inputs ("twice a day for 7 days") into discrete actionable schedule rows.
2.  **Notification & Event Manager:** Interfaces with Firebase Cloud Messaging (FCM). Handles timezone conversions, grouping multiple pills at the same time into a single notification, and delivery retries.
3.  **Offline Sync Resolver:** Conflict resolution logic. If a patient marks a pill as "taken" offline, and the IoT device logs it online simultaneously, the backend reconciles the timestamps to prevent duplicate logs.

## 8. IoT Integration Basics (ESP32)

1.  **Hardware Core:** ESP32 connected to micro-switches, IR sensors, or weight sensors inside pillbox compartments.
2.  **Communication Protocol:** MQTT over TLS. Extremely lightweight, optimized for unreliable networks, and supports QoS (Quality of Service) to guarantee message delivery.
3.  **Basic Flow:** Pillbox lid opened -> ESP32 wakes -> Connects to WiFi -> Publishes `{"device_id": "DEV123", "compartment": 2, "action": "opened", "timestamp": 1715620000}` to MQTT topic -> Returns to deep sleep to save battery.

## 9. Event & Notification Flow

1.  **Trigger:** Backend cron job identifies a scheduled dose (e.g., 8:00 AM).
2.  **Alert:** Notification Manager sends an FCM push to the Patient.
3.  **Action (App):** Patient taps "Taken" -> API call logs status.
4.  **Action (Hardware):** IoT sensor detects removal -> MQTT publishes event -> Backend logs status.
5.  **Missed Dose Engine:** If no log exists by 8:30 AM (30-minute grace period):
    *   System updates log status to `missed`.
    *   **Escalation Protocol:** Event bus fires a high-priority FCM push to the Caregiver ("Alert: John missed Amoxicillin").

## 10. Security Layer

*   **Authentication:** Short-lived JWTs (JSON Web Tokens) with secure refresh token rotation.
*   **Data Encryption:** TLS 1.3 for all in-transit API and MQTT traffic. At-rest database encryption via cloud provider (e.g., GCP Cloud KMS).
*   **Healthcare Compliance Prep:** Logically separate PII (Names, Emails) from PHI (Prescriptions, Diagnoses) to simplify future HIPAA compliance audits.
*   **IoT Hardening:** Provision each ESP32 with unique X.509 certificates. Do not hardcode API keys in firmware.

## 11. Analytics Layer

*   **Adherence Percentage Logic:** `(Total Doses Taken / Total Doses Prescribed) * 100`. Calculated dynamically over rolling 7-day, 30-day, and all-time windows.
*   **Caregiver Escalation Logic:** Define severity tiers. Missing a vitamin is a low-priority log; missing a heart medication triggers an immediate push notification and SMS fallback.
*   **Doctor Risk Stratification:** Any patient dropping below 80% adherence over 7 days is automatically flagged on the Doctor's dashboard.

## 12. MVP Roadmap (12-Week Sprint)

*   **Weeks 1-2 (Foundation):** DB Schema creation, FastAPI boilerplate, React Native navigation, and authentication flows.
*   **Weeks 3-5 (Core Workflows):** Medication and scheduling CRUD APIs, Patient Dashboard UI, and Doctor prescription assignment.
*   **Weeks 6-7 (Resilience):** SQLite offline sync logic, FCM push notifications, and background cron jobs.
*   **Weeks 8-9 (Hardware):** ESP32 firmware development, MQTT broker configuration, and hardware-to-backend event mapping.
*   **Weeks 10-11 (Ecosystem):** Caregiver read-only views, Doctor analytics dashboard, and escalation testing.
*   **Week 12 (Stabilization):** Cloud deployment (Docker/Cloud Run), load testing, and edge-case QA across Android OEMs.

## 13. Future AI Expansion (Phase 2+)

*Do NOT build these during the MVP, but ensure the architecture supports them:*
*   **Predictive Non-adherence AI:** Machine learning models analyzing historical data to predict *when* a patient is likely to miss a dose before it happens, allowing preemptive nudges.
*   **Computer Vision (Pill ID):** Using the smartphone camera to identify pill shapes, colors, and imprints to verify the correct medication is being taken.
*   **NLP Prescription Parsing:** Allowing doctors to take a photo of a handwritten note or speak instructions, which the AI converts into structured schedules.

## 14. Final Recommendations & Startup Pitfalls to Avoid

1.  **Don't Build a Complex Robot First:** Avoid over-engineering the IoT hardware. Start with a simple connected button or a basic micro-switch pillbox. Prove the software and behavioral loops first.
2.  **Respect the "Hospital WiFi" Problem:** Elderly homes and hospitals have notoriously bad connectivity. An offline-first mobile architecture is mandatory, not optional.
3.  **Firebase is a Trap for Healthcare:** While Firebase is great for simple chats, healthcare data is relational. Trying to run complex queries (e.g., "Find all patients of Doctor X who missed Medication Y in the last 7 days") in Firestore becomes an expensive, slow nightmare. Stick to PostgreSQL.
4.  **The Caregiver is the Differentiator:** Patients often swipe away their own alarms. Caregivers, however, act immediately when alerted about a loved one. The caregiver escalation loop is your most valuable product feature.

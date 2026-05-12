/**
 * services/api.js — Centralized API layer for Medisync Mobile
 *
 * Mirrors the web api.js but uses AsyncStorage instead of localStorage.
 * All calls go to API_BASE — correctly configured for the deployed backend.
 *
 * Deployed Backend: https://medisync-backend-520988526649.asia-south1.run.app
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ─── Config ────────────────────────────────────────────────────────────────────
const ENV = 'PROD'; // 'DEV', 'STAGING', 'PROD'
const LOCAL_WIFI_IP = '192.168.1.13'; // Replace with your local IP if testing on physical device

const getApiBase = () => {
  if (ENV === 'PROD') return 'https://backend-520988526649.asia-south1.run.app';
  if (ENV === 'STAGING') return 'https://medisync-staging.run.app';
  if (Platform.OS === 'android') {
    return Constants.isDevice ? `http://${LOCAL_WIFI_IP}:8000` : 'http://10.0.2.2:8000';
  }
  return `http://${LOCAL_WIFI_IP}:8000`;
};

export const API_BASE = getApiBase();
console.log(`[Network] Environment: ${ENV}, API_BASE: ${API_BASE}`);

const TOKEN_KEY = 'medisync_token';
const USER_KEY = 'medisync_user';
const ROLE_KEY = 'medisync_ui_role';

// ─── Network Utilities ────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

let globalLogoutHandler = null;
export function setGlobalLogoutHandler(handler) {
  globalLogoutHandler = handler;
}

async function fetchWithTimeout(resource, options) {
  const { timeout = FETCH_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// ─── Token & User Helpers ──────────────────────────────────────────────────────

export async function getToken() {
  try { return await AsyncStorage.getItem(TOKEN_KEY) } catch { return null }
}

export async function setToken(token) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, ROLE_KEY]);
}

export async function setUser(user) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser() {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null }
}

export async function saveUiRole(role) {
  await AsyncStorage.setItem(ROLE_KEY, role);
}

export async function getUiRole() {
  try { return (await AsyncStorage.getItem(ROLE_KEY)) || 'patient' } catch { return 'patient' }
}

// ─── Base Fetch ────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}, authenticated = true, retries = MAX_RETRIES) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (authenticated) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't override Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const url = `${API_BASE}${path}`;

  try {
    const res = await fetchWithTimeout(url, { ...options, headers });

    if (!res.ok) {
      if (res.status === 401 && authenticated) {
        console.warn(`[API Auth Error] Unauthorized access at ${path}. Token may be expired.`);
        if (globalLogoutHandler) {
          globalLogoutHandler();
        }
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }

    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[API Timeout] ${path}`);
      throw new Error('Request timed out. Please check your connection.');
    }

    // Retry logic for network failures on idempotent requests
    const isIdempotent = !options.method || options.method === 'GET';
    if (retries > 0 && isIdempotent) {
      console.warn(`[API Retry] Retrying ${path} (${retries} left)...`);
      await new Promise(res => setTimeout(res, 1000));
      return apiFetch(path, options, authenticated, retries - 1);
    }

    console.error(`[API Error] ${path}:`, error.message);
    throw error;
  }
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function apiRegister(name, email, password, role = 'patient', phone = null, specialization = null, verifyPhoneNow = false) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name, email, password, role,
      phone: phone || undefined,
      specialization: specialization || undefined,
      verify_phone_now: verifyPhoneNow,
    }),
  }, false);
}

export async function apiLogin(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  await setToken(data.access_token);
  return data;
}

export async function apiPatientLogin(patient_id) {
  const data = await apiFetch('/auth/login/patient', {
    method: 'POST',
    body: JSON.stringify({ patient_id }),
  }, false);
  await setToken(data.access_token);
  return data;
}

export async function apiCaretakerLogin(patient_id, caretaker_pin) {
  const data = await apiFetch('/auth/caretaker-login', {
    method: 'POST',
    body: JSON.stringify({ patient_id, caretaker_pin }),
  }, false);
  await setToken(data.access_token);
  // Store caretaker context so dashboard can show patient info
  await AsyncStorage.setItem('medisync_caretaker_ctx', JSON.stringify({
    linked_patient_id: data.linked_patient_id,
    patient_name:      data.patient_name,
    expires_in:        data.expires_in,
    logged_at:         Date.now(),
  }));
  return data;
}

/** Request a password reset code via email (no auth required) */
export async function apiForgotPassword(email) {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false);
}

/** Submit reset code + new password (no auth required) */
export async function apiResetPassword(email, reset_code, new_password) {
  return apiFetch('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, reset_code, new_password }),
  }, false);
}

/** Session metadata for the current logged-in user */
export async function apiGetSessionInfo() {
  return apiFetch('/auth/me/session');
}

/** Send OTP to phone number (requires auth) */
export async function apiSendOTP(phone_number) {
  return apiFetch('/phone/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number }),
  });
}

/** Verify OTP code for phone (requires auth) */
export async function apiVerifyOTP(phone_number, otp_code) {
  return apiFetch('/phone/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number, otp_code }),
  });
}

export async function apiSetCaretakerPin(caretaker_pin, caretaker_name) {
  return apiFetch('/auth/set-caretaker-pin', {
    method: 'PUT',
    body: JSON.stringify({ caretaker_pin, caretaker_name }),
  });
}

/** Auto-generate a secure 6-digit PIN. Returns plain PIN ONCE — never stored. */
export async function apiGenerateCaretakerPin(caretaker_name, relationship) {
  return apiFetch('/auth/caretaker/generate-pin', {
    method: 'POST',
    body: JSON.stringify({ caretaker_name, relationship }),
  });
}

/** Get current caretaker access status for the settings screen. */
export async function apiGetCaretakerStatus() {
  return apiFetch('/auth/caretaker/status');
}

/** Fully revoke caretaker access — deletes PIN and invalidates all active sessions. */
export async function apiRevokeCaretakerAccess() {
  return apiFetch('/auth/caretaker/revoke', { method: 'DELETE' });
}

/** Toggle caretaker access on/off without regenerating the PIN. */
export async function apiToggleCaretakerAccess(enabled) {
  return apiFetch('/auth/caretaker/toggle', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

// ─── User ──────────────────────────────────────────────────────────────────────

export async function apiGetMe() {
  return apiFetch('/me');
}

export async function apiUpdateMe(data) {
  return apiFetch('/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiUpdateCallingPreferences(data) {
  return apiFetch('/me/calling-preferences', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiUpdateCaregiver(data) {
  return apiFetch('/me/caregiver', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}


export async function apiGetPrescriptions(limit = 20, skip = 0) {
  return apiFetch(`/user-prescriptions?limit=${limit}&skip=${skip}`);
}

export async function apiGetInsights() {
  return apiFetch('/insights');
}

// ─── Scan ──────────────────────────────────────────────────────────────────────

export async function apiScan(imageUri, mimeType = 'image/jpeg', fileName = 'prescription.jpg') {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const formData = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    formData.append('file', blob, fileName);
  } else {
    formData.append('file', {
      uri: imageUri,
      type: mimeType,
      name: fileName,
    });
  }

  const res = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Scan failed (${res.status})`);
  }

  return res.json();
}

// ─── Tracking ──────────────────────────────────────────────────────────────────

export async function apiMarkDone(med_id, status, note = '') {
  return apiFetch('/mark-done', {
    method: 'POST',
    body: JSON.stringify({ med_id, status, note }),
  });
}

export async function apiDeleteExpired() {
  return apiFetch('/expired', { method: 'DELETE' });
}

export async function apiReportSymptom(symptom, severity, time_context = null) {
  return apiFetch('/symptoms', {
    method: 'POST',
    body: JSON.stringify({ symptom, severity, time_context }),
  });
}

// ─── Pillbox ───────────────────────────────────────────────────────────────────

export async function apiGetPillboxSlots() {
  return apiFetch('/pillbox');
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export async function apiChat(question, language = 'en', user_data = {}) {
  return apiFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ question, language, user_data }),
  });
}

export async function apiChatAudio(audioUri, language = 'en') {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'voice.m4a',
  });

  const res = await fetch(`${API_BASE}/chat/audio?language=${language}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Audio chat failed (${res.status})`);
  }

  return res.json();
}

// ─── Doctor Chat ───────────────────────────────────────────────────────────────

export async function apiSendDoctorMessage(message) {
  return apiFetch('/doctor/message', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function apiGetDoctorMessages(limit = 50, skip = 0) {
  return apiFetch(`/doctor/messages?limit=${limit}&skip=${skip}`);
}

export async function apiBroadcastAlert(message, severity) {
  return apiFetch('/doctor/broadcast', {
    method: 'POST',
    body: JSON.stringify({ message, severity }),
  });
}

// ─── Doctor Panel ──────────────────────────────────────────────────────────────

export async function apiGetDoctorPatients() {
  return apiFetch('/doctor/patients');
}

export async function apiGetPatientProfile(patient_id) {
  return apiFetch(`/doctor/patient/${patient_id}`);
}

export async function apiDoctorGetInbox() {
  return apiFetch('/doctor/inbox');
}

export async function apiDoctorSendReply(patient_id, message) {
  return apiFetch('/doctor/reply', {
    method: 'POST',
    body: JSON.stringify({ patient_id, message }),
  });
}

/** Doctor fetches a specific patient's full chat thread */
export async function apiDoctorGetPatientThread(patient_id) {
  return apiFetch(`/doctor/patient-thread/${patient_id}`);
}

/** Doctor marks all patient messages in a thread as seen */
export async function apiMarkDoctorMessagesSeen(patient_id) {
  return apiFetch('/doctor/mark-seen', {
    method: 'POST',
    body: JSON.stringify({ patient_id }),
  });
}

// ─── Health ────────────────────────────────────────────────────────────────────

export async function apiHealthCheck() {
  return apiFetch('/health-check', {}, false);
}

// ─── Push Notifications ────────────────────────────────────────────────────────

export async function apiRegisterPushToken(expo_push_token) {
  return apiFetch('/register-push-token', {
    method: 'POST',
    body: JSON.stringify({ expo_push_token }),
  });
}

// ─── Weekly Adherence Chart ────────────────────────────────────────────────────

export async function apiGetWeeklyAdherence() {
  return apiFetch('/adherence/weekly');
}

export async function apiGetMedicineAnalytics(days = 30) {
  return apiFetch(`/medicine/analytics?days=${days}`);
}

export async function apiGetSmartReport(days = 30) {
  return apiFetch(`/medicine/smart-report?days=${days}`);
}

// ─── Doctor Search & Linking ───────────────────────────────────────────────────

export async function apiSearchAllPatients(q = '', limit = 20) {
  return apiFetch(`/doctor/all-patients?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export async function apiAssignPatient(patient_user_id) {
  return apiFetch('/doctor/assign-patient', {
    method: 'POST',
    body: JSON.stringify({ patient_user_id }),
  });
}

export async function apiRegisterDoctor(doctor_patient_id) {
  return apiFetch('/doctor/register-doctor', {
    method: 'POST',
    body: JSON.stringify({ doctor_patient_id }),
  });
}

// ─── Voice Reminder ────────────────────────────────────────────────────────────

export async function apiGetVoiceReminder(medicine_name, slot = 'morning', language = 'en') {
  return apiFetch('/voice-reminder', {
    method: 'POST',
    body: JSON.stringify({ medicine_name, slot, language }),
  });
}

// ─── Phone & OTP Verification ──────────────────────────────────────────────────

export async function apiSendOtp(phone_number) {
  return apiFetch('/phone/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number }),
  });
}

export async function apiVerifyOtp(phone_number, otp_code) {
  return apiFetch('/phone/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number, otp_code }),
  });
}

// ─── Doctor Dashboard ──────────────────────────────────────────────────────────

export async function apiGetDoctorDashboard() {
  return apiFetch('/doctor/dashboard');
}

// ─── Doctor Profile ────────────────────────────────────────────────────────────

export async function apiGetDoctorProfile() {
  return apiFetch('/doctor/profile');
}

export async function apiUpdateDoctorProfile(data) {
  return apiFetch('/doctor/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Medicine Management ───────────────────────────────────────────────────────

export async function apiAddMedicine(medicineData) {
  return apiFetch('/doctor/medicine/add', {
    method: 'POST',
    body: JSON.stringify(medicineData),
  });
}

export async function apiEditMedicine(medicineData) {
  return apiFetch('/doctor/medicine/edit', {
    method: 'PUT',
    body: JSON.stringify(medicineData),
  });
}

export async function apiDeleteMedicine(patient_id, medicine_index) {
  return apiFetch('/doctor/medicine/delete', {
    method: 'DELETE',
    body: JSON.stringify({ patient_id, medicine_index }),
  });
}

// ─── Clinical Notes ────────────────────────────────────────────────────────────

export async function apiAddClinicalNote(patient_id, note, is_private = true) {
  return apiFetch('/doctor/notes/add', {
    method: 'POST',
    body: JSON.stringify({ patient_id, note, is_private }),
  });
}

export async function apiGetClinicalNotes(patient_id) {
  return apiFetch(`/doctor/notes/${patient_id}`);
}

// ─── Follow-up Reminders ───────────────────────────────────────────────────────

export async function apiAddFollowUp(patient_id, note, follow_up_date) {
  return apiFetch('/doctor/followup/add', {
    method: 'POST',
    body: JSON.stringify({ patient_id, note, follow_up_date }),
  });
}

export async function apiGetFollowUps() {
  return apiFetch('/doctor/followups');
}

// ─── Audit Trail ───────────────────────────────────────────────────────────────

export async function apiGetAuditTrail(patient_id) {
  return apiFetch(`/doctor/audit/${patient_id}`);
}

// ─── Emergency SOS ─────────────────────────────────────────────────────────────

export async function apiTriggerEmergency(note = '', location = null) {
  return apiFetch('/doctor/emergency/trigger', {
    method: 'POST',
    body: JSON.stringify({ note, location }),
  });
}

export async function apiGetEmergencyStatus() {
  return apiFetch('/doctor/emergency/status');
}

/** Patient/Caretaker emergency status — uses /doctor/emergency/status */
export async function apiGetPatientEmergencyStatus() {
  return apiFetch('/doctor/emergency/status');
}

export async function apiResolveEmergency(emergency_id, note = '') {
  return apiFetch('/doctor/emergency/resolve', {
    method: 'PUT',
    body: JSON.stringify({ emergency_id, note }),
  });
}

// ─── Patient Medicine Delete ────────────────────────────────────────────────────

export async function apiPatientDeleteMedicine(rx_id, med_index) {
  return apiFetch(`/prescription/${rx_id}/medicine/${med_index}`, {
    method: 'DELETE',
  });
}

// ─── Notifications ─────────────────────────────────────────────────────────────

/** Register FCM device token with backend */
export async function apiRegisterFCMToken(token, deviceId = '', platform = 'android') {
  return apiFetch('/notifications/fcm-token', {
    method: 'POST',
    body: JSON.stringify({ token, device_id: deviceId, platform }),
  });
}

/** Fetch notification inbox */
export async function apiGetNotifications(limit = 50, skip = 0, type = null, unreadOnly = false) {
  const params = new URLSearchParams({ limit, skip, unread_only: unreadOnly });
  if (type) params.set('notif_type', type);
  return apiFetch(`/notifications?${params}`);
}

/** Get unread notification count (for badges) */
export async function apiGetUnreadNotificationCount() {
  return apiFetch('/notifications/unread-count');
}

/** Mark notifications as read */
export async function apiMarkNotificationsRead(ids = [], markAll = false) {
  return apiFetch('/notifications/mark-read', {
    method: 'POST',
    body: JSON.stringify({ ids, mark_all: markAll }),
  });
}

/** Record notification analytics event */
export async function apiNotificationAnalytics(notificationId, event) {
  return apiFetch(`/notifications/analytics/${notificationId}?event=${event}`, {
    method: 'POST',
  });
}

/** Get notification preferences */
export async function apiGetNotificationPreferences() {
  return apiFetch('/notifications/preferences');
}

/** Update notification preferences */
export async function apiUpdateNotificationPreferences(prefs) {
  return apiFetch('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

/** Mark a dose as taken (quick action from notification) */
export async function apiMarkDoseTaken(med_id, slot = '') {
  return apiFetch('/tracking/mark-done', {
    method: 'POST',
    body: JSON.stringify({ med_id, slot, status: 'taken' }),
  });
}

/** Mark a dose as skipped (quick action from notification) */
export async function apiMarkDoseSkipped(med_id, slot = '') {
  return apiFetch('/tracking/mark-done', {
    method: 'POST',
    body: JSON.stringify({ med_id, slot, status: 'skipped' }),
  });
}

/**
 * services/api.js — Centralized API layer for Medisync Mobile
 *
 * Mirrors the web api.js but uses AsyncStorage instead of localStorage.
 * All calls go to API_BASE — update this to your machine's local IP for device testing.
 *
 * Android Emulator: http://10.0.2.2:8000
 * Physical device:  http://<your-local-ip>:8000
 * Local browser:    http://127.0.0.1:8000
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ─── Config ────────────────────────────────────────────────────────────────────
// Dynamically use the IP of the machine running the Expo bundler
const debuggerHost = Constants.expoConfig?.hostUri;
const LOCAL_IP = debuggerHost ? debuggerHost.split(':')[0] : 'localhost';
export const API_BASE = Platform.OS === 'web' ? 'http://localhost:8000' : `http://${LOCAL_IP}:8000`;

const TOKEN_KEY = 'medisync_token';
const USER_KEY  = 'medisync_user';
const ROLE_KEY  = 'medisync_ui_role';

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

async function apiFetch(path, options = {}, authenticated = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (authenticated) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't override Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }

  return res.json();
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function apiRegister(name, email, password, role = 'patient') {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
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


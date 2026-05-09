/**
 * api.js — Centralized API layer for Medisync frontend.
 *
 * All fetch calls go through here so:
 *  - Base URL is configured once
 *  - JWT token is attached automatically to protected requests
 *  - Errors are thrown with clean messages
 */

export const API_BASE = 'http://127.0.0.1:8000'

// ─── Token Helpers ───────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem('medisync_token')
}

export function setToken(token) {
  localStorage.setItem('medisync_token', token)
}

export function clearToken() {
  localStorage.removeItem('medisync_token')
  localStorage.removeItem('medisync_user')
}

export function setUser(user) {
  localStorage.setItem('medisync_user', JSON.stringify(user))
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('medisync_user')) || null
  } catch {
    return null
  }
}

// ─── Base Fetch ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}, authenticated = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }

  if (authenticated) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Request failed (${res.status})`)
  }

  return res.json()
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function apiRegister(name, email, password, role = 'patient') {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  }, false)
}

export async function apiLogin(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false)
  // Store token on successful login
  setToken(data.access_token)
  return data
}

export async function apiPatientLogin(patient_id) {
  const data = await apiFetch('/auth/login/patient', {
    method: 'POST',
    body: JSON.stringify({ patient_id }),
  }, false)
  setToken(data.access_token)
  return data
}

// ─── User ────────────────────────────────────────────────────────────────────

export async function apiGetMe() {
  return apiFetch('/me')
}

export async function apiGetPrescriptions(limit = 20, skip = 0) {
  return apiFetch(`/user-prescriptions?limit=${limit}&skip=${skip}`)
}

export async function apiGetInsights() {
  return apiFetch('/insights')
}

// ─── Scan ────────────────────────────────────────────────────────────────────

export async function apiScan(file) {
  const formData = new FormData()
  formData.append('file', file)

  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Scan failed (${res.status})`)
  }

  return res.json()
}

// ─── Tracking ────────────────────────────────────────────────────────────────

export async function apiMarkDone(med_id, status, note = '') {
  return apiFetch('/mark-done', {
    method: 'POST',
    body: JSON.stringify({ med_id, status, note }),
  })
}

export async function apiDeleteExpired() {
  return apiFetch('/expired', { method: 'DELETE' })
}

// ─── Pillbox Helpers (uses /user-prescriptions + /mark-done) ─────────────────

/**
 * Derives today's pillbox slots from the user's prescriptions.
 * Returns { morning: [], afternoon: [], night: [] } where each entry is
 * { med_id, name, dosage, timing, status }
 */
export async function apiGetPillboxSlots() {
  const rxData = await apiGetPrescriptions(5, 0)
  const prescriptions = rxData.prescriptions || []

  const slots = { morning: [], afternoon: [], night: [] }

  prescriptions.forEach(rx => {
    const meds = rx.medicines || []
    meds.forEach(med => {
      const timing = (med.timing || '').toLowerCase()
      const entry = {
        med_id: med.name?.replace(/\s+/g, '_').toLowerCase() || 'unknown',
        name: med.name || 'Unknown Medicine',
        dosage: med.dosage || '',
        timing: med.timing || '',
        status: 'pending',  // default; real status tracked locally
        rx_id: rx._id,
      }

      if (timing.includes('morning') || timing.includes('breakfast') || timing.includes('सुबह')) {
        slots.morning.push(entry)
      } else if (timing.includes('afternoon') || timing.includes('lunch') || timing.includes('दोपहर')) {
        slots.afternoon.push(entry)
      } else if (timing.includes('night') || timing.includes('dinner') || timing.includes('evening') || timing.includes('रात')) {
        slots.night.push(entry)
      } else {
        // Default to morning if timing unclear
        slots.morning.push(entry)
      }
    })
  })

  return slots
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function apiChat(question, language = 'en', user_data = {}) {
  return apiFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ question, language, user_data }),
  })
}

// ─── Doctor Chat (Patient side) ───────────────────────────────────────────────

export async function apiSendDoctorMessage(message) {
  return apiFetch('/doctor/message', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export async function apiGetDoctorMessages(limit = 50, skip = 0) {
  return apiFetch(`/doctor/messages?limit=${limit}&skip=${skip}`)
}

// ─── Doctor Panel (Doctor side) ───────────────────────────────────────────────

export async function apiGetDoctorPatients() {
  return apiFetch('/doctor/patients')
}

export async function apiGetPatientProfile(patient_id) {
  return apiFetch(`/doctor/patient/${patient_id}`)
}

export async function apiDoctorGetInbox() {
  // Returns doctor's message inbox
  return apiFetch('/doctor/messages?limit=100&skip=0')
}

export async function apiDoctorSendReply(patient_id, message) {
  // Doctor sends a reply to a specific patient
  return apiFetch('/doctor/reply', {
    method: 'POST',
    body: JSON.stringify({ patient_id, message }),
  })
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function apiHealthCheck() {
  return apiFetch('/health-check', {}, false)
}

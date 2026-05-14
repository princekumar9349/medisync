/**
 * services/ReminderEngine.js — Smart Escalation Reminder Engine
 *
 * Escalation flow per medicine:
 *   T+0m  → Stage 0: Normal reminder
 *   T+10m → Stage 1: Repeat
 *   T+30m → Stage 2: Warning
 *   T+60m → Stage 3: Critical + caretaker alert
 *
 * Quick actions: Taken / Snooze / Skip — all cancel escalation chain
 * Persists state across app restarts via AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationService from './NotificationService';
import { enqueueSyncAction } from '../sync/queue';
import { apiMarkDoseTaken, apiMarkDoseSkipped, apiRegisterFCMToken } from './api';

const STORE_KEY      = '@medisync_medicines';
const ESCALATION_KEY = '@medisync_escalation';
const PREFS_KEY      = '@medisync_notif_prefs';

// Escalation delay chain in minutes
const ESCALATION_DELAYS = [0, 10, 30, 60];

class ReminderEngine {
  constructor() {
    this.medicines       = [];
    this.escalationState = {}; // { medId: { stage, scheduledAt, timeoutIds } }
  }

  // ─── Sync from server ────────────────────────────────────────────────────────
  async syncMedicines(medicinesFromServer) {
    this.medicines = medicinesFromServer || [];
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(this.medicines));
    await this.scheduleAllReminders();
  }

  async loadFromLocal() {
    try {
      const data = await AsyncStorage.getItem(STORE_KEY);
      this.medicines = data ? JSON.parse(data) : [];
    } catch { this.medicines = []; }
    return this.medicines;
  }

  // ─── Preferences ─────────────────────────────────────────────────────────────
  async loadPreferences() {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  async savePreferences(prefs) {
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }

  // ─── Time parsing ─────────────────────────────────────────────────────────────
  _parseTiming(timingStr) {
    if (!timingStr) return null;
    // Handle "09:00 AM" format
    const parts = timingStr.trim().split(' ');
    if (parts.length === 2) {
      const [h, m] = parts[0].split(':').map(Number);
      let hours = h;
      if (parts[1].toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (parts[1].toUpperCase() === 'AM' && hours === 12) hours = 0;
      const d = new Date();
      d.setHours(hours, m, 0, 0);
      return d;
    }
    // Handle "09:00" 24h format
    if (parts.length === 1 && parts[0].includes(':')) {
      const [h, m] = parts[0].split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    // Handle slot-based timing
    const SLOT_TIMES = { morning: '08:00', afternoon: '13:00', night: '21:00' };
    if (SLOT_TIMES[timingStr?.toLowerCase()]) {
      const [h, m] = SLOT_TIMES[timingStr.toLowerCase()].split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    return null;
  }

  _getMedTimes(med) {
    // Returns array of Date objects for today's dose times
    const times = [];
    const now = new Date();

    // If medicine has explicit timing string
    if (med.timing) {
      const t = this._parseTiming(med.timing);
      if (t) times.push(t);
    }

    // Slot-based
    const SLOT_TIMES = { morning: [8, 0], afternoon: [13, 0], night: [21, 0] };
    for (const [slot, [h, m]] of Object.entries(SLOT_TIMES)) {
      if (med[slot]) {
        const d = new Date();
        d.setHours(h, m, 0, 0);
        if (!times.some(t => Math.abs(t - d) < 60000)) times.push(d);
      }
    }

    return times;
  }

  // ─── Schedule all reminders ────────────────────────────────────────────────
  async scheduleAllReminders() {
    // Local scheduling disabled: Notifications are now driven purely by the backend FCM pushes.
    // The mobile app only needs to be registered with FCM.
    console.log('[ReminderEngine] Local scheduling disabled. Relying on backend FCM pushes.');
  }

  // ─── Start escalation chain for a specific medicine ──────────────────────────
  async startEscalation(med) {
    const medId = med.med_id || med._id || med.name;
    if (this.escalationState[medId]) return; // already running

    this.escalationState[medId] = { stage: 0, active: true };
    await this._saveEscalationState();

    for (let stage = 0; stage < ESCALATION_DELAYS.length; stage++) {
      if (!this.escalationState[medId]?.active) break;
      await this._scheduleEscalationStage(med, stage);
    }
  }

  async _scheduleEscalationStage(med, stage) {
    const medId = med.med_id || med._id || med.name;
    const delayMs = ESCALATION_DELAYS[stage] * 60 * 1000;

    return new Promise((resolve) => {
      const tid = setTimeout(async () => {
        if (!this.escalationState[medId]?.active) { resolve(); return; }
        this.escalationState[medId].stage = stage;
        await this._saveEscalationState();

        await NotificationService.showMedicineReminder(med, stage);

        // Stage 3: notify caretaker
        if (stage === 3) {
          await NotificationService.showCaretakerAlert(
            med.patientName || 'Your patient',
            `${med.name} has not been taken. Please check in.`,
            true
          );
          if (this.escalationState[medId]) {
            this.escalationState[medId].caretakerNotified = true;
            await this._saveEscalationState();
          }
        }
        resolve();
      }, delayMs);
    });
  }

  async cancelEscalation(medId) {
    if (this.escalationState[medId]) {
      this.escalationState[medId].active = false;
      delete this.escalationState[medId];
      await this._saveEscalationState();
    }
    await NotificationService.cancelMedicineNotifications(medId);
    await NotificationService.cancelLiveTracker(medId);
  }

  async _saveEscalationState() {
    try {
      await AsyncStorage.setItem(ESCALATION_KEY, JSON.stringify(this.escalationState));
    } catch {}
  }

  async _loadEscalationState() {
    try {
      const raw = await AsyncStorage.getItem(ESCALATION_KEY);
      this.escalationState = raw ? JSON.parse(raw) : {};
    } catch { this.escalationState = {}; }
  }

  // ─── Quick action handlers (called from App.js background event) ─────────────
  async handleTaken(medicineId, stage = null) {
    const timestamp = new Date().toISOString();
    try {
      await apiMarkDoseTaken(medicineId, '', timestamp);
    } catch (e) {
      console.warn('[ReminderEngine] Network fail marking taken. Queuing offline action:', e.message);
      await enqueueSyncAction({
        operation_type: 'MARK_TAKEN',
        priority: 1, // High priority adherence log
        payload: { medicine_id: medicineId, slot: '', timestamp },
        dedupe_key: `taken_${medicineId}`
      });
    }
    await this.cancelEscalation(medicineId);
    await NotificationService.showEngagementNotification('all_taken');
  }

  async handleSkipped(medicineId, stage = null) {
    const timestamp = new Date().toISOString();
    try {
      await apiMarkDoseSkipped(medicineId, '', timestamp);
    } catch (e) {
      console.warn('[ReminderEngine] Network fail marking skipped. Queuing offline action:', e.message);
      await enqueueSyncAction({
        operation_type: 'MARK_SKIPPED',
        priority: 1, // High priority adherence log
        payload: { medicine_id: medicineId, slot: '', timestamp },
        dedupe_key: `skipped_${medicineId}`
      });
    }
    await this.cancelEscalation(medicineId);
  }

  async handleSnooze(medicineId) {
    const count = (this.escalationState[medicineId]?.snoozeCount || 0) + 1;
    await this.cancelEscalation(medicineId);
    
    // Restore count after cancelEscalation wipes the state
    this.escalationState[medicineId] = { snoozeCount: count };
    await this._saveEscalationState();

    // Escalation Intelligence: Shorten snooze limits dynamically
    let snoozeMinutes = 10;
    if (count === 2) snoozeMinutes = 5;
    if (count >= 3) snoozeMinutes = 2;

    const med = this.medicines.find(m => (m.med_id || m._id || m.name) === medicineId);
    if (!med) return;
    
    const snoozeTime = Date.now() + snoozeMinutes * 60 * 1000;
    await NotificationService.scheduleLiveTrackerEvents(med, snoozeTime);
  }

  // ─── Daily Scheduled Summaries ────────────────────────────────────────────────
  async scheduleDailySummaries(role = 'patient') {
    if (!notifeeAvailable()) return;
    const prefs = await this.loadPreferences();
    const timeMap = {
      patient:   prefs.patient_summary_time   || '21:00',
      doctor:    prefs.doctor_summary_time    || '20:00',
      caretaker: prefs.caretaker_summary_time || '21:30',
    };
    const t = timeMap[role] || '21:00';
    const [h, m] = t.split(':').map(Number);
    const trigger = new Date();
    trigger.setHours(h, m, 0, 0);
    if (trigger < new Date()) trigger.setDate(trigger.getDate() + 1);

    await NotificationService.scheduleEngagementSummary(role, trigger.getTime());
  }
}

function notifeeAvailable() {
  try { require('@notifee/react-native'); return true; } catch { return false; }
}

export default new ReminderEngine();

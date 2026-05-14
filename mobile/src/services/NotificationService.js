/**
 * services/NotificationService.js — Production-Grade Notification Engine
 *
 * Features:
 *   - 6 Android notification channels (medicine, doctor, emergency, AI, caretaker, system)
 *   - FCM token registration with backend
 *   - Graceful Expo Go degradation (wraps all notifee calls in try/catch)
 *   - Quick actions: Take / Snooze / Skip
 *   - Emergency: max priority, bypass DnD, sticky
 *   - Silent hours aware (reads from AsyncStorage preferences)
 *   - Engagement notifications: streaks, AI warnings, daily summaries
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Graceful notifee import ──────────────────────────────────────────────────
let notifee = null;
let AndroidImportance = {};
let AndroidVisibility = {};
let AndroidCategory = {};
let TriggerType = {};
let AuthorizationStatus = {};
let EventType = {};
let AndroidStyle = {};

try {
  const mod = require('@notifee/react-native');
  notifee = mod.default;
  AndroidImportance = mod.AndroidImportance || {};
  AndroidVisibility = mod.AndroidVisibility || {};
  AndroidCategory = mod.AndroidCategory || {};
  TriggerType = mod.TriggerType || {};
  AuthorizationStatus = mod.AuthorizationStatus || {};
  EventType = mod.EventType || {};
  AndroidStyle = mod.AndroidStyle || {};
} catch {
  console.warn('[NotificationService] notifee not available (Expo Go) — degraded mode');
}

// ─── Channel IDs ─────────────────────────────────────────────────────────────
export const CH = {
  MEDICINE: 'med-reminder',
  DOCTOR: 'doctor-messages',
  EMERGENCY: 'emergency',
  AI: 'ai-warnings',
  CARETAKER: 'caretaker',
  SYSTEM: 'system',
  COUNTDOWN: 'medisync-foreground',
};

// ─── Severity colors ──────────────────────────────────────────────────────────
const COLORS = {
  medicine: '#0D9488',  // teal
  doctor: '#4338CA',  // indigo
  emergency: '#DC2626',  // red
  ai_warning: '#7C3AED',  // purple
  caretaker: '#D97706',  // amber
  system: '#475569',  // slate
};

// ─── Silent hours check ───────────────────────────────────────────────────────
async function _isInSilentHours() {
  try {
    const raw = await AsyncStorage.getItem('@medisync_notif_prefs');
    if (!raw) return false;
    const prefs = JSON.parse(raw);
    if (!prefs.silent_hours_start || !prefs.silent_hours_end) return false;
    const now = new Date();
    const [sh, sm] = prefs.silent_hours_start.split(':').map(Number);
    const [eh, em] = prefs.silent_hours_end.split(':').map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (startMin > endMin) {
      return nowMin >= startMin || nowMin < endMin;
    }
    return nowMin >= startMin && nowMin < endMin;
  } catch { return false; }
}

// ─── Main Service Class ───────────────────────────────────────────────────────
class NotificationService {

  // ── Permissions ─────────────────────────────────────────────────────────────
  async requestPermissions() {
    if (!notifee) return false;
    try {
      const settings = await notifee.requestPermission();
      return settings.authorizationStatus >= (AuthorizationStatus.AUTHORIZED ?? 1);
    } catch (e) {
      console.warn('[NS] requestPermissions error:', e.message);
      return false;
    }
  }

  async checkExactAlarmPermission() {
    if (!notifee || Platform.OS !== 'android') return true;
    try {
      const settings = await notifee.getNotificationSettings();
      return settings.android?.alarm !== (AndroidImportance.NONE ?? 0);
    } catch { return true; }
  }

  async openExactAlarmSettings() {
    if (!notifee || Platform.OS !== 'android') return;
    try { await notifee.openAlarmPermissionSettings(); } catch { }
  }

  async checkBatteryOptimizations() {
    if (!notifee || Platform.OS !== 'android') return false;
    try {
      const enabled = await notifee.isBatteryOptimizationEnabled();
      if (enabled) console.warn('[NS] Battery optimization is ON — notifications may be delayed');
      return enabled;
    } catch { return false; }
  }

  async getNotificationSettings() {
    if (!notifee) return { isAuthorized: false };
    try {
      const settings = await notifee.getNotificationSettings();
      return {
        isAuthorized: settings.authorizationStatus === AuthorizationStatus.AUTHORIZED,
        raw: settings
      };
    } catch {
      return { isAuthorized: false };
    }
  }

  async openBatterySettings() {
    if (!notifee || Platform.OS !== 'android') return;
    try { await notifee.openBatteryOptimizationSettings(); } catch { }
  }

  async openPowerManagerSettings() {
    if (!notifee || Platform.OS !== 'android') return;
    try { await notifee.openPowerManagerSettings(); } catch { }
  }

  // ── Channel Creation ─────────────────────────────────────────────────────────
  async createChannels() {
    if (!notifee || Platform.OS !== 'android') return;
    const channels = [
      {
        id: CH.MEDICINE,
        name: 'Medicine Reminders',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
        vibrationPattern: [300, 500],
      },
      {
        id: CH.DOCTOR,
        name: 'Doctor Messages',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
      },
      {
        id: CH.EMERGENCY,
        name: 'Emergency Alerts',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
        vibrationPattern: [100, 200, 100, 200, 100, 500],
        bypassDnd: true,
      },
      {
        id: CH.AI,
        name: 'AI Health Warnings',
        importance: AndroidImportance.DEFAULT,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
      },
      {
        id: CH.CARETAKER,
        name: 'Caretaker Alerts',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
      },
      {
        id: CH.SYSTEM,
        name: 'System Updates',
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PRIVATE,
        sound: undefined,
        vibration: false,
      },
      {
        id: CH.COUNTDOWN,
        name: 'Live Countdown',
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PUBLIC,
        vibration: false,
      },
    ];
    try {
      await notifee.createChannels(channels);
      console.log('[NS] All notification channels created');
    } catch (e) {
      console.warn('[NS] createChannels error:', e.message);
    }
  }

  // ── Generic display ──────────────────────────────────────────────────────────
  async _display(config, bypassSilent = false) {
    if (!notifee) return null;
    if (!bypassSilent && await _isInSilentHours()) {
      console.log('[NS] Silent hours active — notification suppressed');
      return null;
    }
    try {
      await AsyncStorage.setItem('@medisync_last_notif_time', String(Date.now()));
      return await notifee.displayNotification(config);
    } catch (e) {
      console.warn('[NS] displayNotification error:', e.message);
      return null;
    }
  }

  // ── Medicine Reminder ────────────────────────────────────────────────────────
  async showMedicineReminder(med, stage = 0) {
    const stages = [
      { title: `💊 Time for ${med.name}`, body: `Take your ${med.dosage || 'dose'} now.` },
      { title: `⏰ ${med.name} still pending`, body: `You haven't taken your medicine yet.` },
      { title: `⚠️ ${med.name} overdue`, body: `Medicine is overdue — please take it now.` },
      { title: `🚨 Critical: ${med.name} missed`, body: `Missed dose detected. Notifying caretaker.` },
    ];
    const s = stages[Math.min(stage, stages.length - 1)];
    const notifId = `med_${med.med_id || med._id || med.name}_stage${stage}`;
    await this._display({
      id: notifId,
      title: s.title,
      body: s.body,
      data: { medicineId: med.med_id || med._id || med.name, stage: String(stage), type: 'medicine' },
      android: {
        channelId: stage >= 3 ? CH.EMERGENCY : CH.MEDICINE,
        smallIcon: 'ic_launcher',
        color: stage >= 3 ? COLORS.emergency : COLORS.medicine,
        category: AndroidCategory.ALARM ?? 'alarm',
        importance: stage >= 2 ? (AndroidImportance.HIGH ?? 4) : (AndroidImportance.DEFAULT ?? 3),
        ongoing: stage >= 3,
        autoCancel: stage < 3,
        pressAction: { id: 'default' },
        actions: [
          { title: '✅ Taken', pressAction: { id: 'action_taken' } },
          { title: '⏰ Snooze 10m', pressAction: { id: 'action_snooze' } },
          { title: '⏭️ Skip', pressAction: { id: 'action_skip' } },
        ],
      },
    }, stage >= 3);
    return notifId;
  }

  async cancelMedicineNotifications(medId) {
    if (!notifee) return;
    try {
      for (let stage = 0; stage <= 3; stage++) {
        await notifee.cancelNotification(`med_${medId}_stage${stage}`);
      }
    } catch { }
  }

  // ── Doctor Message ────────────────────────────────────────────────────────────
  async showDoctorMessage(doctorName, preview) {
    await this._display({
      id: `doc_msg_${Date.now()}`,
      title: `💬 ${doctorName}`,
      body: preview,
      data: { type: 'doctor_message', action_route: 'DoctorChat' },
      android: {
        channelId: CH.DOCTOR,
        smallIcon: 'ic_launcher',
        color: COLORS.doctor,
        pressAction: { id: 'default' },
        actions: [{ title: '💬 Reply', pressAction: { id: 'doctor_chat' } }],
      },
    });
  }

  // ── Emergency Alert ───────────────────────────────────────────────────────────
  async showEmergencyAlert(patientName, message = 'Emergency SOS triggered') {
    await this._display({
      id: 'emergency_sos',
      title: `🚨 EMERGENCY: ${patientName}`,
      body: message,
      data: { type: 'emergency', action_route: 'DoctorChat' },
      android: {
        channelId: CH.EMERGENCY,
        smallIcon: 'ic_launcher',
        color: COLORS.emergency,
        ongoing: true,
        autoCancel: false,
        category: AndroidCategory.ALARM ?? 'alarm',
        pressAction: { id: 'emergency' },
        actions: [{ title: '📞 Call Emergency', pressAction: { id: 'call_emergency' } }],
      },
    }, true); // bypass silent hours
  }

  // ── AI Warning ────────────────────────────────────────────────────────────────
  async showAIWarning(message, metadata = {}) {
    await this._display({
      id: `ai_warn_${Date.now()}`,
      title: '🤖 AI Health Warning',
      body: message,
      data: { type: 'ai_warning', action_route: 'Profile', ...metadata },
      android: {
        channelId: CH.AI,
        smallIcon: 'ic_launcher',
        color: COLORS.ai_warning,
        pressAction: { id: 'default' },
      },
    });
  }

  // ── Caretaker Alert ───────────────────────────────────────────────────────────
  async showCaretakerAlert(patientName, message, sticky = false) {
    await this._display({
      id: `caretaker_${Date.now()}`,
      title: `👨‍👩‍👦 ${patientName}`,
      body: message,
      data: { type: 'caretaker', action_route: 'CaretakerDashboard' },
      android: {
        channelId: CH.CARETAKER,
        smallIcon: 'ic_launcher',
        color: COLORS.caretaker,
        ongoing: sticky,
        pressAction: { id: 'default' },
      },
    }, true);
  }

  // ── Engagement & Summary ──────────────────────────────────────────────────────
  async showEngagementNotification(type, extra = {}) {
    const messages = {
      all_taken: { title: '🎉 Great job!', body: 'You completed all medicines today!' },
      adherence_improved: { title: '📈 Adherence improved', body: 'Your adherence improved this week. Keep it up!' },
      prescription_updated: { title: '📋 Prescription updated', body: 'Your doctor updated your prescription.' },
      streak_3: { title: '🔥 3-day streak!', body: `You've taken all medicines for 3 days in a row.` },
      missed_3_days: { title: '⚠️ 3-day miss', body: `You have missed medicines 3 days in a row. Please take action.` },
      adherence_drop: { title: '🤖 AI Alert', body: 'AI detected a declining adherence pattern.' },
      daily_summary_patient: { title: '📊 Daily Summary', body: extra.body || 'View your medicine summary for today.' },
      daily_summary_doctor: { title: '🏥 Doctor Daily Summary', body: extra.body || 'Review today\'s patient activity.' },
    };
    const m = messages[type];
    if (!m) return;
    await this._display({
      id: `engage_${type}_${Date.now()}`,
      title: m.title,
      body: m.body,
      data: { type: 'system', action_route: extra.action_route || 'Pillbox' },
      android: {
        channelId: CH.SYSTEM,
        smallIcon: 'ic_launcher',
        color: COLORS.system,
        pressAction: { id: 'default' },
      },
    });
  }

  // ── Live Tracker Trigger ──────────────────────────────────────────────────────
  async scheduleLiveTrackerEvents(med, targetTimeMs) {
    if (!notifee) return;
    const medId = med.med_id || med._id || med.name;
    const fifteenMins = 15 * 60 * 1000;
    const fiveMins = 5 * 60 * 1000;

    const commonActions = [
      { title: '✅ TAKE NOW', pressAction: { id: 'action_taken' } },
      { title: '⏰ SNOOZE', pressAction: { id: 'action_snooze' } },
      { title: '⏭️ SKIP', pressAction: { id: 'action_skip' } },
    ];

    // Smart context selection
    const smartMessages = [
      `Taking this now protects your adherence streak.`,
      `You completed this medicine on time yesterday.`,
      `Stay consistent to reach your health goals.`,
      `One more dose for a perfect day!`,
    ];
    const smartContext = smartMessages[Math.floor(Math.random() * smartMessages.length)];

    // Future-ready payload for Apple Live Activities / Wearables / Widgets
    const futurePayload = {
      medName: med.name,
      targetTimeMs,
      dosage: med.dosage || '1 dose',
      priority: med.critical ? 'high' : 'normal',
      enableWearableSync: true,
      widgetAction: 'OPEN_TRACKER',
    };

    const baseData = { 
      medicineId: medId, 
      type: 'medicine_tracker',
      trackerPayload: JSON.stringify(futurePayload),
      scheduled_for: String(targetTimeMs) // Add exact target for drift detection
    };

    // Rich HTML formatting for Android BigText
    const priorityBadge = med.critical ? `<b>🚨 CRITICAL PRIORITY</b><br/><br/>` : '';
    const expandedBody = `${priorityBadge}` +
      `<b>💊 Dosage:</b> ${med.dosage || '1 dose'}<br/>` +
      `<b>🍽️ Food:</b> ${med.food_instructions || 'As prescribed'}<br/>` +
      `<b>👨‍⚕️ Notes:</b> ${med.notes || 'None'}<br/>` +
      `<b>🔥 Impact:</b> ${smartContext}`;

    try {
      // Clean up previous triggers for this medicine
      await this.cancelLiveTracker(medId);

      // 1. SAFE Mode (T-15m)
      if (targetTimeMs - fifteenMins > Date.now()) {
        await notifee.createTriggerNotification({
          id: `tracker_${medId}`,
          title: `💊 ${med.name} Window Open`,
          body: `Closes in`,
          data: { ...baseData, state: 'SAFE' },
          android: {
            channelId: CH.COUNTDOWN, // Low importance, silent
            smallIcon: 'ic_launcher',
            color: COLORS.medicine,
            ongoing: true,
            autoCancel: false,
            showChronometer: true,
            chronometerDirection: 'down',
            timestamp: targetTimeMs,
            style: { type: AndroidStyle.BIGTEXT ?? 1, text: expandedBody },
            actions: commonActions,
            pressAction: { id: 'default' },
            group: 'medisync_live_trackers',
            sortKey: med.critical ? '0' : '1',
          }
        }, { type: TriggerType.TIMESTAMP ?? 0, timestamp: targetTimeMs - fifteenMins, alarmManager: { allowWhileIdle: true } });
      }

      // 2. DUE SOON Mode (T-5m)
      if (targetTimeMs - fiveMins > Date.now()) {
        await notifee.createTriggerNotification({
          id: `tracker_${medId}`,
          title: `⚠️ ${med.name} Due Soon`,
          body: `Closes in`,
          data: { ...baseData, state: 'DUE_SOON' },
          android: {
            channelId: CH.COUNTDOWN, // Keeps the chronometer going silently
            smallIcon: 'ic_launcher',
            color: '#D97706', // Amber
            ongoing: true,
            autoCancel: false,
            showChronometer: true,
            chronometerDirection: 'down',
            timestamp: targetTimeMs,
            style: { type: AndroidStyle.BIGTEXT ?? 1, text: expandedBody },
            actions: commonActions,
            pressAction: { id: 'default' },
            group: 'medisync_live_trackers',
            sortKey: med.critical ? '0' : '1',
          }
        }, { type: TriggerType.TIMESTAMP ?? 0, timestamp: targetTimeMs - fiveMins, alarmManager: { allowWhileIdle: true } });

        // Secondary brief alert for vibration
        await notifee.createTriggerNotification({
          id: `tracker_alert_${medId}_5m`,
          title: `Medicine Due Soon`,
          body: `Window for ${med.name} closes in 5 minutes.`,
          android: {
            channelId: CH.MEDICINE, // High importance, vibrate
            smallIcon: 'ic_launcher',
            color: '#D97706',
            autoCancel: true,
            timeoutAfter: 5000,
          }
        }, { type: TriggerType.TIMESTAMP ?? 0, timestamp: targetTimeMs - fiveMins, alarmManager: { allowWhileIdle: true } });
      }

      // 3. CRITICAL Mode (T-0m)
      if (targetTimeMs > Date.now()) {
        await notifee.createTriggerNotification({
          id: `tracker_${medId}`,
          title: `🚨 ${med.name} Critical`,
          body: `Window expired`,
          data: { ...baseData, state: 'CRITICAL' },
          android: {
            channelId: CH.EMERGENCY, // Heads up
            smallIcon: 'ic_launcher',
            color: COLORS.emergency, // Red
            ongoing: true,
            autoCancel: false,
            style: { type: AndroidStyle.BIGTEXT ?? 1, text: expandedBody },
            actions: commonActions,
            pressAction: { id: 'default' },
            group: 'medisync_live_trackers',
            sortKey: '0', // Critical always floats to top
          }
        }, { type: TriggerType.TIMESTAMP ?? 0, timestamp: targetTimeMs, alarmManager: { allowWhileIdle: true } });
      }

      // 4. Missed Dose Escalation Trigger (T+10m)
      await notifee.createTriggerNotification({
        id: `tracker_missed_${medId}`,
        title: `❌ ${med.name} Missed`,
        body: `You missed your medicine window. Adherence impacted.`,
        data: { ...baseData, state: 'MISSED' },
        android: {
          channelId: CH.EMERGENCY,
          smallIcon: 'ic_launcher',
          color: COLORS.system,
          autoCancel: true,
          style: { type: AndroidStyle.BIGTEXT ?? 1, text: `The window to take <b>${med.name}</b> has expired. It has been marked as missed in your logs.<br/><br/>If you still take it, you can update it in the app.` },
          pressAction: { id: 'default' },
          group: 'medisync_live_trackers',
          sortKey: '2', // Missed drops to bottom of group
        }
      }, { type: TriggerType.TIMESTAMP ?? 0, timestamp: targetTimeMs + (10 * 60 * 1000), alarmManager: { allowWhileIdle: true } });

      // 5. Update the Group Summary Notification
      await notifee.displayNotification({
        id: 'tracker_summary',
        title: 'Active Medicine Trackers',
        body: 'You have active medicine windows.',
        android: {
          channelId: CH.COUNTDOWN,
          groupSummary: true,
          group: 'medisync_live_trackers',
          smallIcon: 'ic_launcher',
          color: COLORS.medicine,
        }
      });

    } catch (e) {
      console.warn('[NS] scheduleLiveTrackerEvents error:', e.message);
    }
  }

  async cancelLiveTracker(medId) {
    if (!notifee) return;
    try {
      // Cancel pending triggers
      const triggers = await notifee.getTriggerNotificationIds();
      const idsToCancel = triggers.filter(id => id.includes(`tracker_${medId}`) || id.includes(`tracker_alert_${medId}`) || id.includes(`tracker_missed_${medId}`));
      if (idsToCancel.length > 0) {
        await notifee.cancelTriggerNotifications(idsToCancel);
      }
      // Cancel active notifications
      await notifee.cancelNotification(`tracker_${medId}`);
      await notifee.cancelNotification(`tracker_missed_${medId}`);
    } catch { }
  }

  async cancelAll() {
    if (!notifee) return;
    try { await notifee.cancelAllNotifications(); } catch { }
  }

  // ── Test ──────────────────────────────────────────────────────────────────────
  async testNotification() {
    await this._display({
      title: '✅ MediSync Notifications Active',
      body: 'Medicine reminders and alerts are working correctly.',
      android: { channelId: CH.MEDICINE, smallIcon: 'ic_launcher', color: COLORS.medicine, pressAction: { id: 'default' } },
    }, true);
  }
}

export default new NotificationService();

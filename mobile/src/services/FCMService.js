/**
 * services/FCMService.js — Firebase Cloud Messaging Integration
 *
 * Responsibilities:
 *   1. Token lifecycle: request → fetch → register → refresh
 *   2. Foreground messages: FCM payload → Notifee local notification
 *   3. Background/quit-state handler registration (setBackgroundMessageHandler)
 *   4. Deep-link routing: tap → correct screen
 *   5. Multi-device support & stale token cleanup
 *
 * Architecture:
 *   - Graceful fallback if Firebase unavailable (Expo Go / missing google-services.json)
 *   - All notification rendering goes through Notifee channels
 *   - Deep-link targets stored in AsyncStorage for quit-state restore
 *
 * Channel → type mapping:
 *   emergency        → MAX priority, DnD bypass, lockscreen full visibility
 *   doctor-messages  → HIGH priority
 *   med-reminder     → HIGH priority, action buttons
 *   ai-warnings      → DEFAULT
 *   caretaker        → HIGH
 *   system           → DEFAULT
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRegisterFCMToken } from './api';

// ─── Graceful Firebase import ─────────────────────────────────────────────────
let messaging = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
  console.log('[FCM] Firebase Messaging module loaded');
} catch (e) {
  console.warn('[FCM] Firebase not available — falling back to local-only notifications:', e.message);
}

// ─── Graceful Notifee import ──────────────────────────────────────────────────
let notifee = null;
let AndroidImportance = {};
let AndroidVisibility = {};
let AndroidCategory = {};
try {
  const mod = require('@notifee/react-native');
  notifee = mod.default;
  AndroidImportance = mod.AndroidImportance || {};
  AndroidVisibility = mod.AndroidVisibility || {};
  AndroidCategory = mod.AndroidCategory || {};
} catch (e) {
  console.warn('[FCM] Notifee not available:', e.message);
}

const PENDING_NAV_KEY = '@medisync_pending_nav';
const FCM_TOKEN_KEY = '@medisync_fcm_token';

// ─── Type → Channel + Priority map ───────────────────────────────────────────
const TYPE_CONFIG = {
  emergency: {
    channelId: 'emergency',
    importance: 'URGENT',
    sound: 'default',
    vibration: true,
    icon: '🚨',
    screen: 'Emergency',
  },
  doctor_message: {
    channelId: 'doctor-messages',
    importance: 'HIGH',
    sound: 'default',
    vibration: true,
    icon: '👨‍⚕️',
    screen: 'DoctorPatientChat',
  },
  medicine_reminder: {
    channelId: 'med-reminder',
    importance: 'HIGH',
    sound: 'default',
    vibration: true,
    icon: '💊',
    screen: 'Pillbox',
  },
  ai_warning: {
    channelId: 'ai-warnings',
    importance: 'DEFAULT',
    sound: 'default',
    vibration: false,
    icon: '🤖',
    screen: 'Alerts',
  },
  caretaker_alert: {
    channelId: 'caretaker',
    importance: 'HIGH',
    sound: 'default',
    vibration: true,
    icon: '👥',
    screen: 'CaretakerDashboard',
  },
  adherence_warning: {
    channelId: 'ai-warnings',
    importance: 'DEFAULT',
    sound: 'default',
    vibration: false,
    icon: '📊',
    screen: 'Alerts',
  },
};

function getConfig(type) {
  return TYPE_CONFIG[type] || {
    channelId: 'system',
    importance: 'DEFAULT',
    sound: 'default',
    vibration: false,
    icon: '🔔',
    screen: null,
  };
}

// ─── Store pending navigation ──────────────────────────────────────────────────
async function storePendingNav(screen, params = {}) {
  if (!screen) return;
  try {
    await AsyncStorage.setItem(PENDING_NAV_KEY, JSON.stringify({ screen, params }));
  } catch { }
}

// ─── Display FCM payload via Notifee ──────────────────────────────────────────
async function displayFCMNotification(remoteMessage) {
  if (!notifee) return;
  try {
    const data = remoteMessage.data || {};
    const notif = remoteMessage.notification || {};
    const type = data.type || 'system';
    const cfg = getConfig(type);

    const title = notif.title || data.title || 'MediSync';
    const body = notif.body || data.body || '';

    // Record last push
    AsyncStorage.setItem('@medisync_last_push_time', String(Date.now())).catch(() => {});

    // Drift Analytics (fire and forget)
    if (data.scheduled_for) {
      try {
        const expected = parseInt(data.scheduled_for, 10);
        const actual = Date.now();
        const driftMs = actual - expected;
        import('./api').then(({ apiNotificationAnalytics }) => {
          apiNotificationAnalytics(remoteMessage.messageId || 'local', 'delivered_with_drift', { drift_ms: driftMs }).catch(() => {});
        }).catch(() => {});
      } catch (e) { }
    }

    const androidConfig = {
      channelId: cfg.channelId,
      smallIcon: 'ic_launcher',
      color: '#0D9488',
      pressAction: { id: 'default' },
      showTimestamp: true,
    };

    // Emergency: max priority, full-screen, persistent
    if (type === 'emergency') {
      androidConfig.importance = AndroidImportance?.URGENT;
      androidConfig.visibility = AndroidVisibility?.PUBLIC;
      androidConfig.category = AndroidCategory?.ALARM;
      androidConfig.ongoing = true;
      androidConfig.asForegroundService = false;
      androidConfig.vibrationPattern = [0, 500, 200, 500, 200, 500];
      androidConfig.lights = { color: '#FF0000', onMs: 300, offMs: 200 };
    }

    // Doctor message: reply action
    if (type === 'doctor_message') {
      androidConfig.actions = [
        { title: '💬 Open Chat', pressAction: { id: 'open_chat' } },
      ];
    }

    // Medicine reminder: action buttons
    if (type === 'medicine_reminder') {
      androidConfig.actions = [
        { title: '✅ Taken', pressAction: { id: 'action_taken', launchActivity: 'default' } },
        { title: '⏰ Snooze', pressAction: { id: 'action_snooze', launchActivity: 'default' } },
        { title: '❌ Skip', pressAction: { id: 'action_skip', launchActivity: 'default' } },
      ];
      if (data.medicineId) androidConfig.data = { medicineId: data.medicineId };
    }

    await notifee.displayNotification({
      title: `${cfg.icon} ${title}`,
      body,
      data: { ...data, type },
      android: androidConfig,
    });
  } catch (e) {
    console.error('[FCM] displayFCMNotification error:', e.message);
  }
}

// ─── Handle tap navigation ─────────────────────────────────────────────────────
function buildNavTarget(data) {
  const type = data?.type || 'system';
  const cfg = getConfig(type);
  const params = {};

  if (type === 'doctor_message' && data.patient_id) params.patientId = data.patient_id;
  if (type === 'medicine_reminder' && data.medicineId) params.medicineId = data.medicineId;

  return { screen: cfg.screen, params };
}

// ─── Background message handler (module-level registration) ───────────────────
// Called ONCE at module load time (before render) from App.js
export function registerBackgroundHandler() {
  if (!messaging) return;
  try {
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('[FCM BG] Received:', remoteMessage?.data?.type);
      await displayFCMNotification(remoteMessage);
      // Store nav target so app can route on open
      const { screen, params } = buildNavTarget(remoteMessage.data);
      if (screen) await storePendingNav(screen, params);
    });
    console.log('[FCM] Background handler registered');
  } catch (e) {
    console.warn('[FCM] setBackgroundMessageHandler failed:', e.message);
  }
}

// ─── FCM Initialization (called inside App component) ─────────────────────────
export async function initFCM(navigationRef) {
  if (!messaging) {
    console.warn('[FCM] messaging not available — skipping FCM init');
    return null;
  }

  try {
    // ── 1. Request permission ──────────────────────────────────────────────
    const authStatus = await messaging().requestPermission({
      alert: true,
      badge: true,
      sound: true,
      announcement: true,
    });
    const enabled = (
      authStatus === messaging.AuthorizationStatus?.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus?.PROVISIONAL ||
      authStatus === 1 || authStatus === 2
    );
    if (!enabled) {
      console.warn('[FCM] Notification permission denied');
      return null;
    }

    // ── 2. Get FCM token ───────────────────────────────────────────────────
    const token = await messaging().getToken();
    if (!token) {
      console.warn('[FCM] No token returned');
      return null;
    }

    console.log('[FCM] Token:', token.slice(0, 24) + '...');
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);

    // ── 3. Register token with backend ────────────────────────────────────
    try {
      // ✅ Fix: correct arg order — token, deviceId, platform (not token, Platform.OS, 'fcm')
      await apiRegisterFCMToken(token, '', Platform.OS);
      console.log('[FCM] Token registered with backend');
    } catch (e) {
      console.warn('[FCM] Backend token registration failed (non-fatal):', e.message);
    }

    // ── 4. Token refresh listener ──────────────────────────────────────────
    const unsubRefresh = messaging().onTokenRefresh(async (newToken) => {
      console.log('[FCM] Token refreshed');
      await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
      try { await apiRegisterFCMToken(newToken, '', Platform.OS); } catch { }
    });

    // ── 5. Foreground message handler ─────────────────────────────────────
    const unsubForeground = messaging().onMessage(async (remoteMessage) => {
      console.log('[FCM FG] Received:', remoteMessage?.data?.type);
      await displayFCMNotification(remoteMessage);
    });

    // ── 6. Tap handlers ───────────────────────────────────────────────────
    // Background → foreground tap
    messaging().onNotificationOpenedApp(async (remoteMessage) => {
      console.log('[FCM] Tap (bg→fg):', remoteMessage?.data?.type);
      const { screen, params } = buildNavTarget(remoteMessage.data);
      if (!screen) return;
      if (navigationRef?.current) {
        // Small delay to let navigator be ready
        setTimeout(() => {
          try { navigationRef.current.navigate(screen, params); } catch { }
        }, 500);
      } else {
        await storePendingNav(screen, params);
      }
    });

    // Quit-state tap (app was closed)
    const initialMessage = await messaging().getInitialNotification();
    if (initialMessage) {
      console.log('[FCM] App opened from quit-state notification:', initialMessage?.data?.type);
      const { screen, params } = buildNavTarget(initialMessage.data);
      if (screen) await storePendingNav(screen, params);
    }

    console.log('[FCM] Initialization complete');
    return { unsubForeground, unsubRefresh };
  } catch (e) {
    console.error('[FCM] initFCM error:', e.message);
    return null;
  }
}

// ─── Consume pending navigation ────────────────────────────────────────────────
// Call this after NavigationContainer is ready
export async function consumePendingNav(navigationRef) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_NAV_KEY);
    if (!raw) return;
    const { screen, params } = JSON.parse(raw);
    await AsyncStorage.removeItem(PENDING_NAV_KEY);
    if (screen && navigationRef?.current) {
      setTimeout(() => {
        try { navigationRef.current.navigate(screen, params); } catch (e) {
          console.warn('[FCM] pendingNav navigate failed:', e.message);
        }
      }, 800);
    }
  } catch { }
}

export default {
  registerBackgroundHandler,
  initFCM,
  consumePendingNav,
};

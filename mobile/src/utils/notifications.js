/**
 * utils/notifications.js — Notification setup orchestrator
 *
 * Called on app launch from App.js useEffect (via setupNotifications).
 * Responsibilities:
 *   - Request Notifee permissions
 *   - Create all notification channels
 *   - Set expo-notifications foreground handler (Expo Go fallback)
 *   - FCM init is handled separately by FCMService (called in App.js)
 *
 * Note: FCM token registration is done inside FCMService.initFCM()
 * This file only handles the Notifee/local layer.
 */

import NotificationService from '../services/NotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ─── Graceful expo-notifications import (Expo Go fallback only) ───────────────
let ExpoNotifications = null;
try {
  ExpoNotifications = require('expo-notifications');
} catch {
  console.warn('[Notifications] expo-notifications not available');
}

// ─── Expo Go: foreground notification display handler ─────────────────────────
if (ExpoNotifications) {
  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ─── Flash notification shortcut ─────────────────────────────────────────────
export async function showFlashMessage(title, body) {
  await NotificationService._display({
    title,
    body,
    android: {
      channelId: 'system',
      smallIcon: 'ic_launcher',
      color: '#0D9488',
      pressAction: { id: 'default' },
    },
  }, true);
}

// ─── Expo Go FCM fallback (Expo push token only) ──────────────────────────────
export async function registerExpoPushToken() {
  if (!ExpoNotifications) return;
  try {
    const { apiRegisterFCMToken } = await import('../services/api');
    const { status: existing } = await ExpoNotifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await ExpoNotifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return;

    const tokenData = await ExpoNotifications.getExpoPushTokenAsync({
      projectId: '23041707-83ef-4fa1-a303-8a1145b4b4e8',
    }).catch(() => null);

    if (tokenData?.data) {
      await apiRegisterFCMToken(tokenData.data, Platform.OS, 'expo');
      await AsyncStorage.setItem('@medisync_fcm_token', tokenData.data);
      console.log('[Notifications] Expo push token registered (Expo Go fallback)');
    }
  } catch (e) {
    console.warn('[Notifications] Expo push token registration failed:', e.message);
  }
}

// ─── Main Setup ───────────────────────────────────────────────────────────────
export async function setupNotifications() {
  try {
    console.log('[setupNotifications] Initializing...');

    // Notifee permission + channels (always runs)
    await NotificationService.requestPermissions();
    await NotificationService.createChannels();
    await NotificationService.checkBatteryOptimizations?.();

    // FCM init is handled by FCMService.initFCM() in App.js useEffect
    // If in Expo Go (no Firebase), fall back to expo-notifications token
    const hasFirebase = (() => {
      try { require('@react-native-firebase/messaging'); return true; } catch { return false; }
    })();

    if (!hasFirebase) {
      console.log('[setupNotifications] Firebase not available — using Expo push token');
      await registerExpoPushToken();
    }

    console.log('[setupNotifications] Complete');
  } catch (error) {
    console.error('[setupNotifications] Error:', error.message);
  }
}

export { NotificationService };

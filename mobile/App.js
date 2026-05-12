/**
 * App.js — Medisync React Native Entry Point
 *
 * Notification infrastructure:
 *   - Notifee background action handler (Taken / Snooze / Skip / Chat)
 *   - FCM background message handler (must register before render)
 *   - FCM foreground handler + token registration in useEffect
 *   - Deep-link navigation from notification taps
 *   - Graceful fallbacks for Expo Go / missing Firebase
 */

import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainerRef } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { setupNotifications } from './src/utils/notifications';
import { registerBackgroundHandler, initFCM, consumePendingNav } from './src/services/FCMService';

// ─── Graceful Notifee import ──────────────────────────────────────────────────
let notifee = null;
let EventType = {};
try {
  const mod = require('@notifee/react-native');
  notifee   = mod.default;
  EventType = mod.EventType || {};
} catch {
  console.warn('[App] notifee not available — Expo Go mode');
}

// ─── Register FCM background handler BEFORE render ───────────────────────────
// This MUST be called at module level (not inside a component)
registerBackgroundHandler();

// ─── Notifee background action handler ────────────────────────────────────────
if (notifee) {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    try {
      const { notification, pressAction } = detail;
      const actionId  = pressAction?.id;
      const data      = notification?.data || {};
      const medicineId = data.medicineId;

      console.log(`[BG Event] type=${type} action=${actionId} medId=${medicineId}`);

      const { default: ReminderEngine } = await import('./src/services/ReminderEngine');
      await ReminderEngine._loadEscalationState();

      if (type === (EventType.ACTION_PRESS ?? 2)) {
        switch (actionId) {
          case 'action_taken':
            if (medicineId) await ReminderEngine.handleTaken(medicineId);
            if (notification?.id) await notifee.cancelNotification(notification.id);
            break;

          case 'action_snooze':
            if (medicineId) await ReminderEngine.handleSnooze(medicineId);
            if (notification?.id) await notifee.cancelNotification(notification.id);
            break;

          case 'action_skip':
            if (medicineId) await ReminderEngine.handleSkipped(medicineId);
            if (notification?.id) await notifee.cancelNotification(notification.id);
            break;

          case 'open_chat':
          case 'doctor_chat':
            await AsyncStorage.setItem('@medisync_pending_nav', JSON.stringify({
              screen: 'DoctorPatientChat',
              params: {},
            }));
            if (notification?.id) await notifee.cancelNotification(notification.id);
            break;

          case 'call_emergency':
          case 'emergency':
            await AsyncStorage.setItem('@medisync_pending_nav', JSON.stringify({
              screen: 'Emergency',
              params: {},
            }));
            break;

          default:
            if (notification?.id) await notifee.cancelNotification(notification.id);
        }
      } else if (type === (EventType.DISMISSED ?? 3)) {
        const notifId = data.notification_id;
        if (notifId) {
          try {
            const { apiNotificationAnalytics } = await import('./src/services/api');
            await apiNotificationAnalytics(notifId, 'dismissed');
          } catch {}
        }
      }
    } catch (error) {
      console.error('[BG Event] Error:', error.message);
    }
  });
}

// ─── App Component ────────────────────────────────────────────────────────────
export default function App() {
  // navigationRef lets FCMService navigate without being inside a Navigator
  const navigationRef = useRef(null);
  // Track FCM listener cleanup functions
  const fcmUnsubRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        // 1. Create Notifee channels + request permissions
        await setupNotifications();

        // 2. Init FCM: permission → token → foreground listener → tap handlers
        const unsub = await initFCM(navigationRef);
        if (mounted && unsub) fcmUnsubRef.current = unsub;

        console.log('[App] Bootstrap complete');
      } catch (e) {
        console.error('[App] Bootstrap error:', e.message);
      }
    }

    bootstrap();

    return () => {
      mounted = false;
      // Clean up FCM listeners on unmount
      try {
        if (fcmUnsubRef.current) {
          fcmUnsubRef.current.unsubForeground?.();
          fcmUnsubRef.current.unsubRefresh?.();
        }
      } catch {}
    };
  }, []);

  // Called when NavigationContainer is fully ready — consume any pending tap nav
  function onNavigationReady() {
    consumePendingNav(navigationRef);
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppNavigator
            navigationRef={navigationRef}
            onReady={onNavigationReady}
          />
          <StatusBar style="auto" />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

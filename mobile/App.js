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

import './global.css';
import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainerRef } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider } from './src/context/AuthContext';
import { AppThemeProvider } from './src/context/AppThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { setupNotifications } from './src/utils/notifications';
import { registerBackgroundHandler, initFCM, consumePendingNav } from './src/services/FCMService';
import { getDb } from './src/storage/db';
import { initStorage } from './src/storage/mmkv';
import { startNetworkListener, stopNetworkListener } from './src/sync/network';
import { flushSyncQueue } from './src/sync/retry';
import { ToastProvider } from './src/components/Toast';
import NetworkStatusBanner from './src/components/NetworkStatusBanner';
import VoiceAssistant from './src/components/VoiceAssistant';

// ─── Production Safety: Silence Logs ──────────────────────────────────────────
if (!__DEV__) {
  console.log = () => {};
  console.debug = () => {};
  // keep console.warn and console.error intact
}

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
      const { apiNotificationAnalytics } = await import('./src/services/api');
      await ReminderEngine._loadEscalationState();

      if (type === (EventType.ACTION_PRESS ?? 2)) {
        if (notification?.id) {
          apiNotificationAnalytics(notification.id, actionId || 'opened').catch(() => {});
        }
        
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
        const notifId = data.notification_id || notification?.id;
        if (notifId) {
          apiNotificationAnalytics(notifId, 'dismissed').catch(() => {});
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

        // 3. Initialize Dual-Tier Storage (MMKV + SQLite)
        await initStorage();
        await getDb();

        // 4. Start network listener & trigger initial sync
        startNetworkListener();
        flushSyncQueue();

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
      
      stopNetworkListener();
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
          <AppThemeProvider>
            <ToastProvider>
              <NetworkStatusBanner />
              <AppNavigator
                navigationRef={navigationRef}
                onReady={onNavigationReady}
              />
              {/* MEDISYNC CORE AI — Floating Voice Assistant (all screens) */}
              <VoiceAssistant navigationRef={navigationRef} />
              <StatusBar style="auto" />
            </ToastProvider>
          </AppThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

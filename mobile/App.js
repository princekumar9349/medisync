/**
 * App.js — Medisync React Native Entry Point
 *
 * Wraps everything in:
 *   - GestureHandlerRootView (required for react-native-gesture-handler)
 *   - SafeAreaProvider
 *   - AuthProvider (JWT context)
 *   - AppNavigator (auth gate + tab routing)
 */

import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import notifee, { EventType } from '@notifee/react-native';

import { setupNotifications } from './src/utils/notifications';

// Handle background events for Notifee
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;

  if (type === EventType.ACTION_PRESS && pressAction.id) {
    console.log('User pressed an action in the background:', pressAction.id);
    // Remove the notification
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
  }
});


import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  React.useEffect(() => {
    setupNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

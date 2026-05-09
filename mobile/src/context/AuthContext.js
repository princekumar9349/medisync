/**
 * context/AuthContext.js — Global Auth State for Medisync Mobile
 *
 * Provides: { user, isLoggedIn, loading, login, logout }
 * Uses AsyncStorage for token/user persistence.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  getToken, getUser, setUser, clearToken,
  apiGetMe, saveUiRole, apiRegisterPushToken,
} from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROLE_KEY = 'medisync_ui_role';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState]   = useState(null);
  const [loading, setLoading]  = useState(true);

  // On mount: validate stored token against /me
  useEffect(() => {
    async function init() {
      try {
        const token = await getToken();
        if (!token) { setLoading(false); return; }

        const profile = await apiGetMe();
        const storedRole = await AsyncStorage.getItem(ROLE_KEY);
        const merged = storedRole ? { ...profile, role: storedRole } : profile;
        setUserState(merged);
        await setUser(merged);
      } catch {
        // Token invalid/expired — wipe everything
        await clearToken();
        setUserState(null);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function login(profile, uiRole) {
    if (uiRole) {
      const merged = { ...profile, role: uiRole };
      await saveUiRole(uiRole);
      await setUser(merged);
      setUserState(merged);
    } else {
      await setUser(profile);
      setUserState(profile);
    }
    // Register Expo push token after login
    _registerPushToken();
  }

  async function _registerPushToken() {
    try {
      const Notifications = require('expo-notifications');
      const Constants = require('expo-constants').default;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medication-reminders', {
          name: 'Medication Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#3B82F6',
        });
      }

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;
      if (!projectId) return;

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      if (tokenData?.data) {
        await apiRegisterPushToken(tokenData.data);
      }
    } catch (_) {
      // Push notifications are optional — fail silently
    }
  }

  async function logout() {
    await clearToken();
    setUserState(null);
  }

  const value = {
    user,
    isLoggedIn: !!user,
    loading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

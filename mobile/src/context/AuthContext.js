/**
 * context/AuthContext.js — Global Auth State for Medisync Mobile
 * Fixed: logout uses ref-based guard (not state), always clears storage + state
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getToken, getUser, setUser, clearToken,
  apiGetMe, saveUiRole, apiRegisterPushToken, setGlobalLogoutHandler,
} from '../services/api';

const AUTH_KEYS = ['medisync_token', 'medisync_user', 'medisync_ui_role'];
const ROLE_KEY  = 'medisync_ui_role';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUserState] = useState(null);
  const [loading, setLoading]   = useState(true);
  const loggingOut = useRef(false); // ref-based guard — never stale

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    // Wire global 401 handler to always use the latest logout via ref
    setGlobalLogoutHandler(() => doLogout());

    async function init() {
      try {
        const token = await getToken();
        if (!token) { setLoading(false); return; }
        const profile    = await apiGetMe();
        const storedRole = await AsyncStorage.getItem(ROLE_KEY);
        const merged = storedRole ? { ...profile, role: storedRole } : profile;
        setUserState(merged);
        await setUser(merged);
      } catch {
        await _wipeStorage();
        setUserState(null);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Storage wipe (always succeeds) ────────────────────────────────────────
  async function _wipeStorage() {
    try {
      await AsyncStorage.multiRemove(AUTH_KEYS);
    } catch {
      for (const k of AUTH_KEYS) {
        try { await AsyncStorage.removeItem(k); } catch {}
      }
    }
    // Also call api-layer clearToken so in-memory cache is cleared
    try { await clearToken(); } catch {}
  }

  // ── Core logout — ref-guarded, cannot be blocked by stale state ──────────
  async function doLogout() {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      await _wipeStorage();
    } finally {
      setUserState(null);        // triggers navigator to show AuthStack
      loggingOut.current = false;
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async function login(profile, uiRole) {
    const merged = uiRole ? { ...profile, role: uiRole } : profile;
    if (uiRole) await saveUiRole(uiRole);
    await setUser(merged);
    setUserState(merged);
    _registerPushToken();
  }

  // ── Push token registration (best-effort) ─────────────────────────────────
  async function _registerPushToken() {
    try {
      const Notifications = require('expo-notifications');
      const Constants = require('expo-constants').default;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medication-reminders', {
          name: 'Medication Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0D9488',
        });
        await Notifications.setNotificationChannelAsync('doctor-alerts', {
          name: 'Doctor Alerts',
          importance: Notifications.AndroidImportance.MAX,
          lightColor: '#EF4444',
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('emergency', {
          name: 'Emergency',
          importance: Notifications.AndroidImportance.MAX,
          lightColor: '#EF4444',
          sound: 'default',
          bypassDnd: true,
        });
      }

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;
      if (!projectId) return;

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      if (tokenData?.data) await apiRegisterPushToken(tokenData.data);
    } catch (_) {
      // Optional — fail silently
    }
  }

  const value = {
    user,
    isLoggedIn: !!user,
    loading,
    login,
    logout: doLogout,   // expose as "logout" so all consumers work unchanged
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

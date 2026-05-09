/**
 * screens/patient/ProfileScreen.js — User Profile & Settings
 * Business Theme Overhaul
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, StatusBar, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}

function ToggleRow({ icon, label, description, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={COLORS.brand600} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.slate200, true: COLORS.brand400 }}
        thumbColor={value ? COLORS.brand600 : COLORS.white}
        ios_backgroundColor={COLORS.slate200}
      />
    </View>
  );
}

function ActionRow({ icon, label, description, accent, onPress }) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: COLORS.slate800 }]}>{label}</Text>
        {description && <Text style={styles.actionDesc}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.slate300} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const [voiceOn,  setVoiceOn]  = useState(false);
  const [language, setLanguage] = useState('EN');

  function testVoice() {
    if (!voiceOn) { Alert.alert('Voice Off', 'Enable voice output first.'); return; }
    Speech.speak(
      language === 'HI' ? 'नमस्ते! मेडिसिंक आपकी सेवा में है।' : 'Hello! Medisync is here to help you.',
      { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 }
    );
  }

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  async function scheduleReminder() {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please allow notifications in settings to set reminders.');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "💊 Time for your Medicine!",
        body: "Please check Medisync to mark your upcoming dose.",
        sound: true,
      },
      trigger: {
        seconds: 5,
      },
    });

    Alert.alert('Reminder Set!', 'You will receive a notification shortly.');
  }

  const initials = user?.name?.[0]?.toUpperCase() || 'U';

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />
      
      {/* Blue Header Section */}
      <View style={S.headerBackground}>
        <Text style={S.headerTitle}>Profile</Text>
        <Text style={S.headerSubtitle}>Manage your account settings</Text>
      </View>

      {/* Overlapping White Container */}
      <View style={S.overlapContainer}>
        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

          {/* User Card */}
          <View style={[S.card, styles.userCard]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.userName}>{user?.name || 'User'}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
              {user?.patient_id && (
                <View style={styles.idBadge}>
                  <Text style={styles.idText}>ID: {user.patient_id}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.editBtn}>
              <Ionicons name="pencil" size={18} color={COLORS.brand600} />
            </TouchableOpacity>
          </View>

          {/* Preferences */}
          <View style={styles.section}>
            <Text style={S.sectionTitle}>General Settings</Text>
            <View style={S.card}>
              <ToggleRow
                icon="volume-high"
                label="Voice Output"
                description="Speak scan results aloud"
                value={voiceOn}
                onValueChange={v => { setVoiceOn(v); if (v) Speech.speak('Voice enabled', { language: 'en-IN' }); }}
              />
              <View style={S.divider} />
              <ToggleRow
                icon="language"
                label={`Language: ${language === 'EN' ? 'English' : 'हिंदी'}`}
                description="Change interface language"
                value={language === 'HI'}
                onValueChange={v => setLanguage(v ? 'HI' : 'EN')}
              />
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={S.sectionTitle}>Tools & Testing</Text>
            <View style={S.card}>
              <ActionRow
                icon="mic"
                label="Test Voice Assistant"
                description="Hear a sample greeting"
                accent={COLORS.brand600}
                onPress={testVoice}
              />
              <View style={S.divider} />
              <ActionRow
                icon="alarm"
                label="Test Notification"
                description="Schedule a 5s test alert"
                accent={COLORS.amber600}
                onPress={scheduleReminder}
              />
            </View>
          </View>

          {/* App Info */}
          <View style={styles.section}>
            <Text style={S.sectionTitle}>About Application</Text>
            <View style={S.card}>
              {[
                { label: 'Version',   value: '3.0.0 (RN)' },
                { label: 'Engine',    value: 'Groq LLaMA 3.3' },
              ].map(row => (
                <View key={row.label} style={[S.rowBetween, { paddingVertical: 10 }]}>
                  <Text style={{ fontSize: FONTS.base, color: COLORS.slate500 }}>{row.label}</Text>
                  <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 }}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.red500} style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userCard: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: SPACING.xl },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.brand100, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: FONTS.bold, color: COLORS.brand700 },
  userName: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  userEmail: { fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 2 },
  idBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.slate100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, marginTop: 8 },
  idText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },
  editBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.slate50, alignItems: 'center', justifyContent: 'center' },

  section: { marginBottom: SPACING.lg },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  toggleLabel: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  toggleDesc: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  actionLabel: { fontSize: FONTS.base, fontWeight: FONTS.semibold },
  actionDesc: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },

  logoutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.full, paddingVertical: 16, marginTop: SPACING.md },
  logoutText: { color: COLORS.red600, fontSize: FONTS.base, fontWeight: FONTS.bold },
});

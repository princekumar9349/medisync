/**
 * screens/patient/ProfileScreen.js — User Profile & Settings
 * Clean Medical Theme — Teal/White
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, StatusBar, Platform
} from 'react-native';
import * as Speech from 'expo-speech';
import NotificationService from '../../services/NotificationService';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

// Removed expo-notifications handler to prevent conflicts with Notifee
function ToggleRow({ icon, label, description, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconCircle}><Ionicons name={icon} size={18} color={COLORS.brand600} /></View>
      <View style={{ flex: 1 }}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.toggleDesc}>{description}</Text></View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: COLORS.slate200, true: COLORS.brand400 }} thumbColor={value ? COLORS.brand600 : COLORS.white} ios_backgroundColor={COLORS.slate200} />
    </View>
  );
}

function ActionRow({ icon, label, description, accent, onPress }) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}><Ionicons name={icon} size={18} color={accent} /></View>
      <View style={{ flex: 1 }}><Text style={styles.actionLabel}>{label}</Text>{description && <Text style={styles.actionDesc}>{description}</Text>}</View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [voiceOn, setVoiceOn] = useState(false);
  const [language, setLanguage] = useState('EN');

  function testVoice() {
    if (!voiceOn) { Alert.alert('Voice Off', 'Enable voice output first.'); return; }
    Speech.speak(language === 'HI' ? 'नमस्ते! मेडिसिंक आपकी सेवा में है।' : 'Hello! Medisync is here to help you.', { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 });
  }

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  async function testImmediateNotification() {
    try {
      await NotificationService.testNotification();
    } catch (e) {
      Alert.alert('Error', 'Failed to show test notification: ' + e.message);
    }
  }

  async function scheduleReminder() {
    try {
      // Schedule 5 seconds in the future
      await NotificationService.scheduleMedicineReminder(
        { _id: 'test_1', name: 'Test Medicine', dosage: '1 pill' },
        Date.now() + 5000
      );
      Alert.alert('Reminder Set!', 'You will receive a notification in 5 seconds.');
    } catch (e) {
      Alert.alert('Error', 'Failed to schedule reminder: ' + e.message);
    }
  }

  async function checkBatteryOptimizations() {
    if (Platform.OS === 'android') {
      await NotificationService.openBatterySettings();
    } else {
      Alert.alert('Not available', 'Battery settings are only on Android.');
    }
  }
  
  async function openPowerManager() {
    if (Platform.OS === 'android') {
      await NotificationService.openPowerManagerSettings();
    } else {
      Alert.alert('Not available', 'Power manager settings are only on Android.');
    }
  }

  const initials = user?.name?.[0]?.toUpperCase() || 'U';

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Profile</Text><Text style={S.headerSubtitle}>Account & settings</Text></View>

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={[S.card, styles.userCard]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {user?.patient_id && (<View style={styles.idBadge}><Text style={styles.idText}>ID: {user.patient_id}</Text></View>)}
          </View>
          <TouchableOpacity style={styles.editBtn}><Ionicons name="pencil" size={16} color={COLORS.brand600} /></TouchableOpacity>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={S.sectionTitle}>General Settings</Text>
          <View style={S.card}>
            <ToggleRow icon="volume-high" label="Voice Output" description="Speak scan results aloud" value={voiceOn} onValueChange={v => { setVoiceOn(v); if (v) Speech.speak('Voice enabled', { language: 'en-IN' }); }} />
            <View style={S.divider} />
            <ToggleRow icon="language" label={`Language: ${language === 'EN' ? 'English' : 'हिंदी'}`} description="Change interface language" value={language === 'HI'} onValueChange={v => setLanguage(v ? 'HI' : 'EN')} />
            <View style={S.divider} />
            <ActionRow 
              icon="call-outline" 
              label="Calling & Caregiver" 
              description="AI reminders & safety escalation" 
              accent={COLORS.brand600} 
              onPress={() => navigation.navigate('CallingSettings')} 
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={S.sectionTitle}>Tools & Testing</Text>
          <View style={S.card}>
            <ActionRow icon="mic" label="Test Voice Assistant" description="Hear a sample greeting" accent={COLORS.brand600} onPress={testVoice} />
            <View style={S.divider} />
            <ActionRow icon="notifications" label="Immediate Test Alert" description="Trigger local notification now" accent={COLORS.amber600} onPress={testImmediateNotification} />
            <View style={S.divider} />
            <ActionRow icon="alarm" label="Schedule Test Reminder" description="Schedule a 5s test alert" accent={COLORS.amber600} onPress={scheduleReminder} />
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={S.sectionTitle}>Device Restrictions (Android)</Text>
          <View style={S.card}>
            <ActionRow icon="battery-charging" label="Battery Optimizations" description="Disable to fix notification delays" accent={COLORS.red500} onPress={checkBatteryOptimizations} />
            <View style={S.divider} />
            <ActionRow icon="settings-outline" label="Auto-Start / Power Manager" description="Fix for Realme/Xiaomi devices" accent={COLORS.red500} onPress={openPowerManager} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={S.sectionTitle}>About Application</Text>
          <View style={S.card}>
            {[{ label: 'Version', value: '3.0.0 (RN)' }, { label: 'Engine', value: 'Groq LLaMA 3.3' }].map(row => (
              <View key={row.label} style={[S.rowBetween, { paddingVertical: 8 }]}>
                <Text style={{ fontSize: FONTS.base, color: COLORS.slate500 }}>{row.label}</Text>
                <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 }}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.red500} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  userCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xl },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.brand200 },
  avatarText: { fontSize: 24, fontWeight: FONTS.bold, color: COLORS.brand700 },
  userName: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  userEmail: { fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 2 },
  idBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.slate100, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full, marginTop: 6, borderWidth: 1, borderColor: COLORS.border },
  idText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  section: { marginBottom: SPACING.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  toggleLabel: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  toggleDesc: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  actionLabel: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  actionDesc: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  logoutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.full, paddingVertical: 14, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.red200 },
  logoutText: { color: COLORS.red600, fontSize: FONTS.base, fontWeight: FONTS.bold },
});

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

import { COLORS, FONTS, SHADOW, SPACING, RADIUS, SEMANTIC } from '../../theme';
import NotificationService from '../../services/NotificationService';
import GlassCard from '../../components/GlassCard';

export default function NotificationDiagnosticsScreen({ navigation }) {
  const [refreshing, setRefreshing] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [exactAlarm, setExactAlarm] = useState(true);
  const [batteryOpt, setBatteryOpt] = useState(null);
  const [lastPush, setLastPush] = useState('Unknown');
  const [fcmToken, setFcmToken] = useState(null);

  const loadState = useCallback(async () => {
    try {
      // FCM Token
      const token = await AsyncStorage.getItem('@medisync_fcm_token');
      setFcmToken(token);

      // Last Push Time
      const lastPushTs = await AsyncStorage.getItem('@medisync_last_push_time');
      if (lastPushTs) {
        setLastPush(new Date(parseInt(lastPushTs, 10)).toLocaleString());
      } else {
        setLastPush('No recent notifications received.');
      }

      // Permissions
      const settings = await NotificationService.getNotificationSettings();
      setPermissions(settings.isAuthorized);
      
      // Android Specifics
      if (Platform.OS === 'android') {
        const hasExact = await NotificationService.checkExactAlarmPermission();
        setExactAlarm(hasExact);
        
        const hasBatteryOpt = await NotificationService.checkBatteryOptimizations();
        setBatteryOpt(hasBatteryOpt);
      }
    } catch (e) {
      console.warn('Failed to load diagnostics:', e);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadState();
    setRefreshing(false);
  };

  const onTestPush = async () => {
    try {
      await NotificationService.testNotification();
    } catch (e) {
      console.error(e);
    }
  };

  const getOEMGuidance = () => {
    const brand = (Device.manufacturer || '').toLowerCase();
    if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco')) {
      return {
        brand: 'Xiaomi / Poco',
        steps: [
          '1. Go to App Info > Battery saver > Select "No restrictions".',
          '2. Go to App Info > Turn ON "Autostart".',
        ]
      };
    }
    if (brand.includes('vivo') || brand.includes('iqoo')) {
      return {
        brand: 'Vivo / iQOO',
        steps: [
          '1. Go to Settings > Battery > High background power consumption > Enable for MediSync.',
          '2. Go to App Info > Permissions > Enable "Autostart".',
        ]
      };
    }
    if (brand.includes('oppo') || brand.includes('realme')) {
      return {
        brand: 'Oppo / Realme',
        steps: [
          '1. Go to App Info > Battery usage > Turn ON "Allow background activity" & "Allow auto launch".',
        ]
      };
    }
    if (brand.includes('samsung')) {
      return {
        brand: 'Samsung',
        steps: [
          '1. Go to Settings > Battery > Background usage limits > "Never sleeping apps" > Add MediSync.',
        ]
      };
    }
    return {
      brand: 'Android',
      steps: [
        '1. Turn off Battery Optimization for MediSync.',
        '2. Enable "Allow Background Activity" if available.',
      ]
    };
  };

  const guidance = getOEMGuidance();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={COLORS.slate800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Health</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand500} />}
      >
        <Text style={styles.introText}>
          If you are missing medicine reminders, check the status below to ensure your phone allows MediSync to send alerts.
        </Text>

        <GlassCard style={{ padding: SPACING.md }}>
          <View style={styles.statusRow}>
            <View style={styles.iconCircle}>
              <Ionicons name={permissions ? "notifications" : "notifications-off"} size={20} color={permissions ? SEMANTIC.success : SEMANTIC.danger} />
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusLabel}>Notification Permission</Text>
              <Text style={styles.statusDesc}>{permissions ? 'Granted' : 'Denied'}</Text>
            </View>
            {!permissions && (
              <TouchableOpacity style={styles.fixBtn} onPress={() => NotificationService.openBatterySettings() /* Usually opens App Info */}>
                <Text style={styles.fixBtnTxt}>Fix</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.divider} />

          <View style={styles.statusRow}>
            <View style={styles.iconCircle}>
              <Ionicons name={fcmToken ? "cloud-done" : "cloud-offline"} size={20} color={fcmToken ? SEMANTIC.success : SEMANTIC.warning} />
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusLabel}>Server Connection</Text>
              <Text style={styles.statusDesc}>{fcmToken ? 'Connected' : 'Disconnected'}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.statusRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="time" size={20} color={COLORS.brand500} />
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusLabel}>Last Successful Alert</Text>
              <Text style={styles.statusDesc}>{lastPush}</Text>
            </View>
          </View>
        </GlassCard>

        {Platform.OS === 'android' && (
          <>
            <Text style={styles.sectionTitle}>Device Optimization Restrictions</Text>
            <GlassCard style={{ padding: SPACING.md }}>
              <View style={styles.statusRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name={batteryOpt ? "battery-dead" : "battery-charging"} size={20} color={batteryOpt ? SEMANTIC.danger : SEMANTIC.success} />
                </View>
                <View style={styles.statusTextCol}>
                  <Text style={styles.statusLabel}>Battery Optimization</Text>
                  <Text style={styles.statusDesc}>{batteryOpt ? 'Restricting Alerts (Bad)' : 'Unrestricted (Good)'}</Text>
                </View>
                {batteryOpt && (
                  <TouchableOpacity style={styles.fixBtn} onPress={() => NotificationService.openBatterySettings()}>
                    <Text style={styles.fixBtnTxt}>Fix</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.divider} />

              <View style={styles.statusRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name={exactAlarm ? "alarm" : "alarm-outline"} size={20} color={exactAlarm ? SEMANTIC.success : SEMANTIC.warning} />
                </View>
                <View style={styles.statusTextCol}>
                  <Text style={styles.statusLabel}>Exact Alarms</Text>
                  <Text style={styles.statusDesc}>{exactAlarm ? 'Allowed (Good)' : 'Blocked - Timers may drift'}</Text>
                </View>
                {!exactAlarm && (
                  <TouchableOpacity style={styles.fixBtn} onPress={() => NotificationService.openExactAlarmSettings()}>
                    <Text style={styles.fixBtnTxt}>Fix</Text>
                  </TouchableOpacity>
                )}
              </View>
            </GlassCard>

            <View style={styles.oemBox}>
              <Text style={styles.oemTitle}>Fixing Missing Alerts on {guidance.brand}</Text>
              <Text style={styles.oemDesc}>
                Some phones block notifications to save battery. Follow these steps exactly:
              </Text>
              {guidance.steps.map((step, i) => (
                <Text key={i} style={styles.oemStep}>{step}</Text>
              ))}
              <TouchableOpacity style={styles.oemBtn} onPress={() => NotificationService.openPowerManagerSettings()}>
                <Text style={styles.oemBtnTxt}>Open {guidance.brand} Settings</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <TouchableOpacity style={styles.testBtn} onPress={onTestPush}>
          <Ionicons name="notifications" size={18} color={COLORS.white} />
          <Text style={styles.testBtnTxt}>Send Test Notification</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: FONTS.bold, color: COLORS.slate800 },
  scroll: { padding: SPACING.lg, paddingBottom: 100 },
  introText: { fontSize: 14, color: COLORS.slate600, marginBottom: SPACING.lg, lineHeight: 20 },
  sectionTitle: { fontSize: 15, fontWeight: FONTS.bold, color: COLORS.slate800, marginTop: SPACING.md, marginBottom: SPACING.sm },
  
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.slate50, alignItems: 'center', justifyContent: 'center' },
  statusTextCol: { flex: 1 },
  statusLabel: { fontSize: 14, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  statusDesc: { fontSize: 12, color: COLORS.slate500, marginTop: 2 },
  fixBtn: { backgroundColor: SEMANTIC.warningBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: SEMANTIC.warningBorder },
  fixBtnTxt: { color: SEMANTIC.warning, fontSize: 12, fontWeight: FONTS.bold },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

  oemBox: { marginTop: SPACING.xl, backgroundColor: '#EFF6FF', borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: '#BFDBFE' },
  oemTitle: { fontSize: 14, fontWeight: FONTS.bold, color: '#1E3A8A', marginBottom: 8 },
  oemDesc: { fontSize: 13, color: '#1E40AF', marginBottom: 12, lineHeight: 18 },
  oemStep: { fontSize: 13, color: '#1D4ED8', marginBottom: 6, fontWeight: FONTS.medium },
  oemBtn: { marginTop: 12, backgroundColor: '#2563EB', borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center' },
  oemBtnTxt: { color: COLORS.white, fontSize: 13, fontWeight: FONTS.bold },

  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.brand600, borderRadius: RADIUS.lg, paddingVertical: 14, marginTop: SPACING.xl },
  testBtnTxt: { color: COLORS.white, fontSize: 15, fontWeight: FONTS.bold }
});

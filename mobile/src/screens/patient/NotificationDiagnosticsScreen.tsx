import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

import { COLORS, FONTS, SHADOW, SPACING, RADIUS, SEMANTIC } from '../../theme';
import NotificationService from '../../services/NotificationService';
import { apiSendTestPush } from '../../services/api';

// ─── Status Row ───────────────────────────────────────────────────────────────
function StatusRow({ icon, label, desc, status, onFix }: any) {
  const color = status === true ? SEMANTIC.success : status === false ? SEMANTIC.danger : SEMANTIC.warning;
  const iconName = status === true ? 'checkmark-circle' : status === false ? 'close-circle' : 'ellipse-outline';
  return (
    <View style={s.statusRow}>
      <View style={[s.iconCircle, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={s.statusTextCol}>
        <Text style={s.statusLabel}>{label}</Text>
        <Text style={[s.statusDesc, { color }]}>{desc}</Text>
      </View>
      <Ionicons name={iconName} size={18} color={color} />
      {onFix && (
        <TouchableOpacity style={[s.fixBtn, { borderColor: color }]} onPress={onFix}>
          <Text style={[s.fixBtnTxt, { color }]}>Fix</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Test Result Card ─────────────────────────────────────────────────────────
function TestResult({ name, ok, error }: any) {
  return (
    <View style={[s.resultRow, { backgroundColor: ok ? '#F0FDF4' : '#FFF1F2' }]}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={16} color={ok ? SEMANTIC.success : SEMANTIC.danger} />
      <View style={{ flex: 1 }}>
        <Text style={[s.resultName, { color: ok ? SEMANTIC.success : SEMANTIC.danger }]}>{name}</Text>
        {!ok && error && <Text style={s.resultErr}>{error}</Text>}
      </View>
    </View>
  );
}

export default function NotificationDiagnosticsScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [permissions, setPermissions] = useState<boolean | null>(null);
  const [exactAlarm, setExactAlarm]   = useState(true);
  const [batteryOpt, setBatteryOpt]   = useState<boolean | null>(null);
  const [lastPush,   setLastPush]     = useState('Unknown');
  const [fcmToken,   setFcmToken]     = useState<string | null>(null);

  const [testing,     setTesting]     = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [autoMsgTesting, setAutoMsgTesting] = useState(false);
  const [autoMsgResult,  setAutoMsgResult]  = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('@medisync_fcm_token');
      setFcmToken(token);

      const lastPushTs = await AsyncStorage.getItem('@medisync_last_push_time');
      setLastPush(lastPushTs
        ? new Date(parseInt(lastPushTs, 10)).toLocaleString()
        : 'No recent notifications received.'
      );

      const settings = await NotificationService.getNotificationSettings();
      setPermissions(settings.isAuthorized);

      if (Platform.OS === 'android') {
        const hasExact = await NotificationService.checkExactAlarmPermission();
        setExactAlarm(hasExact);
        const hasBatteryOpt = await NotificationService.checkBatteryOptimizations();
        setBatteryOpt(hasBatteryOpt);
      }
    } catch (e: any) {
      console.warn('Failed to load diagnostics:', e);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadState();
    setRefreshing(false);
  };

  // ── Test all notification types locally ──────────────────────────────────────
  const onTestAll = async () => {
    setTesting(true);
    setTestResults([]);
    try {
      const results = await NotificationService.runDiagnosticTests();
      setTestResults(results);
    } catch (e: any) {
      setTestResults([{ name: 'Suite Error', ok: false, error: e.message }]);
    } finally {
      setTesting(false);
    }
  };

  // ── Send a real FCM push via backend (tests the full push pipeline) ───────────
  const onAutoMessageTest = async () => {
    setAutoMsgTesting(true);
    setAutoMsgResult(null);
    try {
      const result = await apiSendTestPush();
      setAutoMsgResult(result?.message || '✅ Test push sent! Check notifications.');
    } catch (e: any) {
      setAutoMsgResult('❌ Failed: ' + (e?.message || 'Unknown error. Check backend logs.'));
    } finally {
      setAutoMsgTesting(false);
    }
  };

  const getOEMGuidance = () => {
    const brand = (Device.manufacturer || '').toLowerCase();
    if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco'))
      return { brand: 'Xiaomi / Poco', steps: ['1. App Info → Battery Saver → No Restrictions.', '2. App Info → Turn ON Autostart.'] };
    if (brand.includes('vivo') || brand.includes('iqoo'))
      return { brand: 'Vivo / iQOO', steps: ['1. Settings → Battery → High background power → Enable MediSync.', '2. App Info → Permissions → Enable Autostart.'] };
    if (brand.includes('oppo') || brand.includes('realme'))
      return { brand: 'Oppo / Realme', steps: ['1. App Info → Battery usage → Enable Background Activity & Auto Launch.'] };
    if (brand.includes('samsung'))
      return { brand: 'Samsung', steps: ['1. Settings → Battery → Background usage limits → Never sleeping apps → Add MediSync.'] };
    if (brand.includes('asus'))
      return { brand: 'ASUS', steps: ['1. Settings → Battery → Power saving mode → OFF.', '2. App Info → Battery → Unrestricted.'] };
    return { brand: 'Android', steps: ['1. Turn off Battery Optimization for MediSync.', '2. Enable Allow Background Activity if available.'] };
  };

  const guidance = getOEMGuidance();
  const allGood = permissions && !batteryOpt && exactAlarm && !!fcmToken;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.slate800} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notification Health</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand500} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall Status Banner */}
        <View style={[s.banner, { backgroundColor: allGood ? '#F0FDF4' : '#FFF7ED', borderColor: allGood ? '#86EFAC' : '#FCD34D' }]}>
          <Ionicons name={allGood ? 'shield-checkmark' : 'warning'} size={20} color={allGood ? SEMANTIC.success : SEMANTIC.warning} />
          <Text style={[s.bannerTxt, { color: allGood ? SEMANTIC.success : '#92400E' }]}>
            {allGood
              ? 'All systems operational — notifications should work reliably.'
              : 'One or more issues detected. Fix them below for reliable alerts.'}
          </Text>
        </View>

        {/* ── Status Checks ── */}
        <Text style={s.sectionTitle}>System Status</Text>
        <View style={s.card}>
          <StatusRow icon="notifications" label="Notification Permission"
            desc={permissions === null ? 'Checking…' : permissions ? 'Granted ✓' : 'DENIED — Tap Fix'}
            status={permissions}
            onFix={!permissions ? () => NotificationService.requestPermissions() : undefined} />
          <View style={s.divider} />
          <StatusRow icon={fcmToken ? 'cloud-done' : 'cloud-offline'} label="Push Server Connection"
            desc={fcmToken ? 'Connected — Token registered ✓' : 'Not connected — log out & back in'}
            status={!!fcmToken} />
          <View style={s.divider} />
          <StatusRow icon="time" label="Last Notification Received"
            desc={lastPush}
            status={lastPush !== 'No recent notifications received.' && lastPush !== 'Unknown' ? true : null} />
        </View>

        {Platform.OS === 'android' && (
          <>
            <Text style={s.sectionTitle}>Android Optimization</Text>
            <View style={s.card}>
              <StatusRow icon={batteryOpt ? 'battery-dead' : 'battery-charging'}
                label="Battery Optimization"
                desc={batteryOpt === null ? 'Checking…' : batteryOpt ? '⚠ Restricting alerts — Tap Fix' : 'Unrestricted ✓'}
                status={batteryOpt === null ? null : !batteryOpt}
                onFix={batteryOpt ? () => NotificationService.openBatterySettings() : undefined} />
              <View style={s.divider} />
              <StatusRow icon={exactAlarm ? 'alarm' : 'alarm-outline'}
                label="Exact Alarms"
                desc={exactAlarm ? 'Allowed ✓' : 'Blocked — Medicine timers may drift'}
                status={exactAlarm}
                onFix={!exactAlarm ? () => NotificationService.openExactAlarmSettings() : undefined} />
            </View>

            {/* OEM Guide */}
            <View style={s.oemBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="phone-portrait" size={16} color="#1E40AF" />
                <Text style={s.oemTitle}>Fix Missing Alerts on {guidance.brand}</Text>
              </View>
              {guidance.steps.map((step, i) => (
                <Text key={i} style={s.oemStep}>• {step}</Text>
              ))}
              <TouchableOpacity style={s.oemBtn} onPress={() => NotificationService.openPowerManagerSettings()}>
                <Text style={s.oemBtnTxt}>Open {guidance.brand} Settings →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* FCM Token */}
        {fcmToken && (
          <View style={s.tokenBox}>
            <Text style={s.tokenLabel}>FCM Device Token (first 40 chars):</Text>
            <Text style={s.tokenVal} numberOfLines={2}>{fcmToken.slice(0, 40)}…</Text>
          </View>
        )}

        {/* ── Local Notification Test Suite ── */}
        <Text style={s.sectionTitle}>Local Notification Tests</Text>
        <Text style={s.helpText}>
          Tests all 6 notification types locally (medicine, AI, doctor, caretaker, emergency, engagement). Results show below.
        </Text>
        <TouchableOpacity style={[s.testBtn, { backgroundColor: COLORS.brand600 }]} onPress={onTestAll} disabled={testing} activeOpacity={0.85}>
          {testing
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Ionicons name="flask" size={18} color={COLORS.white} />}
          <Text style={s.testBtnTxt}>{testing ? 'Running Tests…' : 'Run All Notification Tests'}</Text>
        </TouchableOpacity>

        {testResults.length > 0 && (
          <View style={s.resultsBox}>
            <Text style={s.resultsTitle}>
              Results: {testResults.filter(r => r.ok).length}/{testResults.length} passed
            </Text>
            {testResults.map((r, i) => <TestResult key={i} {...r} />)}
          </View>
        )}

        {/* ── Auto Doctor Message Test (FCM Pipeline) ── */}
        <Text style={s.sectionTitle}>Auto Doctor Message Test</Text>
        <Text style={s.helpText}>
          Sends a real FCM push via the backend to simulate a doctor message notification. Tests the full server → device pipeline.
        </Text>
        <TouchableOpacity style={[s.testBtn, { backgroundColor: '#4338CA' }]} onPress={onAutoMessageTest} disabled={autoMsgTesting} activeOpacity={0.85}>
          {autoMsgTesting
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.white} />}
          <Text style={s.testBtnTxt}>{autoMsgTesting ? 'Sending…' : 'Send Test Doctor Push'}</Text>
        </TouchableOpacity>

        {autoMsgResult && (
          <View style={[s.resultsBox, {
            backgroundColor: autoMsgResult.startsWith('✅') ? '#F0FDF4' : '#FFF1F2',
            borderColor: autoMsgResult.startsWith('✅') ? '#86EFAC' : '#FCA5A5',
          }]}>
            <Text style={{ color: autoMsgResult.startsWith('✅') ? SEMANTIC.success : SEMANTIC.danger, fontSize: 13, fontWeight: '700' }}>
              {autoMsgResult}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border },
  backBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: FONTS.bold, color: COLORS.slate800 },
  scroll:    { padding: SPACING.lg, paddingBottom: 60 },

  banner:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  bannerTxt: { flex: 1, fontSize: 13, fontWeight: FONTS.semibold, lineHeight: 19 },

  sectionTitle: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.brand700, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  helpText:     { fontSize: 13, color: COLORS.slate500, marginBottom: SPACING.md, lineHeight: 19 },

  card:    { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } } }) },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  iconCircle:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statusTextCol: { flex: 1 },
  statusLabel:   { fontSize: 13, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  statusDesc:    { fontSize: 12, marginTop: 1 },
  fixBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, marginLeft: 4 },
  fixBtnTxt:     { fontSize: 11, fontWeight: FONTS.bold },

  oemBox:   { marginTop: SPACING.md, backgroundColor: '#EFF6FF', borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: '#BFDBFE' },
  oemTitle: { fontSize: 13, fontWeight: FONTS.bold, color: '#1E3A8A' },
  oemStep:  { fontSize: 12, color: '#1D4ED8', marginTop: 5, lineHeight: 18 },
  oemBtn:   { marginTop: 12, backgroundColor: '#2563EB', borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center' },
  oemBtnTxt:{ color: COLORS.white, fontSize: 13, fontWeight: FONTS.bold },

  tokenBox: { backgroundColor: COLORS.slate50, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  tokenLabel: { fontSize: 11, fontWeight: FONTS.bold, color: COLORS.slate500, marginBottom: 4 },
  tokenVal:   { fontSize: 11, color: COLORS.slate600, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  testBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.lg, paddingVertical: 14, marginBottom: SPACING.md },
  testBtnTxt: { color: COLORS.white, fontSize: 15, fontWeight: FONTS.bold },

  resultsBox:   { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  resultsTitle: { fontSize: 13, fontWeight: FONTS.bold, color: COLORS.slate700, marginBottom: SPACING.sm },
  resultRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: RADIUS.sm, marginBottom: 4 },
  resultName:   { fontSize: 13, fontWeight: FONTS.semibold },
  resultErr:    { fontSize: 11, color: SEMANTIC.danger, marginTop: 2 },
});

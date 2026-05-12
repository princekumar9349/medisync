/**
 * screens/patient/HistoryScreen.js — Premium Patient Dashboard
 * Real emergency SOS, accurate streak, doctor alerts, adherence ring
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, Alert, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AppHeader, { AppHeaderBtn } from '../../components/AppHeader';
import {
  apiGetPrescriptions, apiGetInsights, apiGetWeeklyAdherence,
  apiTriggerEmergency, apiGetEmergencyStatus,
} from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';


const EMERGENCY_KEY = 'medisync_active_emergency';

// ─── Adherence Ring ───────────────────────────────────────────────────────────
function AdherenceRing({ rate }) {
  const size = 84, r = 32, circ = 2 * Math.PI * r;
  const dash  = (rate / 100) * circ;
  const color = rate >= 85 ? COLORS.emerald500 : rate >= 60 ? COLORS.amber500 : COLORS.red500;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 84 84">
        <Circle cx="42" cy="42" r={r} stroke={COLORS.slate100} strokeWidth="6" fill="none" />
        <Circle cx="42" cy="42" r={r} stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" rotation="-90" origin="42,42" />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: FONTS.bold, color: COLORS.slate800 }}>{rate}%</Text>
      </View>
    </View>
  );
}

// ─── Emergency Banner ─────────────────────────────────────────────────────────
function EmergencyBanner({ emergency, onDismiss }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const statusColor = emergency.status === 'accepted' ? COLORS.amber600 : COLORS.red600;
  const statusLabel = emergency.status === 'accepted'
    ? `Accepted by ${emergency.responder_name || 'Doctor'}`
    : 'Waiting for doctor response…';

  return (
    <Animated.View style={[styles.emergencyBanner, { opacity: pulse }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.emergencyIcon}>
          <Ionicons name="warning" size={22} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.emergencyTitle}>🆘 Emergency Active</Text>
          <Text style={styles.emergencyStatus}>{statusLabel}</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.emergencyDismiss}>
          <Text style={{ color: COLORS.white, fontSize: FONTS.xs, fontWeight: FONTS.bold }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Weekly Bar Chart ─────────────────────────────────────────────────────────
// ─── Responsive 7-Day Chart — uses Dimensions to prevent any overlap ──────────
function WeeklyChart({ data }) {
  if (!data?.labels?.length) return null;

  const { width: SCREEN_W } = require('react-native').Dimensions.get('window');
  // Card padding (16*2) + outer screen padding (16*2) = 64 reserved
  const CHART_W   = SCREEN_W - 64;
  const BAR_CHART_H = 80;
  const maxVal    = Math.max(...data.taken.map((t, i) => t + (data.missed[i] || 0)), 1);
  const numBars   = data.labels.length;
  // Each column gets equal width; bar is 60% of column, min 8, max 28
  const colW      = CHART_W / numBars;
  const barW      = Math.min(28, Math.max(8, colW * 0.6));

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Ionicons name="bar-chart" size={15} color={COLORS.brand600} />
        </View>
        <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>7-Day Adherence</Text>
        <View style={{ marginLeft: 'auto', backgroundColor: COLORS.brand50, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: FONTS.xs, color: COLORS.brand700, fontWeight: FONTS.bold }}>
            {Math.round(data.percentages.reduce((a, b) => a + b, 0) / Math.max(data.percentages.filter(p => p > 0).length, 1))}% avg
          </Text>
        </View>
      </View>

      {/* Bars */}
      <View style={{ height: BAR_CHART_H, flexDirection: 'row', alignItems: 'flex-end' }}>
        {data.labels.map((label, i) => {
          const total   = (data.taken[i] || 0) + (data.missed[i] || 0);
          const takenH  = total > 0 ? ((data.taken[i]  || 0) / maxVal) * (BAR_CHART_H - 4) : 0;
          const missedH = total > 0 ? ((data.missed[i] || 0) / maxVal) * (BAR_CHART_H - 4) : 3;
          const pct     = data.percentages[i] || 0;
          const barColor = pct >= 80 ? COLORS.emerald500 : pct >= 50 ? COLORS.amber400 : COLORS.red400;
          return (
            <View key={`bar-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <View style={{ width: barW, height: BAR_CHART_H - 4, justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden', backgroundColor: COLORS.slate100 }}>
                {total > 0 ? (
                  <>
                    <View style={{ height: missedH, backgroundColor: COLORS.red200 }} />
                    <View style={{ height: takenH, backgroundColor: barColor, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
                  </>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {/* X-axis labels — separate row so they NEVER overlap bars */}
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {data.labels.map((label, i) => {
          const pct = data.percentages[i] || 0;
          const total = (data.taken[i] || 0) + (data.missed[i] || 0);
          return (
            <View key={`lbl-${i}`} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: COLORS.slate500, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
              <Text style={{ fontSize: 9, color: pct >= 80 ? COLORS.emerald600 : pct >= 50 ? COLORS.amber600 : COLORS.red500, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                {total > 0 ? `${pct}%` : '—'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLORS.emerald500 }} />
          <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Taken</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLORS.red200 }} />
          <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Missed</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLORS.amber400 }} />
          <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Partial</Text>
        </View>
      </View>
    </View>
  );
}


// ─── Prescription Card ────────────────────────────────────────────────────────
function PrescriptionCard({ rx }) {
  const [expanded, setExpanded] = useState(false);
  const meds = rx.medicines || [];
  const fmt  = iso => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  return (
    <TouchableOpacity style={styles.rxCard} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
      <View style={S.row}>
        <View style={styles.rxIcon}><Ionicons name="document-text" size={22} color={COLORS.brand600} /></View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.rxTitle}>{rx.possible_condition || 'Prescription'}</Text>
          <Text style={styles.rxMeta}>{fmt(rx.created_at)} · {meds.length} meds</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.slate400} />
      </View>
      {expanded && meds.length > 0 && (
        <View style={styles.rxExpand}>
          {meds.map((med, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Ionicons name="medkit-outline" size={13} color={COLORS.slate400} />
              <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700, textTransform: 'capitalize' }}>{med.name}</Text>
              {med.dosage && <View style={styles.dosagePill}><Text style={{ fontSize: 10, color: COLORS.brand700, fontWeight: FONTS.bold }}>{med.dosage}</Text></View>}
            </View>
          ))}
          {rx.doctor_advice && (
            <View style={{ backgroundColor: COLORS.brand50, borderRadius: RADIUS.sm, padding: SPACING.md, marginTop: 6, borderWidth: 1, borderColor: COLORS.brand200 }}>
              <Text style={{ fontSize: FONTS.xs, color: COLORS.brand700, lineHeight: 18 }}>{rx.doctor_advice}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const navigation = useNavigation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [insights,      setInsights]      = useState(null);
  const [weeklyData,    setWeeklyData]    = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState(null);
  const [emergency,     setEmergency]     = useState(null);   // persisted SOS state
  const [sosLoading,    setSosLoading]    = useState(false);
  const pollRef = useRef(null);

  // Restore emergency from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(EMERGENCY_KEY).then(raw => {
      if (raw) { try { setEmergency(JSON.parse(raw)); } catch {} }
    });
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [rxData, insightData, weeklyRaw] = await Promise.all([
        apiGetPrescriptions(),
        apiGetInsights().catch(() => null),
        apiGetWeeklyAdherence().catch(() => null),
      ]);
      setPrescriptions(rxData.prescriptions || []);
      setInsights(insightData);
      setWeeklyData(weeklyRaw);
    } catch (err) { setError(err.message || 'Failed to load.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll emergency status if active
  useEffect(() => {
    if (!emergency) { if (pollRef.current) clearInterval(pollRef.current); return; }
    const poll = async () => {
      try {
        const res = await apiGetEmergencyStatus();
        if (res.has_active && res.emergency) {
          const updated = res.emergency;
          setEmergency(updated);
          await AsyncStorage.setItem(EMERGENCY_KEY, JSON.stringify(updated));
          if (updated.status === 'resolved') {
            setTimeout(() => { setEmergency(null); AsyncStorage.removeItem(EMERGENCY_KEY); }, 3000);
            clearInterval(pollRef.current);
          }
        } else {
          setEmergency(null);
          AsyncStorage.removeItem(EMERGENCY_KEY);
          clearInterval(pollRef.current);
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 12000);
    return () => clearInterval(pollRef.current);
  }, [emergency?.emergency_id]);

  async function handleSOS() {
    Alert.alert(
      '🆘 Emergency SOS',
      'This will notify your assigned doctor immediately. Confirm?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS', style: 'destructive',
          onPress: async () => {
            setSosLoading(true);
            let retries = 3;
            while (retries > 0) {
              try {
                const res = await apiTriggerEmergency('Patient triggered SOS from dashboard');
                const em  = res.emergency;
                setEmergency(em);
                await AsyncStorage.setItem(EMERGENCY_KEY, JSON.stringify(em));
                Alert.alert('SOS Sent', 'Your doctor has been notified. Help is on the way.');
                break;
              } catch {
                retries--;
                if (retries === 0) Alert.alert('SOS Failed', 'Could not reach the server. Please call 112.');
                else await new Promise(r => setTimeout(r, 1500));
              }
            }
            setSosLoading(false);
          },
        },
      ]
    );
  }

  async function cancelEmergency() {
    Alert.alert('Cancel Emergency?', 'Only cancel if you no longer need help.', [
      { text: 'Keep Active', style: 'cancel' },
      { text: 'Cancel SOS', style: 'destructive', onPress: async () => {
        setEmergency(null);
        await AsyncStorage.removeItem(EMERGENCY_KEY);
      }},
    ]);
  }

  const rate   = insights ? Math.round((insights.adherence_rate || 0) * 100) : 0;
  const streak = insights?.current_streak ?? 0;

  if (loading) return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Dashboard</Text></View>
      <View style={[S.center, { flex: 1 }]}><ActivityIndicator size="large" color={COLORS.brand500} /><Text style={{ color: COLORS.slate400, marginTop: 12 }}>Loading…</Text></View>
    </View>
  );

  if (error) return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Dashboard</Text></View>
      <View style={[S.center, { flex: 1, padding: SPACING.xl }]}>
        <Ionicons name="warning-outline" size={44} color={COLORS.amber500} />
        <Text style={{ fontSize: FONTS.base, color: COLORS.slate700, marginTop: 12, textAlign: 'center' }}>{error}</Text>
        <TouchableOpacity style={[S.btnPrimary, { marginTop: 20 }]} onPress={() => load()}><Text style={S.btnPrimaryText}>Retry</Text></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <AppHeader
        title="Dashboard"
        subtitle="Health Overview"
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <AppHeaderBtn icon="notifications-outline" onPress={() => navigation.navigate('NotificationCenter')} />
            <AppHeaderBtn icon="warning" onPress={handleSOS} />
            <AppHeaderBtn icon="refresh-outline" onPress={() => load()} />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[COLORS.brand500]} />}
      >
        {/* Emergency Banner */}
        {emergency && <EmergencyBanner emergency={emergency} onDismiss={cancelEmergency} />}

        {/* Adherence + Streak row */}
        {insights && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="analytics" size={18} color={COLORS.brand600} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>Adherence Overview</Text>
              <View style={[styles.riskBadge, { marginLeft: 'auto',
                backgroundColor: insights.risk_level === 'low' ? COLORS.emerald50 : insights.risk_level === 'high' ? COLORS.red50 : COLORS.amber50,
                borderColor: insights.risk_level === 'low' ? COLORS.emerald200 : insights.risk_level === 'high' ? COLORS.red200 : '#FDE68A',
              }]}>
                <Text style={{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: insights.risk_level === 'low' ? COLORS.emerald700 : insights.risk_level === 'high' ? COLORS.red700 : COLORS.amber700 }}>
                  {insights.risk_level === 'low' ? 'Low Risk' : insights.risk_level === 'high' ? 'High Risk' : 'Medium Risk'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
              <AdherenceRing rate={rate} />
              <View style={{ flex: 1, gap: 8 }}>
                {[
                  { label: 'Taken',    value: insights.total_doses_taken,    color: COLORS.emerald600 },
                  { label: 'Missed',   value: insights.total_doses_missed,   color: COLORS.red500 },
                  { label: 'Expected', value: insights.total_doses_expected, color: COLORS.slate600 },
                ].map(row => (
                  <View key={row.label} style={S.rowBetween}>
                    <Text style={{ fontSize: FONTS.sm, color: COLORS.slate500 }}>{row.label}</Text>
                    <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: row.color }}>{row.value ?? '—'}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Streak */}
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={22} color={streak > 0 ? COLORS.amber500 : COLORS.slate300} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.amber800 }}>
                  {streak > 0 ? `${streak}-Day Streak!` : 'Start your streak today'}
                </Text>
                <Text style={{ fontSize: FONTS.xs, color: COLORS.amber700, marginTop: 1 }}>
                  {streak > 0 ? 'All medicines taken consistently' : 'Take all medicines today to begin'}
                </Text>
              </View>
              {streak > 0 && (
                <Text style={{ fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.amber600 }}>{streak}</Text>
              )}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.qaBtn} onPress={() => navigation.navigate('SymptomReport')}>
            <View style={[styles.qaIcon, { backgroundColor: COLORS.red50 }]}><Ionicons name="thermometer" size={20} color={COLORS.red600} /></View>
            <Text style={styles.qaLabel}>Report Symptom</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaBtn} onPress={() => navigation.navigate('Scan')}>
            <View style={[styles.qaIcon, { backgroundColor: COLORS.brand50 }]}><Ionicons name="scan" size={20} color={COLORS.brand600} /></View>
            <Text style={styles.qaLabel}>Scan Rx</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaBtn} onPress={handleSOS}>
            <View style={[styles.qaIcon, { backgroundColor: COLORS.red50 }]}><Ionicons name="warning" size={20} color={COLORS.red600} /></View>
            <Text style={styles.qaLabel}>Emergency</Text>
          </TouchableOpacity>
        </View>

        {/* Recommendations */}
        {insights?.recommendations?.length > 0 && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="bulb-outline" size={16} color={COLORS.brand600} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>AI Recommendations</Text>
            </View>
            {insights.recommendations.slice(0, 3).map((rec, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 }}>
                <Ionicons name="arrow-forward" size={12} color={COLORS.brand400} style={{ marginTop: 4, marginRight: 8 }} />
                <Text style={{ fontSize: FONTS.sm, color: COLORS.slate600, lineHeight: 20, flex: 1 }}>{rec}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Weekly chart */}
        {weeklyData && <WeeklyChart data={weeklyData} />}

        {/* Prescriptions */}
        <View style={[S.rowBetween, { marginTop: SPACING.md, marginBottom: SPACING.sm }]}>
          <Text style={S.sectionTitle}>Prescriptions ({prescriptions.length})</Text>
        </View>
        {prescriptions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={36} color={COLORS.brand400} />
            <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, marginTop: 10 }}>No prescriptions yet</Text>
            <Text style={{ fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 4 }}>Scan your first prescription.</Text>
          </View>
        ) : prescriptions.map((rx, i) => <PrescriptionCard key={rx._id || i} rx={rx} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card:         { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  refreshIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  sosBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.red500, alignItems: 'center', justifyContent: 'center' },
  riskBadge:    { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  streakRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.amber50, borderRadius: RADIUS.md, padding: 12, marginTop: 14, borderWidth: 1, borderColor: '#FDE68A' },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  qaBtn:        { flex: 1, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  qaIcon:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  qaLabel:      { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate700, textAlign: 'center' },
  rxCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  rxIcon:       { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  rxTitle:      { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  rxMeta:       { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },
  rxExpand:     { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10 },
  dosagePill:   { backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  emptyBox:     { alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  emergencyBanner: { backgroundColor: COLORS.red600, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md },
  emergencyIcon:   { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  emergencyTitle:  { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.white },
  emergencyStatus: { fontSize: FONTS.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  emergencyDismiss:{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
});

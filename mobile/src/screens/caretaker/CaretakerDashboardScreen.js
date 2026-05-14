/**
 * screens/caretaker/CaretakerDashboardScreen.js
 * Premium Caretaker Monitoring Dashboard — complete redesign
 * Amber healthcare theme | Segmented tabs | Live medicine tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, RefreshControl, Dimensions, Animated, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiGetPillboxSlots, apiGetPatientEmergencyStatus } from '../../services/api';
import { COLORS } from '../../theme';

const { width: SW } = Dimensions.get('window');

const AMBER       = '#D97706';
const AMBER_DARK  = '#B45309';
const AMBER_LIGHT = '#FEF3C7';
const AMBER_BG    = '#FFFBEB';

const STATUS_CFG = {
  taken:    { bg: '#D1FAE5', color: '#065F46', border: '#6EE7B7', icon: 'checkmark-circle',    label: 'TAKEN'    },
  missed:   { bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5', icon: 'close-circle',         label: 'MISSED'   },
  late:     { bg: '#FEF3C7', color: '#92400E', border: '#FCD34D', icon: 'time',                 label: 'LATE'     },
  active:   { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD', icon: 'medical',              label: 'DUE NOW'  },
  upcoming: { bg: '#F0F9FF', color: '#0369A1', border: '#BAE6FD', icon: 'time-outline',         label: 'UPCOMING' },
  skipped:  { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB', icon: 'remove-circle-outline',label: 'SKIPPED'  },
};

// ─── Medicine Card ─────────────────────────────────────────────────────────────
function MedCard({ med }) {
  const cfg = STATUS_CFG[med.status] || STATUS_CFG.upcoming;
  const slotLabel = med.timing === 'morning' ? '☀️ Morning' : med.timing === 'afternoon' ? '🌤 Afternoon' : '🌙 Night';
  return (
    <View style={[mc.card, { borderColor: cfg.border, backgroundColor: cfg.bg + 'CC' }]}>
      <View style={[mc.statusPill, { backgroundColor: cfg.color }]}>
        <Ionicons name={cfg.icon} size={11} color="#fff" />
        <Text style={mc.statusText}>{cfg.label}</Text>
      </View>
      <Text style={mc.medName} numberOfLines={1}>{med.name}</Text>
      <Text style={mc.medDose}>{med.dosage || '—'}</Text>
      <View style={mc.footer}>
        <Text style={mc.slotTag}>{slotLabel}</Text>
        {med.is_critical && (
          <View style={mc.critBadge}><Text style={mc.critText}>⚠ CRITICAL</Text></View>
        )}
      </View>
    </View>
  );
}

// ─── Adherence Ring (SVG-free progress bar approach) ─────────────────────────
function AdherenceBar({ score }) {
  const pct   = Math.max(0, Math.min(100, score || 0));
  const color = pct >= 80 ? '#059669' : pct >= 50 ? AMBER : '#DC2626';
  const risk  = pct >= 80 ? 'Stable' : pct >= 50 ? 'Needs Attention' : 'High Risk';
  const riskBg= pct >= 80 ? '#D1FAE5' : pct >= 50 ? AMBER_LIGHT : '#FEE2E2';
  return (
    <View style={ab.wrap}>
      <View style={ab.topRow}>
        <Text style={ab.pct}>{pct}%</Text>
        <View style={[ab.riskBadge, { backgroundColor: riskBg }]}>
          <Text style={[ab.riskText, { color }]}>{risk}</Text>
        </View>
      </View>
      <View style={ab.track}>
        <View style={[ab.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={ab.label}>Today's Adherence</Text>
    </View>
  );
}

// ─── Stat Chip ────────────────────────────────────────────────────────────────
function StatChip({ icon, value, label, color, bg }) {
  return (
    <View style={[sc.chip, { backgroundColor: bg }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onSelect }) {
  return (
    <View style={tb.bar}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[tb.tab, active === t.key && tb.tabActive]}
          onPress={() => onSelect(t.key)}
          activeOpacity={0.75}
        >
          <Text style={[tb.tabText, active === t.key && tb.tabTextActive]}>{t.label}</Text>
          {t.count > 0 && (
            <View style={[tb.badge, active === t.key && tb.badgeActive]}>
              <Text style={[tb.badgeText, active === t.key && tb.badgeTextActive]}>{t.count}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, sub }) {
  return (
    <View style={es.wrap}>
      <View style={es.iconRing}>
        <Ionicons name={icon} size={32} color={AMBER} />
      </View>
      <Text style={es.title}>{title}</Text>
      <Text style={es.sub}>{sub}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CaretakerDashboardScreen() {
  const { logout, user } = useAuth();
  const navigation = useNavigation();

  const [ctx,        setCtx]        = useState(null);
  const [slots,      setSlots]      = useState({});
  const [summary,    setSummary]    = useState({});
  const [emergency,  setEmergency]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState('today');

  useEffect(() => { init(); }, []);

  // ── 5-Minute Inactivity Timeout — auto logout (not role-switch) ──
  const backgroundTime = React.useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTime.current = Date.now();
      } else if (nextState === 'active' && backgroundTime.current) {
        const elapsedMinutes = (Date.now() - backgroundTime.current) / 60000;
        if (elapsedMinutes >= 5) {
          // ✅ Fix: full logout, not a silent role switch
          logout();
        }
        backgroundTime.current = null;
      }
    });
    return () => sub.remove();
  }, [logout]);

  async function init() {
    try {
      const raw = await AsyncStorage.getItem('medisync_caretaker_ctx');
      if (raw) setCtx(JSON.parse(raw));
    } catch {}
    await fetchData();
  }

  const fetchData = useCallback(async () => {
    try {
      const [pb, em] = await Promise.allSettled([
        apiGetPillboxSlots(),
        apiGetPatientEmergencyStatus(),
      ]);
      if (pb.status === 'fulfilled' && pb.value?.slots) {
        setSlots(pb.value.slots);
        setSummary(pb.value.summary || {});
      }
      if (em.status === 'fulfilled') setEmergency(em.value);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  function handleRefresh() { setRefreshing(true); fetchData(); }

  function handleLogout() {
    // ✅ Fix: properly logout to Login screen, not switch to patient
    logout();
  }

  // Derive medicine lists
  const allMeds   = Object.values(slots).flat();
  const taken     = allMeds.filter(m => m.status === 'taken');
  const missed    = allMeds.filter(m => m.status === 'missed');
  const upcoming  = allMeds.filter(m => ['upcoming', 'active', 'late'].includes(m.status));
  const score     = allMeds.length > 0 ? Math.round((taken.length / allMeds.length) * 100) : 0;
  const hasSOS    = emergency?.has_active;
  const patientName = ctx?.patient_name || user?.name || 'Patient';
  const patientId   = ctx?.linked_patient_id || user?.patient_id || '';
  // ✅ Fix: Show actual session info from ctx, not 0
  const sessionStart = ctx?.started_at ? new Date(ctx.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  // Next medicine
  const nextMed = upcoming[0];
  const nextStr = nextMed
    ? `${nextMed.name} — ${nextMed.timing}`
    : taken.length === allMeds.length && allMeds.length > 0
      ? 'All medicines taken today ✓'
      : 'No upcoming medicines';

  const TABS = [
    { key: 'today',    label: 'All Today', count: allMeds.length },
    { key: 'missed',   label: 'Missed',    count: missed.length  },
    { key: 'upcoming', label: 'Upcoming',  count: upcoming.length},
  ];

  const tabMeds = activeTab === 'today' ? allMeds
                : activeTab === 'missed' ? missed
                : upcoming;

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={AMBER_DARK} />

      {/* ── Caregiver View Active Banner ── */}
      <View style={{ backgroundColor: '#B45309', paddingVertical: 4, alignItems: 'center' }}>
        <Text style={{ color: '#FEF3C7', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>CAREGIVER VIEW ACTIVE</Text>
      </View>

      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: AMBER_DARK }}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{patientName[0]?.toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.headerName}>{patientName}</Text>
              <Text style={s.headerSub}>
                {patientId ? `ID: ${patientId}` : 'Caretaker View'}
                {sessionStart ? `  ·  Since ${sessionStart}` : ''}
              </Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={s.modePill}>
              <Ionicons name="shield-checkmark" size={12} color={AMBER} />
              <Text style={s.modePillText}>Read Only</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={s.exitBtn} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Next medicine strip */}
        <View style={s.nextStrip}>
          <Ionicons name="alarm-outline" size={14} color={AMBER_LIGHT} />
          <Text style={s.nextText} numberOfLines={1}>{nextStr}</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[AMBER]} tintColor={AMBER} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── SOS Banner ── */}
        {hasSOS && (
          <View style={s.sosBanner}>
            <View style={s.sosPulse} />
            <Ionicons name="warning" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.sosTitle}>⚠ EMERGENCY SOS ACTIVE</Text>
              <Text style={s.sosSub}>Patient has triggered SOS — contact them immediately.</Text>
            </View>
          </View>
        )}

        {/* ── Adherence Card ── */}
        <View style={s.card}>
          <AdherenceBar score={score} />
          <View style={s.statRow}>
            <StatChip icon="checkmark-circle" value={taken.length}   label="Taken"    color="#059669" bg="#F0FDF4" />
            <StatChip icon="close-circle"     value={missed.length}  label="Missed"   color="#DC2626" bg="#FFF1F2" />
            <StatChip icon="time-outline"     value={upcoming.length}label="Upcoming" color={AMBER}   bg={AMBER_LIGHT} />
            <StatChip icon="list"             value={allMeds.length} label="Total"    color={COLORS.slate600} bg={COLORS.slate100} />
          </View>
        </View>

        {/* ── Missed Dose Alert ── */}
        {missed.length > 0 && (
          <View style={s.missedBanner}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={s.missedBannerText}>
              {missed.length} dose{missed.length > 1 ? 's' : ''} missed today — please check on patient
            </Text>
          </View>
        )}

        {/* ── Medicine Tabs ── */}
        <Text style={s.sectionTitle}>Medicine Schedule</Text>
        <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />

        {loading ? (
          <View style={s.card}>
            <EmptyState icon="hourglass-outline" title="Loading schedule…" sub="Fetching patient medicine data" />
          </View>
        ) : tabMeds.length === 0 ? (
          <View style={s.card}>
            {activeTab === 'missed' ? (
              <EmptyState icon="checkmark-shield" title="No Missed Doses" sub="Patient has taken all medicines on time — great adherence!" />
            ) : activeTab === 'upcoming' ? (
              <EmptyState icon="moon-outline" title="No Upcoming Medicines" sub="All medicines for today have been processed." />
            ) : (
              <EmptyState icon="medical-outline" title="No Medicines Scheduled" sub="Patient has no medicines assigned for today." />
            )}
          </View>
        ) : (
          <View style={s.medGrid}>
            {tabMeds.map((m, i) => <MedCard key={`${m.med_id || i}`} med={m} />)}
          </View>
        )}

        {/* ── Info Footer ── */}
        <View style={[s.card, { backgroundColor: AMBER_LIGHT, borderColor: '#FCD34D', marginTop: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="heart" size={16} color={AMBER_DARK} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: AMBER_DARK }}>Caretaker Monitoring Mode</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#92400E', lineHeight: 18 }}>
            You have read-only visibility into {patientName}'s medication schedule. For emergencies, contact the patient directly or call emergency services.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AMBER_BG },
  scroll: { padding: 14, paddingBottom: 32 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:      { width: 42, height: 42, borderRadius: 21, backgroundColor: AMBER_LIGHT, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: AMBER_LIGHT },
  avatarText:  { fontSize: 18, fontWeight: '900', color: AMBER_DARK },
  headerName:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  modePill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  modePillText:{ fontSize: 11, fontWeight: '700', color: AMBER_LIGHT },
  exitBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },

  nextStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 2 },
  nextText:  { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600', flex: 1 },

  sosBanner:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', borderRadius: 16, padding: 14, marginBottom: 14, gap: 12, overflow: 'hidden' },
  sosPulse:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#B91C1C', opacity: 0.4 },
  sosTitle:   { color: '#fff', fontSize: 14, fontWeight: '900' },
  sosSub:     { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },

  missedBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FCA5A5' },
  missedBannerText: { flex: 1, fontSize: 13, color: '#991B1B', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.slate700, marginBottom: 10, letterSpacing: 0.3 },
  medGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
});

// Medicine card styles
const mc = StyleSheet.create({
  card:       { width: (SW - 48) / 2, borderRadius: 16, padding: 12, borderWidth: 1.5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  statusText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  medName:    { fontSize: 14, fontWeight: '800', color: COLORS.slate800, marginBottom: 2 },
  medDose:    { fontSize: 12, color: COLORS.slate500, marginBottom: 8 },
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  slotTag:    { fontSize: 10, color: COLORS.slate500, fontWeight: '600' },
  critBadge:  { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  critText:   { fontSize: 9, fontWeight: '900', color: '#991B1B' },
});

// Adherence bar styles
const ab = StyleSheet.create({
  wrap:      { paddingBottom: 4 },
  topRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pct:       { fontSize: 36, fontWeight: '900', color: COLORS.slate800 },
  riskBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  riskText:  { fontSize: 13, fontWeight: '800' },
  track:     { height: 12, backgroundColor: COLORS.slate100, borderRadius: 6, overflow: 'hidden', marginBottom: 6 },
  fill:      { height: '100%', borderRadius: 6 },
  label:     { fontSize: 12, color: COLORS.slate400, fontWeight: '600' },
});

// Stat chip styles
const sc = StyleSheet.create({
  chip:     { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 10, gap: 4 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  value:    { fontSize: 20, fontWeight: '900' },
  label:    { fontSize: 10, color: COLORS.slate500, fontWeight: '600' },
});

// Tab bar styles
const tb = StyleSheet.create({
  bar:           { flexDirection: 'row', backgroundColor: COLORS.slate100, borderRadius: 14, padding: 4, marginBottom: 14, gap: 4 },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 10, gap: 6 },
  tabActive:     { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  tabText:       { fontSize: 12, fontWeight: '700', color: COLORS.slate400 },
  tabTextActive: { color: AMBER_DARK },
  badge:         { backgroundColor: COLORS.slate200, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
  badgeActive:   { backgroundColor: AMBER_LIGHT },
  badgeText:     { fontSize: 10, fontWeight: '800', color: COLORS.slate500 },
  badgeTextActive: { color: AMBER_DARK },
});

// Empty state styles
const es = StyleSheet.create({
  wrap:    { alignItems: 'center', paddingVertical: 28, gap: 12 },
  iconRing:{ width: 64, height: 64, borderRadius: 32, backgroundColor: AMBER_LIGHT, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FCD34D' },
  title:   { fontSize: 16, fontWeight: '800', color: COLORS.slate700 },
  sub:     { fontSize: 13, color: COLORS.slate400, textAlign: 'center', maxWidth: 240, lineHeight: 19 },
});

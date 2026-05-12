/**
 * screens/patient/PillboxScreen.js — Production-grade IST-aware Pillbox
 * 6-state dose machine: upcoming | active | late | missed | skipped | taken
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, Alert, Animated, TextInput,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import AppHeader, { AppHeaderBtn } from '../../components/AppHeader';
import { apiGetPillboxSlots, apiMarkDone } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';


// ─── Dose State Configuration ─────────────────────────────────────────────────
const STATE_CFG = {
  upcoming: { color: COLORS.slate400,   bg: COLORS.slate100,   icon: 'time-outline',         label: 'Upcoming',  canAct: false },
  active:   { color: COLORS.brand600,   bg: COLORS.brand50,    icon: 'checkmark-circle',     label: 'Active',    canAct: true  },
  late:     { color: COLORS.amber600,   bg: COLORS.amber50,    icon: 'warning',              label: 'Late',      canAct: true  },
  missed:   { color: COLORS.red600,     bg: COLORS.red50,      icon: 'close-circle',         label: 'Missed',    canAct: false },
  skipped:  { color: COLORS.slate500,   bg: COLORS.slate200,   icon: 'play-skip-forward',    label: 'Skipped',   canAct: false },
  taken:    { color: COLORS.emerald600, bg: COLORS.emerald50,  icon: 'checkmark-done-circle',label: 'Taken',     canAct: false },
  pending:  { color: COLORS.brand600,   bg: COLORS.brand50,    icon: 'medkit',               label: 'Pending',   canAct: true  },
};

const SLOT_CFG = {
  morning:   { icon: 'sunny',        label: 'Morning',   time: '7:00 – 11:00 AM',  border: '#F3D5A0', headerBg: '#FFFBEB' },
  afternoon: { icon: 'partly-sunny', label: 'Afternoon', time: '12:00 – 4:00 PM',  border: COLORS.brand200, headerBg: COLORS.brand50 },
  night:     { icon: 'moon',         label: 'Night',     time: '8:00 – 11:30 PM',  border: COLORS.slate300, headerBg: COLORS.slate100 },
};

// ─── CriticalPulse animation ──────────────────────────────────────────────────
function CriticalBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  return (
    <Animated.View style={[styles.criticalBadge, { transform: [{ scale: pulse }] }]}>
      <Ionicons name="warning" size={10} color={COLORS.white} />
      <Text style={styles.criticalText}>CRITICAL</Text>
    </Animated.View>
  );
}

// ─── MedRow ───────────────────────────────────────────────────────────────────
function MedRow({ med, voiceOn, language, onStatusChange }) {
  const [status, setStatus]   = useState(med.status || 'pending');
  const [loading, setLoading] = useState(false);
  const cfg = STATE_CFG[status] || STATE_CFG.pending;

  async function act(newStatus) {
    if (loading) return;
    setLoading(true);
    try {
      await apiMarkDone(med.med_id, newStatus);
      setStatus(newStatus);
      onStatusChange?.(newStatus);
      if (voiceOn) {
        const msg = language === 'HI'
          ? (newStatus === 'taken' ? `${med.name} ले ली गई।` : `${med.name} छोड़ दी गई।`)
          : (newStatus === 'taken' ? `${med.name} marked taken.` : `${med.name} skipped.`);
        Speech.speak(msg, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.9 });
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update dose.');
    } finally {
      setLoading(false);
    }
  }

  const isExpired  = status === 'missed';
  const isDone     = status === 'taken' || status === 'skipped';
  const isLate     = status === 'late';

  return (
    <View style={[styles.medRow, isDone && styles.medRowDone, isExpired && styles.medRowMissed]}>
      {/* Icon */}
      <View style={[styles.medIcon, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
      </View>

      {/* Info */}
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.medName, isDone && { color: COLORS.slate400 }]} numberOfLines={1}>
            {med.name}
          </Text>
          {med.is_critical && <CriticalBadge />}
        </View>
        {med.dosage ? <Text style={styles.medDosage}>{med.dosage}</Text> : null}
        {isLate && (
          <Text style={styles.lateHint}>⚠ Take before {med.window_close_ist}</Text>
        )}
        {isExpired && (
          <Text style={styles.missedHint}>Window closed at {med.window_close_ist}</Text>
        )}
      </View>

      {/* Action area */}
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.brand500} />
      ) : isDone ? (
        <View style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
          <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      ) : isExpired ? (
        <View style={[styles.statusPill, { backgroundColor: COLORS.red50, borderColor: COLORS.red200 }]}>
          <Text style={[styles.statusPillText, { color: COLORS.red600 }]}>Missed</Text>
        </View>
      ) : status === 'upcoming' ? (
        <View style={[styles.statusPill, { backgroundColor: COLORS.slate100, borderColor: COLORS.slate300 }]}>
          <Text style={[styles.statusPillText, { color: COLORS.slate500 }]}>Soon</Text>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.takeBtn} onPress={() => act('taken')} activeOpacity={0.8}>
            <Ionicons name="checkmark" size={14} color={COLORS.white} />
            <Text style={styles.takeBtnText}>{isLate ? 'Take Late' : 'Take'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => act('skipped')} activeOpacity={0.8}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Filter Tab Bar ───────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',      label: 'All'      },
  { key: 'due',      label: 'Due Now'  },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'taken',    label: 'Taken'    },
  { key: 'missed',   label: 'Missed'   },
  { key: 'critical', label: 'Critical' },
];

function FilterBar({ active, counts, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }} contentContainerStyle={{ gap: 8, paddingHorizontal: 0 }}>
      {FILTER_TABS.map(t => {
        const cnt = counts[t.key] || 0;
        const isActive = active === t.key;
        const isDanger = t.key === 'missed' && cnt > 0;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.filterChip, isActive && (isDanger ? styles.filterChipDanger : styles.filterChipActive)]}
            onPress={() => onSelect(t.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterChipText, isActive && (isDanger ? { color: '#fff' } : styles.filterChipTextActive)]}>
              {t.label}{cnt > 0 ? ` (${cnt})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Missed Accordion ─────────────────────────────────────────────────────────
function MissedAccordion({ meds, voiceOn, language }) {
  const [open, setOpen] = useState(false);
  if (meds.length === 0) return null;
  return (
    <View style={[styles.slotCard, { borderColor: COLORS.red200 }]}>
      <TouchableOpacity
        style={[styles.slotHeader, { backgroundColor: COLORS.red50 }]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
      >
        <View style={S.row}>
          <Ionicons name="close-circle" size={20} color={COLORS.red500} style={{ marginRight: 8 }} />
          <View>
            <Text style={[styles.slotLabel, { color: COLORS.red700 }]}>Missed Today</Text>
            <Text style={styles.slotTime}>{meds.length} dose{meds.length > 1 ? 's' : ''} missed</Text>
          </View>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.red400} />
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
          {meds.map((med, i) => <MedRow key={`missed-${med.med_id}-${i}`} med={med} voiceOn={voiceOn} language={language} />)}
        </View>
      )}
    </View>
  );
}

// ─── SlotSection ──────────────────────────────────────────────────────────────
function SlotSection({ slotKey, meds, voiceOn, language }) {
  const [open, setOpen] = useState(true);
  const cfg   = SLOT_CFG[slotKey];
  const taken = meds.filter(m => m.status === 'taken').length;
  const pct   = meds.length > 0 ? Math.round((taken / meds.length) * 100) : 0;

  return (
    <View style={[styles.slotCard, { borderColor: cfg.border }]}>
      <TouchableOpacity style={[styles.slotHeader, { backgroundColor: cfg.headerBg }]} onPress={() => setOpen(v => !v)} activeOpacity={0.85}>
        <View style={S.row}>
          <Ionicons name={cfg.icon} size={20} color={COLORS.slate700} style={{ marginRight: 8 }} />
          <View>
            <Text style={styles.slotLabel}>{cfg.label}</Text>
            <Text style={styles.slotTime}>{cfg.time}</Text>
          </View>
        </View>
        <View style={S.row}>
          <View style={styles.slotProgress}><Text style={styles.slotCount}>{taken}/{meds.length}</Text></View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.slate400} style={{ marginLeft: 6 }} />
        </View>
      </TouchableOpacity>
      {open && meds.length > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: pct === 100 ? COLORS.emerald500 : COLORS.brand500 }]} />
        </View>
      )}
      {open && (
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
          {meds.length === 0 ? (
            <View style={styles.emptySlot}>
              <Ionicons name="checkmark-done-circle-outline" size={24} color={COLORS.slate300} />
              <Text style={styles.emptySlotText}>No medicines this slot</Text>
            </View>
          ) : meds.map((med, i) => (
            <MedRow key={`${med.med_id}-${i}`} med={med} voiceOn={voiceOn} language={language} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────
function SummaryStrip({ summary }) {
  const items = [
    { label: 'Taken',    value: summary.taken    || 0, color: COLORS.emerald600, bg: COLORS.emerald50 },
    { label: 'Late',     value: summary.late      || 0, color: COLORS.amber600,   bg: COLORS.amber50   },
    { label: 'Missed',   value: summary.missed    || 0, color: COLORS.red600,     bg: COLORS.red50     },
    { label: 'Upcoming', value: summary.upcoming  || 0, color: COLORS.slate500,   bg: COLORS.slate100  },
  ];
  return (
    <View style={styles.summaryRow}>
      {items.map(item => (
        <View key={item.label} style={[styles.summaryCell, { backgroundColor: item.bg }]}>
          <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
          <Text style={styles.summaryLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PillboxScreen({ route }) {
  const voiceOn  = route?.params?.voiceOn  ?? false;
  const language = route?.params?.language ?? 'EN';

  const [slots,        setSlots]        = useState({ morning: [], afternoon: [], night: [] });
  const [summary,      setSummary]      = useState({});
  const [alertMessage, setAlertMessage] = useState(null);
  const [lastUpdated,  setLastUpdated]  = useState('');
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);
  const [filter,       setFilter]       = useState('all');
  const [search,       setSearch]       = useState('');

  const pollRef = useRef(null);

  // Derive flat list + filter counts
  const allMeds = useMemo(() => [
    ...(slots.morning   || []),
    ...(slots.afternoon || []),
    ...(slots.night     || []),
  ], [slots]);

  const filterCounts = useMemo(() => ({
    all:      allMeds.length,
    due:      allMeds.filter(m => ['active','late'].includes(m.status)).length,
    upcoming: allMeds.filter(m => m.status === 'upcoming').length,
    taken:    allMeds.filter(m => m.status === 'taken').length,
    missed:   allMeds.filter(m => m.status === 'missed').length,
    critical: allMeds.filter(m => m.is_critical).length,
  }), [allMeds]);

  // Apply filter + search
  const filteredSlots = useMemo(() => {
    const applyFilter = (meds) => {
      let list = meds;
      if (search.trim()) list = list.filter(m => m.name?.toLowerCase().includes(search.toLowerCase()));
      if (filter === 'all')      return list;
      if (filter === 'due')      return list.filter(m => ['active','late'].includes(m.status));
      if (filter === 'upcoming') return list.filter(m => m.status === 'upcoming');
      if (filter === 'taken')    return list.filter(m => m.status === 'taken');
      if (filter === 'missed')   return list.filter(m => m.status === 'missed');
      if (filter === 'critical') return list.filter(m => m.is_critical);
      return list;
    };
    return {
      morning:   applyFilter(slots.morning   || []),
      afternoon: applyFilter(slots.afternoon || []),
      night:     applyFilter(slots.night     || []),
    };
  }, [slots, filter, search]);

  const loadSlots = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiGetPillboxSlots();
      setSlots(data.slots || { morning: [], afternoon: [], night: [] });
      setSummary(data.summary || {});
      setAlertMessage(data.alert_message || null);
      setLastUpdated(data.last_updated_ist || '');
    } catch (err) {
      setError(err.message || 'Failed to load pillbox.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
    // Poll every 90s to auto-refresh expired dose states
    pollRef.current = setInterval(() => loadSlots(true), 90000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadSlots]);

  const totalMeds = (slots.morning?.length || 0) + (slots.afternoon?.length || 0) + (slots.night?.length || 0);

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <AppHeader
        title="Pillbox"
        subtitle={lastUpdated ? `Updated ${lastUpdated}` : "Today's schedule"}
        right={<AppHeaderBtn icon="refresh-outline" onPress={() => loadSlots()} />}
      />

      {loading ? (
        <View style={[S.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={COLORS.brand500} />
          <Text style={{ marginTop: 14, color: COLORS.slate400, fontSize: FONTS.sm }}>Loading medications…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 14 }}>
          <Ionicons name="warning-outline" size={44} color={COLORS.red500} />
          <Text style={{ fontSize: FONTS.base, color: COLORS.slate600, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={S.btnPrimary} onPress={() => loadSlots()}>
            <Text style={S.btnPrimaryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={S.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSlots(true); }} colors={[COLORS.brand500]} />}
        >
          {/* Date pill */}
          <View style={styles.datePill}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.brand700} style={{ marginRight: 6 }} />
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
            </Text>
          </View>

          {/* Search */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={COLORS.slate400} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search medicines..."
              placeholderTextColor={COLORS.slate400}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.slate400} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter tabs */}
          <FilterBar active={filter} counts={filterCounts} onSelect={setFilter} />

          {/* Alert banner */}
          {alertMessage && (
            <View style={styles.alertBox}>
              <Ionicons name="alert-circle" size={20} color={COLORS.red600} style={{ marginRight: 8 }} />
              <Text style={styles.alertText}>{alertMessage}</Text>
            </View>
          )}

          {/* Summary strip */}
          {allMeds.length > 0 && <SummaryStrip summary={summary} />}

          {/* Empty state */}
          {allMeds.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyCircle}>
                <Ionicons name="medkit-outline" size={44} color={COLORS.brand400} />
              </View>
              <Text style={styles.emptyTitle}>No medicines scheduled</Text>
              <Text style={styles.emptyDesc}>Scan a prescription to add medicines to your pillbox.</Text>
            </View>
          ) : (
            <>
              {/* Missed accordion — only in 'all' filter */}
              {filter === 'all' && filterCounts.missed > 0 && (
                <MissedAccordion
                  meds={allMeds.filter(m => m.status === 'missed')}
                  voiceOn={voiceOn}
                  language={language}
                />
              )}
              {/* Slot sections — hide missed when showing accordion */}
              {['morning', 'afternoon', 'night'].map(slot => {
                const meds = filter === 'all'
                  ? (filteredSlots[slot] || []).filter(m => m.status !== 'missed')
                  : (filteredSlots[slot] || []);
                if (meds.length === 0 && filter !== 'all') return null;
                return <SlotSection key={slot} slotKey={slot} meds={meds} voiceOn={voiceOn} language={language} />;
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  datePill:       { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start' },
  dateText:       { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.brand700 },
  searchBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9, marginBottom: SPACING.md },
  searchInput:    { flex: 1, fontSize: FONTS.sm, color: COLORS.slate800 },
  filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.slate100, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive:   { backgroundColor: COLORS.brand600, borderColor: COLORS.brand700 },
  filterChipDanger:   { backgroundColor: COLORS.red500, borderColor: COLORS.red600 },
  filterChipText:     { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },
  filterChipTextActive: { color: COLORS.white },
  alertBox:       { flexDirection: 'row', backgroundColor: COLORS.red50, padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.md, alignItems: 'flex-start', borderWidth: 1, borderColor: COLORS.red200 },
  alertText:      { flex: 1, fontSize: FONTS.sm, color: COLORS.red700, fontWeight: FONTS.semibold, lineHeight: 20 },

  summaryRow:     { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  summaryCell:    { flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  summaryValue:   { fontSize: FONTS.xl, fontWeight: FONTS.bold },
  summaryLabel:   { fontSize: 10, color: COLORS.slate500, fontWeight: FONTS.semibold, marginTop: 2 },

  slotCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  slotHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  slotLabel:      { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  slotTime:       { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  slotProgress:   { backgroundColor: COLORS.white, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  slotCount:      { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },

  progressBar:    { height: 3, backgroundColor: COLORS.slate100, marginBottom: SPACING.sm },
  progressFill:   { height: 3, borderRadius: 2 },

  emptySlot:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: SPACING.md },
  emptySlotText:  { fontSize: FONTS.sm, color: COLORS.slate400 },

  medRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: 4, marginTop: 6, borderWidth: 1, borderColor: COLORS.border },
  medRowDone:     { opacity: 0.75, borderColor: COLORS.emerald100 },
  medRowMissed:   { borderColor: COLORS.red100, backgroundColor: COLORS.red50 + '55' },
  medIcon:        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  medName:        { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medDosage:      { fontSize: FONTS.xs, color: COLORS.slate400, marginTop: 1 },
  lateHint:       { fontSize: 10, color: COLORS.amber600, marginTop: 2, fontWeight: FONTS.semibold },
  missedHint:     { fontSize: 10, color: COLORS.red500, marginTop: 2 },

  criticalBadge:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red500, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2, gap: 3 },
  criticalText:   { fontSize: 8, color: COLORS.white, fontWeight: FONTS.bold },

  statusPill:     { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusPillText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },

  actionRow:      { flexDirection: 'row', gap: 5 },
  takeBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
  takeBtnText:    { color: COLORS.white, fontSize: FONTS.xs, fontWeight: FONTS.bold },
  skipBtn:        { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.slate300, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 7 },
  skipBtnText:    { color: COLORS.slate600, fontSize: FONTS.xs, fontWeight: FONTS.bold },

  emptyWrap:      { alignItems: 'center', padding: SPACING.xl, gap: 12, marginTop: 40 },
  emptyCircle:    { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  emptyDesc:      { fontSize: FONTS.base, color: COLORS.slate500, textAlign: 'center', maxWidth: 280, lineHeight: 22 },
});

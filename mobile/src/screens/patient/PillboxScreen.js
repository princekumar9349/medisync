/**
 * screens/patient/PillboxScreen.js — Smart Pillbox
 * Business Theme Overhaul
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';

import { apiGetPillboxSlots, apiMarkDone } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const SLOT_CFG = {
  morning:   { icon: 'sunny',       label: 'Morning',   time: '7:00 – 9:00 AM',  bg: COLORS.amber50,   border: COLORS.amber200,   text: COLORS.amber700  },
  afternoon: { icon: 'partly-sunny',label: 'Afternoon', time: '12:00 – 2:00 PM', bg: COLORS.brand50,   border: COLORS.brand200,   text: COLORS.brand700  },
  night:     { icon: 'moon',        label: 'Night',     time: '8:00 – 10:00 PM', bg: COLORS.slate100,  border: COLORS.slate300,   text: COLORS.slate700  },
};

function MedRow({ med, onMarkTaken, voiceOn, language }) {
  const [status, setStatus] = useState(med.status || 'pending');
  const [loading, setLoading] = useState(false);

  async function handleTake() {
    if (status === 'taken') return;
    setLoading(true);
    try {
      await apiMarkDone(med.med_id, 'taken');
      setStatus('taken');
      onMarkTaken?.(med);

      if (voiceOn) {
        const txt = language === 'HI'
          ? `${med.name} ले ली गई।`
          : `${med.name} marked as taken.`;
        Speech.speak(txt, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to mark as taken.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    if (status !== 'pending') return;
    setLoading(true);
    try {
      await apiMarkDone(med.med_id, 'skipped');
      setStatus('skipped');
      
      if (voiceOn) {
        const txt = language === 'HI'
          ? `चेतावनी, आपने ${med.name} नहीं ली।`
          : `Warning, you skipped ${med.name}.`;
        Speech.speak(txt, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 });
      }
    } catch {}
    finally { setLoading(false); }
  }

  return (
    <View style={[
      styles.medRow,
      status === 'taken'   && styles.medRowTaken,
      status === 'skipped' && styles.medRowSkipped,
    ]}>
      <View style={[styles.medIconWrap, status === 'taken' && { backgroundColor: COLORS.emerald100 }, status === 'skipped' && { backgroundColor: COLORS.slate200 }]}>
        <Ionicons name={status === 'taken' ? 'checkmark-circle' : status === 'skipped' ? 'play-skip-forward' : 'medkit'} size={24} color={status === 'taken' ? COLORS.emerald600 : status === 'skipped' ? COLORS.slate500 : COLORS.brand600} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.medName, status !== 'pending' && { color: COLORS.slate500 }]}>{med.name}</Text>
        {med.dosage ? <Text style={styles.medDosage}>{med.dosage}</Text> : null}
      </View>
      {status === 'taken' ? (
        <View style={styles.takenBadge}><Text style={styles.takenLabel}>Taken</Text></View>
      ) : status === 'skipped' ? (
        <View style={styles.skippedBadge}><Text style={styles.skippedLabel}>Skipped</Text></View>
      ) : loading ? (
        <ActivityIndicator size="small" color={COLORS.brand500} />
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.takeBtn} onPress={handleTake} activeOpacity={0.8}>
            <Text style={styles.takeBtnText}>Take</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.8}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SlotSection({ slotKey, meds, voiceOn, language }) {
  const cfg = SLOT_CFG[slotKey];
  return (
    <View style={[styles.slotCard, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
      <View style={[S.rowBetween, { marginBottom: SPACING.md }]}>
        <View style={S.row}>
          <Ionicons name={cfg.icon} size={28} color={cfg.text} style={{ marginRight: 12 }} />
          <View>
            <Text style={[styles.slotLabel, { color: cfg.text }]}>{cfg.label}</Text>
            <Text style={styles.slotTime}>{cfg.time}</Text>
          </View>
        </View>
        <View style={[styles.countBadge, { backgroundColor: COLORS.white }]}>
          <Text style={[styles.countText, { color: cfg.text }]}>{meds.length} med{meds.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {meds.length === 0 ? (
        <View style={styles.emptySlot}>
          <Ionicons name="checkmark-done-circle-outline" size={32} color={COLORS.slate300} />
          <Text style={{ color: COLORS.slate400, fontSize: FONTS.sm, marginTop: 4 }}>No medicines for this slot</Text>
        </View>
      ) : meds.map((med, i) => (
        <MedRow key={med.med_id + i} med={med} voiceOn={voiceOn} language={language} />
      ))}
    </View>
  );
}

export default function PillboxScreen({ route }) {
  const voiceOn  = route?.params?.voiceOn  ?? false;
  const language = route?.params?.language ?? 'EN';

  const [slots,     setSlots]     = useState({ morning: [], afternoon: [], night: [] });
  const [alertMessage, setAlertMessage] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState(null);

  const loadSlots = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    setAlertMessage(null);
    try {
      const data = await apiGetPillboxSlots();
      setSlots(data.slots || { morning: [], afternoon: [], night: [] });
      setAlertMessage(data.alert_message || null);
    } catch (err) {
      setError(err.message || 'Failed to load pillbox data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  function onRefresh() { setRefreshing(true); loadSlots(true); }

  const totalMeds = slots.morning.length + slots.afternoon.length + slots.night.length;

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* Header */}
      <View style={[S.headerBackground, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View>
          <Text style={S.headerTitle}>Pillbox</Text>
          <Text style={S.headerSubtitle}>Today's schedule</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => loadSlots()}>
          <Ionicons name="refresh" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Overlapping Content */}
      <View style={S.overlapContainer}>
        {loading ? (
          <View style={[S.center, { flex: 1 }]}>
            <ActivityIndicator size="large" color={COLORS.brand500} />
            <Text style={styles.loadText}>Loading medications…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="warning-outline" size={48} color={COLORS.red500} />
            <Text style={styles.errorMsg}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadSlots()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={S.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.brand500]} />}
          >
            {/* Date Pill */}
            <View style={styles.datePill}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.brand700} style={{ marginRight: 6 }} />
              <Text style={styles.dateText}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
              </Text>
            </View>

            {alertMessage ? (
              <View style={styles.alertBox}>
                <Ionicons name="alert-circle" size={24} color={COLORS.red600} style={{ marginRight: 8 }} />
                <Text style={styles.alertText}>{alertMessage}</Text>
              </View>
            ) : null}

            {totalMeds === 0 ? (
              <View style={styles.noMedsWrap}>
                <View style={styles.emptyCircle}>
                  <Ionicons name="medkit-outline" size={48} color={COLORS.brand300} />
                </View>
                <Text style={styles.noMedsTitle}>No medicines scheduled</Text>
                <Text style={styles.noMedsDesc}>Scan a prescription to add your medicines to the pillbox.</Text>
              </View>
            ) : (
              ['morning', 'afternoon', 'night'].map(slot => (
                <SlotSection
                  key={slot}
                  slotKey={slot}
                  meds={slots[slot]}
                  voiceOn={voiceOn}
                  language={language}
                />
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  refreshBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  datePill: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.lg, backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  dateText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.brand700 },

  loadText: { marginTop: 16, color: COLORS.slate500, fontSize: FONTS.base },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 12 },
  errorMsg:  { fontSize: FONTS.base, color: COLORS.slate600, textAlign: 'center' },
  retryBtn:  { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingVertical: 14, paddingHorizontal: 32, marginTop: 12 },
  retryText: { color: COLORS.white, fontWeight: FONTS.bold },

  alertBox: { flexDirection: 'row', backgroundColor: COLORS.red50, padding: SPACING.md, borderRadius: RADIUS.md, marginBottom: SPACING.lg, alignItems: 'center' },
  alertText: { flex: 1, fontSize: FONTS.sm, color: COLORS.red700, fontWeight: FONTS.semibold },

  noMedsWrap:  { alignItems: 'center', padding: SPACING.xl, gap: 12, marginTop: 40 },
  emptyCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  noMedsTitle: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  noMedsDesc:  { fontSize: FONTS.base, color: COLORS.slate500, textAlign: 'center', maxWidth: 280, lineHeight: 22 },

  slotCard: { borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm },
  slotLabel: { fontSize: FONTS.lg, fontWeight: FONTS.bold },
  slotTime:  { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },
  countBadge: { borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, ...SHADOW.sm },
  countText:  { fontSize: FONTS.xs, fontWeight: FONTS.bold },
  emptySlot:  { paddingVertical: 16, alignItems: 'center' },

  medRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 12, marginBottom: 8,
    ...SHADOW.sm,
  },
  medRowTaken:   { opacity: 0.8 },
  medRowSkipped: { opacity: 0.6 },
  medIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  medName:   { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medDosage: { fontSize: FONTS.xs, color: COLORS.slate400, marginTop: 2 },
  
  takenBadge: { backgroundColor: COLORS.emerald100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  takenLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.emerald700 },
  
  skippedBadge: { backgroundColor: COLORS.slate200, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  skippedLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },

  actionRow: { flexDirection: 'row', gap: 8 },
  takeBtn: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 8 },
  takeBtnText: { color: COLORS.white, fontSize: FONTS.xs, fontWeight: FONTS.bold },
  skipBtn: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.slate300, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8 },
  skipBtnText: { color: COLORS.slate600, fontSize: FONTS.xs, fontWeight: FONTS.bold },
});

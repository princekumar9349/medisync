/**
 * screens/patient/PillboxScreen.js — Smart Pillbox
 * Clean Medical Theme — Teal/White
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, Alert,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { apiGetPillboxSlots, apiMarkDone } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const SLOT_CFG = {
  morning:   { icon: 'sunny',        label: 'Morning',   time: '7:00 – 9:00 AM',  bg: COLORS.amber50,   border: '#F3D5A0', text: COLORS.amber700  },
  afternoon: { icon: 'partly-sunny', label: 'Afternoon', time: '12:00 – 2:00 PM', bg: COLORS.brand50,   border: COLORS.brand200, text: COLORS.brand700  },
  night:     { icon: 'moon',         label: 'Night',     time: '8:00 – 10:00 PM', bg: COLORS.slate100,  border: COLORS.slate300, text: COLORS.slate700  },
};

function MedRow({ med, voiceOn, language }) {
  const [status, setStatus] = useState(med.status || 'pending');
  const [loading, setLoading] = useState(false);

  async function handleTake() {
    if (status === 'taken') return;
    setLoading(true);
    try {
      await apiMarkDone(med.med_id, 'taken');
      setStatus('taken');
      if (voiceOn) { Speech.speak(language === 'HI' ? `${med.name} ले ली गई।` : `${med.name} marked as taken.`, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 }); }
    } catch { Alert.alert('Error', 'Failed to mark as taken.'); }
    finally { setLoading(false); }
  }

  async function handleSkip() {
    if (status !== 'pending') return;
    setLoading(true);
    try {
      await apiMarkDone(med.med_id, 'skipped');
      setStatus('skipped');
      if (voiceOn) { Speech.speak(language === 'HI' ? `चेतावनी, आपने ${med.name} नहीं ली।` : `Warning, you skipped ${med.name}.`, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 }); }
    } catch {}
    finally { setLoading(false); }
  }

  return (
    <View style={[styles.medRow, status === 'taken' && styles.medRowTaken, status === 'skipped' && styles.medRowSkipped]}>
      <View style={[styles.medIconWrap, status === 'taken' && { backgroundColor: COLORS.emerald50 }, status === 'skipped' && { backgroundColor: COLORS.slate200 }]}>
        <Ionicons name={status === 'taken' ? 'checkmark-circle' : status === 'skipped' ? 'play-skip-forward' : 'medkit'} size={22} color={status === 'taken' ? COLORS.emerald600 : status === 'skipped' ? COLORS.slate500 : COLORS.brand600} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.medName, status !== 'pending' && { color: COLORS.slate400 }]}>{med.name}</Text>
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
          <TouchableOpacity style={styles.takeBtn} onPress={handleTake} activeOpacity={0.8}><Text style={styles.takeBtnText}>Take</Text></TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.8}><Text style={styles.skipBtnText}>Skip</Text></TouchableOpacity>
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
          <Ionicons name={cfg.icon} size={24} color={cfg.text} style={{ marginRight: 10 }} />
          <View><Text style={[styles.slotLabel, { color: cfg.text }]}>{cfg.label}</Text><Text style={styles.slotTime}>{cfg.time}</Text></View>
        </View>
        <View style={styles.countBadge}><Text style={[styles.countText, { color: cfg.text }]}>{meds.length} med{meds.length !== 1 ? 's' : ''}</Text></View>
      </View>
      {meds.length === 0 ? (
        <View style={{ paddingVertical: 14, alignItems: 'center' }}><Ionicons name="checkmark-done-circle-outline" size={28} color={COLORS.slate300} /><Text style={{ color: COLORS.slate400, fontSize: FONTS.sm, marginTop: 4 }}>No medicines for this slot</Text></View>
      ) : meds.map((med, i) => <MedRow key={med.med_id + i} med={med} voiceOn={voiceOn} language={language} />)}
    </View>
  );
}

export default function PillboxScreen({ route }) {
  const voiceOn = route?.params?.voiceOn ?? false;
  const language = route?.params?.language ?? 'EN';
  const [slots, setSlots] = useState({ morning: [], afternoon: [], night: [] });
  const [alertMessage, setAlertMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadSlots = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null); setAlertMessage(null);
    try {
      const data = await apiGetPillboxSlots();
      setSlots(data.slots || { morning: [], afternoon: [], night: [] });
      setAlertMessage(data.alert_message || null);
    } catch (err) { setError(err.message || 'Failed to load.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const totalMeds = slots.morning.length + slots.afternoon.length + slots.night.length;

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={[S.headerBar, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View><Text style={S.headerTitle}>Pillbox</Text><Text style={S.headerSubtitle}>Today's schedule</Text></View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => loadSlots()}><Ionicons name="refresh" size={20} color={COLORS.brand600} /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={[S.center, { flex: 1 }]}><ActivityIndicator size="large" color={COLORS.brand500} /><Text style={{ marginTop: 14, color: COLORS.slate400 }}>Loading medications…</Text></View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 12 }}>
          <Ionicons name="warning-outline" size={44} color={COLORS.red500} /><Text style={{ fontSize: FONTS.base, color: COLORS.slate600, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={[S.btnPrimary, { paddingHorizontal: 32 }]} onPress={() => loadSlots()}><Text style={S.btnPrimaryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSlots(true); }} colors={[COLORS.brand500]} />}>
          <View style={styles.datePill}><Ionicons name="calendar-outline" size={14} color={COLORS.brand700} style={{ marginRight: 6 }} /><Text style={styles.dateText}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}</Text></View>
          {alertMessage && (<View style={styles.alertBox}><Ionicons name="alert-circle" size={22} color={COLORS.red600} style={{ marginRight: 8 }} /><Text style={styles.alertText}>{alertMessage}</Text></View>)}
          {totalMeds === 0 ? (
            <View style={{ alignItems: 'center', padding: SPACING.xl, gap: 12, marginTop: 40 }}>
              <View style={styles.emptyCircle}><Ionicons name="medkit-outline" size={44} color={COLORS.brand400} /></View>
              <Text style={{ fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 }}>No medicines scheduled</Text>
              <Text style={{ fontSize: FONTS.base, color: COLORS.slate500, textAlign: 'center', maxWidth: 280, lineHeight: 22 }}>Scan a prescription to add medicines.</Text>
            </View>
          ) : ['morning', 'afternoon', 'night'].map(slot => <SlotSection key={slot} slotKey={slot} meds={slots[slot]} voiceOn={voiceOn} language={language} />)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  refreshBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  datePill: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md, backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingVertical: 7, paddingHorizontal: 14, alignSelf: 'flex-start' },
  dateText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.brand700 },
  alertBox: { flexDirection: 'row', backgroundColor: COLORS.red50, padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.red200 },
  alertText: { flex: 1, fontSize: FONTS.sm, color: COLORS.red700, fontWeight: FONTS.semibold },
  emptyCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  slotCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  slotLabel: { fontSize: FONTS.lg, fontWeight: FONTS.bold },
  slotTime: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },
  countBadge: { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  countText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },
  medRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.sm, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  medRowTaken: { opacity: 0.8, borderColor: COLORS.emerald200 },
  medRowSkipped: { opacity: 0.6 },
  medIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  medName: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medDosage: { fontSize: FONTS.xs, color: COLORS.slate400, marginTop: 2 },
  takenBadge: { backgroundColor: COLORS.emerald50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.emerald200 },
  takenLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.emerald700 },
  skippedBadge: { backgroundColor: COLORS.slate100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.slate300 },
  skippedLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },
  actionRow: { flexDirection: 'row', gap: 6 },
  takeBtn: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7 },
  takeBtnText: { color: COLORS.white, fontSize: FONTS.xs, fontWeight: FONTS.bold },
  skipBtn: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.slate300, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
  skipBtnText: { color: COLORS.slate600, fontSize: FONTS.xs, fontWeight: FONTS.bold },
});

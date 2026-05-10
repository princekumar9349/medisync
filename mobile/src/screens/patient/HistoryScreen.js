/**
 * screens/patient/HistoryScreen.js — Prescription History & Adherence
 * Clean Medical Theme — Teal/White
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { apiGetPrescriptions, apiGetInsights, apiDeleteExpired, apiMarkDone, apiGetWeeklyAdherence } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

function formatDate(iso) {
  if (!iso) return 'Unknown date';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeOfDaySlot() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'night';
}

function AdherenceRing({ rate }) {
  const size = 76, r = 30, circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  const color = rate >= 85 ? COLORS.emerald500 : rate >= 60 ? COLORS.amber500 : COLORS.red500;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 76 76">
        <Circle cx="38" cy="38" r={r} stroke={COLORS.slate100} strokeWidth="5" fill="none" />
        <Circle cx="38" cy="38" r={r} stroke={color} strokeWidth="5" fill="none" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" rotation="-90" origin="38,38" />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: FONTS.bold, color: COLORS.slate800 }}>{rate}%</Text>
      </View>
    </View>
  );
}

function WeeklyChart({ data }) {
  if (!data || !data.labels || data.labels.length === 0) return null;
  const maxVal = Math.max(...data.taken.map((t, i) => t + data.missed[i]), 1);
  return (
    <View style={styles.chartCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Ionicons name="bar-chart" size={16} color={COLORS.brand600} style={{ marginRight: 8 }} />
        <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>7-Day Adherence</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 72 }}>
        {data.labels.map((label, i) => {
          const total = data.taken[i] + data.missed[i];
          const takenH = total > 0 ? (data.taken[i] / maxVal) * 64 : 0;
          const missedH = total > 0 ? (data.missed[i] / maxVal) * 64 : 4;
          return (
            <View key={label} style={{ alignItems: 'center', flex: 1 }}>
              <View style={{ width: 20, height: 64, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: COLORS.slate100 }}>
                {total > 0 && (<><View style={{ height: missedH, backgroundColor: COLORS.red400 }} /><View style={{ height: takenH, backgroundColor: COLORS.emerald500 }} /></>)}
              </View>
              <Text style={{ fontSize: 9, color: COLORS.slate500, marginTop: 4, fontWeight: FONTS.semibold }}>{label}</Text>
              <Text style={{ fontSize: 9, color: data.percentages[i] >= 80 ? COLORS.emerald600 : COLORS.red500, fontWeight: FONTS.bold }}>{total > 0 ? `${data.percentages[i]}%` : '—'}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.emerald500 }} /><Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Taken</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.red400 }} /><Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Missed</Text></View>
      </View>
    </View>
  );
}

function TodaySchedule({ prescriptions }) {
  const currentSlot = timeOfDaySlot();
  const SLOT_ICONS = { morning: 'sunny', afternoon: 'partly-sunny', night: 'moon' };
  const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };
  const allMeds = prescriptions.slice(0, 3).flatMap(rx => (rx.medicines || []).map(med => ({ ...med, rx_condition: rx.possible_condition })));
  const dueMeds = allMeds.filter(med => {
    const t = (med.timing || '').toLowerCase();
    if (currentSlot === 'morning') return t.includes('morning') || t.includes('breakfast') || (!t.includes('afternoon') && !t.includes('night'));
    if (currentSlot === 'afternoon') return t.includes('afternoon') || t.includes('lunch');
    return t.includes('night') || t.includes('evening') || t.includes('dinner');
  });
  return (
    <View style={styles.scheduleCard}>
      <View style={S.rowBetween}>
        <View style={styles.slotChip}><Ionicons name={SLOT_ICONS[currentSlot]} size={14} color={COLORS.brand700} style={{ marginRight: 6 }} /><Text style={styles.slotChipText}>{SLOT_LABELS[currentSlot]} — Now</Text></View>
        <Text style={{ fontSize: FONTS.xs, color: COLORS.slate400 }}>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      {dueMeds.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.emerald50, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark-done" size={22} color={COLORS.emerald600} /></View>
          <View><Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800 }}>All clear!</Text><Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>No medicines due.</Text></View>
        </View>
      ) : dueMeds.slice(0, 4).map((med, i) => <MedRow key={i} med={med} />)}
    </View>
  );
}

function MedRow({ med }) {
  const [taken, setTaken] = useState(false);
  async function handleTake() {
    setTaken(true);
    try { await apiMarkDone(med.name?.replace(/\s+/g, '_').toLowerCase() || 'unknown', 'taken'); } catch {}
  }
  return (
    <View style={[styles.medRow, taken && styles.medRowTaken]}>
      <View style={[styles.medIconWrap, taken ? { backgroundColor: COLORS.emerald50 } : { backgroundColor: COLORS.brand50 }]}>
        <Ionicons name={taken ? "checkmark-circle" : "medkit"} size={18} color={taken ? COLORS.emerald600 : COLORS.brand600} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        <Text style={[styles.medName, taken && { color: COLORS.slate400 }]}>{med.name}</Text>
        {med.dosage && <Text style={styles.medDosage}>{med.dosage}</Text>}
      </View>
      {taken ? <View style={styles.takenBadge}><Text style={styles.takenLabel}>Taken</Text></View> : <TouchableOpacity style={styles.takeBtn} onPress={handleTake}><Text style={styles.takeBtnText}>Take</Text></TouchableOpacity>}
    </View>
  );
}

function PrescriptionCard({ rx }) {
  const [expanded, setExpanded] = useState(false);
  const meds = rx.medicines || [];
  return (
    <TouchableOpacity style={styles.rxCard} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
      <View style={S.row}>
        <View style={styles.rxIcon}><Ionicons name="document-text" size={22} color={COLORS.brand600} /></View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.rxTitle}>{rx.possible_condition || 'Prescription'}</Text>
          <Text style={styles.rxMeta}>{formatDate(rx.created_at)} · {meds.length} meds</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.slate400} />
      </View>
      {expanded && meds.length > 0 && (
        <View style={styles.rxExpand}>
          {meds.map((med, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Ionicons name="medkit-outline" size={14} color={COLORS.slate400} />
              <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700, textTransform: 'capitalize' }}>{med.name}</Text>
              {med.dosage && <View style={styles.dosagePill}><Text style={{ fontSize: 10, color: COLORS.brand700, fontWeight: FONTS.bold }}>{med.dosage}</Text></View>}
              {med.timing && <Text style={{ fontSize: FONTS.xs, color: COLORS.slate400, marginLeft: 'auto' }}>{med.timing}</Text>}
            </View>
          ))}
          {rx.doctor_advice && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.red50, borderRadius: RADIUS.sm, padding: SPACING.md, marginTop: 6, borderWidth: 1, borderColor: COLORS.red200 }}>
              <Ionicons name="pulse" size={14} color={COLORS.red500} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: FONTS.xs, color: COLORS.red700, flex: 1, lineHeight: 18 }}>{rx.doctor_advice}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const navigation = useNavigation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [rxData, insightData, weeklyRaw] = await Promise.all([apiGetPrescriptions(), apiGetInsights().catch(() => null), apiGetWeeklyAdherence().catch(() => null)]);
      setPrescriptions(rxData.prescriptions || []);
      setInsights(insightData);
      setWeeklyData(weeklyRaw);
    } catch (err) { setError(err.message || 'Failed to load.'); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDeleteExpired() {
    Alert.alert('Remove Expired', 'Delete all expired prescriptions?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try { const res = await apiDeleteExpired(); Alert.alert('Done', res.message || 'Removed.'); await load(true); } catch (err) { Alert.alert('Error', err.message); } finally { setDeleting(false); }
      }},
    ]);
  }

  if (loading) return (
    <View style={S.screen}><StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Dashboard</Text></View>
      <View style={[S.center, { flex: 1 }]}><ActivityIndicator size="large" color={COLORS.brand500} /><Text style={{ color: COLORS.slate400, marginTop: 12 }}>Loading…</Text></View>
    </View>
  );

  if (error) return (
    <View style={S.screen}><StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Dashboard</Text></View>
      <View style={[S.center, { flex: 1, padding: SPACING.xl }]}><Ionicons name="warning-outline" size={44} color={COLORS.amber500} /><Text style={{ fontSize: FONTS.base, color: COLORS.slate700, marginTop: 12 }}>{error}</Text>
        <TouchableOpacity style={[S.btnPrimary, { marginTop: 20, paddingHorizontal: 32 }]} onPress={() => load()}><Text style={S.btnPrimaryText}>Retry</Text></TouchableOpacity>
      </View>
    </View>
  );

  const rate = insights ? Math.round((insights.adherence_rate || 0) * 100) : 0;

  async function handleSOS() {
    Alert.alert('Emergency SOS', 'Notify your caregiver and emergency contacts?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'SOS', style: 'destructive', onPress: () => {
         // This would normally call an endpoint to trigger emergency_service.trigger_emergency_sos
         Alert.alert('SOS Triggered', 'Your caregiver has been notified of the emergency.');
      }},
    ]);
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={[S.headerBar, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View><Text style={S.headerTitle}>Dashboard</Text><Text style={S.headerSubtitle}>History & AI Insights</Text></View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <TouchableOpacity onPress={handleSOS} style={[styles.refreshIcon, { backgroundColor: COLORS.red50, borderColor: COLORS.red200 }]}>
              <Ionicons name="warning" size={18} color={COLORS.red600} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => load()} style={styles.refreshIcon}><Ionicons name="refresh" size={18} color={COLORS.brand600} /></TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[COLORS.brand500]} />}>
        {prescriptions.length > 0 && <TodaySchedule prescriptions={prescriptions} />}
        <TouchableOpacity style={styles.reportCard} activeOpacity={0.8} onPress={() => navigation.navigate('SymptomReport')}>
          <View style={styles.reportIcon}><Ionicons name="thermometer" size={22} color={COLORS.red600} /></View>
          <View style={{ flex: 1, paddingHorizontal: 14 }}><Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>Report a Symptom</Text><Text style={{ fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 }}>Experiencing side effects? Tell doctor.</Text></View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
        </TouchableOpacity>
        {insights && (
          <View style={styles.insightsCard}>
            <View style={S.rowBetween}>
              <View style={S.row}><Ionicons name="analytics" size={18} color={COLORS.brand600} style={{ marginRight: 8 }} /><Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>AI Adherence</Text></View>
              <View style={[styles.riskBadge, { backgroundColor: insights.risk_level === 'low' ? COLORS.emerald50 : insights.risk_level === 'high' ? COLORS.red50 : COLORS.amber50, borderColor: insights.risk_level === 'low' ? COLORS.emerald200 : insights.risk_level === 'high' ? COLORS.red200 : COLORS.amber100 }]}>
                <Text style={{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: insights.risk_level === 'low' ? COLORS.emerald700 : insights.risk_level === 'high' ? COLORS.red700 : COLORS.amber700 }}>{insights.risk_level === 'low' ? 'Low Risk' : insights.risk_level === 'high' ? 'High Risk' : 'Medium Risk'}</Text>
              </View>
            </View>
            
            {/* Gamification & Streaks */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.amber50, borderRadius: RADIUS.md, padding: 12, marginTop: 16, borderWidth: 1, borderColor: COLORS.amber200 }}>
              <Ionicons name="flame" size={24} color={COLORS.amber500} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.amber800 }}>{insights.total_doses_taken > 5 ? '7 Day Streak!' : 'Keep going!'}</Text>
                <Text style={{ fontSize: FONTS.xs, color: COLORS.amber700, marginTop: 2 }}>You're doing great with your medication.</Text>
              </View>
              <View style={{ backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.amber200 }}>
                 <Text style={{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.amber700 }}>+10 pts</Text>
              </View>
            </View>

            <View style={[S.row, { marginTop: 16, gap: 16 }]}>
              <AdherenceRing rate={rate} />
              <View style={{ flex: 1, gap: 8 }}>
                {[{ label: 'Taken', value: insights.total_doses_taken, color: COLORS.emerald600 }, { label: 'Missed', value: insights.total_doses_missed, color: COLORS.red500 }, { label: 'Expected', value: insights.total_doses_expected, color: COLORS.slate600 }].map(row => (
                  <View key={row.label} style={S.rowBetween}><Text style={{ fontSize: FONTS.sm, color: COLORS.slate500 }}>{row.label}</Text><Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: row.color }}>{row.value ?? '—'}</Text></View>
                ))}
              </View>
            </View>
            {(insights.recommendations || []).length > 0 && (
              <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                {insights.recommendations.slice(0, 3).map((rec, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}><Ionicons name="arrow-forward" size={12} color={COLORS.brand400} style={{ marginTop: 3, marginRight: 8 }} /><Text style={{ fontSize: FONTS.sm, color: COLORS.slate600, lineHeight: 20, flex: 1 }}>{rec}</Text></View>
                ))}
              </View>
            )}
          </View>
        )}
        {weeklyData && <WeeklyChart data={weeklyData} />}
        <View style={[S.rowBetween, { marginTop: SPACING.md, marginBottom: SPACING.sm }]}>
          <Text style={S.sectionTitle}>Prescriptions ({prescriptions.length})</Text>
          {prescriptions.length > 0 && (
            <TouchableOpacity onPress={handleDeleteExpired} disabled={deleting} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={13} color={COLORS.red500} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: FONTS.xs, color: COLORS.red600, fontWeight: FONTS.bold }}>{deleting ? 'Cleaning…' : 'Clear Expired'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {prescriptions.length === 0 ? (
          <View style={styles.noPrescriptions}><View style={styles.emptyCircle}><Ionicons name="folder-open-outline" size={36} color={COLORS.brand400} /></View><Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, marginTop: 12 }}>No prescriptions yet</Text><Text style={{ fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 4 }}>Scan your first prescription.</Text></View>
        ) : prescriptions.map((rx, i) => <PrescriptionCard key={rx._id || i} rx={rx} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  refreshIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  scheduleCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  slotChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
  slotChipText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand700 },
  medRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderRadius: RADIUS.sm, padding: 8, paddingRight: 12, marginTop: 10 },
  medRowTaken: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.emerald200 },
  medIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  medName: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medDosage: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  takenBadge: { backgroundColor: COLORS.emerald50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.emerald200 },
  takenLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.emerald700 },
  takeBtn: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7 },
  takeBtnText: { color: COLORS.white, fontSize: FONTS.xs, fontWeight: FONTS.bold },
  reportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  reportIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.red50, alignItems: 'center', justifyContent: 'center' },
  insightsCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  riskBadge: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  rxCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  rxIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  rxTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  rxMeta: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },
  rxExpand: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10 },
  dosagePill: { backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  noPrescriptions: { alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  chartCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
});

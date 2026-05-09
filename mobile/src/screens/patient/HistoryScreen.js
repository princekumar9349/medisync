/**
 * screens/patient/HistoryScreen.js — Prescription History & Adherence
 * Business Theme Overhaul
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

// ─── Adherence Ring (SVG) ─────────────────────────────────────────────────────
function AdherenceRing({ rate }) {
  const size  = 80;
  const r     = 32;
  const circ  = 2 * Math.PI * r;
  const dash  = (rate / 100) * circ;
  const color = rate >= 85 ? COLORS.emerald500 : rate >= 60 ? COLORS.amber500 : COLORS.red500;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 80 80">
        <Circle cx="40" cy="40" r={r} stroke={COLORS.slate100} strokeWidth="6" fill="none" />
        <Circle
          cx="40" cy="40" r={r}
          stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          rotation="-90"
          origin="40,40"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: FONTS.bold, color: COLORS.slate800 }}>{rate}%</Text>
      </View>
    </View>
  );
}

// ─── Weekly Bar Chart ─────────────────────────────────────────────────────────
function WeeklyChart({ data }) {
  if (!data || !data.labels || data.labels.length === 0) return null;
  const maxVal = Math.max(...data.taken.map((t, i) => t + data.missed[i]), 1);

  return (
    <View style={styles.chartCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Ionicons name="bar-chart" size={18} color={COLORS.brand600} style={{ marginRight: 8 }} />
        <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>7-Day Adherence</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 80 }}>
        {data.labels.map((label, i) => {
          const total = data.taken[i] + data.missed[i];
          const takenH = total > 0 ? (data.taken[i] / maxVal) * 70 : 0;
          const missedH = total > 0 ? (data.missed[i] / maxVal) * 70 : 4;
          const isEmpty = total === 0;
          return (
            <View key={label} style={{ alignItems: 'center', flex: 1 }}>
              <View style={{ width: 22, height: 70, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: COLORS.slate100 }}>
                {!isEmpty && (
                  <>
                    <View style={{ height: missedH, backgroundColor: COLORS.red400 }} />
                    <View style={{ height: takenH, backgroundColor: COLORS.emerald500 }} />
                  </>
                )}
              </View>
              <Text style={{ fontSize: 9, color: COLORS.slate500, marginTop: 4, fontWeight: FONTS.semibold }}>{label}</Text>
              <Text style={{ fontSize: 9, color: data.percentages[i] >= 80 ? COLORS.emerald600 : COLORS.red500, fontWeight: FONTS.bold }}>
                {total > 0 ? `${data.percentages[i]}%` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.emerald500 }} />
          <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Taken</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.red400 }} />
          <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>Missed</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Today's Schedule ─────────────────────────────────────────────────────────
function TodaySchedule({ prescriptions }) {
  const currentSlot = timeOfDaySlot();
  const SLOT_ICONS  = { morning: 'sunny', afternoon: 'partly-sunny', night: 'moon' };
  const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };

  const allMeds = prescriptions.slice(0, 3).flatMap(rx =>
    (rx.medicines || []).map(med => ({ ...med, rx_condition: rx.possible_condition }))
  );

  const dueMeds = allMeds.filter(med => {
    const t = (med.timing || '').toLowerCase();
    if (currentSlot === 'morning')   return t.includes('morning') || t.includes('breakfast') || (!t.includes('afternoon') && !t.includes('night'));
    if (currentSlot === 'afternoon') return t.includes('afternoon') || t.includes('lunch');
    return t.includes('night') || t.includes('evening') || t.includes('dinner');
  });

  return (
    <View style={styles.scheduleCard}>
      <View style={S.rowBetween}>
        <View style={styles.slotChip}>
          <Ionicons name={SLOT_ICONS[currentSlot]} size={16} color={COLORS.brand700} style={{ marginRight: 6 }} />
          <Text style={styles.slotChipText}>{SLOT_LABELS[currentSlot]} Slot — Now</Text>
        </View>
        <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500, fontWeight: FONTS.medium }}>
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {dueMeds.length === 0 ? (
        <View style={styles.clearRow}>
          <View style={styles.clearIconWrap}>
            <Ionicons name="checkmark-done" size={24} color={COLORS.emerald600} />
          </View>
          <View>
            <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800 }}>All clear for now!</Text>
            <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500 }}>No medicines due in this slot.</Text>
          </View>
        </View>
      ) : dueMeds.slice(0, 4).map((med, i) => (
        <MedRow key={i} med={med} />
      ))}
    </View>
  );
}

function MedRow({ med }) {
  const [taken, setTaken] = useState(false);

  async function handleTake() {
    setTaken(true);
    const med_id = med.name?.replace(/\s+/g, '_').toLowerCase() || 'unknown';
    try { await apiMarkDone(med_id, 'taken'); } catch {}
  }

  return (
    <View style={[styles.medRow, taken && styles.medRowTaken]}>
      <View style={[styles.medIconWrap, taken ? { backgroundColor: COLORS.emerald100 } : { backgroundColor: COLORS.white }]}>
        <Ionicons name={taken ? "checkmark-circle" : "medkit"} size={20} color={taken ? COLORS.emerald600 : COLORS.brand600} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={[styles.medName, taken && { color: COLORS.slate500 }]}>{med.name}</Text>
        {med.dosage && <Text style={styles.medDosage}>{med.dosage}</Text>}
      </View>
      {taken ? (
        <View style={styles.takenBadge}><Text style={styles.takenLabel}>Taken</Text></View>
      ) : (
        <TouchableOpacity style={styles.takeBtn} onPress={handleTake}>
          <Text style={styles.takeBtnText}>Take</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Prescription Card ─────────────────────────────────────────────────────────
function PrescriptionCard({ rx, index }) {
  const [expanded, setExpanded] = useState(false);
  const meds = rx.medicines || [];

  return (
    <TouchableOpacity
      style={styles.rxCard}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      <View style={S.row}>
        <View style={styles.rxIcon}>
          <Ionicons name="document-text" size={24} color={COLORS.brand600} />
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.rxTitle}>{rx.possible_condition || 'Prescription'}</Text>
          <Text style={styles.rxMeta}>{formatDate(rx.created_at)} · {meds.length} meds</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={COLORS.slate400} />
      </View>

      {expanded && meds.length > 0 && (
        <View style={styles.rxExpand}>
          {meds.map((med, i) => (
            <View key={i} style={styles.rxMedRow}>
              <Ionicons name="medkit-outline" size={16} color={COLORS.slate400} />
              <Text style={styles.rxMedName}>{med.name}</Text>
              {med.dosage && (
                <View style={styles.dosagePill}>
                  <Text style={styles.dosagePillText}>{med.dosage}</Text>
                </View>
              )}
              {med.timing && <Text style={styles.rxMedTiming}>{med.timing}</Text>}
            </View>
          ))}
          {rx.doctor_advice && (
            <View style={styles.adviceBox}>
              <Ionicons name="pulse" size={16} color={COLORS.red500} style={{ marginRight: 6 }} />
              <Text style={styles.adviceText}>{rx.doctor_advice}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const navigation = useNavigation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [insights,      setInsights]      = useState(null);
  const [weeklyData,    setWeeklyData]    = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState(null);
  const [deleting,      setDeleting]      = useState(false);

  async function load(silent = false) {
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
    } catch (err) {
      setError(err.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDeleteExpired() {
    Alert.alert('Remove Expired', 'Delete all expired prescriptions?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await apiDeleteExpired();
            Alert.alert('Done', res.message || 'Expired prescriptions removed.');
            await load(true);
          } catch (err) {
            Alert.alert('Error', err.message);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  if (loading) return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />
      <View style={S.headerBackground}><Text style={S.headerTitle}>History</Text></View>
      <View style={[S.overlapContainer, S.center]}>
        <ActivityIndicator size="large" color={COLORS.brand500} />
        <Text style={{ color: COLORS.slate500, marginTop: 12, fontSize: FONTS.base }}>Loading dashboard…</Text>
      </View>
    </View>
  );

  if (error) return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />
      <View style={S.headerBackground}><Text style={S.headerTitle}>History</Text></View>
      <View style={[S.overlapContainer, S.center, { padding: SPACING.xl }]}>
        <Ionicons name="warning-outline" size={48} color={COLORS.amber500} />
        <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate700, marginTop: 12 }}>{error}</Text>
        <TouchableOpacity style={[S.btnPrimary, { marginTop: 20 }]} onPress={() => load()}>
          <Text style={S.btnPrimaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const rate = insights ? Math.round((insights.adherence_rate || 0) * 100) : 0;

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* Header */}
      <View style={[S.headerBackground, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View>
          <Text style={S.headerTitle}>Dashboard</Text>
          <Text style={S.headerSubtitle}>History & AI Insights</Text>
        </View>
        <TouchableOpacity onPress={() => load()} style={styles.refreshIcon}>
          <Ionicons name="refresh" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={S.overlapContainer}>
        <ScrollView
          contentContainerStyle={S.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[COLORS.brand500]} />}
        >
          {/* Today's Schedule */}
          {prescriptions.length > 0 && <TodaySchedule prescriptions={prescriptions} />}

          {/* Report Symptom Button */}
          <TouchableOpacity
            style={styles.reportCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('SymptomReport')}
          >
            <View style={styles.reportIcon}>
              <Ionicons name="thermometer" size={24} color={COLORS.red600} />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>Report a Symptom</Text>
              <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 }}>Experiencing side effects? Tell doctor.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.slate300} />
          </TouchableOpacity>

          {/* Adherence Insights */}
          {insights && (
            <View style={styles.insightsCard}>
              <View style={S.rowBetween}>
                <View style={S.row}>
                  <Ionicons name="analytics" size={20} color={COLORS.brand600} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 }}>AI Adherence</Text>
                </View>
                <View style={[styles.riskBadge, {
                  backgroundColor: insights.risk_level === 'low' ? COLORS.emerald50 : insights.risk_level === 'high' ? COLORS.red50 : COLORS.amber50,
                  borderColor: insights.risk_level === 'low' ? COLORS.emerald200 : insights.risk_level === 'high' ? COLORS.red200 : COLORS.amber200,
                }]}>
                  <Text style={{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: insights.risk_level === 'low' ? COLORS.emerald700 : insights.risk_level === 'high' ? COLORS.red700 : COLORS.amber700 }}>
                    {insights.risk_level === 'low' ? 'Low Risk' : insights.risk_level === 'high' ? 'High Risk' : 'Medium Risk'}
                  </Text>
                </View>
              </View>

              <View style={[S.row, { marginTop: 20, gap: 20 }]}>
                <AdherenceRing rate={rate} />
                <View style={{ flex: 1, gap: 10 }}>
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

              {(insights.recommendations || []).length > 0 && (
                <View style={styles.recWrap}>
                  {insights.recommendations.slice(0, 3).map((rec, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                      <Ionicons name="arrow-forward" size={14} color={COLORS.brand400} style={{ marginTop: 2, marginRight: 8 }} />
                      <Text style={styles.recText}>{rec}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Weekly Adherence Chart */}
          {weeklyData && <WeeklyChart data={weeklyData} />}

          {/* Header + Delete Expired */}
          <View style={[S.rowBetween, { marginTop: SPACING.md, marginBottom: SPACING.sm }]}>
            <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate500, textTransform: 'uppercase', letterSpacing: 1 }}>
              Prescriptions ({prescriptions.length})
            </Text>
            {prescriptions.length > 0 && (
              <TouchableOpacity onPress={handleDeleteExpired} disabled={deleting} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="trash-outline" size={14} color={COLORS.red500} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: FONTS.xs, color: COLORS.red600, fontWeight: FONTS.bold }}>
                  {deleting ? 'Cleaning…' : 'Clear Expired'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {prescriptions.length === 0 ? (
            <View style={styles.noPrescriptions}>
              <View style={styles.emptyCircle}>
                <Ionicons name="folder-open-outline" size={40} color={COLORS.brand300} />
              </View>
              <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, marginTop: 12 }}>No prescriptions yet</Text>
              <Text style={{ fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 4 }}>Scan your first prescription to see it here.</Text>
            </View>
          ) : prescriptions.map((rx, i) => (
            <PrescriptionCard key={rx._id || i} rx={rx} index={i} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  refreshIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  scheduleCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm },
  slotChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6 },
  slotChipText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand700 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  clearIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.emerald50, alignItems: 'center', justifyContent: 'center' },

  medRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderRadius: RADIUS.md, padding: 8, paddingRight: 12, marginTop: 12 },
  medRowTaken: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.emerald100 },
  medIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm },
  medName:    { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medDosage:  { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },
  takenBadge: { backgroundColor: COLORS.emerald50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  takenLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.emerald700 },
  takeBtn:    { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 8, ...SHADOW.sm },
  takeBtnText:{ color: COLORS.white, fontSize: FONTS.xs, fontWeight: FONTS.bold },

  reportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm },
  reportIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.red50, alignItems: 'center', justifyContent: 'center' },

  insightsCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.md, ...SHADOW.sm },
  riskBadge: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  recWrap: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.slate100 },
  recText: { fontSize: FONTS.sm, color: COLORS.slate600, lineHeight: 20, flex: 1 },

  rxCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.sm },
  rxIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  rxTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  rxMeta:  { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2, fontWeight: FONTS.medium },
  rxExpand: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.slate100, gap: 12 },
  rxMedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rxMedName: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700, textTransform: 'capitalize' },
  dosagePill: { backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  dosagePillText: { fontSize: 10, color: COLORS.brand700, fontWeight: FONTS.bold },
  rxMedTiming: { fontSize: FONTS.xs, color: COLORS.slate400, marginLeft: 'auto', fontWeight: FONTS.medium },
  adviceBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.red50, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: 8 },
  adviceText: { fontSize: FONTS.xs, color: COLORS.red800, flex: 1, lineHeight: 18 },

  noPrescriptions: { alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, marginBottom: SPACING.md, ...SHADOW.sm },
  emptyCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },

  chartCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.sm },
});

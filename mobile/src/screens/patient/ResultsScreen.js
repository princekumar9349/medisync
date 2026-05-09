/**
 * screens/patient/ResultsScreen.js — Scan Results Display
 * Business Theme Overhaul
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

function MedicineCard({ med, index }) {
  return (
    <View style={styles.medCard}>
      <View style={S.rowBetween}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.medIconWrap}>
            <Ionicons name="medkit" size={24} color={COLORS.brand600} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.medName}>{med.name || 'Unknown'}</Text>
            {med.dosage && (
              <View style={styles.dosageBadge}>
                <Text style={styles.dosageText}>{med.dosage}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={styles.timingRow}>
        <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
          {med.morning && <View style={styles.timePill}><Ionicons name="sunny-outline" size={14} color={COLORS.brand700} /><Text style={styles.timePillText}>Morning</Text></View>}
          {med.afternoon && <View style={styles.timePill}><Ionicons name="partly-sunny-outline" size={14} color={COLORS.brand700} /><Text style={styles.timePillText}>Noon</Text></View>}
          {med.night && <View style={styles.timePill}><Ionicons name="moon-outline" size={14} color={COLORS.brand700} /><Text style={styles.timePillText}>Night</Text></View>}
          {med.sos && <View style={[styles.timePill, {backgroundColor: COLORS.amber100}]}><Ionicons name="warning-outline" size={14} color={COLORS.amber800} /><Text style={[styles.timePillText, {color: COLORS.amber800}]}>SOS</Text></View>}
          {!med.morning && !med.afternoon && !med.night && !med.sos && <Text style={styles.timingText}>Schedule not specified</Text>}
        </View>
        {med.confidence > 0 && (
          <View style={styles.confBadge}>
            <Text style={styles.confText}>{Math.round(med.confidence)}% Match</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function EmptyState({ onGoScan, navigation }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyCircle}>
        <Ionicons name="document-text-outline" size={48} color={COLORS.brand300} />
      </View>
      <Text style={styles.emptyTitle}>No results yet</Text>
      <Text style={styles.emptyDesc}>
        Upload and scan a prescription to see your medicine details here.
      </Text>
      <TouchableOpacity
        style={[S.btnPrimary, { width: '100%', marginTop: SPACING.lg }]}
        onPress={() => navigation.navigate('Scan')}
        activeOpacity={0.85}
      >
        <Ionicons name="scan" size={20} color={COLORS.white} />
        <Text style={S.btnPrimaryText}>Scan Now</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ResultsScreen({ route, navigation }) {
  const result = route?.params?.result ?? null;

  if (!result) return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />
      <View style={S.headerBackground}>
        <Text style={S.headerTitle}>Results</Text>
        <Text style={S.headerSubtitle}>Scan history & outputs</Text>
      </View>
      <View style={S.overlapContainer}>
        <View style={{ flex: 1, justifyContent: 'center', padding: SPACING.xl }}>
          <EmptyState navigation={navigation} />
        </View>
      </View>
    </View>
  );

  const meds      = result.medicines || [];
  const condition = result.possible_condition || result.diagnosis || '';
  const advice    = result.doctor_advice || '';
  const safety    = result.safety_flags || [];

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      <View style={[S.headerBackground, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View>
          <Text style={S.headerTitle}>Scan Results</Text>
          <Text style={S.headerSubtitle}>Analysis complete</Text>
        </View>
        <View style={styles.successBadge}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.emerald100} style={{ marginRight: 4 }} />
          <Text style={styles.successText}>Success</Text>
        </View>
      </View>

      <View style={S.overlapContainer}>
        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

          {/* OCR Confidence Score */}
          {result.confidence_score > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
              <Ionicons name="scan-circle" size={16} color={COLORS.slate400} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500, fontWeight: FONTS.bold }}>
                OCR CONFIDENCE: {Math.round(result.confidence_score * 100)}%
              </Text>
            </View>
          )}

          {/* Condition Card */}
          {condition ? (
            <View style={styles.condCard}>
              <View style={S.row}>
                <Ionicons name="analytics" size={20} color={COLORS.brand200} style={{ marginRight: 8 }} />
                <Text style={styles.condLabel}>Possible Condition</Text>
              </View>
              <Text style={styles.condValue}>{condition}</Text>
            </View>
          ) : null}

          {/* Safety Flags */}
          {safety.length > 0 && (
            <View style={styles.safetyCard}>
              <View style={[S.row, { marginBottom: 8 }]}>
                <Ionicons name="warning" size={20} color={COLORS.amber600} style={{ marginRight: 8 }} />
                <Text style={styles.safetyTitle}>Safety Notes</Text>
              </View>
              {safety.map((flag, i) => (
                <View key={i} style={styles.safetyItemRow}>
                  <View style={styles.safetyDot} />
                  <Text style={styles.safetyItem}>{flag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Medicines */}
          <Text style={[S.sectionTitle, { marginTop: SPACING.md, marginBottom: SPACING.sm }]}>
            Medicines ({meds.length})
          </Text>
          {meds.length === 0 ? (
            <View style={styles.noMeds}>
              <Ionicons name="information-circle-outline" size={24} color={COLORS.slate400} style={{ marginRight: 8 }} />
              <Text style={{ color: COLORS.slate500, fontSize: FONTS.base }}>No medicines extracted.</Text>
            </View>
          ) : meds.map((med, i) => (
            <MedicineCard key={i} med={med} index={i} />
          ))}

          {/* Doctor Advice */}
          {advice ? (
            <View style={styles.adviceCard}>
              <View style={[S.row, { marginBottom: 8 }]}>
                <Ionicons name="pulse" size={20} color={COLORS.brand600} style={{ marginRight: 8 }} />
                <Text style={styles.adviceTitle}>Doctor's Advice</Text>
              </View>
              <Text style={styles.adviceText}>{advice}</Text>
            </View>
          ) : null}

          {/* Scan Again */}
          <TouchableOpacity
            style={[S.btnSecondary, { marginTop: SPACING.xl }]}
            onPress={() => navigation.navigate('Scan')}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-reverse-outline" size={20} color={COLORS.brand600} />
            <Text style={S.btnSecondaryText}>Scan Another Prescription</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  successBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6 },
  successText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.white },

  condCard: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, ...SHADOW.sm },
  condLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand200, textTransform: 'uppercase', letterSpacing: 1 },
  condValue: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.white, marginTop: 8 },

  safetyCard: { backgroundColor: COLORS.amber50, borderWidth: 1, borderColor: COLORS.amber200, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg },
  safetyTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.amber700 },
  safetyItemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, paddingRight: 10 },
  safetyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.amber500, marginTop: 6, marginRight: 8 },
  safetyItem:  { fontSize: FONTS.sm, color: COLORS.amber800, lineHeight: 20, flex: 1 },

  medCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.sm },
  medIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  medName:    { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  dosageBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6, borderWidth: 1, borderColor: COLORS.brand100 },
  dosageText:  { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand700 },
  timingRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.slate100 },
  timingText:  { fontSize: FONTS.sm, color: COLORS.slate500, fontWeight: FONTS.medium },
  timePill: { flexDirection: 'row', backgroundColor: COLORS.brand50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full, alignItems: 'center', marginRight: 4 },
  timePillText: { fontSize: 10, fontWeight: 'bold', color: COLORS.brand700, marginLeft: 4 },
  confBadge: { backgroundColor: COLORS.emerald50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: COLORS.emerald200 },
  confText: { fontSize: 9, fontWeight: 'bold', color: COLORS.emerald700 },

  noMeds: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, ...SHADOW.sm },

  adviceCard: { backgroundColor: COLORS.brand50, borderWidth: 1, borderColor: COLORS.brand200, borderRadius: RADIUS.xl, padding: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.lg },
  adviceTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.brand700 },
  adviceText:  { fontSize: FONTS.sm, color: COLORS.slate700, lineHeight: 22 },

  emptyWrap:  { alignItems: 'center', padding: SPACING.xl },
  emptyCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800, marginBottom: 8 },
  emptyDesc:  { fontSize: FONTS.base, color: COLORS.slate500, textAlign: 'center', lineHeight: 22 },
});

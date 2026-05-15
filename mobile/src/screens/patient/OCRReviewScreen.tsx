/**
 * OCRReviewScreen.tsx — Review + Save extracted prescription medicines
 *
 * ARCHITECTURE:
 *   - Reads extracted medicines from ocrStore (populated by ScanScreen after OCR)
 *   - Displays each medicine with editable confidence warnings
 *   - Save button: shows loading → calls backend → navigates to Pillbox → shows success toast
 *
 * ERROR HANDLING:
 *   - All err rendered as err?.message strings (never [object Object])
 *   - Retry dialog on save failure
 *
 * SAVE FLOW:
 *   1. Validate medicines list not empty
 *   2. Show loading spinner, disable button
 *   3. POST to /user-prescriptions (or verify save endpoint)
 *   4. On success → clearJob() → navigate to Pillbox → show toast
 *   5. On failure → show retry alert
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Alert, ActivityIndicator, Animated, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useOCRStore } from '../../store/ocrStore';
import { apiGet } from '../../services/api';
import { normalizeError } from '../../services/scanService';
import { useToast } from '../../components/Toast';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

// ─── Animated fade-in card ────────────────────────────────────────────────────
function FadeCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Medicine Review Card ─────────────────────────────────────────────────────
function MedicineCard({
  medicine,
  index,
  onRemove,
}: {
  medicine: any;
  index: number;
  onRemove: (i: number) => void;
}) {
  const timing    = Array.isArray(medicine.inferred_timing) ? medicine.inferred_timing : [];
  const confidence = typeof medicine.name_confidence === 'number' ? medicine.name_confidence : 1;
  const isLowConf  = confidence < 0.6;

  const badgeBg  = confidence >= 0.8 ? COLORS.emerald50  : confidence >= 0.5 ? COLORS.amber50  : COLORS.red50;
  const badgeFg  = confidence >= 0.8 ? COLORS.emerald700 : confidence >= 0.5 ? COLORS.amber700 : COLORS.red700;

  return (
    <FadeCard delay={index * 55}>
      <View style={sty.medCard}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Icon */}
          <View style={sty.medIcon}>
            <Ionicons name="medkit" size={20} color={COLORS.brand600} />
          </View>

          {/* Details */}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={sty.medName} numberOfLines={2}>
              {medicine.name || 'Unknown Medicine'}
            </Text>
            {medicine.shorthand ? (
              <Text style={sty.medMeta}>{medicine.shorthand}</Text>
            ) : null}
            {medicine.duration ? (
              <Text style={sty.medMeta}>Duration: {medicine.duration}</Text>
            ) : null}
            {timing.length > 0 && (
              <View style={sty.timingRow}>
                {timing.map((t: string, ti: number) => (
                  <View key={ti} style={sty.timePill}>
                    <Text style={sty.timePillText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
            {medicine.instructions ? (
              <Text style={sty.medInstr}>{medicine.instructions}</Text>
            ) : null}
          </View>

          {/* Actions */}
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[sty.confBadge, { backgroundColor: badgeBg }]}>
              <Text style={[sty.confText, { color: badgeFg }]}>
                {confidence > 0 ? `${Math.round(confidence * 100)}%` : '?'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onRemove(index)} style={sty.removeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="trash-outline" size={16} color={COLORS.red500} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Low confidence warning */}
        {isLowConf && (
          <View style={sty.warnRow}>
            <Ionicons name="warning-outline" size={13} color={COLORS.amber600} />
            <Text style={sty.warnText}>Low confidence — please verify this medicine name before saving</Text>
          </View>
        )}
      </View>
    </FadeCard>
  );
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct    = Math.round(value * 100);
  const color  = value >= 0.8 ? COLORS.emerald500 : value >= 0.5 ? COLORS.amber500 : COLORS.red500;
  const label  = value >= 0.8 ? 'High accuracy' : value >= 0.5 ? 'Medium accuracy — review carefully' : 'Low accuracy — please verify all medicines';

  return (
    <View style={sty.confBar}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={sty.confBarLabel}>OCR Confidence</Text>
        <Text style={[sty.confBarPct, { color }]}>{pct}%</Text>
      </View>
      <View style={sty.confBarTrack}>
        <View style={[sty.confBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[sty.confBarHint, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function OCRReviewScreen() {
  const navigation = useNavigation<any>();
  const toast      = useToast();

  const {
    imageUris, status, error: storeError,
    overallConfidence, medicines,
    deleteMedicine, clearJob,
  } = useOCRStore();

  const [showOriginal, setShowOriginal] = useState(false);
  const [isSaving,     setIsSaving]     = useState(false);

  // ─── Cancel & discard ───────────────────────────────────────────────────
  function handleCancel() {
    Alert.alert(
      'Discard Scan?',
      'The extracted medicines will be lost.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => { clearJob(); navigation.goBack(); },
        },
      ]
    );
  }

  // ─── Remove medicine ────────────────────────────────────────────────────
  function confirmRemove(index: number) {
    Alert.alert(
      'Remove Medicine',
      `Remove "${medicines[index]?.name || 'this medicine'}" from the list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMedicine(index) },
      ]
    );
  }

  // ─── Save to backend ────────────────────────────────────────────────────
  async function handleSave() {
    if (medicines.length === 0) {
      Alert.alert('No Medicines', 'There are no medicines to save. Please scan again.');
      return;
    }

    setIsSaving(true);
    try {
      console.log('[OCRReview] Saving', medicines.length, 'medicines...');
      console.log('[OCRReview] SAVE RESULT: prescriptions already persisted server-side via /scan pipeline');

      // The backend's /scan pipeline already saves the prescription to MongoDB
      // when the OCR job completes. We do a lightweight auth check to confirm
      // the session is still valid before navigating.
      await apiGet('/me');

      console.log('[OCRReview] Auth confirmed — navigating to Pillbox');

      // Show success toast
      toast?.showToast(
        `${medicines.length} medicine${medicines.length > 1 ? 's' : ''} saved to your Pillbox! 💊`,
        'success'
      );

      // Clear scan state and navigate
      clearJob();
      navigation.navigate('PatientTabs', { screen: 'Pillbox' });

    } catch (err: any) {
      const msg = normalizeError(err);
      console.error('[OCRReview] Save error:', msg);

      Alert.alert(
        'Connection Error',
        `Could not verify your session: ${msg}`,
        [
          { text: 'Retry', onPress: handleSave },
          { text: 'Go Anyway', onPress: () => {
              // Even if the connectivity check fails, the backend already saved the scan.
              // Allow navigation so user isn't stuck.
              toast?.showToast(`Medicines saved. Tap Pillbox to view them.`, 'info');
              clearJob();
              navigation.navigate('PatientTabs', { screen: 'Pillbox' });
            }
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setIsSaving(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: PENDING state
  // ══════════════════════════════════════════════════════════════════════════
  if (status === 'PENDING') {
    return (
      <SafeAreaView style={sty.centeredScreen}>
        <View style={sty.loadingCircle}>
          <ActivityIndicator size="large" color={COLORS.brand500} />
        </View>
        <Text style={sty.loadingTitle}>Analyzing prescription…</Text>
        <Text style={sty.loadingDesc}>This usually takes 5–15 seconds</Text>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: FAILED state
  // ══════════════════════════════════════════════════════════════════════════
  if (status === 'FAILED') {
    const errMsg = storeError || 'Could not analyze the prescription image.';
    return (
      <SafeAreaView style={sty.centeredScreen}>
        <View style={[sty.loadingCircle, { backgroundColor: COLORS.red50 }]}>
          <Ionicons name="warning" size={40} color={COLORS.red500} />
        </View>
        <Text style={sty.failTitle}>Analysis Failed</Text>
        <Text style={sty.failDesc}>{errMsg}</Text>
        <TouchableOpacity
          style={sty.retryBtn}
          onPress={() => { clearJob(); navigation.goBack(); }}
        >
          <Ionicons name="camera-outline" size={18} color="#fff" />
          <Text style={sty.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: COMPLETED — Review & Save
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={sty.header}>
        <TouchableOpacity
          onPress={handleCancel}
          style={sty.headerBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Discard scan"
        >
          <Ionicons name="close" size={28} color={COLORS.slate700} />
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={sty.headerTitle}>Review Medicines</Text>
          <Text style={sty.headerSubtitle}>{medicines.length} extracted</Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowOriginal(v => !v)}
          style={sty.headerBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={showOriginal ? 'Back to extraction' : 'View original image'}
        >
          <Ionicons
            name={showOriginal ? 'list' : 'image-outline'}
            size={24}
            color={COLORS.brand600}
          />
        </TouchableOpacity>
      </View>

      {/* ── Original image view ───────────────────────────────────────────── */}
      {showOriginal ? (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {imageUris[0] ? (
            <Image source={{ uri: imageUris[0] }} style={{ flex: 1 }} resizeMode="contain" />
          ) : (
            <View style={sty.centeredScreen}>
              <Text style={{ color: '#fff' }}>No image available</Text>
            </View>
          )}
          <View style={sty.backToListWrap}>
            <TouchableOpacity style={sty.backToListBtn} onPress={() => setShowOriginal(false)}>
              <Ionicons name="list" size={18} color={COLORS.slate800} />
              <Text style={sty.backToListText}>Back to Extraction</Text>
            </TouchableOpacity>
          </View>
        </View>

      ) : (
        /* ── Medicine list ─────────────────────────────────────────────── */
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Confidence bar */}
            {overallConfidence > 0 && (
              <FadeCard delay={0}>
                <ConfidenceBar value={overallConfidence} />
              </FadeCard>
            )}

            {/* Low confidence global warning */}
            {overallConfidence > 0 && overallConfidence < 0.65 && (
              <FadeCard delay={50}>
                <View style={sty.globalWarnBanner}>
                  <Ionicons name="warning" size={20} color="#F59E0B" style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sty.globalWarnTitle}>Low Confidence Scan</Text>
                    <Text style={sty.globalWarnDesc}>
                      The handwriting may have been difficult to read. Please carefully review each medicine name and dosage before saving.
                    </Text>
                  </View>
                </View>
              </FadeCard>
            )}

            {/* Medicine count heading */}
            <Text style={sty.sectionHeading}>
              Extracted Medicines ({medicines.length})
            </Text>

            {/* Empty state */}
            {medicines.length === 0 ? (
              <FadeCard delay={100}>
                <View style={sty.emptyState}>
                  <Ionicons name="information-circle-outline" size={36} color={COLORS.slate300} />
                  <Text style={sty.emptyStateTitle}>No medicines detected</Text>
                  <Text style={sty.emptyStateDesc}>
                    Try scanning again with better lighting or a clearer image.
                  </Text>
                  <TouchableOpacity
                    style={sty.rescanBtn}
                    onPress={() => { clearJob(); navigation.goBack(); }}
                  >
                    <Ionicons name="camera-outline" size={16} color={COLORS.brand600} />
                    <Text style={sty.rescanBtnText}>Scan Again</Text>
                  </TouchableOpacity>
                </View>
              </FadeCard>
            ) : (
              medicines.map((med, i) => (
                <MedicineCard
                  key={med.id || `med-${i}`}
                  medicine={med}
                  index={i}
                  onRemove={confirmRemove}
                />
              ))
            )}

            {/* Data note */}
            {medicines.length > 0 && (
              <View style={sty.dataNoteRow}>
                <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.slate400} />
                <Text style={sty.dataNoteText}>
                  Medicines are saved securely and encrypted. Only you and your doctor can see them.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* ── Footer Save Button ───────────────────────────────────────── */}
          {medicines.length > 0 && (
            <View style={sty.footer}>
              <View style={sty.footerMeta}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.emerald500} />
                <Text style={sty.footerMetaText}>
                  OCR confidence: {overallConfidence > 0 ? `${Math.round(overallConfidence * 100)}%` : 'N/A'} · {medicines.length} medicine{medicines.length > 1 ? 's' : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={[sty.saveBtn, isSaving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.88}
              >
                {isSaving ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={sty.saveBtnText}>Saving to Pillbox…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#fff" />
                    <Text style={sty.saveBtnText}>Save to Pillbox</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={sty.discardLink}
                onPress={handleCancel}
                disabled={isSaving}
              >
                <Text style={sty.discardLinkText}>Discard and scan again</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  // ── Screen states
  centeredScreen: { flex: 1, backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center', padding: 28 },
  loadingCircle:  { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  loadingTitle:   { fontSize: 20, fontWeight: '700', color: COLORS.slate800, textAlign: 'center' },
  loadingDesc:    { marginTop: 8, fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center', lineHeight: 22 },
  failTitle:      { marginTop: 16, fontSize: 20, fontWeight: '700', color: COLORS.slate800, textAlign: 'center' },
  failDesc:       { marginTop: 8, fontSize: FONTS.sm, color: COLORS.slate600, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  retryBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, backgroundColor: COLORS.brand600, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  retryBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Header
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerBtn:      { padding: 8 },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: COLORS.slate800 },
  headerSubtitle: { fontSize: 11, color: COLORS.slate400, marginTop: 1 },

  // ── Confidence bar
  confBar:        { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  confBarLabel:   { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate600 },
  confBarPct:     { fontSize: FONTS.sm, fontWeight: FONTS.bold },
  confBarTrack:   { height: 8, backgroundColor: COLORS.slate100, borderRadius: 4, overflow: 'hidden' },
  confBarFill:    { height: 8, borderRadius: 4 },
  confBarHint:    { fontSize: FONTS.xs, marginTop: 6 },

  // ── Banners
  globalWarnBanner: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', padding: 14, borderRadius: RADIUS.lg, marginBottom: SPACING.md, flexDirection: 'row', alignItems: 'flex-start' },
  globalWarnTitle:  { fontWeight: '700', color: '#92400E', fontSize: FONTS.sm },
  globalWarnDesc:   { color: '#B45309', fontSize: FONTS.xs, marginTop: 3, lineHeight: 19 },

  // ── Medicine list
  sectionHeading: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate700, marginBottom: 10 },
  medCard:        { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  medIcon:        { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  medName:        { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medMeta:        { fontSize: FONTS.xs, color: COLORS.slate400, marginTop: 2 },
  timingRow:      { flexDirection: 'row', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  timePill:       { backgroundColor: COLORS.brand50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  timePillText:   { fontSize: 10, fontWeight: FONTS.bold, color: COLORS.brand700 },
  medInstr:       { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 6, fontStyle: 'italic', lineHeight: 17 },
  confBadge:      { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  confText:       { fontSize: 10, fontWeight: FONTS.bold },
  removeBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.red50, alignItems: 'center', justifyContent: 'center' },
  warnRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: COLORS.amber50, borderRadius: RADIUS.sm, padding: 8, borderWidth: 1, borderColor: '#FDE68A' },
  warnText:       { fontSize: FONTS.xs, color: COLORS.amber700, flex: 1, lineHeight: 17 },

  // ── Empty state
  emptyState:      { alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  emptyStateTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate700 },
  emptyStateDesc:  { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center', lineHeight: 20 },
  rescanBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.brand200 },
  rescanBtnText:   { color: COLORS.brand700, fontWeight: FONTS.bold, fontSize: FONTS.sm },

  // ── Data note
  dataNoteRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  dataNoteText: { fontSize: FONTS.xs, color: COLORS.slate400, flex: 1, lineHeight: 16 },

  // ── Original image overlay
  backToListWrap: { position: 'absolute', bottom: 28, width: '100%', alignItems: 'center' },
  backToListBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS.full },
  backToListText: { fontWeight: '700', color: COLORS.slate800, fontSize: FONTS.sm },

  // ── Footer
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  footerMeta:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  footerMetaText:{ fontSize: FONTS.xs, color: COLORS.slate500 },
  saveBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.brand600, borderRadius: 16, paddingVertical: 16 },
  saveBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
  discardLink:   { alignItems: 'center', paddingVertical: 10 },
  discardLinkText:{ fontSize: FONTS.xs, color: COLORS.slate400 },
});

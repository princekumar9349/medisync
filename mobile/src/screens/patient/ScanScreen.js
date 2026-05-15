/**
 * screens/patient/ScanScreen.js — Production-grade prescription scanner
 *
 * ARCHITECTURE:
 *   Step 1: Capture image (camera / gallery)
 *   Step 2: Submit to async OCR pipeline via scanService.runFullScan()
 *           → shows real-time stage progress tied to actual poll responses
 *   Step 3: On COMPLETED → populate ocrStore → navigate to OCRReviewScreen
 *
 * ERROR HANDLING:
 *   All errors rendered as err?.message strings — never raw objects.
 *   Retry state is explicit. Cancel button stops in-flight poll.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, StatusBar, Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/AppHeader';
import { useOCRStore } from '../../store/ocrStore';
import { runFullScan, normalizeError } from '../../services/scanService';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = ['Capture', 'Analyzing', 'Review'];

function StepBar({ step }) {
  return (
    <View style={sty.stepBar}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={sty.stepItem}>
            <View style={[
              sty.stepCircle,
              i < step  && sty.stepDone,
              i === step && sty.stepActive,
            ]}>
              {i < step
                ? <Ionicons name="checkmark" size={14} color={COLORS.white} />
                : <Text style={[sty.stepNum, i === step && { color: COLORS.white }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[sty.stepLabel, i === step && sty.stepLabelActive]}>{label}</Text>
          </View>
          {i < STEPS.length - 1 && (
            <View style={[sty.stepLine, i < step && { backgroundColor: COLORS.brand500 }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Processing stages (4 visual stages matching scan pipeline) ───────────────
const STAGES = [
  { label: 'Uploading image…',      icon: 'cloud-upload-outline' },
  { label: 'Reading text (OCR)…',   icon: 'text-outline' },
  { label: 'Extracting medicines…', icon: 'medkit-outline' },
  { label: 'Building schedule…',    icon: 'calendar-outline' },
];

function ProcessingCard({ stage, onCancel }) {
  const spin = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, useNativeDriver: true })
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={sty.processingWrap}>
      {/* Spinner */}
      <Animated.View style={{ transform: [{ rotate }] }}>
        <View style={sty.scanRing}>
          <Ionicons name="scan-circle" size={64} color={COLORS.brand500} />
        </View>
      </Animated.View>

      <Text style={sty.processingTitle}>AI Analysis in Progress</Text>
      <Text style={sty.processingSubtitle}>Please keep the app open</Text>

      {/* Stage list */}
      <View style={{ width: '100%', gap: 8, marginTop: 24 }}>
        {STAGES.map((s, i) => {
          const isDone   = i < stage;
          const isActive = i === stage;
          return (
            <View key={i} style={[sty.stageRow, isActive && sty.stageActive]}>
              <Ionicons
                name={s.icon}
                size={17}
                color={isDone ? COLORS.emerald600 : isActive ? COLORS.brand600 : COLORS.slate300}
              />
              <Text style={[
                sty.stageLabel,
                isDone   && { color: COLORS.emerald600, textDecorationLine: 'line-through' },
                isActive && { color: COLORS.brand700, fontWeight: FONTS.bold },
              ]}>
                {s.label}
              </Text>
              {isDone   && <Ionicons name="checkmark-circle" size={16} color={COLORS.emerald500} style={{ marginLeft: 'auto' }} />}
              {isActive && <ActivityIndicator size="small" color={COLORS.brand500} style={{ marginLeft: 'auto' }} />}
            </View>
          );
        })}
      </View>

      {/* Cancel */}
      <TouchableOpacity style={sty.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
        <Ionicons name="close-circle-outline" size={18} color={COLORS.slate500} />
        <Text style={sty.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message, onRetry, onDismiss }) {
  return (
    <View style={sty.errorBanner}>
      <Ionicons name="alert-circle" size={20} color={COLORS.red600} />
      <Text style={sty.errorText}>{message}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} style={sty.retryBtnSmall}>
            <Text style={sty.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDismiss}>
          <Ionicons name="close" size={18} color={COLORS.red400} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Image tips ───────────────────────────────────────────────────────────────
const TIPS = [
  { icon: 'bulb-outline',          text: 'Good lighting — avoid shadows and glare' },
  { icon: 'scan-outline',          text: 'Keep prescription flat and fully visible' },
  { icon: 'text-outline',          text: 'Ensure text is sharp and readable' },
  { icon: 'phone-portrait-outline',text: 'Hold camera steady for sharp focus' },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ScanScreen({ navigation }) {
  const [step,   setStep]   = useState(0); // 0=capture 1=processing
  const [image,  setImage]  = useState(null);
  const [stage,  setStage]  = useState(0);
  const [error,  setError]  = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const cancelRef = useRef(false);
  const { setJob, setExtraction, updateStatus, clearJob } = useOCRStore();

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    cancelRef.current = true; // signal any in-flight poll to stop
    setStep(0); setImage(null); setStage(0); setError(null); setIsBusy(false);
  }, []);

  // ── Pick image ─────────────────────────────────────────────────────────────
  async function pickImage(source) {
    setError(null);
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is needed to scan prescriptions.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Gallery access is needed to pick a prescription.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
        });
      }
      if (!result.canceled && result.assets?.[0]) {
        setImage(result.assets[0]);
      }
    } catch (err) {
      setError('Could not open camera or gallery. Please try again.');
    }
  }

  // ── Handle scan ────────────────────────────────────────────────────────────
  async function handleScan() {
    if (!image?.uri || isBusy) return;

    cancelRef.current = false;
    setIsBusy(true);
    setError(null);
    setStep(1);
    setStage(0);

    try {
      const result = await runFullScan(image.uri, {
        onStageChange: (s) => {
          if (!cancelRef.current) setStage(s);
        },
        onJobCreated: (jobId) => {
          console.log('[ScanScreen] Job created:', jobId);
          // Store job in ocrStore so OCRReviewScreen can access metadata
          setJob(jobId, [image.uri]);
          updateStatus('PENDING');
        },
      });

      if (cancelRef.current) return; // user cancelled

      console.log('[ScanScreen] PARSED MEDS:', JSON.stringify(result.medicines));
      console.log('[ScanScreen] Confidence:', result.confidence);

      // Populate the ocrStore — OCRReviewScreen reads from this
      setExtraction(result.confidence, result.medicines);
      updateStatus('COMPLETED');

      // Navigate to review
      navigation.navigate('OCRReview');

    } catch (err) {
      if (cancelRef.current) return; // cancelled — don't show error
      const msg = normalizeError(err);
      console.error('[ScanScreen] Scan failed:', msg);
      setError(msg);
      setStep(0);
      setIsBusy(false);
      // Mark job failed in store
      updateStatus('FAILED', msg);
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  function handleCancel() {
    Alert.alert('Cancel Scan', 'Stop the current analysis?', [
      { text: 'Keep Waiting', style: 'cancel' },
      {
        text: 'Cancel',
        style: 'destructive',
        onPress: () => {
          cancelRef.current = true;
          clearJob();
          reset();
        },
      },
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — PROCESSING
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <View style={S.screen}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <AppHeader title="Analyzing Prescription" subtitle="AI is reading your prescription" />
        <StepBar step={1} />
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 40 }}>
          <ProcessingCard stage={stage} onCancel={handleCancel} />
        </ScrollView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 0 — CAPTURE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <AppHeader title="Scan Prescription" subtitle="Upload a clear photo for best results" />
      <StepBar step={0} />

      <ScrollView
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error banner */}
        {error && (
          <ErrorBanner
            message={error}
            onRetry={image ? handleScan : null}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Image preview / upload zone */}
        <View style={[sty.uploadZone, image && sty.uploadZoneFilled]}>
          {image ? (
            <>
              <Image source={{ uri: image.uri }} style={sty.previewImage} resizeMode="cover" />
              {/* Corner brackets */}
              <View style={sty.cornerTL} /><View style={sty.cornerTR} />
              <View style={sty.cornerBL} /><View style={sty.cornerBR} />
              <TouchableOpacity style={sty.removeImageBtn} onPress={() => setImage(null)}>
                <Ionicons name="trash-outline" size={14} color={COLORS.red600} />
                <Text style={sty.removeImageText}>Remove</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={sty.emptyZone}>
              <View style={sty.emptyIcon}>
                <Ionicons name="document-text" size={44} color={COLORS.brand500} />
              </View>
              <Text style={sty.emptyTitle}>Upload Prescription</Text>
              <Text style={sty.emptyDesc}>Take a clear photo or pick from your gallery</Text>
            </View>
          )}
        </View>

        {/* Pick source buttons */}
        <View style={sty.pickRow}>
          <TouchableOpacity
            style={sty.pickBtn}
            onPress={() => pickImage('camera')}
            activeOpacity={0.8}
          >
            <View style={[sty.pickIconWrap, { backgroundColor: COLORS.brand50 }]}>
              <Ionicons name="camera" size={28} color={COLORS.brand600} />
            </View>
            <Text style={sty.pickLabel}>Camera</Text>
            <Text style={sty.pickSublabel}>Take a new photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={sty.pickBtn}
            onPress={() => pickImage('gallery')}
            activeOpacity={0.8}
          >
            <View style={[sty.pickIconWrap, { backgroundColor: COLORS.slate50 }]}>
              <Ionicons name="images" size={28} color={COLORS.slate600} />
            </View>
            <Text style={sty.pickLabel}>Gallery</Text>
            <Text style={sty.pickSublabel}>Pick existing photo</Text>
          </TouchableOpacity>
        </View>

        {/* Analyze button */}
        {image && (
          <TouchableOpacity
            style={[S.btnPrimary, isBusy && { opacity: 0.6 }]}
            onPress={handleScan}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {isBusy
              ? <><ActivityIndicator size="small" color={COLORS.white} /><Text style={[S.btnPrimaryText, { marginLeft: 8 }]}>Uploading…</Text></>
              : <><Ionicons name="sparkles" size={18} color={COLORS.white} /><Text style={S.btnPrimaryText}>Analyze with AI</Text></>
            }
          </TouchableOpacity>
        )}

        {/* Tips card */}
        <View style={sty.tipsCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md }}>
            <Ionicons name="bulb" size={18} color={COLORS.amber600} />
            <Text style={sty.tipsTitle}>Tips for Best Results</Text>
          </View>
          {TIPS.map((tip, i) => (
            <View key={i} style={sty.tipRow}>
              <Ionicons name={tip.icon} size={15} color={COLORS.slate400} />
              <Text style={sty.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  stepBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepItem:      { alignItems: 'center', gap: 4 },
  stepCircle:    { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: COLORS.slate300, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  stepDone:      { backgroundColor: COLORS.brand600, borderColor: COLORS.brand600 },
  stepActive:    { backgroundColor: COLORS.brand600, borderColor: COLORS.brand600 },
  stepNum:       { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate400 },
  stepLabel:     { fontSize: 10, color: COLORS.slate500 },
  stepLabelActive:{ color: COLORS.brand600, fontWeight: FONTS.bold, fontSize: 10 },
  stepLine:      { flex: 1, height: 2, backgroundColor: COLORS.slate200, marginHorizontal: 4, marginBottom: 18 },

  errorBanner:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.red200, gap: 8 },
  errorText:     { flex: 1, color: COLORS.red700, fontSize: FONTS.sm, lineHeight: 18 },
  retryBtnSmall: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.red100, borderRadius: RADIUS.sm },
  retryBtnText:  { fontSize: FONTS.xs, color: COLORS.red700, fontWeight: FONTS.bold },

  uploadZone:       { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, borderWidth: 2, borderColor: COLORS.brand200, borderStyle: 'dashed', minHeight: 220, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, overflow: 'hidden' },
  uploadZoneFilled: { borderStyle: 'solid', borderColor: COLORS.border, borderWidth: 1, padding: 0 },
  previewImage:     { width: '100%', height: 260 },
  cornerTL: { position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderColor: COLORS.brand500 },
  cornerTR: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: COLORS.brand500 },
  cornerBL: { position: 'absolute', bottom: 44, left: 10, width: 22, height: 22, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderColor: COLORS.brand500 },
  cornerBR: { position: 'absolute', bottom: 44, right: 10, width: 22, height: 22, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderColor: COLORS.brand500 },
  removeImageBtn:  { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: COLORS.red50, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.red200 },
  removeImageText: { color: COLORS.red600, fontSize: FONTS.xs, fontWeight: FONTS.bold },

  emptyZone:  { alignItems: 'center', gap: 10, padding: SPACING.xl },
  emptyIcon:  { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  emptyDesc:  { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center', maxWidth: 220 },

  pickRow:       { flexDirection: 'row', gap: 12, marginBottom: SPACING.lg },
  pickBtn:       { flex: 1, alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  pickIconWrap:  { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  pickLabel:     { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  pickSublabel:  { fontSize: FONTS.xs, color: COLORS.slate400 },

  processingWrap:     { alignItems: 'center', gap: 12, paddingTop: 8 },
  scanRing:           { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  processingTitle:    { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800, marginTop: 8 },
  processingSubtitle: { fontSize: FONTS.sm, color: COLORS.slate500 },
  stageRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.slate50 },
  stageActive: { backgroundColor: COLORS.brand50, borderWidth: 1, borderColor: COLORS.brand200 },
  stageLabel:  { fontSize: FONTS.sm, color: COLORS.slate500, flex: 1 },
  cancelBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xl, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.slate100, borderRadius: RADIUS.full },
  cancelText:  { fontSize: FONTS.sm, color: COLORS.slate600, fontWeight: FONTS.medium },

  tipsCard:    { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  tipsTitle:   { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate700 },
  tipRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  tipText:     { fontSize: FONTS.sm, color: COLORS.slate600, flex: 1 },
});

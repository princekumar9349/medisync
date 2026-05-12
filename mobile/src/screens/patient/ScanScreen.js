/**
 * screens/patient/ScanScreen.js — Premium multi-step prescription scanner
 * Step 1: Capture → Step 2: Processing → Step 3: Review extracted medicines
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, StatusBar, Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/AppHeader';
import { apiScan } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';


const STEPS = ['Capture', 'Analyzing', 'Review'];

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ step }) {
  return (
    <View style={styles.stepBar}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, i < step && styles.stepDone, i === step && styles.stepActive]}>
              {i < step
                ? <Ionicons name="checkmark" size={14} color={COLORS.white} />
                : <Text style={[styles.stepNum, i === step && { color: COLORS.white }]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, i === step && { color: COLORS.brand600, fontWeight: FONTS.bold }]}>{label}</Text>
          </View>
          {i < STEPS.length - 1 && <View style={[styles.stepLine, i < step && { backgroundColor: COLORS.brand500 }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Animated progress stages ─────────────────────────────────────────────────
const STAGES = [
  { label: 'Uploading image…',    icon: 'cloud-upload-outline' },
  { label: 'Reading text (OCR)…', icon: 'text-outline' },
  { label: 'Extracting medicines…', icon: 'medkit-outline' },
  { label: 'Building schedule…',  icon: 'calendar-outline' },
];

function ProcessingView({ stage }) {
  const spin = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, useNativeDriver: true })).start();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.processingWrap}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <View style={styles.scanRing}>
          <Ionicons name="scan-circle" size={60} color={COLORS.brand500} />
        </View>
      </Animated.View>
      <Text style={styles.processingTitle}>AI Analysis in Progress</Text>
      <View style={{ width: '100%', gap: 8, marginTop: 24 }}>
        {STAGES.map((s, i) => (
          <View key={i} style={[styles.stageRow, i === stage && styles.stageActive]}>
            <Ionicons name={s.icon} size={16} color={i < stage ? COLORS.emerald600 : i === stage ? COLORS.brand600 : COLORS.slate300} />
            <Text style={[styles.stageLabel, i < stage && { color: COLORS.emerald600, textDecorationLine: 'line-through' }, i === stage && { color: COLORS.brand600, fontWeight: FONTS.bold }]}>
              {s.label}
            </Text>
            {i < stage && <Ionicons name="checkmark-circle" size={16} color={COLORS.emerald500} style={{ marginLeft: 'auto' }} />}
            {i === stage && <ActivityIndicator size="small" color={COLORS.brand500} style={{ marginLeft: 'auto' }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Medicine review card ─────────────────────────────────────────────────────
function MedReviewCard({ med, index, onRemove }) {
  const conf = med.confidence || 0;
  const confColor = conf >= 0.8 ? COLORS.emerald600 : conf >= 0.5 ? COLORS.amber600 : COLORS.red500;
  const confBg    = conf >= 0.8 ? COLORS.emerald50  : conf >= 0.5 ? COLORS.amber50  : COLORS.red50;
  const slots = [med.morning && 'Morning', med.afternoon && 'Afternoon', med.night && 'Night'].filter(Boolean);

  return (
    <View style={styles.medCard}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={styles.medIcon}><Ionicons name="medkit" size={20} color={COLORS.brand600} /></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.medName}>{med.name || 'Unknown Medicine'}</Text>
          {med.dosage ? <Text style={styles.medDosage}>{med.dosage}</Text> : null}
          {slots.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {slots.map(s => (
                <View key={s} style={styles.timePill}><Text style={styles.timePillText}>{s}</Text></View>
              ))}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={[styles.confBadge, { backgroundColor: confBg }]}>
            <Text style={[styles.confText, { color: confColor }]}>
              {conf > 0 ? `${Math.round(conf * 100)}%` : '?'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => onRemove(index)} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={16} color={COLORS.red500} />
          </TouchableOpacity>
        </View>
      </View>
      {conf < 0.5 && (
        <View style={styles.lowConfWarn}>
          <Ionicons name="warning-outline" size={13} color={COLORS.amber600} />
          <Text style={styles.lowConfText}>Low confidence — please verify this medicine</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ScanScreen({ navigation, route }) {
  const [step,    setStep]    = useState(0); // 0=capture 1=processing 2=review
  const [image,   setImage]   = useState(null);
  const [result,  setResult]  = useState(null);
  const [meds,    setMeds]    = useState([]);
  const [stage,   setStage]   = useState(0);
  const [error,   setError]   = useState(null);
  const stageTimer = useRef(null);

  function reset() { setStep(0); setImage(null); setResult(null); setMeds([]); setError(null); setStage(0); }

  async function pickImage(source) {
    setError(null);
    try {
      let res;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera access is required.'); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.88 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Gallery access is required.'); return; }
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.88 });
      }
      if (!res.canceled && res.assets?.[0]) setImage(res.assets[0]);
    } catch { setError('Could not access camera/gallery.'); }
  }

  async function handleScan() {
    if (!image) return;
    setStep(1); setError(null); setStage(0);

    // Animate through stages
    let s = 0;
    stageTimer.current = setInterval(() => {
      s = Math.min(s + 1, STAGES.length - 1);
      setStage(s);
    }, 1200);

    try {
      const data = await apiScan(image.uri, image.mimeType || 'image/jpeg', image.fileName || 'prescription.jpg');
      clearInterval(stageTimer.current);
      setStage(STAGES.length);
      setResult(data);
      setMeds(data.medicines || []);
      setStep(2);
    } catch (err) {
      clearInterval(stageTimer.current);
      setError(err.message || 'Scan failed. Please try again with a clearer image.');
      setStep(0);
    }
  }

  function removeMed(idx) {
    Alert.alert('Remove Medicine', 'Remove this medicine from the results?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setMeds(prev => prev.filter((_, i) => i !== idx)) },
    ]);
  }

  function confirmAndSave() {
    if (meds.length === 0) { Alert.alert('No Medicines', 'Please keep at least one medicine before saving.'); return; }
    navigation.navigate('Results', { result: { ...result, medicines: meds } });
  }

  // ── STEP 0: Capture ───────────────────────────────────────────────────────
  if (step === 0) return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <AppHeader title="Scan Prescription" subtitle="AI-powered medicine detection" />
      <StepBar step={0} />

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={COLORS.red600} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}><Ionicons name="close" size={18} color={COLORS.red400} /></TouchableOpacity>
          </View>
        )}

        {/* Preview or upload zone */}
        <View style={[styles.uploadCard, image && styles.uploadCardFilled]}>
          {image ? (
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Image source={{ uri: image.uri }} style={styles.previewImg} resizeMode="cover" />
              <View style={styles.scanOverlay}>
                <View style={styles.cornerTL} /><View style={styles.cornerTR} />
                <View style={styles.cornerBL} /><View style={styles.cornerBR} />
              </View>
              <TouchableOpacity style={styles.removeImgBtn} onPress={() => setImage(null)}>
                <Ionicons name="trash-outline" size={15} color={COLORS.red600} style={{ marginRight: 5 }} />
                <Text style={{ color: COLORS.red600, fontSize: FONTS.sm, fontWeight: FONTS.bold }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyUpload}>
              <View style={styles.uploadIcon}><Ionicons name="document-text" size={40} color={COLORS.brand500} /></View>
              <Text style={styles.uploadTitle}>Upload Prescription</Text>
              <Text style={styles.uploadDesc}>Take a clear photo or pick from gallery</Text>
            </View>
          )}
        </View>

        {/* Pick buttons */}
        <View style={styles.pickRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('camera')} activeOpacity={0.8}>
            <View style={[styles.pickIcon, { backgroundColor: COLORS.brand50 }]}><Ionicons name="camera" size={26} color={COLORS.brand600} /></View>
            <Text style={styles.pickLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('gallery')} activeOpacity={0.8}>
            <View style={[styles.pickIcon, { backgroundColor: COLORS.slate50 }]}><Ionicons name="image" size={26} color={COLORS.slate600} /></View>
            <Text style={styles.pickLabel}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <TouchableOpacity style={S.btnPrimary} onPress={handleScan} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={18} color={COLORS.white} />
            <Text style={S.btnPrimaryText}>Analyze Prescription</Text>
          </TouchableOpacity>
        )}

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={[S.sectionTitle, { marginBottom: SPACING.md }]}>Tips for Best Results</Text>
          {[
            { icon: 'bulb-outline',       text: 'Good lighting — avoid shadows and glare' },
            { icon: 'scan-outline',       text: 'Keep prescription flat and fully visible' },
            { icon: 'text-outline',       text: 'Ensure text is sharp and readable' },
            { icon: 'phone-portrait-outline', text: 'Hold camera steady for sharp focus' },
          ].map((tip, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
              <Ionicons name={tip.icon} size={16} color={COLORS.slate400} style={{ marginRight: 10 }} />
              <Text style={{ fontSize: FONTS.sm, color: COLORS.slate600 }}>{tip.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  // ── STEP 1: Processing ────────────────────────────────────────────────────
  if (step === 1) return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <AppHeader title="Analyzing…" subtitle="Please wait" />
      <StepBar step={1} />

      <View style={{ flex: 1, padding: SPACING.xl }}>
        <ProcessingView stage={stage} />
      </View>
    </View>
  );

  // ── STEP 2: Review ────────────────────────────────────────────────────────
  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <AppHeader
        title="Review Results"
        subtitle="Verify before saving"
        right={
          <View style={styles.successBadge}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.emerald600} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: FONTS.xs, fontWeight: 'bold', color: COLORS.emerald700 }}>OCR Done</Text>
          </View>
        }
      />
      <StepBar step={2} />

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Confidence */}
        {result?.confidence_score > 0 && (
          <View style={[styles.confHeader, { backgroundColor: result.confidence_score >= 0.7 ? COLORS.emerald50 : COLORS.amber50 }]}>
            <Ionicons name="scan-circle" size={16} color={result.confidence_score >= 0.7 ? COLORS.emerald600 : COLORS.amber600} />
            <Text style={{ fontSize: FONTS.sm, fontWeight: FONTS.bold, color: result.confidence_score >= 0.7 ? COLORS.emerald700 : COLORS.amber700, marginLeft: 6 }}>
              OCR Confidence: {Math.round(result.confidence_score * 100)}%
              {result.confidence_score < 0.7 ? ' — Some results may need review' : ' — High accuracy'}
            </Text>
          </View>
        )}

        {/* Condition */}
        {result?.possible_condition ? (
          <View style={styles.condCard}>
            <Text style={styles.condLabel}>Possible Condition</Text>
            <Text style={styles.condValue}>{result.possible_condition}</Text>
          </View>
        ) : null}

        {/* Medicines */}
        <Text style={[S.sectionTitle, { marginBottom: SPACING.sm }]}>
          Extracted Medicines ({meds.length})
        </Text>
        {meds.length === 0 ? (
          <View style={styles.noMeds}>
            <Ionicons name="information-circle-outline" size={24} color={COLORS.slate400} style={{ marginRight: 8 }} />
            <Text style={{ color: COLORS.slate500, fontSize: FONTS.base }}>No medicines detected.</Text>
          </View>
        ) : meds.map((med, i) => <MedReviewCard key={i} med={med} index={i} onRemove={removeMed} />)}

        {/* Doctor Advice */}
        {result?.doctor_advice ? (
          <View style={styles.adviceCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name="pulse" size={16} color={COLORS.brand600} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.brand700 }}>Doctor's Advice</Text>
            </View>
            <Text style={{ fontSize: FONTS.sm, color: COLORS.slate700, lineHeight: 22 }}>{result.doctor_advice}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={{ gap: 12, marginTop: SPACING.md }}>
          <TouchableOpacity style={S.btnPrimary} onPress={confirmAndSave} activeOpacity={0.85}>
            <Ionicons name="save-outline" size={18} color={COLORS.white} />
            <Text style={S.btnPrimaryText}>Save to Pillbox</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.btnSecondary} onPress={reset} activeOpacity={0.85}>
            <Ionicons name="camera-reverse-outline" size={18} color={COLORS.brand600} />
            <Text style={S.btnSecondaryText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stepBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: COLORS.slate300, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  stepDone:   { backgroundColor: COLORS.brand600, borderColor: COLORS.brand600 },
  stepActive: { backgroundColor: COLORS.brand600, borderColor: COLORS.brand600 },
  stepNum:    { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate400 },
  stepLabel:  { fontSize: 10, color: COLORS.slate500 },
  stepLine:   { flex: 1, height: 2, backgroundColor: COLORS.slate200, marginHorizontal: 4, marginBottom: 14 },

  errorBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.red200, gap: 8 },
  errorText:  { flex: 1, color: COLORS.red700, fontSize: FONTS.sm },

  uploadCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.brand200, borderStyle: 'dashed', padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg, minHeight: 200, justifyContent: 'center' },
  uploadCardFilled: { padding: SPACING.md, borderStyle: 'solid', borderColor: COLORS.border, borderWidth: 1 },
  previewImg:       { width: '100%', height: 240, borderRadius: RADIUS.md },
  scanOverlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 40 },
  cornerTL:         { position: 'absolute', top: 8,  left: 8,  width: 20, height: 20, borderTopWidth: 2,    borderLeftWidth: 2,   borderColor: COLORS.brand400 },
  cornerTR:         { position: 'absolute', top: 8,  right: 8, width: 20, height: 20, borderTopWidth: 2,    borderRightWidth: 2,  borderColor: COLORS.brand400 },
  cornerBL:         { position: 'absolute', bottom: 50, left: 8,  width: 20, height: 20, borderBottomWidth: 2, borderLeftWidth: 2,   borderColor: COLORS.brand400 },
  cornerBR:         { position: 'absolute', bottom: 50, right: 8, width: 20, height: 20, borderBottomWidth: 2, borderRightWidth: 2,  borderColor: COLORS.brand400 },
  removeImgBtn:     { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: COLORS.red50, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.red200 },

  emptyUpload:  { alignItems: 'center', gap: 10 },
  uploadIcon:   { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  uploadTitle:  { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  uploadDesc:   { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center' },

  pickRow:    { flexDirection: 'row', gap: 14, marginBottom: SPACING.lg },
  pickBtn:    { flex: 1, alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  pickIcon:   { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pickLabel:  { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700 },
  tipsCard:   { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },

  processingWrap:  { alignItems: 'center', gap: 16, paddingTop: 20 },
  scanRing:        { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  processingTitle: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  stageRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.slate50 },
  stageActive:     { backgroundColor: COLORS.brand50, borderWidth: 1, borderColor: COLORS.brand200 },
  stageLabel:      { fontSize: FONTS.sm, color: COLORS.slate500, flex: 1 },

  confHeader:  { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.md },
  condCard:    { backgroundColor: COLORS.brand600, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.lg },
  condLabel:   { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand200, textTransform: 'uppercase', letterSpacing: 1 },
  condValue:   { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.white, marginTop: 6 },
  medCard:     { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  medIcon:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  medName:     { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800, textTransform: 'capitalize' },
  medDosage:   { fontSize: FONTS.xs, color: COLORS.slate400, marginTop: 2 },
  timePill:    { backgroundColor: COLORS.brand50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  timePillText:{ fontSize: 10, fontWeight: FONTS.bold, color: COLORS.brand700 },
  confBadge:   { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  confText:    { fontSize: 10, fontWeight: FONTS.bold },
  removeBtn:   { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.red50, alignItems: 'center', justifyContent: 'center' },
  lowConfWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: COLORS.amber50, borderRadius: RADIUS.sm, padding: 8, borderWidth: 1, borderColor: '#FDE68A' },
  lowConfText: { fontSize: FONTS.xs, color: COLORS.amber700, flex: 1 },
  noMeds:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  adviceCard:  { backgroundColor: COLORS.brand50, borderWidth: 1, borderColor: COLORS.brand200, borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.lg },
  successBadge:{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.emerald50, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.emerald200 },
});

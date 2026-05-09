/**
 * screens/patient/ScanScreen.js — Prescription Scanner
 * Business Theme Overhaul
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';

import { apiScan } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

export default function ScanScreen({ navigation, route }) {
  const [image,   setImage]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const voiceOn  = route?.params?.voiceOn  ?? false;
  const language = route?.params?.language ?? 'EN';

  async function pickImage(source) {
    setError(null);
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera access is required.'); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Gallery access is required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      }
      if (!result.canceled && result.assets?.[0]) {
        setImage(result.assets[0]);
      }
    } catch (err) {
      setError('Could not access camera/gallery.');
    }
  }

  async function handleScan() {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const mime = image.mimeType || 'image/jpeg';
      const name = image.fileName || 'prescription.jpg';
      const data = await apiScan(image.uri, mime, name);

      if (voiceOn) {
        const meds = (data.medicines || []).map(m => `${m.name} ${m.dosage}`).join(', ');
        const txt = language === 'HI'
          ? `आपकी दवाएं हैं: ${meds || 'कोई नहीं'}`
          : `Your medicines are: ${meds || 'none found'}`;
        Speech.speak(txt, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 });
      }

      navigation.navigate('Results', { result: data });
    } catch (err) {
      setError(err.message || 'Scan failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* Header */}
      <View style={[S.headerBackground, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View>
          <Text style={S.headerTitle}>Scan Prescription</Text>
          <Text style={S.headerSubtitle}>AI-powered medicine detection</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: loading ? COLORS.amber400 : image ? COLORS.emerald400 : 'rgba(255,255,255,0.2)' }]}>
          <Text style={[styles.statusText, { color: loading ? COLORS.amber900 : image ? COLORS.emerald900 : COLORS.white }]}>
            {loading ? 'Scanning' : image ? 'Ready' : 'Idle'}
          </Text>
        </View>
      </View>

      <View style={S.overlapContainer}>
        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={24} color={COLORS.red600} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <Ionicons name="close" size={20} color={COLORS.red400} />
              </TouchableOpacity>
            </View>
          )}

          {/* Upload Area */}
          <View style={[styles.uploadCard, image ? styles.uploadCardFilled : null]}>
            {image ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: image.uri }} style={styles.previewImg} resizeMode="cover" />
                <TouchableOpacity style={styles.changeBtn} onPress={() => setImage(null)}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.red600} style={{ marginRight: 6 }} />
                  <Text style={styles.changeBtnText}>Remove Image</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyUpload}>
                <View style={styles.uploadIcon}>
                  <Ionicons name="document-text" size={48} color={COLORS.brand500} />
                </View>
                <Text style={styles.uploadTitle}>Upload Prescription</Text>
                <Text style={styles.uploadDesc}>Take a photo or pick from gallery</Text>
              </View>
            )}
          </View>

          {/* Pick Buttons */}
          <View style={styles.pickRow}>
            <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('camera')} activeOpacity={0.8}>
              <View style={[styles.pickIconWrap, { backgroundColor: COLORS.brand50 }]}>
                <Ionicons name="camera" size={28} color={COLORS.brand600} />
              </View>
              <Text style={styles.pickBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('gallery')} activeOpacity={0.8}>
              <View style={[styles.pickIconWrap, { backgroundColor: COLORS.slate50 }]}>
                <Ionicons name="image" size={28} color={COLORS.slate600} />
              </View>
              <Text style={styles.pickBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>

          {/* Scan Button */}
          {image && (
            <TouchableOpacity
              style={[S.btnPrimary, { opacity: loading ? 0.7 : 1, marginTop: SPACING.md }]}
              onPress={handleScan}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <>
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={S.btnPrimaryText}>Analyzing AI Data…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color={COLORS.white} />
                  <Text style={S.btnPrimaryText}>Analyze Prescription</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Tips */}
          <View style={styles.tips}>
            <Text style={S.sectionTitle}>Tips for best results</Text>
            {[
              { icon: 'bulb', text: 'Good lighting — avoid shadows' },
              { icon: 'scan-outline', text: 'Keep prescription flat & unfolded' },
              { icon: 'text', text: 'Make sure text is clearly visible' },
              { icon: 'phone-portrait', text: 'Hold camera steady' },
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name={tip.icon} size={18} color={COLORS.slate400} style={{ marginRight: 12 }} />
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  statusText:  { fontSize: FONTS.xs, fontWeight: FONTS.bold },

  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  errorText: { flex: 1, color: COLORS.red700, fontSize: FONTS.sm, paddingHorizontal: 8 },

  uploadCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.xl, borderWidth: 2,
    borderColor: COLORS.brand200, borderStyle: 'dashed',
    padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg,
    minHeight: 220, justifyContent: 'center',
  },
  uploadCardFilled: { padding: SPACING.md, borderStyle: 'solid', borderColor: COLORS.slate100, ...SHADOW.sm },
  emptyUpload: { alignItems: 'center', gap: 12 },
  uploadIcon:  { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  uploadDesc:  { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center' },

  previewWrap: { width: '100%', alignItems: 'center' },
  previewImg:  { width: '100%', height: 260, borderRadius: RADIUS.lg },
  changeBtn:   { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.red50, borderRadius: RADIUS.full },
  changeBtnText: { color: COLORS.red600, fontSize: FONTS.sm, fontWeight: FONTS.bold },

  pickRow:     { flexDirection: 'row', gap: 16, marginBottom: SPACING.xl },
  pickBtn:     { flex: 1, alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, ...SHADOW.sm },
  pickIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  pickBtnText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700 },

  tips:    { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.xl, marginTop: SPACING.xl, ...SHADOW.sm },
  tipRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  tipText: { fontSize: FONTS.sm, color: COLORS.slate600 },
});

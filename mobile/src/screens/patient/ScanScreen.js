/**
 * screens/patient/ScanScreen.js — Prescription Scanner
 * Clean Medical Theme — Teal/White
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { apiScan } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

export default function ScanScreen({ navigation, route }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const voiceOn = route?.params?.voiceOn ?? false;
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
      if (!result.canceled && result.assets?.[0]) setImage(result.assets[0]);
    } catch { setError('Could not access camera/gallery.'); }
  }

  async function handleScan() {
    if (!image) return;
    setLoading(true); setError(null);
    try {
      const data = await apiScan(image.uri, image.mimeType || 'image/jpeg', image.fileName || 'prescription.jpg');
      if (voiceOn) {
        const meds = (data.medicines || []).map(m => `${m.name} ${m.dosage}`).join(', ');
        Speech.speak(language === 'HI' ? `आपकी दवाएं हैं: ${meds || 'कोई नहीं'}` : `Your medicines are: ${meds || 'none found'}`, { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 });
      }
      navigation.navigate('Results', { result: data });
    } catch (err) { setError(err.message || 'Scan failed.'); }
    finally { setLoading(false); }
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={[S.headerBar, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View><Text style={S.headerTitle}>Scan Prescription</Text><Text style={S.headerSubtitle}>AI-powered medicine detection</Text></View>
        <View style={[styles.statusBadge, { backgroundColor: loading ? COLORS.amber50 : image ? COLORS.emerald50 : COLORS.slate100, borderColor: loading ? COLORS.amber400 : image ? COLORS.emerald200 : COLORS.border }]}>
          <Text style={[styles.statusText, { color: loading ? COLORS.amber700 : image ? COLORS.emerald700 : COLORS.slate500 }]}>{loading ? 'Scanning' : image ? 'Ready' : 'Idle'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={22} color={COLORS.red600} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}><Ionicons name="close" size={18} color={COLORS.red400} /></TouchableOpacity>
          </View>
        )}

        <View style={[styles.uploadCard, image && styles.uploadCardFilled]}>
          {image ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: image.uri }} style={styles.previewImg} resizeMode="cover" />
              <TouchableOpacity style={styles.changeBtn} onPress={() => setImage(null)}>
                <Ionicons name="trash-outline" size={16} color={COLORS.red600} style={{ marginRight: 6 }} />
                <Text style={styles.changeBtnText}>Remove Image</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyUpload}>
              <View style={styles.uploadIcon}><Ionicons name="document-text" size={44} color={COLORS.brand500} /></View>
              <Text style={styles.uploadTitle}>Upload Prescription</Text>
              <Text style={styles.uploadDesc}>Take a photo or pick from gallery</Text>
            </View>
          )}
        </View>

        <View style={styles.pickRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('camera')} activeOpacity={0.8}>
            <View style={[styles.pickIconWrap, { backgroundColor: COLORS.brand50 }]}><Ionicons name="camera" size={26} color={COLORS.brand600} /></View>
            <Text style={styles.pickBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage('gallery')} activeOpacity={0.8}>
            <View style={[styles.pickIconWrap, { backgroundColor: COLORS.slate50 }]}><Ionicons name="image" size={26} color={COLORS.slate600} /></View>
            <Text style={styles.pickBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <TouchableOpacity style={[S.btnPrimary, { opacity: loading ? 0.7 : 1, marginTop: SPACING.sm }]} onPress={handleScan} disabled={loading} activeOpacity={0.85}>
            {loading ? (<><ActivityIndicator color={COLORS.white} /><Text style={S.btnPrimaryText}>Analyzing…</Text></>) : (<><Ionicons name="sparkles" size={18} color={COLORS.white} /><Text style={S.btnPrimaryText}>Analyze Prescription</Text></>)}
          </TouchableOpacity>
        )}

        <View style={styles.tips}>
          <Text style={S.sectionTitle}>Tips for best results</Text>
          {[{ icon: 'bulb', text: 'Good lighting — avoid shadows' }, { icon: 'scan-outline', text: 'Keep prescription flat & unfolded' }, { icon: 'text', text: 'Make sure text is clearly visible' }, { icon: 'phone-portrait', text: 'Hold camera steady' }].map((tip, i) => (
            <View key={i} style={styles.tipRow}><Ionicons name={tip.icon} size={16} color={COLORS.slate400} style={{ marginRight: 10 }} /><Text style={styles.tipText}>{tip.text}</Text></View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1 },
  statusText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.red200 },
  errorText: { flex: 1, color: COLORS.red700, fontSize: FONTS.sm, paddingHorizontal: 8 },
  uploadCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.brand200, borderStyle: 'dashed', padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg, minHeight: 200, justifyContent: 'center' },
  uploadCardFilled: { padding: SPACING.md, borderStyle: 'solid', borderColor: COLORS.border, borderWidth: 1 },
  emptyUpload: { alignItems: 'center', gap: 10 },
  uploadIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  uploadDesc: { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center' },
  previewWrap: { width: '100%', alignItems: 'center' },
  previewImg: { width: '100%', height: 240, borderRadius: RADIUS.md },
  changeBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: COLORS.red50, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.red200 },
  changeBtnText: { color: COLORS.red600, fontSize: FONTS.sm, fontWeight: FONTS.bold },
  pickRow: { flexDirection: 'row', gap: 14, marginBottom: SPACING.lg },
  pickBtn: { flex: 1, alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  pickIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pickBtnText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700 },
  tips: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  tipRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  tipText: { fontSize: FONTS.sm, color: COLORS.slate600 },
});

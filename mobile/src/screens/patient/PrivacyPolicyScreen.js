import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={COLORS.slate800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          At MediSync, your health data is private, secure, and always under your control. We designed this policy to be simple and easy to understand.
        </Text>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="medkit" size={20} color={COLORS.brand600} />
            <Text style={styles.sectionTitle}>Medication & Reminder Storage</Text>
          </View>
          <Text style={styles.sectionText}>
            Your medication schedule and adherence history are stored securely on our servers to ensure you can access them from any device. We also save this data locally on your phone so your reminders continue to work even when you are offline.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text" size={20} color={COLORS.brand600} />
            <Text style={styles.sectionTitle}>Prescription OCR & AI Processing</Text>
          </View>
          <Text style={styles.sectionText}>
            When you scan a handwritten prescription, the image is securely transmitted to our AI partners (Google Gemini) for text extraction. 
            {"\n\n"}
            • The image is analyzed to pull out medicine names and dosages.
            {"\n"}• The image is NOT used by our partners to train their AI models.
            {"\n"}• We store a secure copy of your prescription image so you can review it later alongside your schedule.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={20} color={COLORS.brand600} />
            <Text style={styles.sectionTitle}>Caregiver Access</Text>
          </View>
          <Text style={styles.sectionText}>
            If you enable Caregiver Access, your selected family members or caretakers will be able to see your adherence history and receive alerts if you miss critical medicines. You can revoke this access at any time using your Caretaker PIN.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications" size={20} color={COLORS.brand600} />
            <Text style={styles.sectionTitle}>Notifications & Analytics</Text>
          </View>
          <Text style={styles.sectionText}>
            We collect basic information about whether your reminders were delivered on time. This helps us detect if your phone is accidentally blocking medical alerts (like due to battery saving modes). We do not track your location or sell your data to advertisers.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.brand600} />
            <Text style={styles.sectionTitle}>Data Deletion</Text>
          </View>
          <Text style={styles.sectionText}>
            You own your data. You can export your complete medical history or permanently delete your account and all associated data at any time from the Data & Privacy settings screen.
          </Text>
        </View>
        
        <Text style={styles.footer}>Last updated: May 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: FONTS.bold, color: COLORS.slate800 },
  scroll: { padding: SPACING.lg, paddingBottom: 100 },
  intro: { fontSize: 15, color: COLORS.slate700, lineHeight: 22, marginBottom: SPACING.xl },
  
  section: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: FONTS.bold, color: COLORS.slate800 },
  sectionText: { fontSize: 14, color: COLORS.slate600, lineHeight: 22 },
  
  footer: { textAlign: 'center', color: COLORS.slate400, marginTop: SPACING.xl, fontSize: 12 }
});

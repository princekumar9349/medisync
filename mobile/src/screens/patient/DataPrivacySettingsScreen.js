import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiPost } from '../../services/api';

function ActionRow({ icon, label, description, accent, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconCircle, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, danger && { color: COLORS.red600 }]}>{label}</Text>
        {description && <Text style={styles.actionDesc}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
    </TouchableOpacity>
  );
}

export default function DataPrivacySettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    Alert.alert(
      'Export Data',
      'We will prepare a secure archive of your medical history, prescriptions, and adherence logs. This will be sent to your registered email address.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Request Export', 
          onPress: async () => {
            setExporting(true);
            try {
              // Stub for actual export endpoint
              await new Promise(r => setTimeout(r, 1500));
              Alert.alert('Export Requested', `Your data archive will be sent to ${user?.email || 'your email'} shortly.`);
            } catch (e) {
              Alert.alert('Error', 'Failed to request data export. Please try again later.');
            } finally {
              setExporting(false);
            }
          }
        }
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your medical history, prescriptions, and caregiver links will be securely erased from our servers.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Permanently Delete', 
          style: 'destructive',
          onPress: () => {
            Alert.alert('Contact Support', 'To permanently delete your account, please contact support@medisync.app or use the Chat feature to verify your identity.');
          }
        }
      ]
    );
  };

  return (
    <View style={S.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={COLORS.slate800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data & Privacy</Text>
        <View style={{ width: 40 }}>
          {exporting && <ActivityIndicator size="small" color={COLORS.brand500} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.introText}>
          Control your personal health data, manage permissions, and understand how MediSync protects your privacy.
        </Text>

        <Text style={S.sectionTitle}>Privacy Information</Text>
        <View style={S.card}>
          <ActionRow 
            icon="document-text-outline" 
            label="Privacy Policy" 
            description="Read how we handle your health data" 
            accent={COLORS.brand600} 
            onPress={() => navigation.navigate('PrivacyPolicy')} 
          />
        </View>

        <Text style={[S.sectionTitle, { marginTop: SPACING.lg }]}>Transparency & Controls</Text>
        <View style={S.card}>
          <ActionRow 
            icon="pulse-outline" 
            label="Notification Diagnostics" 
            description="See what data we collect to ensure delivery" 
            accent={COLORS.brand600} 
            onPress={() => navigation.navigate('NotificationDiagnostics')} 
          />
          <View style={S.divider} />
          <ActionRow 
            icon="people-outline" 
            label="Caregiver Access" 
            description="Manage who can see your health data" 
            accent="#D97706" 
            onPress={() => navigation.navigate('CaretakerSettings')} 
          />
        </View>

        <Text style={[S.sectionTitle, { marginTop: SPACING.lg }]}>Your Data</Text>
        <View style={S.card}>
          <ActionRow 
            icon="download-outline" 
            label="Export My Data" 
            description="Get a copy of your medical history" 
            accent={COLORS.brand600} 
            onPress={handleExport} 
          />
          <View style={S.divider} />
          <ActionRow 
            icon="trash-outline" 
            label="Delete Account" 
            description="Permanently erase all your data" 
            accent={COLORS.red600} 
            danger={true}
            onPress={handleDelete} 
          />
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.border },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: FONTS.bold, color: COLORS.slate800 },
  scroll: { padding: SPACING.lg, paddingBottom: 100 },
  introText: { fontSize: 14, color: COLORS.slate600, marginBottom: SPACING.lg, lineHeight: 20 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  actionDesc: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
});

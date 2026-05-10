/**
 * screens/patient/CallingSettingsScreen.js — AI Auto-Calling & Caregiver Preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, TextInput, StatusBar, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiUpdateCallingPreferences, apiUpdateCaregiver, apiSendOtp, apiVerifyOtp, apiGetMe } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';

export default function CallingSettingsScreen() {
  const navigation = useNavigation();
  const { user, login } = useAuth();
  
  // Phone Verification State
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '');
  const [isPhoneVerified, setIsPhoneVerified] = useState(user?.phone_verified || false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Caregiver State
  const [caregiverName, setCaregiverName] = useState(user?.caregiver_name || '');
  const [caregiverPhone, setCaregiverPhone] = useState(user?.caregiver_phone || '');
  const [caregiverRelation, setCaregiverRelation] = useState(user?.caregiver_relation || '');
  
  // Calling Preferences State
  const initialPrefs = user?.calling_preferences || {};
  const [enableAutoCalling, setEnableAutoCalling] = useState(initialPrefs.enable_auto_calling || false);
  const [language, setLanguage] = useState(initialPrefs.language || 'en');
  const [voiceType, setVoiceType] = useState(initialPrefs.voice_type || 'female');
  const [criticalOnly, setCriticalOnly] = useState(initialPrefs.critical_only || false);
  const [caregiverEscalation, setCaregiverEscalation] = useState(initialPrefs.caregiver_escalation !== false); // default true
  
  const [loading, setLoading] = useState(false);

  // --- Handlers ---
  
  async function handleSendOtp() {
    if (!phoneNumber || phoneNumber.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid phone number.');
      return;
    }
    setOtpLoading(true);
    try {
      await apiSendOtp(phoneNumber);
      setShowOtpModal(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit code.');
      return;
    }
    setOtpLoading(true);
    try {
      await apiVerifyOtp(phoneNumber, otpCode);
      setIsPhoneVerified(true);
      setShowOtpModal(false);
      Alert.alert('Success', 'Phone number verified successfully.');
      
      // Refresh user context
      const updatedUser = await apiGetMe();
      login(updatedUser);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleSaveSettings() {
    setLoading(true);
    try {
      // 1. Update Calling Prefs
      await apiUpdateCallingPreferences({
        enable_auto_calling: enableAutoCalling,
        language,
        voice_type: voiceType,
        critical_only: criticalOnly,
        caregiver_escalation: caregiverEscalation
      });
      
      // 2. Update Caregiver
      if (caregiverName || caregiverPhone) {
        await apiUpdateCaregiver({
          caregiver_name: caregiverName,
          caregiver_phone: caregiverPhone,
          caregiver_relation: caregiverRelation
        });
      }
      
      // Refresh user
      const updatedUser = await apiGetMe();
      login(updatedUser);
      
      Alert.alert('Saved', 'Your settings have been updated.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleAutoCalling(val) {
    if (val && !isPhoneVerified) {
      Alert.alert('Verification Required', 'Please verify your phone number first to enable AI Auto-Calling.');
      return;
    }
    setEnableAutoCalling(val);
  }

  // --- Sub-components ---
  
  const SegmentedControl = ({ options, selected, onSelect }) => (
    <View style={styles.segmentContainer}>
      {options.map((opt) => (
        <TouchableOpacity 
          key={opt.value}
          style={[styles.segmentBtn, selected === opt.value && styles.segmentBtnActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[styles.segmentText, selected === opt.value && styles.segmentTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView style={S.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      
      {/* Header */}
      <View style={[S.headerBar, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.slate800} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>Calling & Caregiver</Text>
          <Text style={S.headerSubtitle}>AI Reminders & Safety</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Phone Verification Section */}
        <View style={styles.section}>
          <Text style={S.sectionTitle}>Your Phone Number</Text>
          <Text style={styles.sectionDesc}>Required for automated reminder calls.</Text>
          
          <View style={[S.card, styles.phoneCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="call-outline" size={20} color={COLORS.slate500} style={{ marginRight: 10 }} />
              <TextInput 
                style={styles.phoneInput} 
                placeholder="+91 9876543210"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                editable={!isPhoneVerified}
              />
              {isPhoneVerified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.brand600} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.verifyBtn} 
                  onPress={handleSendOtp}
                  disabled={otpLoading}
                >
                  <Text style={styles.verifyBtnText}>{otpLoading ? '...' : 'Verify'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {isPhoneVerified && (
              <TouchableOpacity onPress={() => setIsPhoneVerified(false)} style={{ marginTop: 8 }}>
                <Text style={{ color: COLORS.slate500, fontSize: FONTS.xs, textAlign: 'right' }}>Change Number</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* AI Calling Preferences */}
        <View style={styles.section}>
          <Text style={S.sectionTitle}>AI Reminder Calls</Text>
          <View style={S.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Enable AI Auto-Calling</Text>
                <Text style={styles.toggleDesc}>Receive automated calls if you miss a dose by 1 hour.</Text>
              </View>
              <Switch 
                value={enableAutoCalling} 
                onValueChange={toggleAutoCalling} 
                trackColor={{ false: COLORS.slate200, true: COLORS.brand400 }} 
                thumbColor={enableAutoCalling ? COLORS.brand600 : COLORS.white} 
              />
            </View>
            
            {enableAutoCalling && (
              <View style={styles.nestedSettings}>
                <View style={S.divider} />
                
                <Text style={styles.settingLabel}>Language</Text>
                <SegmentedControl 
                  options={[{ label: 'English', value: 'en' }, { label: 'Hindi', value: 'hi' }]}
                  selected={language}
                  onSelect={setLanguage}
                />
                
                <Text style={[styles.settingLabel, { marginTop: 16 }]}>Voice Type</Text>
                <SegmentedControl 
                  options={[{ label: 'Female', value: 'female' }, { label: 'Male', value: 'male' }]}
                  selected={voiceType}
                  onSelect={setVoiceType}
                />
                
                <View style={[styles.toggleRow, { marginTop: 16, paddingVertical: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>Critical Medicines Only</Text>
                  </View>
                  <Switch 
                    value={criticalOnly} 
                    onValueChange={setCriticalOnly} 
                    trackColor={{ false: COLORS.slate200, true: COLORS.brand400 }} 
                    thumbColor={criticalOnly ? COLORS.brand600 : COLORS.white} 
                  />
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Caregiver Escalation */}
        <View style={styles.section}>
          <Text style={S.sectionTitle}>Caregiver Escalation</Text>
          <Text style={styles.sectionDesc}>Notify a family member if you repeatedly miss medicines.</Text>
          
          <View style={S.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Enable Escalation</Text>
              </View>
              <Switch 
                value={caregiverEscalation} 
                onValueChange={setCaregiverEscalation} 
                trackColor={{ false: COLORS.slate200, true: COLORS.brand400 }} 
                thumbColor={caregiverEscalation ? COLORS.brand600 : COLORS.white} 
              />
            </View>
            
            {caregiverEscalation && (
              <View style={{ marginTop: 12 }}>
                <TextInput style={styles.input} placeholder="Caregiver Name" value={caregiverName} onChangeText={setCaregiverName} />
                <TextInput style={styles.input} placeholder="Caregiver Phone" value={caregiverPhone} onChangeText={setCaregiverPhone} keyboardType="phone-pad" />
                <TextInput style={styles.input} placeholder="Relationship (e.g. Son)" value={caregiverRelation} onChangeText={setCaregiverRelation} />
              </View>
            )}
          </View>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Footer / Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings} disabled={loading}>
          <Text style={styles.saveBtnText}>{loading ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </View>

      {/* OTP Modal */}
      <Modal visible={showOtpModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Verify Phone</Text>
            <Text style={styles.modalDesc}>Enter the 6-digit code sent to {phoneNumber}</Text>
            
            <TextInput 
              style={styles.otpInput} 
              placeholder="000000" 
              keyboardType="number-pad" 
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus
            />
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity style={styles.modalBtnSec} onPress={() => setShowOtpModal(false)}>
                <Text style={styles.modalBtnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPri} onPress={handleVerifyOtp} disabled={otpLoading}>
                <Text style={styles.modalBtnPriText}>{otpLoading ? '...' : 'Verify'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: SPACING.xl },
  sectionDesc: { fontSize: FONTS.sm, color: COLORS.slate500, marginBottom: 8 },
  phoneCard: { padding: 16 },
  phoneInput: { flex: 1, fontSize: 16, color: COLORS.slate800, paddingVertical: 4 },
  verifyBtn: { backgroundColor: COLORS.brand100, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.sm },
  verifyBtnText: { color: COLORS.brand700, fontWeight: FONTS.bold, fontSize: FONTS.sm },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.brand50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full },
  verifiedText: { color: COLORS.brand700, fontWeight: FONTS.bold, fontSize: FONTS.xs, marginLeft: 4 },
  
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  toggleLabel: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  toggleDesc: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  nestedSettings: { marginTop: 8 },
  settingLabel: { fontSize: FONTS.sm, fontWeight: FONTS.semibold, color: COLORS.slate700, marginBottom: 6 },
  
  segmentContainer: { flexDirection: 'row', backgroundColor: COLORS.slate100, borderRadius: RADIUS.md, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm },
  segmentBtnActive: { backgroundColor: COLORS.white, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  segmentText: { fontSize: FONTS.sm, color: COLORS.slate500, fontWeight: FONTS.medium },
  segmentTextActive: { color: COLORS.slate800, fontWeight: FONTS.bold },
  
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, backgroundColor: COLORS.slate50, color: COLORS.slate800, marginBottom: 12 },
  
  footer: { padding: SPACING.lg, backgroundColor: COLORS.white, borderTopWidth: 1, borderColor: COLORS.slate100 },
  saveBtn: { backgroundColor: COLORS.brand600, paddingVertical: 16, borderRadius: RADIUS.full, alignItems: 'center' },
  saveBtnText: { color: COLORS.white, fontSize: 16, fontWeight: FONTS.bold },
  
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: FONTS.bold, color: COLORS.slate800, marginBottom: 8 },
  modalDesc: { fontSize: 14, color: COLORS.slate500, marginBottom: 20 },
  otpInput: { borderWidth: 2, borderColor: COLORS.brand200, borderRadius: RADIUS.md, padding: 16, fontSize: 24, textAlign: 'center', letterSpacing: 8, fontWeight: 'bold', color: COLORS.slate800 },
  modalBtnPri: { flex: 1, backgroundColor: COLORS.brand600, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  modalBtnPriText: { color: COLORS.white, fontWeight: FONTS.bold, fontSize: 16 },
  modalBtnSec: { flex: 1, backgroundColor: COLORS.slate100, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  modalBtnSecText: { color: COLORS.slate700, fontWeight: FONTS.bold, fontSize: 16 },
});

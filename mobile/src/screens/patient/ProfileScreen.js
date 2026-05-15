import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, StatusBar, Platform, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/AppHeader';
import { apiUpdateMe, apiVerifyCaretakerPin } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';
import NotificationService from '../../services/NotificationService';
import { useUIStore } from '../../store/uiStore';

const AUTH_KEYS = ['medisync_token', 'medisync_user', 'medisync_ui_role', 'medisync_caretaker_ctx'];

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({ icon, label, description, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconCircle}><Ionicons name={icon} size={18} color={COLORS.brand600} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange}
        trackColor={{ false: COLORS.slate200, true: COLORS.brand400 }}
        thumbColor={value ? COLORS.brand600 : COLORS.white}
        ios_backgroundColor={COLORS.slate200} />
    </View>
  );
}

// ─── Action Row ───────────────────────────────────────────────────────────────
function ActionRow({ icon, label, description, accent, onPress }) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconCircle, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionLabel}>{label}</Text>
        {description && <Text style={styles.actionDesc}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
    </TouchableOpacity>
  );
}

// ─── Profile Edit Modal ───────────────────────────────────────────────────────
function EditProfileModal({ visible, user, onClose, onSaved }) {
  const [name,   setName]   = useState(user?.name   || '');
  const [age,    setAge]    = useState(user?.age    ? String(user.age) : '');
  const [gender, setGender] = useState(user?.gender || '');
  const [weight, setWeight] = useState(user?.weight ? String(user.weight) : '');
  const [blood,  setBlood]  = useState(user?.blood_group || '');
  const [phone,  setPhone]  = useState(user?.phone  || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    setSaving(true);
    try {
      const payload = {};
      if (name.trim())   payload.name         = name.trim();
      if (age.trim())    payload.age          = parseInt(age, 10) || undefined;
      if (gender.trim()) payload.gender       = gender.trim();
      if (weight.trim()) payload.weight       = parseFloat(weight) || undefined;
      if (blood.trim())  payload.blood_group  = blood.trim();
      if (phone.trim())  payload.phone        = phone.trim();
      await apiUpdateMe(payload);
      Alert.alert('Saved!', 'Profile updated successfully.');
      onSaved(payload);
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save profile. Please try again.');
    } finally { setSaving(false); }
  }

  const GENDERS = ['Male', 'Female', 'Other'];
  const BLOODS  = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.screen}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.slate600} />
          </TouchableOpacity>
          <Text style={modal.title}>Edit Profile</Text>
          <TouchableOpacity onPress={save} style={[modal.saveBtn, { opacity: saving ? 0.5 : 1 }]} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <Text style={modal.saveTxt}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Name */}
          <Text style={modal.label}>Full Name *</Text>
          <TextInput style={S.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={COLORS.slate400} />

          {/* Phone */}
          <Text style={[modal.label, { marginTop: 14 }]}>Phone Number</Text>
          <TextInput style={S.input} value={phone} onChangeText={setPhone} placeholder="+91 9876543210" placeholderTextColor={COLORS.slate400} keyboardType="phone-pad" />

          {/* Age + Weight row */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={modal.label}>Age</Text>
              <TextInput style={S.input} value={age} onChangeText={setAge} placeholder="25" placeholderTextColor={COLORS.slate400} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modal.label}>Weight (kg)</Text>
              <TextInput style={S.input} value={weight} onChangeText={setWeight} placeholder="65" placeholderTextColor={COLORS.slate400} keyboardType="numeric" />
            </View>
          </View>

          {/* Gender */}
          <Text style={[modal.label, { marginTop: 14 }]}>Gender</Text>
          <View style={modal.chipRow}>
            {GENDERS.map(g => (
              <TouchableOpacity key={g} style={[modal.chip, gender === g && modal.chipActive]} onPress={() => setGender(g)} activeOpacity={0.75}>
                <Text style={[modal.chipTxt, gender === g && modal.chipTxtActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Blood Group */}
          <Text style={[modal.label, { marginTop: 14 }]}>Blood Group</Text>
          <View style={modal.chipRow}>
            {BLOODS.map(b => (
              <TouchableOpacity key={b} style={[modal.chip, blood === b && modal.chipActive]} onPress={() => setBlood(b)} activeOpacity={0.75}>
                <Text style={[modal.chipTxt, blood === b && modal.chipTxtActive]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [voiceOn,   setVoiceOn]   = useState(false);
  const [language,  setLanguage]  = useState('EN');
  const [editOpen,  setEditOpen]  = useState(false);
  const { isElderlyMode, setElderlyMode, isHighContrast, setHighContrast } = useUIStore();

  const [localUser, setLocalUser] = useState(user);
  const [cgModalOpen, setCgModalOpen] = useState(false);
  const [cgPin, setCgPin] = useState('');
  const [cgVerifying, setCgVerifying] = useState(false);

  // Merge saved payload back into local display state
  function handleSaved(payload) {
    setLocalUser(prev => ({ ...prev, ...payload }));
  }

  function testVoice() {
    if (!voiceOn) { Alert.alert('Voice Off', 'Enable voice output first.'); return; }
    Speech.speak(language === 'HI' ? 'नमस्ते! मेडिसिंक आपकी सेवा में है।' : 'Hello! Medisync is here to help you.', { language: language === 'HI' ? 'hi-IN' : 'en-IN', rate: 0.95 });
  }

  function handleLogout() {
    const doSignOut = () => {
      AsyncStorage.multiRemove(AUTH_KEYS)
        .catch(() => AUTH_KEYS.forEach(k => AsyncStorage.removeItem(k).catch(() => {})))
        .finally(() => {
          logout().catch(() => {});
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] })
          );
        });
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        doSignOut();
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
        ],
        { cancelable: true }
      );
    }
  }

  async function handleSwitchToCaregiver() {
    if (!cgPin.trim()) return;
    setCgVerifying(true);
    try {
      await apiVerifyCaretakerPin(display?.patient_id, cgPin);
      setCgModalOpen(false);
      setCgPin('');
      // Fast switch!
      login(localUser, 'caretaker');
    } catch (e) {
      Alert.alert('Access Denied', e.message || 'Incorrect PIN or Caretaker access disabled.');
    } finally {
      setCgVerifying(false);
    }
  }


  async function testImmediateNotification() {
    try { await NotificationService.testNotification(); }
    catch (e) { Alert.alert('Error', 'Failed to show notification: ' + e.message); }
  }

  async function scheduleReminder() {
    try {
      await NotificationService.scheduleMedicineReminder({ _id: 'test_1', name: 'Test Medicine', dosage: '1 pill' }, Date.now() + 5000);
      Alert.alert('Reminder Set!', 'Notification in 5 seconds.');
    } catch (e) { Alert.alert('Error', 'Failed to schedule: ' + e.message); }
  }

  async function checkBatteryOptimizations() {
    if (Platform.OS === 'android') await NotificationService.openBatterySettings();
    else Alert.alert('Android only', 'This setting is only available on Android.');
  }

  async function openPowerManager() {
    if (Platform.OS === 'android') await NotificationService.openPowerManagerSettings();
    else Alert.alert('Android only', 'This setting is only available on Android.');
  }

  const display = localUser || user || {};
  const initials = display?.name?.[0]?.toUpperCase() || 'U';

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <AppHeader title="Profile" subtitle="Account & settings" />

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

        {/* User Card */}
        <View style={[S.card, styles.userCard]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.userName}>{display?.name || 'User'}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{display?.email}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {display?.patient_id && (
                <View style={styles.idBadge}><Text style={styles.idText}>ID: {display.patient_id}</Text></View>
              )}
              {display?.blood_group && (
                <View style={[styles.idBadge, { backgroundColor: COLORS.red50, borderColor: COLORS.red200 }]}>
                  <Text style={[styles.idText, { color: COLORS.red700 }]}>{display.blood_group}</Text>
                </View>
              )}
              {display?.age && (
                <View style={styles.idBadge}><Text style={styles.idText}>{display.age} yrs</Text></View>
              )}
            </View>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditOpen(true)} activeOpacity={0.8}>
            <Ionicons name="pencil" size={16} color={COLORS.brand600} />
          </TouchableOpacity>
        </View>

        {/* Phone Verification Banner */}
        {!display?.phone_verified && (
          <TouchableOpacity
            style={styles.phoneBanner}
            onPress={() => navigation.navigate('PhoneVerify', { phone: display?.phone || '', fromProfile: true })}
            activeOpacity={0.85}
          >
            <View style={styles.phoneBannerIcon}>
              <Ionicons name="phone-portrait-outline" size={18} color="#0D9488" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.phoneBannerTitle}>Phone not verified</Text>
              <Text style={styles.phoneBannerSub}>Verify for emergency alerts & medicine reminders</Text>
            </View>
            <View style={styles.phoneBannerCta}>
              <Text style={styles.phoneBannerCtaText}>Verify Now</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Caregiver Switch */}
        <View style={S.card}>
          <ActionRow icon="shield-checkmark" label="Switch to Caregiver View" description="Requires Caregiver PIN" accent="#D97706" onPress={() => setCgModalOpen(true)} />
        </View>

        {/* General Settings */}
        <Text style={S.sectionTitle}>General Settings</Text>
        <View style={S.card}>
          <ToggleRow icon="text" label="Elderly Mode" description="Larger text and buttons" value={isElderlyMode} onValueChange={setElderlyMode} />
          <View style={S.divider} />
          <ToggleRow icon="contrast" label="High Contrast" description="Maximum readability" value={isHighContrast} onValueChange={setHighContrast} />
          <View style={S.divider} />
          <ToggleRow icon="volume-high" label="Voice Output" description="Speak scan results aloud" value={voiceOn}
            onValueChange={v => { setVoiceOn(v); if (v) Speech.speak('Voice enabled', { language: 'en-IN' }); }} />
          <View style={S.divider} />
          <ToggleRow icon="language" label={`Language: ${language === 'EN' ? 'English' : 'हिंदी'}`} description="Change interface language"
            value={language === 'HI'} onValueChange={v => setLanguage(v ? 'HI' : 'EN')} />
          <View style={S.divider} />
          <ActionRow icon="call-outline" label="Calling & Caregiver" description="AI reminders & safety escalation"
            accent={COLORS.brand600} onPress={() => navigation.navigate('CallingSettings')} />
          <View style={S.divider} />
          <ActionRow icon="heart" label="Caretaker Access" description="Manage PIN and family caretaker access"
            accent="#D97706" onPress={() => navigation.navigate('CaretakerSettings')} />
          <View style={S.divider} />
          <ActionRow icon="shield-checkmark" label="Data & Privacy" description="Export data, policies, and permissions"
            accent={COLORS.brand600} onPress={() => navigation.navigate('DataPrivacySettings')} />
        </View>


        {/* Tools */}
        <Text style={[S.sectionTitle, { marginTop: SPACING.md }]}>Presentation Tools</Text>
        <View style={S.card}>
          <ActionRow icon="play-circle" label="Demo Mode" description="Launch AI Voice Confirmation presentation" accent={COLORS.purple600} onPress={() => navigation.navigate('DemoScenario')} />
          <View style={S.divider} />
          <ActionRow icon="mic" label="Test Voice Assistant" description="Hear a sample greeting" accent={COLORS.brand600} onPress={testVoice} />
          <View style={S.divider} />
          <ActionRow icon="notifications" label="Immediate Test Alert" description="Trigger local notification now" accent={COLORS.amber600} onPress={testImmediateNotification} />
          <View style={S.divider} />
          <ActionRow icon="alarm" label="Schedule Test Reminder" description="Schedule a 5s test alert" accent={COLORS.amber600} onPress={scheduleReminder} />
        </View>

        {/* Android Device Settings */}
        <Text style={[S.sectionTitle, { marginTop: SPACING.md }]}>Device (Android)</Text>
        <View style={S.card}>
          <ActionRow icon="battery-charging" label="Battery Optimizations" description="Disable to fix notification delays" accent={COLORS.red500} onPress={checkBatteryOptimizations} />
          <View style={S.divider} />
          <ActionRow icon="settings-outline" label="Auto-Start / Power Manager" description="Fix for Realme/Xiaomi devices" accent={COLORS.red500} onPress={openPowerManager} />
          <View style={S.divider} />
          <ActionRow icon="pulse" label="Notification Diagnostics" description="Fix missing medicine reminders" accent={COLORS.emerald500} onPress={() => navigation.navigate('NotificationDiagnostics')} />
        </View>

        {/* About */}
        <Text style={[S.sectionTitle, { marginTop: SPACING.md }]}>About MediSync</Text>
        <View style={S.card}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Alert.alert('Email Support', 'support@medisync.health')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="mail-outline" size={18} color="#3B82F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Email Support</Text>
              <Text style={styles.actionDesc}>support@medisync.health</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
          </TouchableOpacity>
          <View style={S.divider} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Alert.alert('Helpline', '+91 800-MEDISYNC\nAvailable 9 AM – 9 PM')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="call-outline" size={18} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Helpline</Text>
              <Text style={styles.actionDesc}>Available 9 AM – 9 PM</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
          </TouchableOpacity>
          <View style={S.divider} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('PrivacyPolicy')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FFF7ED' }]}>
              <Ionicons name="document-text-outline" size={18} color="#EA580C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Privacy Policy</Text>
              <Text style={styles.actionDesc}>Terms & data usage</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.slate300} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.red500} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Modal */}
      <EditProfileModal
        visible={editOpen}
        user={display}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
      />

      {/* Caregiver PIN Modal */}
      <Modal visible={cgModalOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 20, width: '100%', maxWidth: 320 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 16, color: '#333' }}>Enter Caregiver PIN</Text>
            <TextInput
              style={[S.input, { textAlign: 'center', fontSize: 24, letterSpacing: 8 }]}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              value={cgPin}
              onChangeText={setCgPin}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10 }} onPress={() => setCgModalOpen(false)}>
                <Text style={{ fontWeight: '700', color: '#64748b' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#D97706', borderRadius: 10 }} onPress={handleSwitchToCaregiver}>
                {cgVerifying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: '700', color: '#fff' }}>Access</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>

  );
}

const styles = StyleSheet.create({
  userCard:     { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.lg },
  avatar:       { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.brand200 },
  avatarText:   { fontSize: 26, fontWeight: FONTS.bold, color: COLORS.brand700 },
  userName:     { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },
  userEmail:    { fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 2 },
  idBadge:      { backgroundColor: COLORS.slate100, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  idText:       { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate600 },
  editBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  iconCircle:   { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  toggleLabel:  { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  toggleDesc:   { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  actionLabel:  { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  actionDesc:   { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  logoutBtn:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.full, paddingVertical: 15, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.red200 },
  logoutText:       { color: COLORS.red600, fontSize: FONTS.base, fontWeight: FONTS.bold },
  // Phone verification banner
  phoneBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDFA', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#99F6E4', gap: 12 },
  phoneBannerIcon:  { width: 38, height: 38, borderRadius: 19, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  phoneBannerTitle: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: '#0F766E' },
  phoneBannerSub:   { fontSize: FONTS.xs, color: '#0D9488', marginTop: 1 },
  phoneBannerCta:   { backgroundColor: '#0D9488', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  phoneBannerCtaText:{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: '#fff' },
});

const modal = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: COLORS.bgLight },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, paddingHorizontal: SPACING.lg, paddingTop: Platform.OS === 'ios' ? 56 : 48, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:   { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  closeBtn:{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 18, paddingVertical: 8 },
  saveTxt: { color: COLORS.white, fontSize: FONTS.sm, fontWeight: FONTS.bold },
  label:   { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700, marginBottom: 6, marginLeft: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:    { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.white },
  chipActive:   { backgroundColor: COLORS.brand600, borderColor: COLORS.brand700 },
  chipTxt:      { fontSize: FONTS.sm, color: COLORS.slate600, fontWeight: FONTS.semibold },
  chipTxtActive:{ color: COLORS.white, fontWeight: FONTS.bold },
});

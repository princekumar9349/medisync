/**
 * screens/caretaker/CaretakerSettingsScreen.js
 * Premium Caretaker PIN Management — full healthcare-grade settings screen
 * Amber accent theme | Section-based layout
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Switch, ActivityIndicator, Platform, Share,
  Linking, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  apiGetCaretakerStatus,
  apiGenerateCaretakerPin,
  apiRevokeCaretakerAccess,
  apiToggleCaretakerAccess,
} from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

// ─── Design tokens ────────────────────────────────────────────────────────────
const AMBER       = '#D97706';
const AMBER_DARK  = '#B45309';
const AMBER_LIGHT = '#FEF3C7';
const AMBER_BG    = '#FFFBEB';
const PIN_HIDE_MS = 8000;

const RELATIONSHIPS = ['Father', 'Mother', 'Son', 'Daughter', 'Sibling', 'Spouse', 'Nurse', 'Relative', 'Other'];

// ─── Small helpers ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, color = AMBER }) {
  return (
    <View style={sh.sectionHeader}>
      <View style={[sh.sectionIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={sh.sectionTitle}>{title}</Text>
    </View>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <View style={sh.infoRow}>
      <Text style={sh.infoLabel}>{label}</Text>
      <Text style={[sh.infoValue, mono && sh.monoValue]}>{value || '—'}</Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 4 }} />;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CaretakerSettingsScreen() {
  const navigation = useNavigation();

  // Server state
  const [status,    setStatus]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  // One-time plain PIN after generation
  const [newPin,       setNewPin]       = useState(null);   // plain PIN shown once
  const [pinVisible,   setPinVisible]   = useState(false);
  const [pinPatientId, setPinPatientId] = useState(null);
  const pinTimerRef = useRef(null);

  // UI state
  const [accessEnabled, setAccessEnabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGetCaretakerStatus();
      setStatus(data);
      setAccessEnabled(data.access_enabled);
    } catch (e) {
      Alert.alert('Error', 'Could not load caretaker status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-hide PIN after PIN_HIDE_MS
  function startPinTimer() {
    if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    setPinVisible(true);
    pinTimerRef.current = setTimeout(() => setPinVisible(false), PIN_HIDE_MS);
  }

  useEffect(() => () => { if (pinTimerRef.current) clearTimeout(pinTimerRef.current); }, []);

  // ── Generate PIN ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (status?.has_caretaker_pin) {
      Alert.alert(
        'Regenerate PIN?',
        'This will immediately log out any active caretaker and invalidate the old PIN.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', style: 'destructive', onPress: doGenerate },
        ],
      );
    } else {
      doGenerate();
    }
  }

  async function doGenerate() {
    setSaving(true);
    try {
      const res = await apiGenerateCaretakerPin(status?.caretaker_name, status?.relationship);
      setNewPin(res.plain_pin);
      setPinPatientId(res.patient_id);
      startPinTimer();
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not generate PIN.');
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle access ────────────────────────────────────────────────────────
  async function handleToggle(val) {
    if (val && !status?.has_caretaker_pin) {
      Alert.alert('No PIN Set', 'Generate a PIN first, then enable access.');
      return;
    }
    setSaving(true);
    try {
      await apiToggleCaretakerAccess(val);
      setAccessEnabled(val);
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update access.');
    } finally { setSaving(false); }
  }

  // ── Revoke ───────────────────────────────────────────────────────────────
  function handleRevoke() {
    Alert.alert(
      'Revoke Caretaker Access?',
      'This permanently deletes the PIN and immediately logs out all caretaker sessions. You will need to generate a new PIN to restore access.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke Access', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await apiRevokeCaretakerAccess();
              setNewPin(null);
              await load();
              Alert.alert('Done', 'Caretaker access has been fully revoked.');
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not revoke access.');
            } finally { setSaving(false); }
          },
        },
      ],
    );
  }

  // ── Share ────────────────────────────────────────────────────────────────
  function buildShareMessage(pin) {
    const pid = pinPatientId || status?.patient_id || '';
    return (
      `🏥 MediSync Caretaker Access\n\n` +
      `Patient ID: ${pid}\n` +
      `Caretaker PIN: ${pin || '••••••'}\n\n` +
      `Steps:\n` +
      `1. Open MediSync app\n` +
      `2. Tap "Caretaker Login" on the login screen\n` +
      `3. Enter the Patient ID and PIN above\n\n` +
      `⚠️ Keep this PIN private. It grants read-only medicine schedule access.\n` +
      `This PIN expires or can be revoked by the patient at any time.`
    );
  }

  async function handleCopy() {
    if (!newPin) { Alert.alert('No PIN', 'Generate a PIN first to copy it.'); return; }
    try {
      await Share.share({ message: buildShareMessage(newPin) });
    } catch (e) {
      // user cancelled share — silent
    }
  }

  function handleWhatsApp() {
    if (!newPin) { Alert.alert('No PIN', 'Generate a PIN first to share it.'); return; }
    const msg = encodeURIComponent(buildShareMessage(newPin));
    Linking.openURL(`whatsapp://send?text=${msg}`).catch(() =>
      Alert.alert('WhatsApp not installed', 'Please share the PIN manually.'),
    );
  }

  function handleSMS() {
    if (!newPin) { Alert.alert('No PIN', 'Generate a PIN first to share it.'); return; }
    const msg = encodeURIComponent(buildShareMessage(newPin));
    const url = Platform.OS === 'ios' ? `sms:&body=${msg}` : `sms:?body=${msg}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open SMS app.'));
  }

  // ── Derived display values ────────────────────────────────────────────────
  const hasPin     = status?.has_caretaker_pin;
  const sessionCnt = status?.session_count ?? 0;
  const lastLogin  = status?.last_login
    ? new Date(status.last_login).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const patientId  = status?.patient_id || '—';

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={AMBER} />
        <Text style={s.loaderText}>Loading caretaker settings…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: AMBER_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={AMBER_BG} />

      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: AMBER }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Caretaker Access</Text>
            <Text style={s.headerSub}>PIN Management &amp; Sharing</Text>
          </View>
          <View style={[s.statusDot, { backgroundColor: accessEnabled && hasPin ? '#34D399' : '#9CA3AF' }]} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Status Card ── */}
        <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: accessEnabled && hasPin ? '#34D399' : '#9CA3AF' }]}>
          <SectionHeader icon="shield-checkmark" title="Access Status" color={accessEnabled && hasPin ? '#059669' : COLORS.slate400} />
          <InfoRow label="Patient ID" value={patientId} mono />
          {hasPin && <>
            <Divider />
            <InfoRow label="Caretaker Name" value={status?.caretaker_name} />
            <Divider />
            <InfoRow label="Relationship" value={status?.relationship} />
            <Divider />
            <InfoRow label="Sessions" value={`${sessionCnt} login${sessionCnt !== 1 ? 's' : ''}`} />
            {lastLogin && <>
              <Divider />
              <InfoRow label="Last Login" value={lastLogin} />
            </>}
          </>}

          {/* Enable / Disable toggle */}
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Caretaker Login Active</Text>
              <Text style={s.toggleSub}>
                {hasPin
                  ? accessEnabled ? 'Caretaker can log in with PIN' : 'Login temporarily blocked'
                  : 'Generate a PIN to enable'}
              </Text>
            </View>
            <Switch
              value={accessEnabled}
              onValueChange={handleToggle}
              disabled={saving || !hasPin}
              trackColor={{ false: COLORS.slate200, true: '#6EE7B7' }}
              thumbColor={accessEnabled ? '#059669' : COLORS.white}
            />
          </View>
        </View>

        {/* ── PIN Management ── */}
        <View style={s.card}>
          <SectionHeader icon="key" title="PIN Management" />

          {/* One-time PIN reveal */}
          {newPin ? (
            <View style={s.pinRevealBox}>
              <View style={s.pinRevealHeader}>
                <Ionicons name="lock-open" size={16} color={AMBER_DARK} />
                <Text style={s.pinRevealTitle}>New PIN Generated — Store Safely</Text>
              </View>
              <View style={s.pinRow}>
                <Text style={s.pinText}>
                  {pinVisible ? newPin : '●'.repeat(newPin.length)}
                </Text>
                <TouchableOpacity
                  onPress={() => { if (pinVisible) setPinVisible(false); else startPinTimer(); }}
                  style={s.eyeBtn}
                >
                  <Ionicons name={pinVisible ? 'eye-off' : 'eye'} size={20} color={AMBER_DARK} />
                </TouchableOpacity>
              </View>
              {pinVisible && (
                <Text style={s.pinAutoHide}>Auto-hides in 8 seconds</Text>
              )}
              <View style={s.pinHint}>
                <Ionicons name="warning-outline" size={14} color='#DC2626' />
                <Text style={s.pinHintText}>This PIN is shown only once and cannot be retrieved again.</Text>
              </View>
            </View>
          ) : (
            <View style={s.noPinBox}>
              <Ionicons name={hasPin ? 'lock-closed' : 'lock-open-outline'} size={28} color={hasPin ? AMBER : COLORS.slate300} />
              <Text style={s.noPinText}>
                {hasPin ? 'A PIN is set. You can regenerate it below.' : 'No PIN has been generated yet.'}
              </Text>
            </View>
          )}

          {/* Generate / Regenerate */}
          <TouchableOpacity
            style={[s.amberBtn, saving && { opacity: 0.6 }]}
            onPress={handleGenerate}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name={hasPin ? 'refresh-circle' : 'add-circle'} size={20} color="#fff" />}
            <Text style={s.amberBtnText}>
              {hasPin ? 'Regenerate PIN' : 'Generate New PIN'}
            </Text>
          </TouchableOpacity>

          {hasPin && (
            <TouchableOpacity style={s.revokeBtn} onPress={handleRevoke} activeOpacity={0.85}>
              <Ionicons name="ban" size={18} color={COLORS.red600} />
              <Text style={s.revokeBtnText}>Revoke All Caretaker Access</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Share Access ── */}
        <View style={s.card}>
          <SectionHeader icon="share-social" title="Share Access" />
          <Text style={s.shareNote}>
            {newPin
              ? 'Share the Patient ID and PIN securely with your trusted family member.'
              : 'Generate a PIN above, then share it with your caretaker.'}
          </Text>

          <View style={s.shareGrid}>
            <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#F3F4F6' }]} onPress={handleCopy} activeOpacity={0.8}>
              <Ionicons name="copy-outline" size={22} color={COLORS.slate700} />
              <Text style={[s.shareBtnText, { color: COLORS.slate700 }]}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#DCF8C6' }]} onPress={handleWhatsApp} activeOpacity={0.8}>
              <Ionicons name="logo-whatsapp" size={22} color="#128C7E" />
              <Text style={[s.shareBtnText, { color: '#128C7E' }]}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#EFF6FF' }]} onPress={handleSMS} activeOpacity={0.8}>
              <Ionicons name="chatbubble-outline" size={22} color="#2563EB" />
              <Text style={[s.shareBtnText, { color: '#2563EB' }]}>SMS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Activity Log ── */}
        <View style={s.card}>
          <SectionHeader icon="time" title="Activity Log" color={COLORS.brand600} />

          {sessionCnt === 0 ? (
            <View style={s.emptyLog}>
              <Ionicons name="eye-off-outline" size={24} color={COLORS.slate300} />
              <Text style={s.emptyLogText}>No caretaker sessions yet</Text>
            </View>
          ) : (
            <>
              <View style={s.activityRow}>
                <View style={[s.activityDot, { backgroundColor: '#34D399' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.activityTitle}>Last Active Session</Text>
                  <Text style={s.activitySub}>{lastLogin || 'Unknown'}</Text>
                </View>
                <View style={s.sessionBadge}>
                  <Text style={s.sessionBadgeText}>{sessionCnt} sessions</Text>
                </View>
              </View>
              <View style={s.pinVersionRow}>
                <Ionicons name="information-circle-outline" size={14} color={COLORS.slate400} />
                <Text style={s.pinVersionText}>
                  PIN Version {status?.pin_version ?? 0} — regenerating invalidates all active sessions
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── Permission Reference ── */}
        <View style={[s.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
          <SectionHeader icon="checkmark-shield" title="Caretaker Permissions" color='#059669' />
          {[
            { icon: 'eye-outline',        text: 'View today\'s medicine schedule',          ok: true  },
            { icon: 'stats-chart-outline',text: 'Monitor adherence trends',                 ok: true  },
            { icon: 'warning-outline',    text: 'Receive emergency SOS alerts',             ok: true  },
            { icon: 'notifications-outline', text: 'Missed dose notifications',             ok: true  },
            { icon: 'create-outline',     text: 'Edit or add medicines',                   ok: false },
            { icon: 'medical-outline',    text: 'Access doctor-only data',                 ok: false },
            { icon: 'person-outline',     text: 'Change patient account details',          ok: false },
          ].map((item, i) => (
            <View key={i} style={s.permRow}>
              <Ionicons
                name={item.ok ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={item.ok ? '#059669' : '#DC2626'}
              />
              <Text style={[s.permText, { color: item.ok ? '#065F46' : COLORS.slate600 }]}>
                {item.text}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Security Notes ── */}
        <View style={[s.card, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <SectionHeader icon="lock-closed" title="Security Notice" color='#C2410C' />
          {[
            'PIN is never stored in plain text — only a secure hash.',
            'After 5 failed login attempts, access is locked for 5 minutes.',
            'Regenerating the PIN immediately ends any active caretaker session.',
            'You can revoke access at any time from this screen.',
            'Caretaker sessions expire after 1 hour automatically.',
          ].map((note, i) => (
            <View key={i} style={s.secRow}>
              <Ionicons name="shield-outline" size={14} color='#C2410C' />
              <Text style={s.secText}>{note}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  loader:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AMBER_BG, gap: 12 },
  loaderText:  { fontSize: 14, color: COLORS.slate500, fontWeight: '600' },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:  { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  statusDot:  { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },

  scroll: { padding: 14, paddingBottom: 48 },

  card: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', paddingTop: 14, marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 12 },
  toggleLabel:{ fontSize: 14, fontWeight: '700', color: COLORS.slate800 },
  toggleSub:  { fontSize: 11, color: COLORS.slate500, marginTop: 2 },

  noPinBox:   { alignItems: 'center', paddingVertical: 20, gap: 8 },
  noPinText:  { fontSize: 13, color: COLORS.slate500, textAlign: 'center', maxWidth: 220, lineHeight: 18 },

  pinRevealBox:   { backgroundColor: AMBER_LIGHT, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: AMBER },
  pinRevealHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pinRevealTitle: { fontSize: 13, fontWeight: '700', color: AMBER_DARK, flex: 1 },
  pinRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 6 },
  pinText:        { fontSize: 32, fontWeight: '900', color: AMBER_DARK, letterSpacing: 10 },
  eyeBtn:         { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(180,83,9,0.12)', alignItems: 'center', justifyContent: 'center' },
  pinAutoHide:    { fontSize: 11, color: AMBER_DARK, textAlign: 'center', fontWeight: '600', marginBottom: 8 },
  pinHint:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10 },
  pinHintText:    { fontSize: 11, color: '#991B1B', flex: 1, lineHeight: 16 },

  amberBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: AMBER, borderRadius: RADIUS.full, paddingVertical: 14, gap: 8, marginTop: 10 },
  amberBtnText:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  revokeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.full, paddingVertical: 13, gap: 8, marginTop: 10, borderWidth: 1, borderColor: COLORS.red200 },
  revokeBtnText: { color: COLORS.red600, fontSize: 14, fontWeight: '700' },

  shareNote: { fontSize: 12, color: COLORS.slate500, marginBottom: 14, lineHeight: 18 },
  shareGrid: { flexDirection: 'row', gap: 10 },
  shareBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14, gap: 6 },
  shareBtnText: { fontSize: 12, fontWeight: '700' },

  emptyLog:     { alignItems: 'center', paddingVertical: 16, gap: 8 },
  emptyLogText: { fontSize: 13, color: COLORS.slate400 },
  activityRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  activityDot:  { width: 10, height: 10, borderRadius: 5 },
  activityTitle:{ fontSize: 14, fontWeight: '700', color: COLORS.slate800 },
  activitySub:  { fontSize: 12, color: COLORS.slate500 },
  sessionBadge: { backgroundColor: AMBER_LIGHT, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  sessionBadgeText: { fontSize: 11, fontWeight: '700', color: AMBER_DARK },
  pinVersionRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pinVersionText:{ fontSize: 11, color: COLORS.slate400, flex: 1, lineHeight: 16 },

  permRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  permText: { fontSize: 13, flex: 1 },

  secRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  secText:  { fontSize: 12, color: '#7C2D12', flex: 1, lineHeight: 18 },
});

const sh = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIcon:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:  { fontSize: 13, fontWeight: '800', color: COLORS.slate700, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  infoLabel:     { fontSize: 13, color: COLORS.slate500 },
  infoValue:     { fontSize: 13, fontWeight: '700', color: COLORS.slate800 },
  monoValue:     { letterSpacing: 1 },
});

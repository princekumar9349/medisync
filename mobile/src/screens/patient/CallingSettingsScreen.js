/**
 * screens/patient/CallingSettingsScreen.js — DTMF Voice Reminder Tester
 *
 * Lets the user select a registered phone number (or type manually),
 * then triggers the backend DTMF reminder call. After the user responds
 * on their phone (1 = taken, 2 = not taken), a polling mechanism shows
 * the call result on this page.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  StatusBar, KeyboardAvoidingView, Platform, FlatList,
  ActivityIndicator, Animated, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiInitiateVoiceCall, apiGetMe } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────────

const CALL_STATES = {
  IDLE:     'idle',       // Default
  CALLING:  'calling',    // Waiting for Twilio to dial
  RINGING:  'ringing',    // Call connected, waiting for patient response
  RESULT:   'result',     // Got a keypress response
  ERROR:    'error',      // Something went wrong
};

const RESULT_MESSAGES = {
  '1': {
    icon: 'checkmark-circle',
    color: COLORS.emerald600,
    bg:    COLORS.emerald50,
    border:COLORS.emerald200,
    title: 'Medicine Taken ✅',
    body:  'The patient confirmed they have taken their medicine. The dose has been logged successfully.',
  },
  '2': {
    icon: 'alert-circle',
    color: COLORS.amber600,
    bg:    COLORS.amber50,
    border:COLORS.amber200,
    title: 'Medicine Not Taken ⚠️',
    body:  'The patient indicated they have not taken their medicine yet. Please follow up if needed.',
  },
  'no_input': {
    icon: 'time-outline',
    color: COLORS.slate500,
    bg:    COLORS.slate100,
    border:COLORS.slate300,
    title: 'No Response',
    body:  'The patient did not press any key during the call. The call ended without a confirmed response.',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CallingSettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────

  const [phoneInput, setPhoneInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [callSid, setCallSid] = useState(null);
  const [result, setResult] = useState(null);   // '1', '2', 'no_input'
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);

  // Registered numbers sourced from the user profile
  const registeredNumbers = buildRegisteredNumbers(user);

  // ── Animation refs ─────────────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const timerRef  = useRef(null);
  const pollRef   = useRef(null);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (callState === CALL_STATES.RINGING) {
      // Pulse animation for "waiting" indicator
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [callState]);

  useEffect(() => {
    if (callState === CALL_STATES.RINGING || callState === CALL_STATES.CALLING) {
      // Elapsed timer
      setElapsedSec(0);
      timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  useEffect(() => {
    if (callState === CALL_STATES.RESULT || callState === CALL_STATES.ERROR) {
      // Fade in the result card
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [callState]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function buildRegisteredNumbers(u) {
    const nums = [];
    if (u?.phone)          nums.push({ label: `My Number — ${u.phone}`,          value: u.phone });
    if (u?.caregiver_phone) nums.push({ label: `Caregiver — ${u.caregiver_phone}`, value: u.caregiver_phone });
    return nums;
  }

  function formatElapsed(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function selectNumber(num) {
    setPhoneInput(num.value);
    setShowDropdown(false);
  }

  function reset() {
    setCallState(CALL_STATES.IDLE);
    setCallSid(null);
    setResult(null);
    setErrorMsg('');
    setElapsedSec(0);
    clearInterval(timerRef.current);
    clearInterval(pollRef.current);
  }

  // ── Call Logic ─────────────────────────────────────────────────────────────

  async function handleCall() {
    const phone = phoneInput.trim();
    if (!phone || phone.length < 10) {
      setErrorMsg('Please enter a valid phone number (at least 10 digits).');
      setCallState(CALL_STATES.ERROR);
      return;
    }

    setCallState(CALL_STATES.CALLING);
    setErrorMsg('');
    setResult(null);

    try {
      const res = await apiInitiateVoiceCall({
        phone_number:  phone,
        user_id:       user?._id || user?.id || 'demo',
        med_id:        'test_call',
        medicine_name: 'Test Medicine',
        slot:          'morning',
        is_critical:   false,
      });

      if (res.status === 'initiated' || res.status === 'simulated') {
        setCallSid(res.call_sid || res.webhook_url || 'simulated');
        setCallState(CALL_STATES.RINGING);

        // In a real system you'd poll a /voice-ai/call-status endpoint.
        // For this demo we simulate a response after a short wait.
        simulateResultPolling();
      } else {
        throw new Error(res.detail || 'Unexpected response from server.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initiate call. Is the backend running?');
      setCallState(CALL_STATES.ERROR);
    }
  }

  /**
   * Simulates polling for the call result.
   * In production, replace with a real GET /voice-ai/call-status?sid=... endpoint.
   */
  function simulateResultPolling() {
    // We wait for the user to actually press a key on their phone.
    // Since we don't have a real poll endpoint yet, we resolve after 30s
    // with "no_input" as a safe default — shows the user what "no response" looks like.
    // When you add GET /voice-ai/call-status, swap this out.
    pollRef.current = setTimeout(() => {
      setResult('no_input');
      setCallState(CALL_STATES.RESULT);
    }, 30000);
  }

  // ── UI: Result card ────────────────────────────────────────────────────────

  const renderResult = () => {
    if (callState !== CALL_STATES.RESULT || !result) return null;
    const info = RESULT_MESSAGES[result] || RESULT_MESSAGES['no_input'];

    return (
      <Animated.View style={[styles.resultCard, { opacity: fadeAnim, backgroundColor: info.bg, borderColor: info.border }]}>
        <Ionicons name={info.icon} size={40} color={info.color} style={{ marginBottom: 12 }} />
        <Text style={[styles.resultTitle, { color: info.color }]}>{info.title}</Text>
        <Text style={styles.resultBody}>{info.body}</Text>
      </Animated.View>
    );
  };

  // ── UI: Calling / Ringing state ────────────────────────────────────────────

  const renderCallingState = () => (
    <View style={styles.callingContainer}>
      <Animated.View style={[styles.pulseBubble, { transform: [{ scale: pulseAnim }] }]}>
        <Ionicons name="call" size={36} color={COLORS.white} />
      </Animated.View>

      <Text style={styles.callingTitle}>
        {callState === CALL_STATES.CALLING ? 'Connecting…' : 'Call in Progress'}
      </Text>
      <Text style={styles.callingPhone}>{phoneInput}</Text>

      {callState === CALL_STATES.RINGING && (
        <View style={styles.callingHint}>
          <Ionicons name="keypad-outline" size={16} color={COLORS.slate500} style={{ marginRight: 6 }} />
          <Text style={styles.callingHintText}>
            Patient should press <Text style={{ fontWeight: FONTS.bold, color: COLORS.brand600 }}>1</Text> (taken) or{' '}
            <Text style={{ fontWeight: FONTS.bold, color: COLORS.amber600 }}>2</Text> (not taken) on their phone
          </Text>
        </View>
      )}

      <Text style={styles.elapsedTimer}>{formatElapsed(elapsedSec)}</Text>

      <TouchableOpacity style={styles.cancelCallBtn} onPress={reset}>
        <Ionicons name="close-circle" size={20} color={COLORS.red600} />
        <Text style={styles.cancelCallText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={S.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header */}
      <View style={[S.headerBar, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.slate800} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>DTMF Call Test</Text>
          <Text style={S.headerSubtitle}>Send a medicine reminder call</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* ── Idle / Error state: show input ─────────────────────────────── */}
        {(callState === CALL_STATES.IDLE || callState === CALL_STATES.ERROR) && (
          <>
            {/* Phone Number Input */}
            <View style={styles.section}>
              <Text style={S.sectionTitle}>Phone Number</Text>
              <Text style={styles.sectionDesc}>
                Select a registered number or type any number to call.
              </Text>

              {/* Input row */}
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={20} color={COLORS.slate400} style={styles.inputIcon} />
                <TextInput
                  style={styles.phoneInput}
                  placeholder="+91 9876543210"
                  placeholderTextColor={COLORS.slate400}
                  value={phoneInput}
                  onChangeText={v => { setPhoneInput(v); setShowDropdown(false); }}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onFocus={() => registeredNumbers.length > 0 && setShowDropdown(true)}
                />
                {phoneInput.length > 0 && (
                  <TouchableOpacity onPress={() => setPhoneInput('')} style={styles.clearBtn}>
                    <Ionicons name="close-circle" size={18} color={COLORS.slate400} />
                  </TouchableOpacity>
                )}
                {registeredNumbers.length > 0 && (
                  <TouchableOpacity onPress={() => setShowDropdown(v => !v)} style={styles.dropdownToggle}>
                    <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.brand600} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Dropdown list */}
              {showDropdown && registeredNumbers.length > 0 && (
                <View style={styles.dropdown}>
                  {registeredNumbers.map((item, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.dropdownItem, i < registeredNumbers.length - 1 && styles.dropdownDivider]}
                      onPress={() => selectNumber(item)}
                    >
                      <Ionicons name="person-circle-outline" size={20} color={COLORS.brand600} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownLabel}>{item.label.split(' — ')[0]}</Text>
                        <Text style={styles.dropdownNumber}>{item.value}</Text>
                      </View>
                      {phoneInput === item.value && (
                        <Ionicons name="checkmark" size={16} color={COLORS.brand600} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* What will happen info card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>How it works</Text>
              <View style={styles.infoRow}>
                <View style={[styles.infoStep, { backgroundColor: COLORS.brand100 }]}>
                  <Text style={styles.infoStepNum}>1</Text>
                </View>
                <Text style={styles.infoStepText}>Twilio dials the number and plays a Hindi medicine reminder</Text>
              </View>
              <View style={styles.infoRow}>
                <View style={[styles.infoStep, { backgroundColor: COLORS.emerald100 }]}>
                  <Text style={[styles.infoStepNum, { color: COLORS.emerald700 }]}>2</Text>
                </View>
                <Text style={styles.infoStepText}>Patient presses <Text style={{ fontWeight: FONTS.bold }}>1</Text> for "taken" or <Text style={{ fontWeight: FONTS.bold }}>2</Text> for "not taken"</Text>
              </View>
              <View style={styles.infoRow}>
                <View style={[styles.infoStep, { backgroundColor: COLORS.amber100 }]}>
                  <Text style={[styles.infoStepNum, { color: COLORS.amber700 }]}>3</Text>
                </View>
                <Text style={styles.infoStepText}>Backend logs the dose and plays a personalised thank-you message</Text>
              </View>
            </View>

            {/* Error Message */}
            {callState === CALL_STATES.ERROR && errorMsg ? (
              <View style={styles.errorBanner}>
                <Ionicons name="warning-outline" size={18} color={COLORS.red700} style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Call Button */}
            <TouchableOpacity
              style={[styles.callButton, !phoneInput.trim() && styles.callButtonDisabled]}
              onPress={handleCall}
              disabled={!phoneInput.trim()}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={22} color={COLORS.white} />
              <Text style={styles.callButtonText}>Send Reminder Call</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Calling / Ringing state ──────────────────────────────────── */}
        {(callState === CALL_STATES.CALLING || callState === CALL_STATES.RINGING) && renderCallingState()}

        {/* ── Result state ─────────────────────────────────────────────── */}
        {callState === CALL_STATES.RESULT && (
          <>
            {renderResult()}

            <View style={styles.callMetaCard}>
              <Ionicons name="call-outline" size={16} color={COLORS.slate400} />
              <Text style={styles.callMetaText}>Called: {phoneInput}</Text>
            </View>

            <TouchableOpacity style={styles.retryBtn} onPress={reset}>
              <Ionicons name="refresh" size={18} color={COLORS.brand600} />
              <Text style={styles.retryText}>Make Another Call</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    paddingBottom: 60,
  },

  section: {
    marginBottom: SPACING.xl,
  },
  sectionDesc: {
    fontSize: FONTS.sm,
    color: COLORS.slate500,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },

  // ── Input ──
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    ...SHADOW.sm,
  },
  inputIcon: {
    marginRight: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: FONTS.base,
    color: COLORS.slate800,
    paddingVertical: 14,
  },
  clearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  dropdownToggle: {
    padding: 4,
    marginLeft: 4,
  },

  // ── Dropdown ──
  dropdown: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    marginTop: 6,
    overflow: 'hidden',
    ...SHADOW.md,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  dropdownDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate100,
  },
  dropdownLabel: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold,
    color: COLORS.slate700,
  },
  dropdownNumber: {
    fontSize: FONTS.sm,
    color: COLORS.slate500,
    marginTop: 1,
  },

  // ── Info Card ──
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOW.sm,
  },
  infoTitle: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.slate800,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  infoStepNum: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.brand700,
  },
  infoStepText: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.slate600,
    lineHeight: 20,
  },

  // ── Error banner ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.red50,
    borderWidth: 1,
    borderColor: COLORS.red200,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorText: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.red700,
    lineHeight: 18,
  },

  // ── Call Button ──
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.full,
    paddingVertical: 18,
    ...SHADOW.md,
  },
  callButtonDisabled: {
    backgroundColor: COLORS.slate300,
  },
  callButtonText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.white,
    letterSpacing: 0.3,
  },

  // ── Calling / Ringing ──
  callingContainer: {
    alignItems: 'center',
    paddingTop: SPACING['2xl'],
    paddingBottom: SPACING.xl,
  },
  pulseBubble: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.brand600,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    ...SHADOW.lg,
  },
  callingTitle: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: COLORS.slate800,
    marginBottom: 6,
  },
  callingPhone: {
    fontSize: FONTS.lg,
    color: COLORS.slate500,
    marginBottom: SPACING.xl,
  },
  callingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.slate50,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  callingHintText: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.slate600,
    lineHeight: 20,
  },
  elapsedTimer: {
    fontSize: 28,
    fontWeight: FONTS.bold,
    color: COLORS.brand600,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xl,
    letterSpacing: 2,
  },
  cancelCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.red200,
    backgroundColor: COLORS.red50,
  },
  cancelCallText: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.red600,
  },

  // ── Result Card ──
  resultCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  resultTitle: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    marginBottom: 10,
    textAlign: 'center',
  },
  resultBody: {
    fontSize: FONTS.base,
    color: COLORS.slate600,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Meta / Retry ──
  callMetaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  callMetaText: {
    fontSize: FONTS.sm,
    color: COLORS.slate500,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.brand200,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    backgroundColor: COLORS.brand50,
    marginTop: SPACING.sm,
  },
  retryText: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.brand600,
  },
});

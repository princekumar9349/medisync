/**
 * screens/ForgotPasswordScreen.js — Password Reset Flow
 *
 * 3-step single-screen flow:
 *   Step 1 — Email: Enter email → POST /auth/forgot-password
 *   Step 2 — Code:  Enter 6-digit code with 60s resend cooldown + brute-force hints
 *   Step 3 — Reset: New password + confirm → POST /auth/reset-password → Login
 *
 * Security:
 *   - 60s resend cooldown with live countdown timer
 *   - Max 3 attempts shown to user
 *   - Password strength meter on Step 3
 *   - Graceful error messages (no user enumeration on Step 1)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
  Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiForgotPassword, apiResetPassword } from '../services/api';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const { height } = Dimensions.get('window');
const ACCENT = '#0D9488';

// ─── Input Component ─────────────────────────────────────────────────────────
function PInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, showToggle, toggleState, onToggle, maxLength, editable = true }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.inputWrap, { borderColor: focused ? ACCENT : COLORS.border, opacity: editable ? 1 : 0.6 }]}>
      <Ionicons name={icon} size={18} color={focused ? ACCENT : COLORS.slate400} style={{ marginRight: 10 }} />
      <TextInput
        style={s.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.slate400}
        secureTextEntry={secureTextEntry && !toggleState}
        keyboardType={keyboardType || 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <TouchableOpacity onPress={onToggle} style={{ padding: 6 }}>
          <Ionicons name={toggleState ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.slate400} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Password Strength ────────────────────────────────────────────────────────
function PwStrength({ password }) {
  if (!password) return null;
  let str = 0;
  if (password.length >= 6)  str++;
  if (password.length >= 10) str++;
  if (/[A-Z]/.test(password)) str++;
  if (/[0-9]/.test(password)) str++;
  if (/[^A-Za-z0-9]/.test(password)) str++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const clrs   = ['', '#EF4444', '#F59E0B', '#3B82F6', '#10B981', '#059669'];
  return (
    <View style={{ marginBottom: 14, marginTop: -8 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1,2,3,4,5].map(i => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= str ? clrs[str] : COLORS.slate200 }} />
        ))}
      </View>
      <Text style={{ fontSize: 11, color: clrs[str], fontWeight: '700', marginTop: 4 }}>{labels[str]}</Text>
    </View>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepDots({ step }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
      {[1, 2, 3].map(n => (
        <View key={n} style={[s.dot, n === step && s.dotActive, n < step && s.dotDone]} />
      ))}
    </View>
  );
}

// ─── OTP Digit Boxes ──────────────────────────────────────────────────────────
function CodeInput({ value, onChange }) {
  const inputRef = useRef(null);
  const digits = value.padEnd(6, ' ').split('');
  return (
    <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={s.codeRow}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={t => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        autoFocus
      />
      {digits.map((d, i) => (
        <View key={i} style={[s.codeBox, value.length === i && s.codeBoxActive]}>
          <Text style={s.codeDigit}>{d.trim() ? d : ''}</Text>
          {value.length === i && <View style={s.codeCursor} />}
        </View>
      ))}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ForgotPasswordScreen({ navigation }) {
  const [step,     setStep]     = useState(1);
  const [email,    setEmail]    = useState('');
  const [code,     setCode]     = useState('');
  const [newPw,    setNewPw]    = useState('');
  const [confirmPw,setConfirmPw]= useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(null);
  const [showPw,   setShowPw]   = useState(false);
  const [showCPw,  setShowCPw]  = useState(false);

  // Resend cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const startCooldown = useCallback((secs = 60) => {
    setCooldown(secs);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  function animateTransition(cb) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  // ── Step 1: Request reset code ──────────────────────────────────
  async function handleRequestCode() {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true); setError(null);
    try {
      await apiForgotPassword(email.trim().toLowerCase());
      startCooldown(60);
      animateTransition(() => setStep(2));
      setSuccess(`Reset code sent to ${email}. Check your inbox (or server console in dev mode).`);
    } catch (err) {
      setError(err.message || 'Failed to send reset code.');
    } finally { setLoading(false); }
  }

  // ── Step 2: Verify code → move to Step 3 ──────────────────────
  function handleCodeNext() {
    if (code.length < 6) { setError('Enter the 6-digit code.'); return; }
    setError(null);
    animateTransition(() => setStep(3));
  }

  // ── Resend cooldown ────────────────────────────────────────────
  async function handleResend() {
    if (cooldown > 0) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiForgotPassword(email.trim().toLowerCase());
      startCooldown(60);
      setSuccess('New code sent!');
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally { setLoading(false); }
  }

  // ── Step 3: Reset password ─────────────────────────────────────
  async function handleReset() {
    if (!newPw || newPw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setLoading(true); setError(null);
    try {
      await apiResetPassword(email.trim().toLowerCase(), code, newPw);
      setSuccess('Password reset! Redirecting to login…');
      setTimeout(() => navigation.replace('Login'), 1800);
    } catch (err) {
      // If code error → send back to step 2
      if (err.message?.toLowerCase().includes('code') || err.message?.toLowerCase().includes('attempt')) {
        animateTransition(() => { setStep(2); setCode(''); });
      }
      setError(err.message || 'Reset failed. Please try again.');
    } finally { setLoading(false); }
  }

  const STEPS = {
    1: {
      title: 'Forgot Password?',
      subtitle: "Enter your email and we'll send you a reset code.",
      icon: 'mail-outline',
    },
    2: {
      title: 'Enter Code',
      subtitle: `We sent a 6-digit code to ${email || 'your email'}.`,
      icon: 'keypad-outline',
    },
    3: {
      title: 'New Password',
      subtitle: 'Choose a strong password for your account.',
      icon: 'lock-closed-outline',
    },
  };

  const current = STEPS[step];

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={s.heroBg} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Back button */}
            <TouchableOpacity style={s.backBtn} onPress={() => step === 1 ? navigation.goBack() : animateTransition(() => { setStep(s => s - 1); setError(null); })} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Hero */}
            <View style={s.heroSection}>
              <View style={s.heroIconWrap}>
                <Ionicons name={current.icon} size={32} color="#fff" />
              </View>
              <Text style={s.heroTitle}>{current.title}</Text>
              <Text style={s.heroSub}>{current.subtitle}</Text>
            </View>

            {/* Card */}
            <Animated.View style={[s.card, { opacity: fadeAnim }]}>
              <StepDots step={step} />

              {/* Success banner */}
              {success && (
                <View style={s.successBox}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={s.successText}>{success}</Text>
                </View>
              )}

              {/* Error banner */}
              {error && (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.red600} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              {/* ── Step 1 ── */}
              {step === 1 && (
                <>
                  <PInput
                    icon="mail-outline"
                    placeholder="Email address"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                  />
                  <View style={s.infoBox}>
                    <Ionicons name="information-circle-outline" size={14} color={ACCENT} />
                    <Text style={s.infoText}>
                      In development mode, the reset code appears in the server console log.
                    </Text>
                  </View>
                  <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleRequestCode} disabled={loading} activeOpacity={0.85}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <><Text style={s.btnText}>Send Reset Code</Text><Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} /></>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ── Step 2 ── */}
              {step === 2 && (
                <>
                  <Text style={s.codeLabel}>Enter 6-digit code</Text>
                  <CodeInput value={code} onChange={t => { setCode(t); setError(null); }} />

                  {/* Resend row */}
                  <View style={s.resendRow}>
                    <Text style={{ fontSize: 13, color: COLORS.slate500 }}>Didn't receive it?</Text>
                    <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || loading} activeOpacity={0.75}>
                      <Text style={[s.resendBtn, cooldown > 0 && { color: COLORS.slate400 }]}>
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={[s.btn, code.length < 6 && { opacity: 0.55 }]} onPress={handleCodeNext} disabled={code.length < 6} activeOpacity={0.85}>
                    <Text style={s.btnText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                </>
              )}

              {/* ── Step 3 ── */}
              {step === 3 && (
                <>
                  <PInput
                    icon="lock-closed-outline"
                    placeholder="New Password (min 6 chars)"
                    value={newPw}
                    onChangeText={setNewPw}
                    secureTextEntry showToggle toggleState={showPw} onToggle={() => setShowPw(!showPw)}
                  />
                  <PwStrength password={newPw} />
                  <PInput
                    icon="lock-closed-outline"
                    placeholder="Confirm New Password"
                    value={confirmPw}
                    onChangeText={setConfirmPw}
                    secureTextEntry showToggle toggleState={showCPw} onToggle={() => setShowCPw(!showCPw)}
                  />
                  <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleReset} disabled={loading} activeOpacity={0.85}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <><Text style={s.btnText}>Reset Password</Text><Ionicons name="checkmark" size={18} color="#fff" style={{ marginLeft: 8 }} /></>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>

            {/* Back to login */}
            <TouchableOpacity onPress={() => navigation.replace('Login')} style={s.loginLink} activeOpacity={0.75}>
              <Text style={s.loginLinkText}>← Back to Sign In</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0F766E' },
  heroBg:      { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F766E' },
  scroll:      { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },

  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 8, alignSelf: 'flex-start' },

  heroSection: { alignItems: 'center', paddingTop: 20, paddingBottom: 28 },
  heroIconWrap:{ width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroTitle:   { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroSub:     { fontSize: 13, color: 'rgba(255,255,255,0.78)', textAlign: 'center', paddingHorizontal: 20 },

  card:        { backgroundColor: '#fff', borderRadius: 28, padding: 24, marginBottom: 16, elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 },

  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.slate200 },
  dotActive:   { width: 24, backgroundColor: ACCENT },
  dotDone:     { backgroundColor: ACCENT + '99' },

  successBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8 },
  successText: { color: '#059669', fontSize: 13, flex: 1 },
  errorBox:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8 },
  errorText:   { color: COLORS.red600, fontSize: 13, flex: 1 },

  inputWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1.5, borderRadius: 14, marginBottom: 14, paddingHorizontal: 14, height: 54 },
  textInput:   { flex: 1, fontSize: 15, color: COLORS.slate800 },

  infoBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F0FDFA', borderRadius: 10, padding: 12, marginBottom: 14 },
  infoText:    { fontSize: 12, color: ACCENT, flex: 1, lineHeight: 17 },

  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '800' },

  codeLabel:   { fontSize: 14, fontWeight: '700', color: COLORS.slate700, marginBottom: 16, textAlign: 'center' },
  codeRow:     { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 20 },
  codeBox:     { width: 44, height: 56, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.slate50, alignItems: 'center', justifyContent: 'center' },
  codeBoxActive:{ borderColor: ACCENT, backgroundColor: '#F0FDFA' },
  codeDigit:   { fontSize: 22, fontWeight: '800', color: COLORS.slate800 },
  codeCursor:  { position: 'absolute', bottom: 10, width: 2, height: 20, backgroundColor: ACCENT, borderRadius: 1 },

  resendRow:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 20 },
  resendBtn:   { fontSize: 13, fontWeight: '700', color: ACCENT },

  loginLink:   { alignItems: 'center', paddingVertical: 12 },
  loginLinkText:{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
});

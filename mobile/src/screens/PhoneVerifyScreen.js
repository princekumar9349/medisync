/**
 * screens/PhoneVerifyScreen.js — Optional phone verification (post-registration)
 *
 * Shown after registration if user opts in, OR accessible from Profile.
 * "Skip for now" takes user straight into the app.
 *
 * Security:
 *   - 60s resend cooldown
 *   - OTP input: 6 digit boxes
 *   - MOCK_OTP_ENABLED: server logs 123456 (no Twilio in dev)
 *   - Phone number stored on user document on success
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiSendOTP, apiVerifyOTP } from '../services/api';
import { COLORS, FONTS } from '../theme';

const ACCENT = '#0D9488';

// ─── Digit boxes ──────────────────────────────────────────────────────────────
function CodeInput({ value, onChange, autoFocus }) {
  const ref = useRef(null);
  const digits = value.padEnd(6, ' ').split('');
  return (
    <TouchableOpacity activeOpacity={1} onPress={() => ref.current?.focus()} style={s.codeRow}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={t => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        autoFocus={autoFocus}
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
export default function PhoneVerifyScreen() {
  const navigation = useNavigation();
  const route      = useRoute();

  // params: { phone?, email?, fromProfile? }
  const initPhone = route.params?.phone || '';
  const fromProfile = route.params?.fromProfile || false;

  const [phone,    setPhone]    = useState(initPhone);
  const [code,     setCode]     = useState('');
  const [step,     setStep]     = useState(1); // 1=phone, 2=code
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);
  const fadeAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  const startCooldown = useCallback((secs = 60) => {
    setCooldown(secs);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  function animateTransition(cb) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  async function handleSendOTP() {
    if (!phone.trim() || phone.trim().length < 10) {
      setError('Enter a valid phone number (min 10 digits).'); return;
    }
    setLoading(true); setError(null);
    try {
      await apiSendOTP(phone.trim());
      startCooldown(60);
      animateTransition(() => setStep(2));
      setSuccess(`OTP sent to ${phone}. Dev mode: check server console for code.`);
    } catch (err) {
      setError(err.message || 'Failed to send OTP.');
    } finally { setLoading(false); }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiSendOTP(phone.trim());
      startCooldown(60);
      setSuccess('New OTP sent!');
    } catch (err) {
      setError(err.message || 'Failed to resend OTP.');
    } finally { setLoading(false); }
  }

  async function handleVerify() {
    if (code.length < 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError(null);
    try {
      await apiVerifyOTP(phone.trim(), code);
      setSuccess('Phone verified successfully! 🎉');
      setTimeout(() => {
        if (fromProfile) navigation.goBack();
        else navigation.replace('PatientTabs');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally { setLoading(false); }
  }

  function handleSkip() {
    if (fromProfile) navigation.goBack();
    else navigation.replace('PatientTabs');
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={s.heroBg} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Back */}
            <TouchableOpacity style={s.backBtn} onPress={() => step === 1 ? navigation.goBack() : animateTransition(() => { setStep(1); setCode(''); setError(null); })} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Hero */}
            <View style={s.heroSection}>
              <View style={s.heroIconWrap}>
                <Ionicons name="phone-portrait-outline" size={32} color="#fff" />
              </View>
              <Text style={s.heroTitle}>
                {step === 1 ? 'Verify Phone' : 'Enter Code'}
              </Text>
              <Text style={s.heroSub}>
                {step === 1
                  ? 'Optional: add your phone for emergency alerts and medicine reminders.'
                  : `Enter the 6-digit code sent to ${phone}.`}
              </Text>
            </View>

            {/* Card */}
            <Animated.View style={[s.card, { opacity: fadeAnim }]}>

              {/* MOCK hint */}
              <View style={s.devBanner}>
                <Ionicons name="code-slash-outline" size={13} color="#7C3AED" />
                <Text style={s.devText}>Dev mode: OTP = <Text style={{ fontWeight: '900' }}>123456</Text></Text>
              </View>

              {success && (
                <View style={s.successBox}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={s.successText}>{success}</Text>
                </View>
              )}
              {error && (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.red600} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              {step === 1 ? (
                <>
                  <View style={s.inputWrap}>
                    <Ionicons name="call-outline" size={18} color={COLORS.slate400} style={{ marginRight: 10 }} />
                    <TextInput
                      style={s.textInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+91 9XXXXXXXXX"
                      placeholderTextColor={COLORS.slate400}
                      keyboardType="phone-pad"
                      autoFocus
                    />
                  </View>

                  <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleSendOTP} disabled={loading} activeOpacity={0.85}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <><Text style={s.btnText}>Send OTP</Text><Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} /></>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.codeLabel}>Enter 6-digit OTP</Text>
                  <CodeInput value={code} onChange={c => { setCode(c); setError(null); }} autoFocus />

                  <View style={s.resendRow}>
                    <Text style={{ fontSize: 13, color: COLORS.slate500 }}>Didn't receive it?</Text>
                    <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || loading} activeOpacity={0.75}>
                      <Text style={[s.resendBtn, cooldown > 0 && { color: COLORS.slate400 }]}>
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={[s.btn, (code.length < 6 || loading) && { opacity: 0.55 }]} onPress={handleVerify} disabled={code.length < 6 || loading} activeOpacity={0.85}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <><Text style={s.btnText}>Verify Phone</Text><Ionicons name="checkmark" size={18} color="#fff" style={{ marginLeft: 8 }} /></>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>

            {/* Skip */}
            <TouchableOpacity onPress={handleSkip} style={s.skipBtn} activeOpacity={0.75}>
              <Text style={s.skipText}>Skip for now — Verify later from Profile</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0F766E' },
  heroBg:       { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F766E' },
  scroll:       { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 8, alignSelf: 'flex-start' },
  heroSection:  { alignItems: 'center', paddingTop: 20, paddingBottom: 28 },
  heroIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroTitle:    { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroSub:      { fontSize: 13, color: 'rgba(255,255,255,0.78)', textAlign: 'center', paddingHorizontal: 20 },
  card:         { backgroundColor: '#fff', borderRadius: 28, padding: 24, marginBottom: 16, elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 },
  devBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginBottom: 14 },
  devText:      { fontSize: 12, color: '#7C3AED', flex: 1 },
  successBox:   { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8 },
  successText:  { color: '#059669', fontSize: 13, flex: 1 },
  errorBox:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8 },
  errorText:    { color: COLORS.red600, fontSize: 13, flex: 1 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, marginBottom: 14, paddingHorizontal: 14, height: 54 },
  textInput:    { flex: 1, fontSize: 15, color: COLORS.slate800 },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  btnText:      { color: '#fff', fontSize: 16, fontWeight: '800' },
  codeLabel:    { fontSize: 14, fontWeight: '700', color: COLORS.slate700, marginBottom: 16, textAlign: 'center' },
  codeRow:      { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 20 },
  codeBox:      { width: 44, height: 56, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.slate50, alignItems: 'center', justifyContent: 'center' },
  codeBoxActive:{ borderColor: ACCENT, backgroundColor: '#F0FDFA' },
  codeDigit:    { fontSize: 22, fontWeight: '800', color: COLORS.slate800 },
  codeCursor:   { position: 'absolute', bottom: 10, width: 2, height: 20, backgroundColor: ACCENT, borderRadius: 1 },
  resendRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 20 },
  resendBtn:    { fontSize: 13, fontWeight: '700', color: ACCENT },
  skipBtn:      { alignItems: 'center', paddingVertical: 14 },
  skipText:     { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textDecorationLine: 'underline' },
});

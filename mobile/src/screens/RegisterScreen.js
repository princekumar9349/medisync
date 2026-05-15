/**
 * screens/RegisterScreen.js — Premium Healthcare Registration
 * Patient · Doctor roles with password strength, optional phone, specialization
 * After registration: shows patient_id, offers phone verification or skip
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiRegister, apiLogin, apiGetMe } from '../services/api';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const { width, height } = Dimensions.get('window');

const ROLES = [
  { id: 'patient', label: 'Patient',  icon: 'person',  accent: '#0D9488', accentLight: '#CCFBF1', tagline: 'Track your medicines & health' },
  { id: 'doctor',  label: 'Doctor',   icon: 'medkit',  accent: '#4F46E5', accentLight: '#EEF2FF', tagline: 'Manage patients & prescriptions' },
];

// ─── Input ────────────────────────────────────────────────────────────────────
function PremiumInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, accent, showToggle, toggleState, onToggle, autoCorrect, maxLength, optional }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputWrap, { borderColor: focused ? accent : COLORS.border }]}>
      <Ionicons name={icon} size={18} color={focused ? accent : COLORS.slate400} style={{ marginRight: 10 }} />
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.slate400}
        secureTextEntry={secureTextEntry && !toggleState}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={autoCorrect === false ? false : undefined}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {optional && (
        <View style={{ backgroundColor: COLORS.slate100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, color: COLORS.slate400, fontWeight: '700' }}>OPTIONAL</Text>
        </View>
      )}
      {showToggle && (
        <TouchableOpacity onPress={onToggle} style={{ padding: 6 }}>
          <Ionicons name={toggleState ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.slate400} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Password Strength ────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    { label: '8+ characters',          ok: password.length >= 8 },
    { label: 'Uppercase letter (A-Z)',  ok: /[A-Z]/.test(password) },
    { label: 'Number (0-9)',            ok: /[0-9]/.test(password) },
    { label: 'Special char (@#!$...)',  ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed = checks.filter(c => c.ok).length;
  const barColors = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'];
  const barColor = barColors[passed - 1] || '#EF4444';
  return (
    <View style={{ marginBottom: 14, marginTop: -4 }}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
        {[0,1,2,3].map(i => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < passed ? barColor : COLORS.slate200 }} />
        ))}
      </View>
      {checks.map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Ionicons name={c.ok ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={c.ok ? '#10B981' : COLORS.slate300} />
          <Text style={{ fontSize: 11, color: c.ok ? '#10B981' : COLORS.slate400, fontWeight: c.ok ? '700' : '500' }}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Success State ────────────────────────────────────────────────────────────
function SuccessCard({ patientId, role, accent, accentLight, onVerifyPhone, onSkip }) {
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: accentLight, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark-circle" size={44} color={accent} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.slate800 }}>Account Created!</Text>
      <Text style={{ fontSize: 14, color: COLORS.slate500, textAlign: 'center' }}>Welcome to MediSync. Your {role} account is ready.</Text>

      {role === 'patient' && (
        <View style={{ backgroundColor: accentLight, borderRadius: 16, padding: 16, width: '100%', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: COLORS.slate500, marginBottom: 4 }}>Your Patient ID</Text>
          <Text style={{ fontSize: 24, fontWeight: '900', color: accent, letterSpacing: 2 }}>{patientId}</Text>
          <Text style={{ fontSize: 11, color: COLORS.slate400, marginTop: 4, textAlign: 'center' }}>Share this with your caretakers for access</Text>
        </View>
      )}

      <TouchableOpacity style={[styles.registerBtn, { backgroundColor: accent }]} onPress={onVerifyPhone} activeOpacity={0.85}>
        <Ionicons name="phone-portrait-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.registerBtnText}>Verify Phone (optional)</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} activeOpacity={0.75} style={{ paddingVertical: 10 }}>
        <Text style={{ fontSize: 14, color: COLORS.slate500, fontWeight: '600', textDecorationLine: 'underline' }}>
          Skip — Verify later from Profile
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }) {
  const { login }  = useAuth();
  const [selectedRole, setSelectedRole] = useState(0);
  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [phone,         setPhone]         = useState('');
  const [specialization,setSpecialization]= useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [showPw,        setShowPw]        = useState(false);
  const [registered,    setRegistered]    = useState(null); // { patientId, phone }
  const slideX = useRef(new Animated.Value(0)).current;
  const role   = ROLES[selectedRole];
  const tabW   = (width - 48) / 2;

  function selectRole(idx) {
    Animated.spring(slideX, { toValue: idx * tabW, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    setSelectedRole(idx);
    setError(null);
  }

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email, and password are required.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter (e.g. A, B, C…)'); return;
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number (e.g. 1, 2, 3…)'); return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      setError('Password must contain at least one special character (e.g. @, #, !, \$…)'); return;
    }
    setLoading(true); setError(null);
    try {
      const regData = await apiRegister(
        name.trim(), email.trim().toLowerCase(), password, role.id,
        phone.trim() || null,
        (role.id === 'doctor' && specialization.trim()) ? specialization.trim() : null,
        false, // verify_phone_now — we ask after
      );
      // Auto-login
      await apiLogin(email.trim().toLowerCase(), password);
      const profile = await apiGetMe();
      await login(profile, role.id);

      // Show success card
      const pid = regData?.user?.patient_id || profile?.patient_id || '';
      setRegistered({ patientId: pid, phone: phone.trim() });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  function handleVerifyPhone() {
    navigation.navigate('PhoneVerify', {
      phone: registered?.phone || '',
      fromProfile: false,
    });
  }

  function handleSkip() {
    // User is already logged in (login() was called) — navigate to app
    navigation.replace(role.id === 'doctor' ? 'DoctorTabs' : 'PatientTabs');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={styles.heroBg} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ── Hero ── */}
            <View style={styles.heroSection}>
              <View style={styles.logoCircle}>
                <Image source={require('../../assets/logo.png')} style={styles.logoImg} />
              </View>
              <Text style={styles.brandName}>MEDISYNE</Text>
              <Text style={styles.heroTagline}>Create your healthcare account</Text>
            </View>

            {/* ── Card ── */}
            <View style={styles.card}>
              {registered ? (
                <SuccessCard
                  patientId={registered.patientId}
                  role={role.id}
                  accent={role.accent}
                  accentLight={role.accentLight}
                  onVerifyPhone={handleVerifyPhone}
                  onSkip={handleSkip}
                />
              ) : (
                <>
                  <Text style={styles.cardTitle}>Create Account</Text>
                  <Text style={styles.cardSubtitle}>Join the AI healthcare platform</Text>

                  {/* 2-Role tab */}
                  <View style={styles.roleTabs}>
                    <Animated.View style={[styles.roleIndicator, { width: tabW, backgroundColor: role.accent, transform: [{ translateX: slideX }] }]} />
                    {ROLES.map((r, idx) => {
                      const isActive = idx === selectedRole;
                      return (
                        <TouchableOpacity key={r.id} style={[styles.roleTab, { width: tabW }]} onPress={() => selectRole(idx)} activeOpacity={0.8}>
                          <Ionicons name={r.icon} size={15} color={isActive ? '#fff' : COLORS.slate400} />
                          <Text style={[styles.roleTabLabel, { color: isActive ? '#fff' : COLORS.slate500 }]}>{r.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Role tagline */}
                  <View style={[styles.taglinePill, { backgroundColor: role.accentLight }]}>
                    <Ionicons name={role.icon} size={13} color={role.accent} />
                    <Text style={[styles.taglineText, { color: role.accent }]}>{role.tagline}</Text>
                  </View>

                  {/* Error */}
                  {error && (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle" size={16} color={COLORS.red600} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  {/* Required fields */}
                  <PremiumInput icon="person-outline"      placeholder="Full Name"              value={name}     onChangeText={setName}     autoCapitalize="words"         accent={role.accent} />
                  <PremiumInput icon="mail-outline"        placeholder="Email Address"           value={email}    onChangeText={setEmail}    keyboardType="email-address"   accent={role.accent} autoCorrect={false} />
                  <PremiumInput icon="lock-closed-outline" placeholder="Password (min 8, A-Z, 0-9, @#!)"  value={password} onChangeText={setPassword} secureTextEntry showToggle toggleState={showPw} onToggle={() => setShowPw(!showPw)} accent={role.accent} />
                  <PasswordStrength password={password} />

                  {/* Doctor specialization */}
                  {role.id === 'doctor' && (
                    <PremiumInput
                      icon="ribbon-outline"
                      placeholder="Specialization (e.g. Cardiologist)"
                      value={specialization}
                      onChangeText={setSpecialization}
                      accent={role.accent}
                      autoCapitalize="words"
                      optional
                    />
                  )}

                  {/* Optional phone */}
                  <PremiumInput
                    icon="call-outline"
                    placeholder="Phone number"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    accent={role.accent}
                    optional
                  />

                  {/* Info note */}
                  <View style={[styles.infoBox, { backgroundColor: role.accentLight }]}>
                    <Ionicons name="information-circle-outline" size={14} color={role.accent} />
                    <Text style={[styles.infoText, { color: role.accent }]}>
                      {role.id === 'doctor'
                        ? 'You can verify your phone and specialization later from your profile.'
                        : 'Phone is optional. You can verify it after registration for emergency alerts.'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.registerBtn, { backgroundColor: role.accent, opacity: loading ? 0.75 : 1 }]}
                    onPress={handleRegister}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <Text style={styles.registerBtnText}>Create Account</Text>
                          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
                        </>
                    }
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Back to login */}
            {!registered && (
              <View style={styles.loginRow}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.7}>
                  <Text style={[styles.loginLink, { color: role.accent }]}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0F766E' },
  heroBg:        { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F766E' },
  scroll:        { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },

  heroSection:   { alignItems: 'center', paddingTop: height * 0.04, paddingBottom: 24 },
  logoCircle:    { width: 72, height: 72, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, overflow: 'hidden', marginBottom: 14 },
  logoImg:       { width: 72, height: 72, resizeMode: 'cover' },
  brandName:     { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 2, marginBottom: 6 },
  heroTagline:   { fontSize: 13, color: 'rgba(255,255,255,0.78)' },

  card:          { backgroundColor: '#fff', borderRadius: 28, padding: 24, marginBottom: 16, elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 },
  cardTitle:     { fontSize: 22, fontWeight: '800', color: COLORS.slate800, marginBottom: 4 },
  cardSubtitle:  { fontSize: 13, color: COLORS.slate500, marginBottom: 20 },

  roleTabs:      { flexDirection: 'row', backgroundColor: COLORS.slate100, borderRadius: 16, padding: 3, marginBottom: 14, position: 'relative', overflow: 'hidden' },
  roleIndicator: { position: 'absolute', top: 3, bottom: 3, borderRadius: 13, elevation: 2 },
  roleTab:       { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 3, zIndex: 1 },
  roleTabLabel:  { fontSize: 11, fontWeight: '700' },

  taglinePill:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 18 },
  taglineText:   { fontSize: 12, fontWeight: '600' },

  errorBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8 },
  errorText:     { color: COLORS.red600, fontSize: 13, flex: 1 },

  inputWrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1.5, borderRadius: 14, marginBottom: 14, paddingHorizontal: 14, height: 54 },
  textInput:     { flex: 1, fontSize: 15, color: COLORS.slate800 },

  infoBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 12, marginBottom: 14 },
  infoText:      { fontSize: 12, flex: 1, lineHeight: 17, fontWeight: '500' },

  registerBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  registerBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  loginRow:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  loginText:     { color: 'rgba(255,255,255,0.75)', fontSize: 14 },
  loginLink:     { fontSize: 14, fontWeight: '800' },
});

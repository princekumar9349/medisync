/**
 * screens/LoginScreen.js — Premium Healthcare Authentication
 * 3-Role: Patient (teal) · Doctor (indigo) · Caretaker (amber)
 * Glass card, animated hero, role-aware form, rate-limit aware
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Dimensions, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiLogin, apiGetMe, apiCaretakerLogin } from '../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const { width, height } = Dimensions.get('window');

// ─── Role definitions ──────────────────────────────────────────────────────────
const ROLES = [
  {
    id: 'patient',
    label: 'Patient',
    icon: 'person',
    accent: '#0D9488',       // teal brand600
    accentLight: '#CCFBF1',
    tagline: 'Manage your medicines',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    icon: 'medkit',
    accent: '#4F46E5',       // indigo
    accentLight: '#EEF2FF',
    tagline: 'Manage your patients',
  },
  {
    id: 'caretaker',
    label: 'Caretaker',
    icon: 'heart',
    accent: '#D97706',       // amber
    accentLight: '#FEF3C7',
    tagline: 'Monitor your loved one',
  },
];

// ─── Animated pulse ring ──────────────────────────────────────────────────────
function PulseRing({ accent }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  return (
    <Animated.View style={[styles.pulseRing, { borderColor: accent, transform: [{ scale }], opacity }]} />
  );
}

// ─── Premium Input ────────────────────────────────────────────────────────────
function PremiumInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, accent, showToggle, toggleState, onToggle, autoCorrect }) {
  const [focused, setFocused] = useState(false);
  const borderColor = focused ? accent : COLORS.border;
  return (
    <View style={[styles.inputWrap, { borderColor }]}>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }) {
  const { login } = useAuth();

  const [selectedRole, setSelectedRole] = useState(0); // index
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [patientId,    setPatientId]    = useState('');
  const [caretakerPin, setCaretakerPin] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [showPw,       setShowPw]       = useState(false);
  const [showPin,      setShowPin]      = useState(false);
  const [error,        setError]        = useState(null);

  // Animated selector indicator
  const slideX = useRef(new Animated.Value(0)).current;
  const role   = ROLES[selectedRole];

  function selectRole(idx) {
    Animated.spring(slideX, {
      toValue: idx * (width - 48) / 3,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
    setSelectedRole(idx);
    setError(null);
  }

  async function handleLogin() {
    setError(null);
    if (role.id === 'caretaker') {
      if (!patientId.trim() || !caretakerPin.trim()) {
        setError('Enter Patient ID and Caretaker PIN.'); return;
      }
      setLoading(true);
      try {
        const data = await apiCaretakerLogin(patientId.trim().toUpperCase(), caretakerPin.trim());
        // Build a synthetic user profile for caretaker
        const profile = {
          name: `Caretaker (${data.patient_name})`,
          email: '',
          role: 'caretaker',
          linked_patient_id: data.linked_patient_id,
          patient_name: data.patient_name,
        };
        await login(profile, 'caretaker');
      } catch (err) {
        setError(err.message || 'Login failed. Check Patient ID and PIN.');
      } finally { setLoading(false); }
      return;
    }

    if (!email.trim() || !password) {
      setError('Please enter email and password.'); return;
    }
    setLoading(true);
    try {
      await apiLogin(email.trim().toLowerCase(), password);
      const profile = await apiGetMe();
      await login(profile, role.id);
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally { setLoading(false); }
  }

  const tabW = (width - 48) / 3;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />

      {/* ── Hero gradient background ── */}
      <View style={styles.heroBg} />
      <View style={[styles.heroBg2, { backgroundColor: role.accent + '22' }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Hero section ── */}
            <View style={styles.heroSection}>
              <View style={styles.logoWrap}>
                <PulseRing accent={role.accent} />
                <View style={styles.logoCircle}>
                  <Image source={require('../../assets/logo.png')} style={styles.logoImg} />
                </View>
              </View>
              <Text style={styles.brandName}>MEDISYNCE</Text>
              <Text style={styles.heroTagline}>Your AI-powered healthcare companion</Text>
            </View>

            {/* ── Glass card ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sign In</Text>
              <Text style={styles.cardSubtitle}>Choose your role to continue</Text>

              {/* ── 3-Role animated tab ── */}
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

              {/* ── Role tagline ── */}
              <View style={[styles.taglinePill, { backgroundColor: role.accentLight }]}>
                <Ionicons name={role.icon} size={13} color={role.accent} />
                <Text style={[styles.taglineText, { color: role.accent }]}>{role.tagline}</Text>
              </View>

              {/* ── Error ── */}
              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.red600} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* ── Form: Caretaker mode ── */}
              {role.id === 'caretaker' ? (
                <>
                  <PremiumInput
                    icon="people-outline" placeholder="Patient ID (e.g. P-123456)"
                    value={patientId} onChangeText={setPatientId}
                    accent={role.accent} autoCapitalize="characters"
                  />
                  <PremiumInput
                    icon="keypad-outline" placeholder="4–6 digit Caretaker PIN"
                    value={caretakerPin} onChangeText={t => setCaretakerPin(t.replace(/\D/g, '').slice(0, 6))}
                    secureTextEntry showToggle toggleState={showPin} onToggle={() => setShowPin(!showPin)}
                    accent={role.accent} keyboardType="number-pad"
                  />
                  <View style={[styles.infoBox, { backgroundColor: role.accentLight }]}>
                    <Ionicons name="information-circle-outline" size={15} color={role.accent} />
                    <Text style={[styles.infoText, { color: role.accent }]}>Ask the patient to set a PIN in their Profile → Caretaker Access</Text>
                  </View>
                </>
              ) : (
                <>
                  <PremiumInput
                    icon="mail-outline" placeholder="Email Address"
                    value={email} onChangeText={setEmail}
                    keyboardType="email-address" accent={role.accent} autoCorrect={false}
                  />
                  <PremiumInput
                    icon="lock-closed-outline" placeholder="Password"
                    value={password} onChangeText={setPassword}
                    secureTextEntry showToggle toggleState={showPw} onToggle={() => setShowPw(!showPw)}
                    accent={role.accent}
                  />
                  <TouchableOpacity style={styles.forgotWrap} activeOpacity={0.7} onPress={() => navigation.navigate('ForgotPassword')}>
                    <Text style={[styles.forgotText, { color: role.accent }]}>Forgot password?</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Submit button ── */}
              <TouchableOpacity
                style={[styles.loginBtn, { backgroundColor: role.accent, opacity: loading ? 0.75 : 1 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={styles.loginBtnText}>
                        {role.id === 'caretaker' ? 'Access Dashboard' : 'Sign In'}
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
                    </>
                }
              </TouchableOpacity>
            </View>

            {/* ── Register link ── */}
            <View style={styles.registerRow}>
              <Text style={styles.registerText}>New to MediSync? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
                <Text style={[styles.registerLink, { color: role.accent }]}>Create Account</Text>
              </TouchableOpacity>
            </View>

            {/* ── Trust badges ── */}
            <View style={styles.trustRow}>
              {['shield-checkmark-outline', 'lock-closed-outline', 'heart-outline'].map((ic, i) => (
                <View key={i} style={styles.trustBadge}>
                  <Ionicons name={ic} size={13} color={COLORS.slate400} />
                  <Text style={styles.trustText}>{['HIPAA Safe', 'Encrypted', 'Healthcare Grade'][i]}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0F766E' },
  heroBg:      { ...StyleSheet.absoluteFillObject, backgroundColor: '#0F766E' },
  heroBg2:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.6, borderTopLeftRadius: 40, borderTopRightRadius: 40 },

  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32 },

  // Hero
  heroSection: { alignItems: 'center', paddingTop: height * 0.04, paddingBottom: 28 },
  logoWrap:    { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 16, width: 90, height: 90 },
  pulseRing:   { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 2 },
  logoCircle:  { width: 76, height: 76, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, overflow: 'hidden' },
  logoImg:     { width: 76, height: 76, resizeMode: 'cover' },
  brandName:   { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 2, marginBottom: 6 },
  heroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.80)', letterSpacing: 0.5 },

  // Card
  card:         { backgroundColor: '#fff', borderRadius: 28, padding: 24, marginBottom: 16, elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 },
  cardTitle:    { fontSize: 22, fontWeight: '800', color: COLORS.slate800, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: COLORS.slate500, marginBottom: 20 },

  // Role tabs
  roleTabs:      { flexDirection: 'row', backgroundColor: COLORS.slate100, borderRadius: 16, padding: 3, marginBottom: 14, position: 'relative', overflow: 'hidden' },
  roleIndicator: { position: 'absolute', top: 3, bottom: 3, borderRadius: 13, elevation: 2 },
  roleTab:       { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 3, zIndex: 1 },
  roleTabLabel:  { fontSize: 11, fontWeight: '700' },

  // Tagline
  taglinePill:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 18 },
  taglineText:  { fontSize: 12, fontWeight: '600' },

  // Error
  errorBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 14, gap: 8 },
  errorText: { color: COLORS.red700, fontSize: 13, flex: 1 },

  // Inputs
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1.5, borderRadius: 14, marginBottom: 14, paddingHorizontal: 14, height: 54 },
  textInput:  { flex: 1, fontSize: 15, color: COLORS.slate800 },

  // Info box (caretaker instructions)
  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 12, marginBottom: 8 },
  infoText: { fontSize: 12, flex: 1, lineHeight: 17, fontWeight: '500' },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -6 },
  forgotText: { fontSize: 13, fontWeight: '700' },

  // Button
  loginBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Register
  registerRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  registerText: { color: 'rgba(255,255,255,0.75)', fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '800' },

  // Trust
  trustRow:   { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingBottom: 8 },
  trustBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustText:  { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
});

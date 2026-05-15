/**
 * screens/LoginScreen.js — MediSync Premium Login
 * Design matches RegisterScreen: dark gradient bg + white glassmorphic card
 * 3-role selector · animated orbs · heartbeat line · premium inputs
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Dimensions, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { apiLogin, apiGetMe, apiCaretakerLogin } from '../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

const { width, height } = Dimensions.get('window');

// ─── Role definitions ──────────────────────────────────────────────────────────
const ROLES = [
  {
    id: 'patient',
    label: 'Patient',
    icon: 'heart',
    accent: '#0D9488',
    accentLight: '#CCFBF1',
    desc: 'Manage prescriptions & doses',
    gradient: ['#0D9488', '#0F766E'],
  },
  {
    id: 'doctor',
    label: 'Doctor',
    icon: 'medical',
    accent: '#6366F1',
    accentLight: '#EEF2FF',
    desc: 'Dashboard & patient alerts',
    gradient: ['#6366F1', '#4338CA'],
  },
  {
    id: 'caretaker',
    label: 'Caretaker',
    icon: 'people',
    accent: '#F59E0B',
    accentLight: '#FEF3C7',
    desc: 'Family access & monitoring',
    gradient: ['#F59E0B', '#D97706'],
  },
];

// ─── Floating orb ─────────────────────────────────────────────────────────────
function FloatingOrb({ size, color, delay, top, left, right }) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 3000 + delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 3000 + delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const opacity = float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.12, 0.22, 0.12] });
  return (
    <Animated.View
      style={{
        position: 'absolute', width: size, height: size,
        borderRadius: size / 2, backgroundColor: color,
        top, left, right, transform: [{ translateY }], opacity,
      }}
    />
  );
}

// ─── Heartbeat line ───────────────────────────────────────────────────────────
function HeartbeatLine({ color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });
  return (
    <View style={{ height: 2, overflow: 'hidden', opacity: 0.35, marginVertical: 8 }}>
      <Animated.View style={{ transform: [{ translateX }], flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40, height: 2, backgroundColor: color }} />
        <View style={{ width: 8, height: 16, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
        <View style={{ width: 4, height: 28, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ width: 8, height: 16, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '45deg' }] }} />
        <View style={{ width: width * 2, height: 2, backgroundColor: color }} />
      </Animated.View>
    </View>
  );
}

// ─── Pulse rings around logo ──────────────────────────────────────────────────
function PulseRings({ color }) {
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    function go(val, delay) {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    }
    go(p1, 0); go(p2, 900);
  }, []);
  return (
    <>
      {[p1, p2].map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', width: 90, height: 90, borderRadius: 45,
            borderWidth: 1.5, borderColor: color,
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
            opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.2, 0] }),
          }}
        />
      ))}
    </>
  );
}

// ─── Role Tab ─────────────────────────────────────────────────────────────────
function RoleTab({ role, isActive, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  function press() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity
        style={[
          styles.roleTab,
          isActive && { backgroundColor: role.accent + '22', borderColor: role.accent },
        ]}
        onPress={press}
        activeOpacity={1}
      >
        <View style={[styles.roleIconWrap, isActive && { backgroundColor: role.accent }]}>
          <Ionicons name={role.icon} size={16} color={isActive ? '#fff' : '#94A3B8'} />
        </View>
        <Text style={[styles.roleLabel, isActive && { color: role.accent, fontWeight: '800' }]}>
          {role.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Premium Input ────────────────────────────────────────────────────────────
function PremiumInput({ icon, placeholder, value, onChangeText, secureTextEntry,
  keyboardType, autoCapitalize, accent, showToggle, toggleState, onToggle, autoCorrect }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.inputWrap, { borderColor: focused ? accent : '#E2E8F0' }]}>
      <View style={[styles.inputIcon, { backgroundColor: focused ? accent + '15' : '#F8FAFC' }]}>
        <Ionicons name={icon} size={16} color={focused ? accent : '#94A3B8'} />
      </View>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        secureTextEntry={secureTextEntry && !toggleState}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={autoCorrect === false ? false : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <TouchableOpacity onPress={onToggle} style={styles.eyeBtn}>
          <Ionicons name={toggleState ? 'eye-off' : 'eye'} size={16} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }) {
  const { login } = useAuth();

  const [selectedRole, setSelectedRole] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [patientId, setPatientId] = useState('');
  const [caretakerPin, setCaretakerPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState(null);

  const role = ROLES[selectedRole];

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(40)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;

  // Mount animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 550, easing: Easing.out(Easing.exp), useNativeDriver: true }),
    ]).start();
  }, []);

  function selectRole(idx) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setSelectedRole(idx);
    setError(null);
    setEmail(''); setPassword(''); setPatientId(''); setCaretakerPin('');
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
        const profile = {
          name: `Caretaker (${data.patient_name})`,
          email: '', role: 'caretaker',
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
      setError('Please enter your email and password.'); return;
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Background gradient (same as RegisterScreen hero) ── */}
      <LinearGradient colors={['#030712', '#0F172A', '#0D1F35']} style={StyleSheet.absoluteFill} />

      {/* ── Floating orbs ── */}
      <FloatingOrb size={280} color={role.accent} delay={0} top={-60} left={-80} />
      <FloatingOrb size={200} color={role.accent} delay={600} top={120} right={-60} />
      <FloatingOrb size={150} color="#6366F1" delay={1200} top={height * 0.45} left={-30} />

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
            {/* ── Hero ── */}
            <View style={styles.hero}>
              {/* Logo with pulse rings */}
              <View style={styles.logoRing}>
                <View style={[styles.logoInner, { borderColor: role.accent + '60' }]}>
                  <Image source={require('../../assets/logo.png')} style={styles.logoImg} />
                </View>
                <PulseRings color={role.accent} />
              </View>

              <Text style={styles.brand}>MEDISYNC</Text>

              <HeartbeatLine color={role.accent} />

              {/* Trust badges */}
              <View style={styles.trustRow}>
                {[
                  { icon: 'shield-checkmark', text: 'HIPAA Safe' },
                  { icon: 'lock-closed', text: 'Encrypted' },
                  { icon: 'pulse', text: '' },
                ].map(b => (
                  <View key={b.text} style={styles.trustBadge}>
                    <Ionicons name={b.icon} size={10} color={role.accent} />
                    <Text style={[styles.trustText, { color: role.accent + 'CC' }]}>{b.text}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── White glass card — same radius/padding as RegisterScreen.card ── */}
            <Animated.View style={[styles.card, { transform: [{ translateY: cardSlide }, { scale: cardScale }] }]}>
              {/* Accent top line */}
              <View style={[styles.cardAccentLine, { backgroundColor: role.accent }]} />

              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSub}>Sign in to your account</Text>

              {/* ── Role selector ── */}
              <View style={styles.roleTabs}>
                {ROLES.map((r, idx) => (
                  <RoleTab key={r.id} role={r} isActive={idx === selectedRole} onPress={() => selectRole(idx)} />
                ))}
              </View>

              {/* Role descriptor pill */}
              <Animated.View style={[styles.roleDesc, { opacity: fadeAnim }]}>
                <View style={[styles.roleDescPill, { backgroundColor: role.accentLight }]}>
                  <Ionicons name={role.icon} size={13} color={role.accent} />
                  <Text style={[styles.roleDescText, { color: role.accent }]}>{role.desc}</Text>
                </View>
              </Animated.View>

              {/* ── Error box ── */}
              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* ── Form fields ── */}
              <Animated.View style={{ opacity: fadeAnim }}>
                {role.id === 'caretaker' ? (
                  <>
                    <PremiumInput
                      icon="people-outline"
                      placeholder="Patient ID  (e.g. P-614961)"
                      value={patientId}
                      onChangeText={setPatientId}
                      accent={role.accent}
                      autoCapitalize="characters"
                    />
                    <PremiumInput
                      icon="keypad-outline"
                      placeholder="4–6 digit Caretaker PIN"
                      value={caretakerPin}
                      onChangeText={t => setCaretakerPin(t.replace(/\D/g, '').slice(0, 6))}
                      secureTextEntry showToggle toggleState={showPin} onToggle={() => setShowPin(!showPin)}
                      accent={role.accent}
                      keyboardType="number-pad"
                    />
                    <View style={[styles.infoBox, { backgroundColor: role.accentLight }]}>
                      <Ionicons name="information-circle-outline" size={15} color={role.accent} />
                      <Text style={[styles.infoText, { color: role.accent }]}>
                        Ask the patient to set a PIN in their Profile → Caretaker Access
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <PremiumInput
                      icon="mail-outline"
                      placeholder="Email Address"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      accent={role.accent}
                      autoCorrect={false}
                    />
                    <PremiumInput
                      icon="lock-closed-outline"
                      placeholder="Password"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry showToggle toggleState={showPw} onToggle={() => setShowPw(!showPw)}
                      accent={role.accent}
                    />
                    <TouchableOpacity
                      style={styles.forgotWrap}
                      onPress={() => navigation.navigate('ForgotPassword')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.forgotText, { color: role.accent }]}>Forgot password?</Text>
                    </TouchableOpacity>
                  </>
                )}
              </Animated.View>

              {/* ── Submit button ── */}
              <TouchableOpacity
                style={[styles.submitBtn, { opacity: loading ? 0.75 : 1 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={role.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGrad}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={role.id === 'caretaker' ? 'shield-checkmark' : 'log-in-outline'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.submitText}>
                        {role.id === 'caretaker' ? 'Access Dashboard' : `Sign In as ${role.label}`}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 'auto' }} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* ── Register link ── */}
            <View style={styles.registerRow}>
              <Text style={styles.registerText}>New to MediSync? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
                <Text style={[styles.registerLink, { color: role.accent }]}>Create Account →</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 36 },

  // Hero
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  logoRing: { alignItems: 'center', justifyContent: 'center', width: 90, height: 90, marginBottom: 18 },
  logoInner: {
    width: 76, height: 76, borderRadius: 22, borderWidth: 1.5,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', elevation: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20,
  },
  logoImg: { width: 76, height: 76, resizeMode: 'cover' },
  brand: { fontSize: 28, fontWeight: '900', color: '#F8FAFC', letterSpacing: 4, marginBottom: 6 },

  trustRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  trustBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trustText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Card — matches RegisterScreen.card in spirit but dark-friendly (white card on dark bg)
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
  },
  cardAccentLine: { position: 'absolute', top: 0, left: 24, right: 24, height: 3, borderRadius: 2 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 4, marginTop: 8 },
  cardSub: { fontSize: 13, color: '#94A3B8', marginBottom: 20, fontWeight: '500' },

  // Role tabs (same style as LoginScreen original, adapted)
  roleTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  roleTab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
    gap: 5,
  },
  roleIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  roleLabel: { fontSize: 11, fontWeight: '600', color: '#64748B' },

  roleDesc: { marginBottom: 18 },
  roleDescPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    alignSelf: 'flex-start', opacity: 0.9,
  },
  roleDescText: { fontSize: 12, fontWeight: '700' },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1, fontWeight: '500', lineHeight: 18 },

  // Inputs — matches RegisterScreen.inputWrap
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderRadius: 14, marginBottom: 12, overflow: 'hidden',
    height: 54,
  },
  inputIcon: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, fontSize: 15, color: '#0F172A', paddingRight: 12, fontWeight: '500' },
  eyeBtn: { paddingHorizontal: 14, height: '100%', alignItems: 'center', justifyContent: 'center' },

  // Info box
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, marginBottom: 8 },
  infoText: { fontSize: 12, flex: 1, lineHeight: 17, fontWeight: '500' },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -4 },
  forgotText: { fontSize: 13, fontWeight: '700' },

  // Submit
  submitBtn: { borderRadius: 16, marginTop: 4, overflow: 'hidden' },
  submitGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 20 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },

  // Register link
  registerRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 4 },
  registerText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '800' },
});

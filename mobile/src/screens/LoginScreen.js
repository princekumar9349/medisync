/**
 * screens/LoginScreen.js — Role-aware Login for Medisync Mobile
 * Clean Medical Theme — Teal/White
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { apiLogin, apiGetMe } from '../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../theme';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const ROLES = [
  { id: 'patient', label: 'Patient',  icon: 'person' },
  { id: 'doctor',  label: 'Doctor',   icon: 'medkit' },
];

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();

  const [selectedRole, setSelectedRole] = useState('patient');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState(null);
  const [remember, setRemember] = useState(false);

  const accent = COLORS.brand600;
  const accentLight = COLORS.brand400;

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiLogin(email.trim().toLowerCase(), password);
      const profile = await apiGetMe();
      await login(profile, selectedRole);
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand700} />
      
      {/* Teal Curved Background */}
      <View style={StyleSheet.absoluteFillObject}>
        <Svg height={height * 0.42} width={width} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={COLORS.brand500} stopOpacity="1" />
              <Stop offset="1" stopColor={COLORS.brand700} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Path 
            fill="url(#grad)" 
            d="M0,0 L1440,0 L1440,220 C1100,360 340,360 0,220 Z" 
          />
        </Svg>
      </View>

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
            {/* Header */}
            <View style={styles.headerWrap}>
              <View style={styles.iconCircle}>
                <Ionicons name="medical" size={36} color={COLORS.brand600} />
              </View>
              <Text style={styles.welcomeText}>Welcome Back</Text>
              <Text style={styles.subText}>Sign in to your Medisync account</Text>
            </View>

            <View style={styles.card}>
              {/* Role Toggle */}
              <View style={styles.roleContainer}>
                {ROLES.map(role => {
                  const isActive = selectedRole === role.id;
                  return (
                    <TouchableOpacity
                      key={role.id}
                      style={[styles.roleBtn, isActive && { backgroundColor: COLORS.brand600 }]}
                      onPress={() => { setSelectedRole(role.id); setError(null); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={role.icon} size={16} color={isActive ? COLORS.white : COLORS.slate500} style={{ marginRight: 6 }} />
                      <Text style={[styles.roleLabel, { color: isActive ? COLORS.white : COLORS.slate500 }]}>
                        {role.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Error */}
              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={COLORS.red600} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Email */}
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color={COLORS.slate400} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email Address"
                  placeholderTextColor={COLORS.slate400}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.slate400} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={COLORS.slate400}
                  secureTextEntry={!showPw}
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeIcon}>
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color={COLORS.slate400} />
                </TouchableOpacity>
              </View>

              {/* Remember & Forgot */}
              <View style={styles.rowBetween}>
                <TouchableOpacity style={styles.row} onPress={() => setRemember(!remember)} activeOpacity={0.7}>
                  <Ionicons name={remember ? "checkbox" : "square-outline"} size={18} color={remember ? COLORS.brand600 : COLORS.slate400} />
                  <Text style={styles.rememberText}>Remember me</Text>
                </TouchableOpacity>
                <TouchableOpacity>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.loginBtn, { opacity: loading ? 0.7 : 1 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.loginBtnText}>Sign In</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.bottomSection} />

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Register link */}
        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
            <Text style={styles.registerLink}>Register Now</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },
  
  headerWrap: { alignItems: 'center', marginTop: height * 0.04, marginBottom: SPACING.xl },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 }, android: { elevation: 8 } }) },
  welcomeText: { fontSize: FONTS['3xl'], fontWeight: FONTS.extrabold, color: COLORS.white },
  subText: { fontSize: FONTS.sm, color: 'rgba(255,255,255,0.85)', marginTop: 4 },

  card: { backgroundColor: COLORS.white, borderRadius: 20, padding: SPACING.xl, paddingTop: SPACING['2xl'], borderWidth: 1, borderColor: COLORS.border, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 }, android: { elevation: 4 } }), marginBottom: SPACING.xl },

  roleContainer: { flexDirection: 'row', backgroundColor: COLORS.slate50, borderRadius: RADIUS.full, padding: 3, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: RADIUS.full },
  roleLabel: { fontSize: FONTS.sm, fontWeight: FONTS.bold },

  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.red200 },
  errorText: { color: COLORS.red700, fontSize: FONTS.sm, marginLeft: 8, flex: 1 },

  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md, height: 52 },
  inputIcon: { marginRight: SPACING.sm },
  textInput: { flex: 1, fontSize: FONTS.base, color: COLORS.slate800, height: '100%' },
  eyeIcon: { padding: SPACING.sm },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING['2xl'] },
  row: { flexDirection: 'row', alignItems: 'center' },
  rememberText: { fontSize: FONTS.sm, color: COLORS.slate600, marginLeft: 6 },
  forgotText: { fontSize: FONTS.sm, fontWeight: FONTS.semibold, color: COLORS.brand600 },

  loginBtn: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingVertical: 15, alignItems: 'center' },
  loginBtnText: { color: COLORS.white, fontSize: FONTS.lg, fontWeight: FONTS.bold },

  bottomSection: { paddingBottom: SPACING.sm },

  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  registerText: { color: COLORS.slate500, fontSize: FONTS.base },
  registerLink: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.brand600 },
});

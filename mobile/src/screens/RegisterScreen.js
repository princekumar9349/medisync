/**
 * screens/RegisterScreen.js — Registration for Medisync Mobile
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { apiRegister, apiLogin, apiGetMe } from '../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../theme';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const ROLES = [
  { id: 'patient', label: 'Patient',  icon: 'person' },
  { id: 'doctor',  label: 'Doctor',   icon: 'medkit' },
];

export default function RegisterScreen({ navigation }) {
  const { login } = useAuth();

  const [selectedRole, setSelectedRole] = useState('patient');
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [showPw,   setShowPw]   = useState(false);

  const isDoctor = selectedRole === 'doctor';
  const accent   = isDoctor ? COLORS.emerald600 : COLORS.brand600;
  const accentLight = isDoctor ? COLORS.emerald400 : COLORS.brand400;

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiRegister(name.trim(), email.trim().toLowerCase(), password, selectedRole);
      // Auto-login after registration
      await apiLogin(email.trim().toLowerCase(), password);
      const profile = await apiGetMe();
      await login(profile, selectedRole);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={accent} />
      
      {/* Dynamic Wavy Background */}
      <View style={StyleSheet.absoluteFillObject}>
        <Svg height={height * 0.45} width={width} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={accentLight} stopOpacity="1" />
              <Stop offset="1" stopColor={accent} stopOpacity="1" />
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
            {/* Header Text */}
            <View style={styles.headerWrap}>
              <View style={styles.iconCircle}>
                <Ionicons name="person-add" size={40} color={accent} />
              </View>
              <Text style={styles.welcomeText}>Create Account</Text>
              <Text style={styles.subText}>Join Medisync today</Text>
            </View>

            <View style={styles.card}>
              {/* Role Toggle */}
              <View style={styles.roleContainer}>
                {ROLES.map(role => {
                  const isActive = selectedRole === role.id;
                  return (
                    <TouchableOpacity
                      key={role.id}
                      style={[styles.roleBtn, isActive && { backgroundColor: accent }]}
                      onPress={() => { setSelectedRole(role.id); setError(null); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={role.icon} size={18} color={isActive ? COLORS.white : COLORS.slate500} style={{ marginRight: 6 }} />
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
                  <Ionicons name="alert-circle" size={20} color={COLORS.red600} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Name */}
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={COLORS.slate400} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Full Name"
                  placeholderTextColor={COLORS.slate400}
                  autoCapitalize="words"
                />
              </View>

              {/* Email */}
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={COLORS.slate400} style={styles.inputIcon} />
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
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.slate400} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (min 6 chars)"
                  placeholderTextColor={COLORS.slate400}
                  secureTextEntry={!showPw}
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeIcon}>
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.slate400} />
                </TouchableOpacity>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.loginBtn, { backgroundColor: accent, opacity: loading ? 0.7 : 1 }]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.loginBtnText}>Register</Text>}
              </TouchableOpacity>
            </View>

            {/* Bottom Section */}
            <View style={styles.bottomSection}>
              <Text style={styles.orText}>or register with</Text>
              <View style={styles.socialRow}>
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: '#3b5998' }]}>
                  <FontAwesome5 name="facebook-f" size={18} color={COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: '#db4a39' }]}>
                  <FontAwesome5 name="google" size={18} color={COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: '#000000' }]}>
                  <FontAwesome5 name="apple" size={18} color={COLORS.white} />
                </TouchableOpacity>
              </View>

              <View style={styles.registerRow}>
                <Text style={styles.registerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={[styles.registerLink, { color: accent }]}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING['3xl'] },
  
  headerWrap: { alignItems: 'center', marginTop: height * 0.05, marginBottom: SPACING.xl },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  welcomeText: { fontSize: FONTS['3xl'], fontWeight: FONTS.extrabold, color: COLORS.white, textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  subText: { fontSize: FONTS.base, color: COLORS.white, opacity: 0.9, marginTop: 4 },

  card: { backgroundColor: COLORS.white, borderRadius: 24, padding: SPACING.xl, paddingTop: SPACING['2xl'], shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10, marginBottom: SPACING.xl },

  roleContainer: { flexDirection: 'row', backgroundColor: COLORS.slate50, borderRadius: RADIUS.full, padding: 4, marginBottom: SPACING.xl },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: RADIUS.full },
  roleLabel: { fontSize: FONTS.sm, fontWeight: FONTS.bold },

  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, padding: SPACING.md, borderRadius: RADIUS.md, marginBottom: SPACING.md },
  errorText: { color: COLORS.red700, fontSize: FONTS.sm, marginLeft: 8, flex: 1 },

  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: RADIUS.md, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md, height: 55 },
  inputIcon: { marginRight: SPACING.sm },
  textInput: { flex: 1, fontSize: FONTS.base, color: COLORS.slate800, height: '100%' },
  eyeIcon: { padding: SPACING.sm },

  loginBtn: { borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5, marginTop: SPACING.sm },
  loginBtnText: { color: COLORS.white, fontSize: FONTS.lg, fontWeight: FONTS.bold, letterSpacing: 0.5 },

  bottomSection: { alignItems: 'center', paddingBottom: SPACING.lg },
  
  orText: { fontSize: FONTS.sm, color: COLORS.slate400, marginBottom: SPACING.lg },
  socialRow: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING['2xl'] },
  socialBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },

  registerRow: { flexDirection: 'row' },
  registerText: { color: COLORS.slate500, fontSize: FONTS.base },
  registerLink: { fontSize: FONTS.base, fontWeight: FONTS.bold },
});

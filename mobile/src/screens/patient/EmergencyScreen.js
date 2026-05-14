/**
 * screens/patient/EmergencyScreen.js
 * 
 * Emergency Instant Chat — Turant doctor ya caretaker se connect karo
 * Features:
 *  - SOS broadcast to all assigned doctors + caretaker
 *  - Real-time polling for doctor response (every 5s)
 *  - 60s countdown with fallback to 112
 *  - Quick relief tips while waiting
 *  - Full chat interface once doctor connects
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Alert,
  Animated, Vibration, Linking, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiPost, apiFetch } from '../../services/api';
import NotificationService from '../../services/NotificationService';

const RED   = '#DC2626';
const DARK  = '#7F1D1D';
const LIGHT = '#FEE2E2';
const GREEN = '#059669';

// ─── Quick Relief Tips ────────────────────────────────────────────────────────
const RELIEF_TIPS = [
  { icon: '🫁', tip: 'Breathe slowly — inhale for 4 seconds, hold 4, exhale 6.' },
  { icon: '🚶', tip: 'Sit down or lie flat. Do NOT stand suddenly.' },
  { icon: '💊', tip: 'If you have your medicine nearby, take it as prescribed.' },
  { icon: '🚰', tip: 'Sip water slowly if you feel dizzy or weak.' },
  { icon: '📍', tip: 'Stay where you are — help is being arranged.' },
  { icon: '👐', tip: 'Loosen any tight clothing around your neck or chest.' },
];

// ─── Pulse animation for SOS button ──────────────────────────────────────────
function PulsingDot() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.6, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[pulse.dot, { transform: [{ scale: anim }] }]} />
  );
}

const pulse = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: RED, marginRight: 8 },
});

// ─── Chat Bubble ─────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isMe = msg.role === 'patient';
  return (
    <View style={[bbl.wrap, isMe && bbl.myWrap]}>
      {!isMe && (
        <View style={bbl.avatar}>
          <Ionicons name="medical" size={14} color="#fff" />
        </View>
      )}
      <View style={[bbl.bubble, isMe ? bbl.myBubble : bbl.drBubble]}>
        {!isMe && <Text style={bbl.sender}>Dr. {msg.sender_name || 'Doctor'}</Text>}
        <Text style={[bbl.text, isMe && { color: '#fff' }]}>{msg.message}</Text>
        <Text style={[bbl.time, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
          {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const bbl = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, paddingHorizontal: 16 },
  myWrap:   { flexDirection: 'row-reverse' },
  avatar:   { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0D9488', alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 2 },
  bubble:   { maxWidth: '78%', borderRadius: 18, padding: 12 },
  drBubble: { backgroundColor: '#F1F5F9', borderBottomLeftRadius: 4 },
  myBubble: { backgroundColor: '#0D9488', borderBottomRightRadius: 4 },
  sender:   { fontSize: 11, fontWeight: '700', color: '#0D9488', marginBottom: 4 },
  text:     { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  time:     { fontSize: 10, color: '#94A3B8', marginTop: 4, textAlign: 'right' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EmergencyScreen({ navigation }) {
  const { user } = useAuth();

  const [phase,     setPhase]     = useState('sos');  // 'sos' | 'waiting' | 'chat'
  const [messages,  setMessages]  = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending,   setSending]   = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [tipIndex,  setTipIndex]  = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [doctorName, setDoctorName] = useState(null);

  const scrollRef  = useRef(null);
  const timerRef   = useRef(null);
  const pollRef    = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(pollRef.current);
    clearInterval(countdownRef.current);
  }, []);

  // ── Tip carousel ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'waiting') return;
    timerRef.current = setInterval(() => setTipIndex(i => (i + 1) % RELIEF_TIPS.length), 4000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // ── SOS Trigger ──────────────────────────────────────────────────────────
  async function triggerSOS() {
    Vibration.vibrate([0, 200, 100, 200]);
    setPhase('waiting');
    setCountdown(60);

    try {
      // Broadcast SOS to backend
      const res = await apiFetch('/emergency/sos', {
        method: 'POST',
        body: JSON.stringify({
          message: `🆘 EMERGENCY: ${user?.name || 'Patient'} needs immediate assistance!`,
          location: 'App triggered',
        }),
      });
      setSessionId(res?.session_id || null);
    } catch (e) {
      console.warn('[Emergency] SOS post failed (non-critical):', e.message);
    }

    // Show local emergency notification
    try {
      await NotificationService.showEmergencyAlert(user?.name || 'You', 'SOS sent to your doctors and caretaker.');
    } catch {}

    // Start 60s countdown
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    // Poll for doctor response every 5s
    pollRef.current = setInterval(() => pollForDoctor(), 5000);
  }

  // ── Poll for doctor joining ───────────────────────────────────────────────
  const pollForDoctor = useCallback(async () => {
    try {
      const res = await apiFetch('/emergency/status');
      if (res?.doctor_online) {
        clearInterval(pollRef.current);
        clearInterval(countdownRef.current);
        setDoctorName(res.doctor_name || 'Doctor');
        setMessages(res.messages || []);
        setPhase('chat');
      }
    } catch {}
  }, []);

  // ── Send Message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const optimistic = {
      role: 'patient', message: text,
      sender_name: user?.name, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      await apiFetch('/emergency/message', {
        method: 'POST',
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      // Poll for reply
      setTimeout(pollForDoctor, 1000);
    } catch (e) {
      Alert.alert('Error', 'Could not send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // ── Call 112 ─────────────────────────────────────────────────────────────
  function call112() {
    Alert.alert(
      '📞 Call Emergency Services',
      'This will call 112 (National Emergency). Confirm?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call 112', style: 'destructive', onPress: () => Linking.openURL('tel:112') },
      ]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: SOS Phase
  if (phase === 'sos') return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={RED} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Emergency Help</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.sosContent} showsVerticalScrollIndicator={false}>
        {/* SOS Explain */}
        <View style={s.explainBox}>
          <Ionicons name="alert-circle" size={28} color={RED} />
          <Text style={s.explainTitle}>Need Immediate Help?</Text>
          <Text style={s.explainSub}>
            Tap SOS to instantly alert your doctor and caretaker. A chat will open for real-time medical guidance.
          </Text>
        </View>

        {/* Big SOS Button */}
        <TouchableOpacity style={s.sosBtn} onPress={triggerSOS} activeOpacity={0.85}>
          <Ionicons name="radio" size={48} color="#fff" />
          <Text style={s.sosBtnLabel}>TAP TO SEND SOS</Text>
          <Text style={s.sosBtnSub}>Alerts all your doctors & caretaker instantly</Text>
        </TouchableOpacity>

        {/* Relief Tips Preview */}
        <View style={s.tipsPreview}>
          <Text style={s.tipsTitle}>While waiting — Quick Relief:</Text>
          {RELIEF_TIPS.slice(0, 3).map((t, i) => (
            <View key={i} style={s.tipRow}>
              <Text style={s.tipIcon}>{t.icon}</Text>
              <Text style={s.tipText}>{t.tip}</Text>
            </View>
          ))}
        </View>

        {/* Direct Call 112 */}
        <TouchableOpacity style={s.callBtn} onPress={call112} activeOpacity={0.8}>
          <Ionicons name="call" size={20} color={RED} />
          <Text style={s.callBtnTxt}>Call 112 Emergency Services</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Waiting Phase
  if (phase === 'waiting') return (
    <SafeAreaView style={[s.container, { backgroundColor: '#FFF7F7' }]}>
      {/* Pulsing SOS Header */}
      <View style={s.waitHeader}>
        <PulsingDot />
        <Text style={s.waitHeaderTxt}>SOS SENT — Contacting Doctors</Text>
      </View>

      <ScrollView contentContainerStyle={s.waitContent} showsVerticalScrollIndicator={false}>
        {/* Countdown Ring */}
        <View style={s.countdownBox}>
          <View style={[s.countRing, { borderColor: countdown > 20 ? RED : '#FCD34D' }]}>
            <Text style={s.countNum}>{countdown}</Text>
            <Text style={s.countLabel}>seconds</Text>
          </View>
          <Text style={s.countSub}>A doctor will respond shortly</Text>
        </View>

        {/* Animated Relief Tip */}
        <View style={s.tipCard}>
          <Text style={s.tipCardIcon}>{RELIEF_TIPS[tipIndex].icon}</Text>
          <Text style={s.tipCardTxt}>{RELIEF_TIPS[tipIndex].tip}</Text>
        </View>

        {/* All Tips */}
        <Text style={s.allTipsTitle}>While you wait:</Text>
        {RELIEF_TIPS.map((t, i) => (
          <View key={i} style={[s.tipRow, { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, padding: 12 }]}>
            <Text style={s.tipIcon}>{t.icon}</Text>
            <Text style={s.tipText}>{t.tip}</Text>
          </View>
        ))}

        {/* Still no response? */}
        {countdown === 0 && (
          <View style={s.noResponseBox}>
            <Text style={s.noResponseTitle}>No doctor responded yet</Text>
            <TouchableOpacity style={s.callBtnRed} onPress={call112}>
              <Ionicons name="call" size={20} color="#fff" />
              <Text style={s.callBtnRedTxt}>Call 112 Now</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={s.callBtn} onPress={call112}>
          <Ionicons name="call" size={18} color={RED} />
          <Text style={s.callBtnTxt}>Call 112 Emergency Services</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Chat Phase
  return (
    <SafeAreaView style={s.container}>
      {/* Chat Header */}
      <View style={s.chatHeader}>
        <View style={s.chatHeaderLeft}>
          <View style={s.chatDrAvatar}>
            <Ionicons name="medical" size={18} color="#fff" />
          </View>
          <View>
            <Text style={s.chatDrName}>Dr. {doctorName}</Text>
            <View style={s.onlinePill}>
              <View style={s.greenDot} />
              <Text style={s.onlineTxt}>Online — Emergency Session</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={s.endBtn} onPress={() => {
          Alert.alert('End Session', 'Are you feeling better?', [
            { text: 'Stay in Chat', style: 'cancel' },
            { text: 'End Session', onPress: () => navigation.goBack() },
          ]);
        }}>
          <Text style={s.endBtnTxt}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Emergency Banner */}
      <View style={s.emergencyBanner}>
        <Ionicons name="shield-checkmark" size={14} color={GREEN} />
        <Text style={s.emergencyBannerTxt}>Emergency session active — doctor is monitoring your status</Text>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
        <ScrollView
          ref={scrollRef}
          style={s.messageList}
          contentContainerStyle={{ paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {/* System message */}
          <View style={s.sysMsg}>
            <Text style={s.sysMsgTxt}>🆘 Emergency session started. Describe your symptoms.</Text>
          </View>
          {messages.map((m, i) => <Bubble key={i} msg={m} />)}
        </ScrollView>

        {/* Input */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Describe your symptoms..."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={500}
          />
          <TouchableOpacity style={[s.sendBtn, !inputText.trim() && { opacity: 0.4 }]} onPress={sendMessage} disabled={!inputText.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: RED },

  sosContent: { padding: 20, alignItems: 'center', paddingBottom: 60 },
  explainBox: { alignItems: 'center', marginBottom: 32, paddingHorizontal: 20 },
  explainTitle:{ fontSize: 24, fontWeight: '900', color: RED, marginTop: 12, textAlign: 'center' },
  explainSub:  { fontSize: 15, color: '#64748B', marginTop: 10, textAlign: 'center', lineHeight: 22 },

  sosBtn:      { width: 220, height: 220, borderRadius: 110, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', marginBottom: 32, elevation: 12, shadowColor: RED, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20 },
  sosBtnLabel: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 12, letterSpacing: 1.5 },
  sosBtnSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },

  tipsPreview: { width: '100%', backgroundColor: '#FFF7ED', borderRadius: 18, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: '#FED7AA' },
  tipsTitle:   { fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 12 },
  tipRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  tipIcon:     { fontSize: 18 },
  tipText:     { fontSize: 13, color: '#475569', flex: 1, lineHeight: 19 },

  callBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: RED, borderRadius: 50, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  callBtnTxt:  { color: RED, fontSize: 15, fontWeight: '700' },

  // Waiting
  waitHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: RED, paddingVertical: 12 },
  waitHeaderTxt: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  waitContent:   { padding: 20, alignItems: 'center', paddingBottom: 60 },
  countdownBox:  { alignItems: 'center', marginVertical: 24 },
  countRing:     { width: 120, height: 120, borderRadius: 60, borderWidth: 5, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  countNum:      { fontSize: 40, fontWeight: '900', color: RED },
  countLabel:    { fontSize: 12, color: '#94A3B8', marginTop: -4 },
  countSub:      { fontSize: 14, color: '#64748B', fontWeight: '600' },
  tipCard:       { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10 },
  tipCardIcon:   { fontSize: 40, marginBottom: 12 },
  tipCardTxt:    { fontSize: 15, color: '#334155', textAlign: 'center', lineHeight: 22 },
  allTipsTitle:  { fontSize: 13, fontWeight: '700', color: '#64748B', alignSelf: 'flex-start', marginBottom: 8 },
  noResponseBox: { width: '100%', backgroundColor: LIGHT, borderRadius: 16, padding: 20, alignItems: 'center', marginVertical: 16 },
  noResponseTitle:{ fontSize: 16, fontWeight: '800', color: RED, marginBottom: 12 },
  callBtnRed:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: RED, borderRadius: 50, paddingVertical: 14, paddingHorizontal: 28 },
  callBtnRedTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Chat
  chatHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#fff' },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatDrAvatar:   { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0D9488', alignItems: 'center', justifyContent: 'center' },
  chatDrName:     { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  onlinePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  greenDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  onlineTxt:      { fontSize: 11, color: GREEN, fontWeight: '700' },
  endBtn:         { backgroundColor: '#FEE2E2', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  endBtnTxt:      { color: RED, fontWeight: '800', fontSize: 14 },

  emergencyBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#BBF7D0' },
  emergencyBannerTxt: { fontSize: 12, color: GREEN, fontWeight: '700', flex: 1 },

  messageList: { flex: 1, backgroundColor: '#F8FAFC' },
  sysMsg:      { alignItems: 'center', marginBottom: 16 },
  sysMsgTxt:   { backgroundColor: '#E0F2FE', color: '#0369A1', fontSize: 12, fontWeight: '700', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', gap: 8 },
  input:    { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#1E293B', maxHeight: 100, backgroundColor: '#F8FAFC' },
  sendBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
});

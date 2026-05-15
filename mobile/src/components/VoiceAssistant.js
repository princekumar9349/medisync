/**
 * VoiceAssistant.js — MEDISYNC CORE AI In-App Voice Control
 *
 * Features:
 *  - Floating mic button visible on all screens
 *  - Press & hold to record audio (expo-audio SDK 54+)
 *  - Release → sends to backend /voice-ai/process (Groq Whisper + LLaMA-3)
 *  - Executes actions: navigate, mark medicine, emergency, open slot, etc.
 *  - Speaks AI response via expo-speech (TTS)
 *  - Animated pulse, listening waveform, status overlay
 *
 * Uses expo-audio (replaces deprecated expo-av in SDK 54)
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
  Pressable, Alert, Modal,
} from 'react-native';
import { useAudioRecorder, requestRecordingPermissionsAsync, RecordingPresets } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../services/api';
import { COLORS, FONTS, RADIUS } from '../theme';

// ── Screen name map: CORE AI screen → React Navigation screen name ────────────
const SCREEN_MAP = {
  home:               'PatientDashboard',
  history:            'History',
  pillbox:            'Pillbox',
  medicines:          'Pillbox',
  scan:               'Scan',
  scanner:            'Scan',
  chat:               'Chat',
  profile:            'Profile',
  analytics:          'AnalyticsDashboard',
  notifications:      'NotificationCenter',
  symptoms:           'SymptomReport',
  ocr:                'OCRReview',
  settings:           'Profile',
  caregiver_settings: 'CaretakerSettings',
  privacy:            'DataPrivacySettings',
  calling_settings:   'CallingSettings',
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  idle:       { label: 'Hold mic to speak',  color: COLORS.brand600 },
  recording:  { label: 'Listening...',        color: '#EF4444' },
  processing: { label: 'Thinking...',         color: '#F59E0B' },
  speaking:   { label: 'Speaking...',         color: '#10B981' },
  error:      { label: 'Try again',           color: COLORS.slate500 },
};

export default function VoiceAssistant({ navigationRef }) {
  const [visible,    setVisible]    = useState(false);
  const [status,     setStatus]     = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [lastAction, setLastAction] = useState('');

  // expo-audio recorder hook
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const isRecordingRef  = useRef(false);
  const recordStartTime = useRef(0);

  // Animations
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const waveAnims  = Array.from({ length: 5 }, () => useRef(new Animated.Value(0.3)).current);

  // ── Pulse animation ─────────────────────────────────────────────────────────
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim,  { toValue: 1.22, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim,  { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim2, { toValue: 1.38, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim2, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim, pulseAnim2]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim2.stopAnimation();
    Animated.timing(pulseAnim,  { toValue: 1, duration: 150, useNativeDriver: true }).start();
    Animated.timing(pulseAnim2, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [pulseAnim, pulseAnim2]);

  // ── Wave animation ──────────────────────────────────────────────────────────
  const startWave = useCallback(() => {
    waveAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(anim, { toValue: 1,   duration: 220, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 220, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  const stopWave = useCallback(() => {
    waveAnims.forEach(a => {
      a.stopAnimation();
      Animated.timing(a, { toValue: 0.3, duration: 100, useNativeDriver: true }).start();
    });
  }, []);

  // ── Get auth token ──────────────────────────────────────────────────────────
  async function getToken() {
    try { return await AsyncStorage.getItem('medisync_token'); }
    catch { return null; }
  }

  // ── Start recording ─────────────────────────────────────────────────────────
  async function startRecording() {
    if (isRecordingRef.current) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Denied', 'Mic permission is required for voice control.');
        return;
      }
      await audioRecorder.record();
      isRecordingRef.current = true;
      recordStartTime.current = Date.now();
      setStatus('recording');
      setTranscript('');
      setAiResponse('');
      setLastAction('');
      startPulse();
      startWave();
    } catch (e) {
      console.error('[VoiceAI] Start recording error:', e);
      setStatus('error');
    }
  }

  // ── Stop recording & process ─────────────────────────────────────────────────
  async function stopAndProcess() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    stopPulse();
    stopWave();

    const elapsed = Date.now() - recordStartTime.current;

    // Must record for at least 600ms to have valid audio
    if (elapsed < 600) {
      setStatus('idle');
      setAiResponse('Thoda aur der boliye...');
      return;
    }

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri) {
        setStatus('error');
        setAiResponse('Audio capture nahi ho paya. Dobara try karein.');
        return;
      }

      setStatus('processing');

      const token = await getToken();
      if (!token) {
        setAiResponse('Pehle app mein login karein.');
        setStatus('error');
        Speech.speak('Pehle app mein login karein.', { language: 'hi-IN', rate: 0.9 });
        return;
      }

      // Send audio to backend
      const form = new FormData();
      form.append('audio', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      });

      const resp = await fetch(`${API_BASE}/voice-ai/process`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.text();
        console.warn('[VoiceAI] Backend error:', err);
        setStatus('error');
        setAiResponse('Backend se response nahi aaya.');
        Speech.speak('Server se response nahi aaya. Dobara try karein.', { language: 'hi-IN' });
        return;
      }

      const action = await resp.json();
      console.log('[VoiceAI] Action:', JSON.stringify(action));

      setTranscript(action.transcript || '');
      setAiResponse(action.response || '');
      setLastAction(action.action || '');

      // Speak response
      if (action.response) {
        setStatus('speaking');
        Speech.speak(action.response, {
          language: 'hi-IN',
          rate: 0.9,
          onDone:    () => setStatus('idle'),
          onStopped: () => setStatus('idle'),
          onError:   () => setStatus('idle'),
        });
      } else {
        setStatus('idle');
      }

      // Execute action
      executeAction(action);

    } catch (e) {
      console.error('[VoiceAI] Process error:', e);
      setStatus('error');
      setAiResponse('Kuch galat hua. Dobara try karein.');
    }
  }

  // ── Execute CORE AI action in-app ────────────────────────────────────────────
  function executeAction(action) {
    const act = action.action;
    const nav  = navigationRef?.current;

    // Navigation
    if (act === 'navigate_screen' && action.screen && nav) {
      const screenName = SCREEN_MAP[action.screen] || action.screen;
      try { setTimeout(() => nav.navigate(screenName), 700); } catch (e) { console.warn('[VoiceAI] Nav error:', e); }
      return;
    }

    // Emergency
    if (act === 'emergency_alert' || act === 'sos_mode') {
      try { setTimeout(() => nav?.navigate('Emergency'), 300); } catch {}
      return;
    }

    // Open Chat
    if (act === 'open_chat' || act === 'send_chat_message') {
      try {
        setTimeout(() => {
          nav?.navigate('Chat', { prefillMessage: action.payload?.message || '' });
        }, 700);
      } catch {}
      return;
    }

    // Slot alert
    if (act === 'open_slot' && action.slot) {
      setTimeout(() => {
        Alert.alert('🔓 Pillbox', `Slot ${action.slot} open kiya ja raha hai!`, [{ text: 'OK' }]);
      }, 500);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const statusInfo = STATUS[status] || STATUS.idle;
  const isRecording = status === 'recording';

  return (
    <>
      {/* ── Floating Mic Button ─────────────────────────────────────────────── */}
      <View style={styles.floatWrap} pointerEvents="box-none">
        {/* Outer pulse ring */}
        {isRecording && (
          <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulseAnim2 }] }]} />
        )}
        {/* Inner pulse ring */}
        {isRecording && (
          <Animated.View style={[styles.pulseInner, { transform: [{ scale: pulseAnim }] }]} />
        )}
        <Pressable
          style={[styles.micBtn, isRecording && styles.micBtnRec]}
          onLongPress={() => { setVisible(true); startRecording(); }}
          onPressOut={() => { if (isRecordingRef.current) stopAndProcess(); }}
          onPress={() => setVisible(true)}
          delayLongPress={100}
        >
          <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={26} color={COLORS.white} />
        </Pressable>
      </View>

      {/* ── Voice Panel Modal ───────────────────────────────────────────────── */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}
        >
          <Pressable style={styles.panel} onPress={() => {}}>

            {/* Header */}
            <View style={styles.panelRow}>
              <View style={styles.coreDot} />
              <Text style={styles.panelTitle}>MEDISYNC CORE AI</Text>
              <TouchableOpacity onPress={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}>
                <Ionicons name="close-circle" size={24} color={COLORS.slate400} />
              </TouchableOpacity>
            </View>

            {/* Status badge */}
            <View style={[styles.badge, { backgroundColor: statusInfo.color + '1A', borderColor: statusInfo.color + '55' }]}>
              <View style={[styles.badgeDot, { backgroundColor: statusInfo.color }]} />
              <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>

            {/* Waveform */}
            <View style={styles.waveRow}>
              {waveAnims.map((anim, i) => (
                <Animated.View key={i} style={[styles.waveBar, {
                  transform: [{ scaleY: anim }],
                  backgroundColor: isRecording ? '#EF4444' : statusInfo.color + 'AA',
                }]} />
              ))}
            </View>

            {/* Transcript */}
            {transcript !== '' && (
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>Aapne kaha:</Text>
                <Text style={styles.transcriptText}>"{transcript}"</Text>
              </View>
            )}

            {/* AI Response */}
            {aiResponse !== '' && (
              <View style={styles.responseBox}>
                <View style={styles.responseRow}>
                  <Ionicons name="sparkles" size={13} color={COLORS.brand600} />
                  <Text style={styles.responseLabel}>MEDISYNC AI</Text>
                  {lastAction !== '' && (
                    <View style={styles.actionChip}>
                      <Text style={styles.actionChipText}>{lastAction}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.responseText}>{aiResponse}</Text>
              </View>
            )}

            {/* Mic Button */}
            <View style={styles.micArea}>
              <Text style={styles.hint}>Press & hold to speak</Text>
              <Pressable
                style={[styles.bigMic, isRecording && styles.bigMicRec]}
                onLongPress={startRecording}
                onPressOut={() => { if (isRecordingRef.current) stopAndProcess(); }}
                delayLongPress={100}
              >
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={40} color={COLORS.white} />
                </Animated.View>
              </Pressable>
              <Text style={styles.hintSub}>
                {isRecording ? 'Release to send' : 'Try: "Profile page kholo"'}
              </Text>
            </View>

            {/* Quick commands */}
            <View style={styles.quickRow}>
              {['Medicines dikhao', 'Next medicine', 'Emergency', 'Analytics kholo'].map(cmd => (
                <TouchableOpacity key={cmd} style={styles.quickChip}
                  onPress={() => Speech.speak(cmd, { language: 'hi-IN' })}
                >
                  <Text style={styles.quickText}>{cmd}</Text>
                </TouchableOpacity>
              ))}
            </View>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Floating
  floatWrap: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 106 : 92,
    right: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  pulseOuter: {
    position: 'absolute',
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#EF444418',
    borderWidth: 1.5, borderColor: '#EF444440',
  },
  pulseInner: {
    position: 'absolute',
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: '#EF444428',
  },
  micBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 8 },
      ios: { shadowColor: COLORS.brand700, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  micBtnRec: { backgroundColor: '#EF4444' },

  // Modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 38, gap: 14,
  },

  // Header
  panelRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coreDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.brand600 },
  panelTitle: { flex: 1, fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800, letterSpacing: 1.4 },

  // Badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1 },
  badgeDot:  { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: FONTS.sm, fontWeight: FONTS.semibold },

  // Waveform
  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 40 },
  waveBar: { width: 5, height: 30, borderRadius: 3 },

  // Transcript
  transcriptBox: { backgroundColor: COLORS.slate50, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  transcriptLabel: { fontSize: FONTS.xs, color: COLORS.slate400, fontWeight: FONTS.semibold, marginBottom: 3 },
  transcriptText:  { fontSize: FONTS.base, color: COLORS.slate700, fontStyle: 'italic' },

  // Response
  responseBox: { backgroundColor: COLORS.brand50, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.brand200 },
  responseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  responseLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand600, flex: 1 },
  actionChip: { backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  actionChipText: { fontSize: 10, color: COLORS.white, fontWeight: FONTS.bold },
  responseText: { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 22 },

  // Mic area
  micArea:  { alignItems: 'center', gap: 8, paddingVertical: 6 },
  hint:     { fontSize: FONTS.sm, color: COLORS.slate400 },
  hintSub:  { fontSize: FONTS.xs, color: COLORS.slate400, textAlign: 'center' },
  bigMic: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 6 },
      ios: { shadowColor: COLORS.brand700, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
    }),
  },
  bigMicRec: { backgroundColor: '#EF4444' },

  // Quick commands
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  quickChip: { backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.brand200 },
  quickText: { fontSize: FONTS.xs, color: COLORS.brand700, fontWeight: FONTS.semibold },
});

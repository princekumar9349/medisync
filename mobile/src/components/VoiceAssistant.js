/**
 * VoiceAssistant.js — MEDISYNC CORE AI In-App Voice Control
 *
 * FIX: Use onPressIn to start recording (fires immediately on touch)
 *      instead of onLongPress — which caused a race condition where
 *      onPressOut fired before the recording even started.
 *
 * Uses expo-av Audio.Recording.createAsync() for reliable single-step init.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
  Pressable, Alert, Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../services/api';
import { COLORS, FONTS, RADIUS } from '../theme';

// ── Screen name map ────────────────────────────────────────────────────────────
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

const STATUS_CFG = {
  idle:       { label: 'Hold mic to speak',   color: COLORS.brand600 },
  recording:  { label: 'Listening...',         color: '#EF4444' },
  processing: { label: 'Thinking...',          color: '#F59E0B' },
  speaking:   { label: 'Speaking...',          color: '#10B981' },
  error:      { label: 'Try again',            color: COLORS.slate500 },
};

export default function VoiceAssistant({ navigationRef }) {
  const [visible,    setVisible]    = useState(false);
  const [status,     setStatus]     = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [lastAction, setLastAction] = useState('');

  // Recording state refs (not useState — avoids stale closures in handlers)
  const recordingRef    = useRef(null);   // Audio.Recording instance
  const recordingReady  = useRef(false);  // true only after createAsync resolves
  const pressStartTime  = useRef(0);

  // Animations
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  // Stable wave refs — must not be created inside .map()
  const waveAnim0  = useRef(new Animated.Value(0.3)).current;
  const waveAnim1  = useRef(new Animated.Value(0.3)).current;
  const waveAnim2  = useRef(new Animated.Value(0.3)).current;
  const waveAnim3  = useRef(new Animated.Value(0.3)).current;
  const waveAnim4  = useRef(new Animated.Value(0.3)).current;
  const waveAnims  = [waveAnim0, waveAnim1, waveAnim2, waveAnim3, waveAnim4];

  const startPulse = useCallback(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim,  { toValue: 1.2,  duration: 500, useNativeDriver: true }),
      Animated.timing(pulseAnim,  { toValue: 1,    duration: 500, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim2, { toValue: 1.38, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim2, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ])).start();
  }, [pulseAnim, pulseAnim2]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim2.stopAnimation();
    Animated.timing(pulseAnim,  { toValue: 1, duration: 150, useNativeDriver: true }).start();
    Animated.timing(pulseAnim2, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [pulseAnim, pulseAnim2]);

  const startWave = useCallback(() => {
    waveAnims.forEach((anim, i) => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(anim, { toValue: 1,   duration: 220, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 220, useNativeDriver: true }),
      ])).start();
    });
  }, []);

  const stopWave = useCallback(() => {
    waveAnims.forEach(a => {
      a.stopAnimation();
      Animated.timing(a, { toValue: 0.3, duration: 100, useNativeDriver: true }).start();
    });
  }, []);

  async function getToken() {
    try { return await AsyncStorage.getItem('medisync_token'); }
    catch { return null; }
  }

  // ── onPressIn — START RECORDING IMMEDIATELY ──────────────────────────────────
  async function handlePressIn() {
    setVisible(true); // open panel

    // Reset state
    setTranscript('');
    setAiResponse('');
    setLastAction('');
    setStatus('recording');

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setStatus('error');
        setAiResponse('Mic permission nahi mili. Settings mein jaake allow karein.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:     true,
        playsInSilentModeIOS:   true,
        shouldDuckAndroid:      true,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current   = recording;
      recordingReady.current = true;
      pressStartTime.current = Date.now();

      startPulse();
      startWave();

    } catch (e) {
      console.error('[VoiceAI] Start error:', e);
      recordingReady.current = false;
      setStatus('error');
      setAiResponse('Mic shuru nahi ho paya. Dobara try karein.');
    }
  }

  // ── onPressOut — STOP & PROCESS ──────────────────────────────────────────────
  async function handlePressOut() {
    stopPulse();
    stopWave();

    // Guard: recording must be ready
    if (!recordingReady.current || !recordingRef.current) {
      setStatus('idle');
      return;
    }

    const elapsed = Date.now() - pressStartTime.current;
    recordingReady.current = false;
    const rec = recordingRef.current;
    recordingRef.current   = null;

    // Must hold for at least 700ms
    if (elapsed < 700) {
      try { await rec.stopAndUnloadAsync(); } catch {}
      setStatus('idle');
      setAiResponse('Thoda aur der boliye... (button hold karein)');
      return;
    }

    setStatus('processing');

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = rec.getURI();
      console.log('[VoiceAI] Recording URI:', uri, '| duration:', elapsed, 'ms');

      if (!uri) {
        setStatus('error');
        setAiResponse('Audio capture nahi hua. Dobara try karein.');
        return;
      }

      const token = await getToken();
      if (!token) {
        setStatus('error');
        setAiResponse('Pehle app mein login karein.');
        Speech.speak('Pehle app mein login karein.', { language: 'hi-IN', rate: 0.9 });
        return;
      }

      // Send to backend
      const form = new FormData();
      form.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' });

      const resp = await fetch(`${API_BASE}/voice-ai/process`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn('[VoiceAI] Backend error:', resp.status, errText);
        setStatus('error');
        setAiResponse(`Backend error ${resp.status}. Dobara try karein.`);
        return;
      }

      const action = await resp.json();
      console.log('[VoiceAI] Action:', action.action, '| conf:', action.confidence, '| transcript:', action.transcript);

      setTranscript(action.transcript || '');
      setAiResponse(action.response  || '');
      setLastAction(action.action    || '');

      if (action.response) {
        setStatus('speaking');
        Speech.speak(action.response, {
          language:  'hi-IN',
          rate:      0.9,
          onDone:    () => setStatus('idle'),
          onStopped: () => setStatus('idle'),
          onError:   () => setStatus('idle'),
        });
      } else {
        setStatus('idle');
      }

      executeAction(action);

    } catch (e: any) {
      console.error('[VoiceAI] Process error:', e?.message || e);
      setStatus('error');
      setAiResponse('Kuch galat hua: ' + (e?.message || 'unknown'));
    }
  }

  // ── Execute action ────────────────────────────────────────────────────────────
  function executeAction(action) {
    const act = action.action;
    const nav  = navigationRef?.current;

    if (act === 'navigate_screen' && action.screen && nav) {
      const screen = SCREEN_MAP[action.screen] || action.screen;
      try { setTimeout(() => nav.navigate(screen), 800); } catch {}
      return;
    }
    if (act === 'emergency_alert' || act === 'sos_mode') {
      try { setTimeout(() => nav?.navigate('Emergency'), 300); } catch {}
      return;
    }
    if (act === 'open_chat' || act === 'send_chat_message') {
      try {
        setTimeout(() => nav?.navigate('Chat', {
          prefillMessage: action.payload?.message || '',
        }), 800);
      } catch {}
      return;
    }
    if (act === 'open_slot' && action.slot) {
      setTimeout(() => Alert.alert('\uD83D\uDD13 Pillbox', `Slot ${action.slot} open kiya ja raha hai!`), 500);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const statusInfo  = STATUS_CFG[status as keyof typeof STATUS_CFG] || STATUS_CFG.idle;
  const isRecording = status === 'recording';

  return (
    <>
      {/* ── Floating Mic Button ─────────────────────────────────────────────── */}
      <View style={sty.floatWrap} pointerEvents="box-none">
        {isRecording && (
          <>
            <Animated.View style={[sty.pulseOuter, { transform: [{ scale: pulseAnim2 }] }]} />
            <Animated.View style={[sty.pulseInner, { transform: [{ scale: pulseAnim  }] }]} />
          </>
        )}
        <Pressable
          style={[sty.micBtn, isRecording && sty.micBtnRec]}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={26} color="#fff" />
        </Pressable>
      </View>

      {/* ── Voice Panel Modal ───────────────────────────────────────────────── */}
      <Modal visible={visible} transparent animationType="slide"
        onRequestClose={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}
      >
        <Pressable style={sty.backdrop}
          onPress={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}
        >
          <Pressable style={sty.panel} onPress={() => {}}>

            {/* Header */}
            <View style={sty.row}>
              <View style={sty.coreDot} />
              <Text style={sty.panelTitle}>MEDISYNC CORE AI</Text>
              <TouchableOpacity onPress={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}>
                <Ionicons name="close-circle" size={24} color={COLORS.slate400} />
              </TouchableOpacity>
            </View>

            {/* Status */}
            <View style={[sty.badge, { backgroundColor: statusInfo.color + '18', borderColor: statusInfo.color + '55' }]}>
              <View style={[sty.badgeDot, { backgroundColor: statusInfo.color }]} />
              <Text style={[sty.badgeTxt, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>

            {/* Waveform */}
            <View style={sty.waveRow}>
              {waveAnims.map((anim, i) => (
                <Animated.View key={i} style={[sty.waveBar, {
                  transform:       [{ scaleY: anim }],
                  backgroundColor: isRecording ? '#EF4444BB' : statusInfo.color + '88',
                }]} />
              ))}
            </View>

            {/* Transcript */}
            {transcript !== '' && (
              <View style={sty.transcriptBox}>
                <Text style={sty.transcriptLbl}>Aapne kaha:</Text>
                <Text style={sty.transcriptTxt}>"{transcript}"</Text>
              </View>
            )}

            {/* AI Response */}
            {aiResponse !== '' && (
              <View style={sty.responseBox}>
                <View style={sty.row}>
                  <Ionicons name="sparkles" size={13} color={COLORS.brand600} />
                  <Text style={sty.responseLbl}> MEDISYNC AI</Text>
                  {lastAction !== '' && (
                    <View style={sty.chip}><Text style={sty.chipTxt}>{lastAction}</Text></View>
                  )}
                </View>
                <Text style={sty.responseTxt}>{aiResponse}</Text>
              </View>
            )}

            {/* Big mic button in panel */}
            <View style={sty.micArea}>
              <Text style={sty.hint}>
                {isRecording ? '🔴  Release to send' : 'Press & hold to speak'}
              </Text>
              <Pressable
                style={[sty.bigMic, isRecording && sty.bigMicRec]}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
              >
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={40} color="#fff" />
                </Animated.View>
              </Pressable>
              <Text style={sty.hintSub}>Try: "Profile page kholo" · "Next medicine kya hai"</Text>
            </View>

            {/* Quick commands */}
            <View style={sty.quickRow}>
              {['Medicines dikhao', 'Analytics kholo', 'Emergency', 'Slot 1 kholo'].map(cmd => (
                <TouchableOpacity key={cmd} style={sty.quickChip}
                  onPress={() => Speech.speak(cmd, { language: 'hi-IN' })}
                >
                  <Text style={sty.quickTxt}>{cmd}</Text>
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
const sty = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 106 : 92,
    right: 18,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  pulseOuter: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#EF444415', borderWidth: 1.5, borderColor: '#EF444435',
  },
  pulseInner: {
    position: 'absolute', width: 66, height: 66, borderRadius: 33,
    backgroundColor: '#EF444425',
  },
  micBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 8 },
      ios: { shadowColor: '#1e40af', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  micBtnRec: { backgroundColor: '#EF4444' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 38, gap: 14,
  },

  row:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coreDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.brand600 },
  panelTitle:{ flex: 1, fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800, letterSpacing: 1.3 },

  badge:    { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeTxt: { fontSize: FONTS.sm, fontWeight: FONTS.semibold },

  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 40 },
  waveBar: { width: 5, height: 30, borderRadius: 3 },

  transcriptBox: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  transcriptLbl: { fontSize: FONTS.xs, color: COLORS.slate400, fontWeight: FONTS.semibold, marginBottom: 3 },
  transcriptTxt: { fontSize: FONTS.base, color: COLORS.slate700, fontStyle: 'italic' },

  responseBox: { backgroundColor: COLORS.brand50, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.brand200 },
  responseLbl: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand600, flex: 1 },
  chip:        { backgroundColor: COLORS.brand600, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  chipTxt:     { fontSize: 10, color: '#fff', fontWeight: FONTS.bold },
  responseTxt: { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 22, marginTop: 6 },

  micArea: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  hint:    { fontSize: FONTS.sm, color: COLORS.slate500, fontWeight: FONTS.medium },
  hintSub: { fontSize: FONTS.xs, color: COLORS.slate400, textAlign: 'center', marginTop: 4 },
  bigMic: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 6 },
      ios: { shadowColor: '#1e40af', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
    }),
  },
  bigMicRec: { backgroundColor: '#EF4444' },

  quickRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  quickChip: { backgroundColor: COLORS.brand50, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.brand200 },
  quickTxt:  { fontSize: FONTS.xs, color: COLORS.brand700, fontWeight: FONTS.semibold },
});

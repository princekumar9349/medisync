/**
 * VoiceAssistant.js — MEDISYNC CORE AI In-App Voice Control
 *
 * Features:
 *  - Floating mic button visible on all screens
 *  - Press & hold to record audio (expo-av)
 *  - Release → sends to backend /voice-ai/process (Groq Whisper + LLaMA-3)
 *  - Executes actions: navigate, mark medicine, emergency, open slot, etc.
 *  - Speaks AI response via expo-speech (TTS)
 *  - Animated pulse, listening waveform, status overlay
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
import { COLORS, FONTS, RADIUS, SHADOW } from '../theme';

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

// ── Status labels ─────────────────────────────────────────────────────────────
const STATUS = {
  idle:       { label: 'Hold mic to speak',    color: COLORS.brand600 },
  recording:  { label: 'Listening...',          color: '#EF4444' },
  processing: { label: 'Thinking...',           color: '#F59E0B' },
  speaking:   { label: 'Speaking...',           color: '#10B981' },
  error:      { label: 'Tap to try again',      color: COLORS.slate500 },
};

export default function VoiceAssistant({ navigationRef }) {
  const [visible,   setVisible]   = useState(false);
  const [status,    setStatus]    = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [lastAction, setLastAction] = useState('');

  const recordingRef = useRef(null);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const waveAnims    = [1, 2, 3, 4, 5].map(() => useRef(new Animated.Value(0.3)).current);

  // ── Pulse animation ─────────────────────────────────────────────────────────
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // ── Waveform animation ──────────────────────────────────────────────────────
  const startWave = useCallback(() => {
    waveAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(anim, { toValue: 1,   duration: 250, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 250, useNativeDriver: true }),
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
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Denied', 'Mic permission is required for voice control.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000, numberOfChannels: 1, bitRate: 64000,
          linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false,
        },
        web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
      });
      await rec.startAsync();
      recordingRef.current = rec;
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
    stopPulse();
    stopWave();

    if (!recordingRef.current) return;
    const rec = recordingRef.current;
    recordingRef.current = null;

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = rec.getURI();
      if (!uri) { setStatus('error'); return; }

      setStatus('processing');

      // Send to backend
      const token = await getToken();
      if (!token) {
        setAiResponse('Pehle app mein login karein.');
        setStatus('error');
        Speech.speak('Pehle app mein login karein.', { language: 'hi-IN', rate: 0.9 });
        return;
      }

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

      // Execute action on mobile side
      executeAction(action);

    } catch (e) {
      console.error('[VoiceAI] Process error:', e);
      setStatus('error');
      setAiResponse('Ek error aaya. Dobara try karein.');
    }
  }

  // ── Execute CORE AI action in the app ────────────────────────────────────────
  function executeAction(action) {
    const act = action.action;
    const nav = navigationRef?.current;

    // NAVIGATION
    if (act === 'navigate_screen' && action.screen && nav) {
      const screenName = SCREEN_MAP[action.screen] || action.screen;
      try {
        setTimeout(() => nav.navigate(screenName), 600); // small delay for TTS
      } catch (e) {
        console.warn('[VoiceAI] Navigation error:', e);
      }
      return;
    }

    // EMERGENCY — immediately open emergency screen
    if (act === 'emergency_alert' || act === 'sos_mode') {
      try {
        setTimeout(() => nav?.navigate('Emergency'), 300);
      } catch {}
      return;
    }

    // OPEN CHAT
    if (act === 'open_chat' || act === 'send_chat_message') {
      try {
        setTimeout(() => {
          nav?.navigate('Chat', {
            prefillMessage: action.payload?.message || '',
          });
        }, 600);
      } catch {}
      return;
    }

    // For all other actions (mark_taken, open_slot, show_medicines, etc.)
    // The backend already processes them — the response TTS is the confirmation.
    // If slot control needed, show an alert.
    if (act === 'open_slot' && action.slot) {
      setTimeout(() => {
        Alert.alert(
          '🔓 Pillbox Control',
          `Slot ${action.slot} open kiya ja raha hai ESP32 se.`,
          [{ text: 'OK' }]
        );
      }, 400);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const statusInfo = STATUS[status] || STATUS.idle;
  const isRecording = status === 'recording';

  return (
    <>
      {/* ── Floating Mic Button ─────────────────────────────────────────────── */}
      <View style={styles.floatContainer} pointerEvents="box-none">
        <Animated.View style={[styles.pulseRing, {
          transform: [{ scale: pulseAnim }],
          opacity: isRecording ? 0.35 : 0,
          backgroundColor: '#EF4444',
        }]} />
        <Pressable
          style={[styles.micBtn, isRecording && styles.micBtnActive]}
          onLongPress={() => { setVisible(true); startRecording(); }}
          onPressOut={() => { if (recordingRef.current) stopAndProcess(); }}
          onPress={() => setVisible(true)}
          delayLongPress={100}
        >
          <Ionicons
            name={isRecording ? 'mic' : 'mic-outline'}
            size={26}
            color={COLORS.white}
          />
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
            <View style={styles.panelHeader}>
              <View style={styles.headerDot} />
              <Text style={styles.panelTitle}>MEDISYNC CORE AI</Text>
              <TouchableOpacity onPress={() => { Speech.stop(); setVisible(false); setStatus('idle'); }}>
                <Ionicons name="close-circle" size={24} color={COLORS.slate400} />
              </TouchableOpacity>
            </View>

            {/* Status */}
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22', borderColor: statusInfo.color + '55' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>

            {/* Waveform */}
            <View style={styles.waveRow}>
              {waveAnims.map((anim, i) => (
                <Animated.View key={i} style={[styles.waveBar, {
                  transform: [{ scaleY: anim }],
                  backgroundColor: isRecording ? '#EF4444' : statusInfo.color,
                }]} />
              ))}
            </View>

            {/* Transcript */}
            {transcript !== '' && (
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>You said:</Text>
                <Text style={styles.transcriptText}>"{transcript}"</Text>
              </View>
            )}

            {/* AI Response */}
            {aiResponse !== '' && (
              <View style={styles.responseBox}>
                <View style={styles.responseHeader}>
                  <Ionicons name="sparkles" size={14} color={COLORS.brand600} />
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
              <Text style={styles.micHint}>Press & hold to speak</Text>
              <Pressable
                style={[styles.bigMicBtn, isRecording && styles.bigMicBtnActive]}
                onLongPress={startRecording}
                onPressOut={() => { if (recordingRef.current) stopAndProcess(); }}
                delayLongPress={100}
              >
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Ionicons
                    name={isRecording ? 'mic' : 'mic-outline'}
                    size={40}
                    color={COLORS.white}
                  />
                </Animated.View>
              </Pressable>
              <Text style={styles.micHintSub}>
                {isRecording ? 'Release to send' : 'Try: "Profile page kholo"'}
              </Text>
            </View>

            {/* Quick commands */}
            <View style={styles.quickRow}>
              {['Medicines dikhao', 'Next medicine', 'Emergency help'].map(cmd => (
                <TouchableOpacity
                  key={cmd}
                  style={styles.quickChip}
                  onPress={() => {
                    /* Could prefill or trigger a text-mode send */
                    setAiResponse('');
                    setTranscript(cmd);
                    Speech.speak(cmd, { language: 'hi-IN' });
                  }}
                >
                  <Text style={styles.quickChipText}>{cmd}</Text>
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
  // Floating button
  floatContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 104 : 90,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  pulseRing: {
    position: 'absolute',
    width: 70, height: 70, borderRadius: 35,
  },
  micBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 8 },
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  micBtnActive: {
    backgroundColor: '#EF4444',
    transform: [{ scale: 1.1 }],
  },

  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 14,
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.brand600,
  },
  panelTitle: {
    flex: 1,
    fontSize: FONTS.base, fontWeight: FONTS.bold,
    color: COLORS.slate800,
    letterSpacing: 1.2,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: FONTS.sm, fontWeight: FONTS.semibold },

  // Waveform
  waveRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5, height: 42,
  },
  waveBar: {
    width: 5, height: 32, borderRadius: 3,
  },

  // Transcript
  transcriptBox: {
    backgroundColor: COLORS.slate50,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  transcriptLabel: { fontSize: FONTS.xs, color: COLORS.slate400, marginBottom: 4, fontWeight: FONTS.semibold },
  transcriptText: { fontSize: FONTS.base, color: COLORS.slate700, fontStyle: 'italic' },

  // AI Response
  responseBox: {
    backgroundColor: COLORS.brand50,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1, borderColor: COLORS.brand200,
  },
  responseHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  responseLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand600 },
  actionChip: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  actionChipText: { fontSize: 10, color: COLORS.white, fontWeight: FONTS.bold },
  responseText: { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 22 },

  // Mic area
  micArea: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  micHint: { fontSize: FONTS.sm, color: COLORS.slate400 },
  bigMicBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 6 },
      ios: { shadowColor: COLORS.brand600, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
    }),
  },
  bigMicBtnActive: { backgroundColor: '#EF4444' },
  micHintSub: { fontSize: FONTS.xs, color: COLORS.slate400, textAlign: 'center' },

  // Quick commands
  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
  },
  quickChip: {
    backgroundColor: COLORS.brand50,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.brand200,
  },
  quickChipText: {
    fontSize: FONTS.xs, color: COLORS.brand700, fontWeight: FONTS.semibold,
  },
});

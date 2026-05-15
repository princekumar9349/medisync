/**
 * VoiceAssistant.js — MEDISYNC PRIME AI
 * Continuous conversation mode, proper recording cleanup, conversational memory.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Platform, Pressable, Alert, Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../services/api';
import { COLORS, FONTS, RADIUS } from '../theme';

const SCREEN_MAP = {
  home: 'PatientDashboard', history: 'History', pillbox: 'Pillbox',
  medicines: 'Pillbox', scan: 'Scan', scanner: 'Scan', chat: 'Chat',
  profile: 'Profile', analytics: 'AnalyticsDashboard',
  notifications: 'NotificationCenter', symptoms: 'SymptomReport',
  ocr: 'OCRReview', settings: 'Profile', caregiver_settings: 'CaretakerSettings',
  privacy: 'DataPrivacySettings', calling_settings: 'CallingSettings',
};

const STATUS_CFG = {
  idle:       { label: 'Tap mic or long-press for Prime',  color: COLORS.brand600 },
  ready:      { label: 'Hold & speak anytime',              color: '#8B5CF6' },
  recording:  { label: 'Listening',                        color: '#EF4444' },
  processing: { label: 'Thinking...',                      color: '#F59E0B' },
  speaking:   { label: 'Speaking...',                      color: '#10B981' },
  error:      { label: 'Error — try again',                color: COLORS.slate500 },
};

// Stop words to exit Prime Mode
const STOP_WORDS = ['stop', 'band karo', 'bas', 'exit', 'quit', 'bnd karo', 'ruk jao'];

// ── MODULE-LEVEL SINGLETON ────────────────────────────────────────────────────
// Persists across hot-reloads so the native expo-av recording session
// is never orphaned (fixes "Only one Recording object can be prepared").
let _gRec = null;          // the one and only Audio.Recording instance
let _gBusy = false;        // lock: prevents concurrent createAsync calls

async function _globalUnload() {
  _gBusy = false;
  if (_gRec) {
    try { await _gRec.stopAndUnloadAsync(); } catch (_e) { /* ignore */ }
    _gRec = null;
  }
  try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_e) { /* ignore */ }
}

export default function VoiceAssistant({ navigationRef }) {
  const [visible,       setVisible]       = useState(false);
  const [status,        setStatus]        = useState('idle');
  const [primeMode,     setPrimeMode]     = useState(false);
  const [transcript,    setTranscript]    = useState('');
  const [aiResponse,    setAiResponse]    = useState('');
  const [lastAction,    setLastAction]    = useState('');
  const [history,       setHistory]       = useState([]);
  const [recordSecs,    setRecordSecs]    = useState(0);  // recording timer

  const recordingReady = useRef(false);
  const pressStart     = useRef(0);
  const timerRef       = useRef(null);
  const primeModeRef   = useRef(false);
  const isSpeaking     = useRef(false);

  // Animations
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const wave0 = useRef(new Animated.Value(0.3)).current;
  const wave1 = useRef(new Animated.Value(0.3)).current;
  const wave2 = useRef(new Animated.Value(0.3)).current;
  const wave3 = useRef(new Animated.Value(0.3)).current;
  const wave4 = useRef(new Animated.Value(0.3)).current;
  const waveAnims = [wave0, wave1, wave2, wave3, wave4];

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
    waveAnims.forEach(function(anim, i) {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(anim, { toValue: 1,   duration: 220, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 220, useNativeDriver: true }),
      ])).start();
    });
  }, []);

  const stopWave = useCallback(() => {
    waveAnims.forEach(function(a) {
      a.stopAnimation();
      Animated.timing(a, { toValue: 0.3, duration: 100, useNativeDriver: true }).start();
    });
  }, []);

  async function getToken() {
    try { return await AsyncStorage.getItem('medisync_token'); }
    catch (_e) { return null; }
  }

  // ── Timer helpers ──────────────────────────────────────────────────────────
  function startTimer() {
    setRecordSecs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(function() {
      setRecordSecs(function(s) { return s + 1; });
    }, 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecordSecs(0);
  }

  // ── Start a single recording session (uses global singleton) ─────────────────
  async function startRecording() {
    if (_gBusy) return;   // already starting or recording
    if (recordingReady.current) return;
    _gBusy = true;

    // Always unload native session first
    await _globalUnload();
    _gBusy = true; // re-set after unload resets it

    try {
      var perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        _gBusy = false;
        setStatus('error');
        setAiResponse('Mic permission nahi mili.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      var result = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      _gRec = result.recording;
      _gBusy = false;
      recordingReady.current = true;
      pressStart.current = Date.now();
      setStatus('recording');
      startTimer();
      startPulse();
      startWave();
    } catch (e) {
      console.error('[PrimeAI] Start error:', e && e.message ? e.message : String(e));
      _gBusy = false;
      recordingReady.current = false;
      setStatus('error');
      setAiResponse('Mic shuru nahi ho paya. Dobara try karein.');
    }
  }

  // ── Stop and send to backend ──────────────────────────────────────────
  async function stopAndProcess() {
    stopPulse();
    stopWave();
    stopTimer();

    if (!recordingReady.current || !_gRec) {
      setStatus(primeModeRef.current ? 'ready' : 'idle');
      return;
    }

    var elapsed = Date.now() - pressStart.current;
    recordingReady.current = false;
    var rec = _gRec;
    _gRec = null;

    if (elapsed < 700) {
      try { await rec.stopAndUnloadAsync(); } catch (_e) { /* ignore */ }
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_e2) { /* ignore */ }
      setStatus(primeModeRef.current ? 'ready' : 'idle');
      setAiResponse('Thoda aur boliye ('+elapsed+'ms)...');
      return;
    }

    setStatus('processing');

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      var uri = rec.getURI();
      if (!uri) {
        setStatus('error');
        setAiResponse('Audio capture nahi hua.');
        return;
      }

      var token = await getToken();
      if (!token) {
        setStatus('error');
        setAiResponse('Pehle login karein.');
        return;
      }

      var form = new FormData();
      form.append('audio', { uri: uri, name: 'voice.m4a', type: 'audio/m4a' });
      // Send last 4 exchanges as conversation history
      form.append('history', JSON.stringify(history.slice(-4)));

      var resp = await fetch(API_BASE + '/voice-ai/process', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
      });

      if (!resp.ok) {
        var errText = await resp.text();
        console.warn('[PrimeAI] Backend:', resp.status, errText);
        setStatus('error');
        setAiResponse('Backend error ' + resp.status);
        return;
      }

      var action = await resp.json();
      console.log('[PrimeAI]', action.action, '| conf:', action.confidence, '|', action.transcript);

      var tx = action.transcript || '';
      var rx = action.response  || '';

      setTranscript(tx);
      setAiResponse(rx);
      setLastAction(action.action || '');

      // Check stop words
      var lowerTx = tx.toLowerCase();
      var shouldStop = STOP_WORDS.some(function(w) { return lowerTx.indexOf(w) !== -1; });
      if (shouldStop) {
        exitPrimeMode();
        return;
      }

      // Update conversational memory
      if (tx || rx) {
        setHistory(function(prev) {
          return prev.concat([{ user: tx, assistant: rx }]).slice(-6);
        });
      }

      // Execute app action
      executeAction(action);

      // Speak + auto-restart in Prime Mode
      if (rx) {
        setStatus('speaking');
        isSpeaking.current = true;
        Speech.speak(rx, {
          language: 'hi-IN',
          rate: 0.9,
          onDone: function() {
            isSpeaking.current = false;
            if (primeModeRef.current) {
              // Auto-restart listening after speaking
              setTimeout(function() {
                if (primeModeRef.current) startRecording();
              }, 500);
            } else {
              setStatus('idle');
            }
          },
          onStopped: function() { isSpeaking.current = false; setStatus(primeModeRef.current ? 'ready' : 'idle'); },
          onError:   function() { isSpeaking.current = false; setStatus(primeModeRef.current ? 'ready' : 'idle'); },
        });
      } else {
        if (primeModeRef.current) {
          setTimeout(function() { if (primeModeRef.current) startRecording(); }, 500);
        } else {
          setStatus('idle');
        }
      }

    } catch (e) {
      console.error('[PrimeAI] Process error:', e && e.message ? e.message : String(e));
      setStatus('error');
      setAiResponse('Kuch galat hua. Dobara try karein.');
    }
  }

  // ── Enter Prime Mode (continuous conversation) ────────────────────────────────
  async function enterPrimeMode() {
    primeModeRef.current = true;
    setPrimeMode(true);
    setVisible(true);
    setHistory([]);
    setTranscript('');
    setAiResponse('');
    setStatus('ready');
    // Greet and start listening
    Speech.speak('Medisync Prime AI active hai. Boliye!', {
      language: 'hi-IN',
      rate: 0.9,
      onDone: function() { if (primeModeRef.current) startRecording(); },
    });
  }

  // ── Exit Prime Mode ─────────────────────────────────────────────
  function exitPrimeMode() {
    primeModeRef.current = false;
    setPrimeMode(false);
    setStatus('idle');
    stopTimer();
    recordingReady.current = false;
    _globalUnload();
    Speech.stop();
    Speech.speak('Prime Mode band kiya. Alvida!', { language: 'hi-IN', rate: 0.9 });
  }

  // ── Execute action ────────────────────────────────────────────────────────────
  function executeAction(action) {
    var act = action.action;
    var nav = navigationRef && navigationRef.current;

    if (act === 'navigate_screen' && action.screen && nav) {
      var screen = SCREEN_MAP[action.screen] || action.screen;
      try { setTimeout(function() { nav.navigate(screen); }, 800); } catch (_e) { /* ignore */ }
      return;
    }
    if (act === 'emergency_alert' || act === 'sos_mode') {
      try { setTimeout(function() { nav && nav.navigate('Emergency'); }, 300); } catch (_e) { /* ignore */ }
      return;
    }
    if (act === 'open_chat' || act === 'send_chat_message') {
      var msg = action.payload && action.payload.message ? action.payload.message : '';
      try { setTimeout(function() { nav && nav.navigate('Chat', { prefillMessage: msg }); }, 800); } catch (_e) { /* ignore */ }
      return;
    }
    if (act === 'open_slot' && action.slot) {
      setTimeout(function() { Alert.alert('Pillbox', 'Slot ' + action.slot + ' open ho raha hai!'); }, 500);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  async function handlePressIn() {
    if (primeMode) return; // Prime mode handles its own flow
    if (isStarting.current || recordingReady.current) return;
    setVisible(true);
    setTranscript('');
    setAiResponse('');
    setLastAction('');
    await startRecording();
  }

  async function handlePressOut() {
    if (primeMode) return;
    stopPulse();
    stopWave();
    await stopAndProcess();
  }

  // ── UI vars ───────────────────────────────────────────────────────────────────
  var isRecording = status === 'recording';
  var statusInfo  = STATUS_CFG[status] || STATUS_CFG.idle;

  return (
    <>
      {/* Floating button */}
      <View style={sty.floatWrap} pointerEvents="box-none">
        {isRecording && (
          <>
            <Animated.View style={[sty.pulseOuter, { transform: [{ scale: pulseAnim2 }] }]} />
            <Animated.View style={[sty.pulseInner, { transform: [{ scale: pulseAnim  }] }]} />
          </>
        )}
        {primeMode && !isRecording && (
          <View style={sty.primeBadge}><Text style={sty.primeBadgeTxt}>PRIME</Text></View>
        )}
        <Pressable
          style={[sty.micBtn, isRecording && sty.micBtnRec, primeMode && !isRecording && sty.micBtnPrime]}
          onPressIn={primeMode ? undefined : handlePressIn}
          onPressOut={primeMode ? undefined : handlePressOut}
          onPress={primeMode ? function() { setVisible(true); } : undefined}
          onLongPress={primeMode ? undefined : enterPrimeMode}
          delayLongPress={600}
        >
          <Ionicons
            name={primeMode ? 'radio' : (isRecording ? 'mic' : 'mic-outline')}
            size={26} color="#fff"
          />
        </Pressable>
      </View>

      {/* Voice Panel */}
      <Modal visible={visible} transparent animationType="slide"
        onRequestClose={function() { Speech.stop(); setVisible(false); if (!primeMode) setStatus('idle'); }}
      >
        <Pressable style={sty.backdrop}
          onPress={function() { if (!primeMode) { Speech.stop(); setVisible(false); setStatus('idle'); } }}
        >
          <Pressable style={sty.panel} onPress={function() {}}>

            {/* Header */}
            <View style={sty.row}>
              <View style={[sty.coreDot, primeMode && { backgroundColor: '#8B5CF6' }]} />
              <Text style={sty.panelTitle}>
                MEDISYNC {primeMode ? 'PRIME' : 'CORE'} AI
              </Text>
              {primeMode ? (
                <TouchableOpacity onPress={exitPrimeMode} style={sty.exitBtn}>
                  <Text style={sty.exitTxt}>EXIT</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={function() { Speech.stop(); setVisible(false); setStatus('idle'); }}>
                  <Ionicons name="close-circle" size={24} color={COLORS.slate400} />
                </TouchableOpacity>
              )}
            </View>

            {/* Status badge */}
            <View style={[sty.badge, { backgroundColor: statusInfo.color + '18', borderColor: statusInfo.color + '55' }]}>
              <View style={[sty.badgeDot, { backgroundColor: statusInfo.color }]} />
              <Text style={[sty.badgeTxt, { color: statusInfo.color }]}>
                {isRecording
                  ? 'Listening  ●  0:' + (recordSecs < 10 ? '0' + recordSecs : recordSecs)
                  : statusInfo.label}
              </Text>
            </View>

            {/* Waveform */}
            <View style={sty.waveRow}>
              {waveAnims.map(function(anim, i) {
                return (
                  <Animated.View key={i} style={[sty.waveBar, {
                    transform: [{ scaleY: anim }],
                    backgroundColor: isRecording ? '#EF4444BB' : (primeMode ? '#8B5CF6AA' : statusInfo.color + '88'),
                  }]} />
                );
              })}
            </View>

            {/* Conversation history in Prime Mode */}
            {primeMode && history.length > 0 && (
              <View style={sty.historyBox}>
                {history.slice(-2).map(function(h, i) {
                  return (
                    <View key={i} style={sty.historyItem}>
                      <Text style={sty.historyUser}>You: {h.user}</Text>
                      <Text style={sty.historyAI}>AI: {h.assistant}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Current transcript */}
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
                  <Ionicons name="sparkles" size={13} color={primeMode ? '#8B5CF6' : COLORS.brand600} />
                  <Text style={[sty.responseLbl, primeMode && { color: '#8B5CF6' }]}> PRIME AI</Text>
                  {lastAction !== '' && (
                    <View style={[sty.chip, primeMode && { backgroundColor: '#8B5CF6' }]}>
                      <Text style={sty.chipTxt}>{lastAction}</Text>
                    </View>
                  )}
                </View>
                <Text style={sty.responseTxt}>{aiResponse}</Text>
              </View>
            )}

            {/* Mic area */}
            <View style={sty.micArea}>
              {primeMode ? (
                <>
                  <Text style={sty.hint}>
                    {isRecording ? '🔴 Release to send' : status === 'speaking' ? '🟢 Speaking...' : '🟣 Hold & speak'}
                  </Text>
                  <Pressable
                    style={[sty.bigMic, isRecording && sty.bigMicRec, !isRecording && sty.bigMicPrime]}
                    onPressIn={startRecording}
                    onPressOut={stopAndProcess}
                  >
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <Ionicons name={isRecording ? 'mic' : 'radio'} size={40} color="#fff" />
                    </Animated.View>
                  </Pressable>
                  <Text style={sty.hintSub}>Auto-listens after each response</Text>
                </>
              ) : (
                <>
                  <Text style={sty.hint}>{isRecording ? '🔴 Release to send' : 'Hold & speak'}</Text>
                  <Pressable
                    style={[sty.bigMic, isRecording && sty.bigMicRec]}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                  >
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={40} color="#fff" />
                    </Animated.View>
                  </Pressable>
                  <Text style={sty.hintSub}>Long-press floating button for Prime Mode</Text>
                </>
              )}
            </View>

            {/* Quick commands (only in normal mode) */}
            {!primeMode && (
              <View style={sty.quickRow}>
                {['Medicines dikhao', 'Analytics kholo', 'Emergency', 'Slot 1 kholo'].map(function(cmd) {
                  return (
                    <TouchableOpacity key={cmd} style={sty.quickChip}
                      onPress={function() { Speech.speak(cmd, { language: 'hi-IN' }); }}
                    >
                      <Text style={sty.quickTxt}>{cmd}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

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
  primeBadge: {
    position: 'absolute', top: -10,
    backgroundColor: '#8B5CF6', borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  primeBadgeTxt: { fontSize: 8, color: '#fff', fontWeight: 'bold' },
  micBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 8 },
      ios: { shadowColor: '#1e40af', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  micBtnRec:   { backgroundColor: '#EF4444' },
  micBtnPrime: { backgroundColor: '#8B5CF6' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 38, gap: 12,
  },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coreDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.brand600 },
  panelTitle:{ flex: 1, fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800, letterSpacing: 1.3 },
  exitBtn:   { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  exitTxt:   { fontSize: FONTS.xs, color: '#fff', fontWeight: FONTS.bold },
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeTxt: { fontSize: FONTS.sm, fontWeight: FONTS.semibold },
  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 38 },
  waveBar: { width: 5, height: 28, borderRadius: 3 },
  historyBox: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 10, gap: 6, maxHeight: 100 },
  historyItem:{ gap: 2 },
  historyUser:{ fontSize: 11, color: COLORS.slate500, fontStyle: 'italic' },
  historyAI:  { fontSize: 11, color: '#7C3AED', fontStyle: 'italic' },
  transcriptBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  transcriptLbl: { fontSize: FONTS.xs, color: COLORS.slate400, fontWeight: FONTS.semibold, marginBottom: 2 },
  transcriptTxt: { fontSize: FONTS.base, color: COLORS.slate700, fontStyle: 'italic' },
  responseBox: { backgroundColor: COLORS.brand50, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.brand200 },
  responseLbl: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand600, flex: 1 },
  chip:        { backgroundColor: COLORS.brand600, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  chipTxt:     { fontSize: 10, color: '#fff', fontWeight: FONTS.bold },
  responseTxt: { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 22, marginTop: 4 },
  micArea: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  hint:    { fontSize: FONTS.sm, color: COLORS.slate500, fontWeight: FONTS.medium },
  hintSub: { fontSize: FONTS.xs, color: COLORS.slate400, textAlign: 'center' },
  bigMic: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 6 },
      ios: { shadowColor: '#1e40af', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
    }),
  },
  bigMicRec:   { backgroundColor: '#EF4444' },
  bigMicPrime: { backgroundColor: '#8B5CF6' },
  quickRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  quickChip: { backgroundColor: COLORS.brand50, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.brand200 },
  quickTxt:  { fontSize: FONTS.xs, color: COLORS.brand700, fontWeight: FONTS.semibold },
});

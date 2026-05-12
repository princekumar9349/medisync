/**
 * ChatScreen.js — Premium Healthcare Chat (AI + Doctor)
 * Uses: AppHeader (branded), parseAIResponse (safe parser), TTS voice
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import AppHeader, { AppHeaderBtn } from '../../components/AppHeader';
import parseAIResponse from '../../utils/parseAIResponse';
import { apiChat, apiSendDoctorMessage, apiGetDoctorMessages } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';

// ─── Markdown-lite (bold **text**) ───────────────────────────────────────────
function RichText({ text, style }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <Text key={i} style={{ fontWeight: 'bold' }}>{p.slice(2, -2)}</Text>
          : <Text key={i}>{p}</Text>
      )}
    </Text>
  );
}

// ─── Typing animation ─────────────────────────────────────────────────────────
function TypingDots() {
  const anims = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const a = anims.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(d, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay(380),
    ])));
    a.forEach(x => x.start());
    return () => a.forEach(x => x.stop());
  }, []);
  return (
    <View style={sty.typingRow}>
      {anims.map((d, i) => (
        <Animated.View key={i} style={[sty.dot, { transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
      ))}
    </View>
  );
}

// ─── TTS speaker — singleton prevents overlap ─────────────────────────────────
let _sid = null;
function SpeakerBtn({ id, text, lang }) {
  const [on, setOn] = useState(false);
  function toggle() {
    if (on) { Speech.stop(); setOn(false); _sid = null; return; }
    if (_sid) Speech.stop();
    _sid = id; setOn(true);
    Speech.speak(String(text).replace(/\*\*/g, ''), {
      language: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.87,
      onDone: () => { setOn(false); _sid = null; },
      onStopped: () => { setOn(false); _sid = null; },
      onError: () => { setOn(false); _sid = null; },
    });
  }
  return (
    <TouchableOpacity onPress={toggle} style={sty.speaker} activeOpacity={0.75}>
      <Ionicons name={on ? 'stop-circle' : 'volume-medium-outline'} size={15}
        color={on ? COLORS.red500 : COLORS.slate400} />
    </TouchableOpacity>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function Bubble({ m, lang }) {
  const isUser   = m.role === 'user';
  const isDoctor = m.role === 'doctor';
  const isSys    = m.role === 'system';
  const isAlert  = m.type === 'alert';
  const ts = m.ts ? new Date(m.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

  if (isAlert) return (
    <View style={sty.alertCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Ionicons name="warning" size={17} color={COLORS.red600} />
        <Text style={sty.alertTitle}>Medical Alert</Text>
      </View>
      <RichText text={m.text} style={sty.alertBody} />
    </View>
  );

  if (isSys) return (
    <View style={sty.sysRow}>
      <View style={sty.sysPill}><Text style={sty.sysTxt}>{m.text}</Text></View>
    </View>
  );

  return (
    <View style={[sty.row, isUser && sty.rowUser, { marginBottom: 10 }]}>
      {!isUser && (
        <View style={[sty.avatar, isDoctor && sty.avatarDoc]}>
          <Ionicons name={isDoctor ? 'medical' : 'sparkles'} size={13}
            color={isDoctor ? COLORS.white : COLORS.brand600} />
        </View>
      )}
      <View style={{ maxWidth: '76%' }}>
        {!isUser && (
          <Text style={[sty.senderLbl, isDoctor && { color: COLORS.brand700 }]}>
            {isDoctor ? 'Dr. MediSync' : 'AI Assistant'}
          </Text>
        )}
        <View style={[sty.bubble, isUser ? sty.bUser : isDoctor ? sty.bDoc : sty.bAI]}>
          <RichText text={m.text}
            style={[sty.bTxt, (isUser || isDoctor) && { color: COLORS.white }]} />
        </View>
        {!isUser && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <SpeakerBtn id={m.id} text={m.text} lang={lang} />
            {ts ? <Text style={sty.tsLbl}>{ts}</Text> : null}
          </View>
        )}
        {isUser && ts ? <Text style={[sty.tsLbl, { textAlign: 'right', marginTop: 3 }]}>{ts}</Text> : null}
      </View>
    </View>
  );
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
const QUICK_EN = ['What medicines am I on?', 'I missed my dose — what now?', 'Is it safe to skip a day?'];
const QUICK_HI = ['मुझे क्या दवा लेनी है?', 'दवा भूल गया — क्या करूँ?', 'क्या एक दिन छोड़ना ठीक है?'];

function AIPane({ lang }) {
  const welcome = {
    id: 'w0', role: 'ai', ts: new Date().toISOString(),
    text: lang === 'hi'
      ? 'नमस्ते! मैं MediSync का AI स्वास्थ्य सहायक हूँ। दवाओं, लक्षणों या स्वास्थ्य संबंधी कुछ भी पूछें।'
      : "Hello! I'm your MediSync AI health assistant. Ask me about your medicines, symptoms, or health guidance.",
  };
  const [msgs, setMsgs] = useState([welcome]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const uid = useRef(1);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80); }, [msgs, busy]);

  async function send(override) {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setMsgs(p => [...p, { id: `u${uid.current++}`, role: 'user', ts: new Date().toISOString(), text }]);
    setBusy(true);
    try {
      const raw = await apiChat(text, lang, {});
      const reply = parseAIResponse(raw,
        lang === 'hi' ? 'माफ करें, अभी जवाब देना संभव नहीं है।' : "Sorry, I couldn't generate a response right now."
      );
      setMsgs(p => [...p, { id: `a${uid.current++}`, role: 'ai', ts: new Date().toISOString(), text: reply }]);
    } catch {
      setMsgs(p => [...p, {
        id: `e${uid.current++}`, role: 'ai', ts: new Date().toISOString(),
        text: lang === 'hi' ? 'एक त्रुटि हुई। कृपया पुनः प्रयास करें।' : 'Something went wrong. Please try again in a moment.',
      }]);
    } finally { setBusy(false); }
  }

  const QUICK = lang === 'hi' ? QUICK_HI : QUICK_EN;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={120}>
      <ScrollView ref={scrollRef} style={sty.list} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {msgs.map(m => <Bubble key={m.id} m={m} lang={lang} />)}
        {busy && (
          <View style={sty.row}>
            <View style={sty.avatar}><Ionicons name="sparkles" size={13} color={COLORS.brand600} /></View>
            <View style={sty.bAI}><TypingDots /></View>
          </View>
        )}
      </ScrollView>

      {msgs.length <= 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ paddingHorizontal: SPACING.lg, paddingBottom: 8, maxHeight: 46 }}>
          {QUICK.map((q, i) => (
            <TouchableOpacity key={i} style={sty.quick} onPress={() => send(q)} activeOpacity={0.8}>
              <Text style={sty.quickTxt}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={sty.bar}>
        <TextInput style={sty.inp} value={input} onChangeText={setInput}
          placeholder={lang === 'hi' ? 'स्वास्थ्य प्रश्न पूछें…' : 'Ask a health question…'}
          placeholderTextColor={COLORS.slate400} onSubmitEditing={() => send()}
          returnKeyType="send" editable={!busy} multiline />
        <TouchableOpacity style={[sty.sendBtn, { opacity: (!input.trim() || busy) ? 0.38 : 1 }]}
          onPress={() => send()} disabled={!input.trim() || busy} activeOpacity={0.85}>
          {busy ? <ActivityIndicator size="small" color={COLORS.white} />
                : <Ionicons name="send" size={16} color={COLORS.white} style={{ marginLeft: 2 }} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Doctor Chat ──────────────────────────────────────────────────────────────
function DoctorPane({ lang, onRegisterRefresh }) {
  const [msgs,    setMsgs]    = useState([]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState(null);
  const scrollRef = useRef(null);
  const pollRef   = useRef(null);

  const fetchMsgs = useCallback(async () => {
    try {
      const data = await apiGetDoctorMessages();
      setMsgs(data.messages || []);
      setError(null);
    } catch { setError('Could not load messages.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchMsgs();
    onRegisterRefresh?.(fetchMsgs);
    pollRef.current = setInterval(fetchMsgs, 15000);
    return () => clearInterval(pollRef.current);
  }, [fetchMsgs]);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setSending(true);
    try {
      const data = await apiSendDoctorMessage(text);
      setMsgs(data.messages || []);
    } catch { setError('Failed to send.'); }
    finally { setSending(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={120}>
      {/* Secure banner */}
      <View style={sty.secureBanner}>
        <View style={sty.secureDot} />
        <Text style={sty.secureText}>End-to-end secure · MediSync Doctor Network</Text>
      </View>

      <ScrollView ref={scrollRef} style={sty.list} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {loading && <View style={[S.center, { paddingVertical: 60 }]}><ActivityIndicator color={COLORS.brand600} /><Text style={sty.loadingTxt}>Loading messages…</Text></View>}

        {error && !loading && (
          <View style={sty.errCard}>
            <Ionicons name="wifi-outline" size={24} color={COLORS.amber600} />
            <Text style={sty.errTxt}>{error}</Text>
            <TouchableOpacity style={sty.retryBtn} onPress={fetchMsgs}>
              <Text style={{ color: COLORS.brand600, fontWeight: FONTS.bold, fontSize: FONTS.sm }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && msgs.length === 0 && (
          <View style={[S.center, { paddingVertical: 60 }]}>
            <View style={sty.emptyIcon}><Ionicons name="chatbubbles-outline" size={36} color={COLORS.brand400} /></View>
            <Text style={sty.emptyTitle}>No messages yet</Text>
            <Text style={sty.emptyDesc}>Send a message below. Your doctor will respond here.</Text>
          </View>
        )}

        {!loading && msgs.map((m, i) => {
          const role = m.sender === 'user' ? 'user' : m.sender === 'system' ? 'system' : 'doctor';
          return <Bubble key={m.id || i} m={{ ...m, role, text: m.message, ts: m.timestamp }} lang={lang} />;
        })}
      </ScrollView>

      <View style={sty.bar}>
        <TextInput style={sty.inp} value={input} onChangeText={setInput}
          placeholder={lang === 'hi' ? 'डॉक्टर को संदेश…' : 'Message your doctor…'}
          placeholderTextColor={COLORS.slate400} onSubmitEditing={send}
          returnKeyType="send" editable={!sending} multiline />
        <TouchableOpacity style={[sty.sendBtn, { opacity: (!input.trim() || sending) ? 0.38 : 1 }]}
          onPress={send} disabled={!input.trim() || sending} activeOpacity={0.85}>
          {sending ? <ActivityIndicator size="small" color={COLORS.white} />
                   : <Ionicons name="send" size={16} color={COLORS.white} style={{ marginLeft: 2 }} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function ChatScreen({ route, navigation }) {
  const lang = route?.params?.language === 'HI' ? 'hi' : 'en';
  const [tab, setTab] = useState('ai');
  const doctorRefreshRef = useRef(null);

  useEffect(() => {
    const unsub = navigation?.addListener?.('blur', () => { Speech.stop(); _sid = null; });
    return unsub;
  }, [navigation]);

  const headerRight = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {tab === 'doctor' && (
        <AppHeaderBtn icon="refresh-outline" onPress={() => doctorRefreshRef.current?.()} />
      )}
    </View>
  );

  return (
    <View style={S.screen}>
      <AppHeader
        title={tab === 'ai' ? 'AI Assistant' : 'Doctor Chat'}
        subtitle={tab === 'ai' ? 'MediSync · Powered by Gemini' : 'Secure Healthcare Messaging'}
        right={headerRight}
      />

      {/* Tab bar */}
      <View style={sty.tabs}>
        {[{ id: 'ai', icon: 'sparkles', label: 'AI Assistant' }, { id: 'doctor', icon: 'medical', label: 'Doctor Chat' }].map(t => (
          <TouchableOpacity key={t.id} style={[sty.tab, tab === t.id && sty.tabOn]} onPress={() => setTab(t.id)} activeOpacity={0.8}>
            <Ionicons name={t.icon} size={15} color={tab === t.id ? COLORS.brand600 : COLORS.slate400} />
            <Text style={[sty.tabLbl, tab === t.id && sty.tabLblOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'ai'
        ? <AIPane lang={lang} />
        : <DoctorPane lang={lang} onRegisterRefresh={fn => { doctorRefreshRef.current = fn; }} />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  tabs:    { flexDirection: 'row', backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn:   { borderBottomColor: COLORS.brand600 },
  tabLbl:  { fontSize: FONTS.sm, fontWeight: FONTS.medium, color: COLORS.slate400 },
  tabLblOn:{ color: COLORS.brand600, fontWeight: FONTS.bold },

  list:    { flex: 1, backgroundColor: '#F7F9FC' },
  row:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowUser: { justifyContent: 'flex-end' },

  avatar:    { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  avatarDoc: { backgroundColor: COLORS.brand600, borderColor: COLORS.brand700 },
  senderLbl: { fontSize: 10, fontWeight: FONTS.bold, color: COLORS.slate400, marginBottom: 3, marginLeft: 2 },

  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  bUser:  { backgroundColor: COLORS.brand600, borderBottomRightRadius: 4 },
  bDoc:   { backgroundColor: COLORS.brand700, borderBottomLeftRadius: 4 },
  bAI:    { backgroundColor: COLORS.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  bTxt:   { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 22 },

  alertCard:  { backgroundColor: COLORS.red50, borderWidth: 1.5, borderColor: COLORS.red200, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md },
  alertTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.red700 },
  alertBody:  { fontSize: FONTS.sm, color: COLORS.red800, lineHeight: 20, marginTop: 2 },

  sysRow:  { alignItems: 'center', marginVertical: 8 },
  sysPill: { backgroundColor: COLORS.slate100, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 5 },
  sysTxt:  { fontSize: FONTS.xs, color: COLORS.slate500, fontStyle: 'italic' },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.brand400 },
  speaker:   { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center' },
  tsLbl:     { fontSize: 10, color: COLORS.slate400 },

  bar:     { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: SPACING.lg, paddingBottom: Platform.OS === 'ios' ? 28 : SPACING.lg, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border },
  inp:     { flex: 1, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: COLORS.border, borderRadius: 22, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: FONTS.base, color: COLORS.slate800, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center' },

  quick:    { backgroundColor: COLORS.brand50, borderWidth: 1, borderColor: COLORS.brand200, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  quickTxt: { fontSize: FONTS.sm, color: COLORS.brand700, fontWeight: FONTS.medium },

  secureBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, backgroundColor: COLORS.emerald50, borderBottomWidth: 1, borderBottomColor: COLORS.emerald100 },
  secureDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.emerald500 },
  secureText:   { fontSize: FONTS.xs, color: COLORS.emerald700, fontWeight: FONTS.semibold },

  loadingTxt: { color: COLORS.slate400, marginTop: 12, fontSize: FONTS.sm },
  errCard:    { alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.amber50, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#FDE68A', margin: SPACING.lg },
  errTxt:     { color: COLORS.amber800, fontSize: FONTS.sm, marginTop: 8, textAlign: 'center' },
  retryBtn:   { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: COLORS.white, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.brand200 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800, marginBottom: 6 },
  emptyDesc:  { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
});

/**
 * screens/patient/DoctorChatScreen.js — Premium telehealth chat UI
 * Teal patient theme | Date separators | Timestamps | Auto-scroll
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiGetDoctorMessages, apiSendDoctorMessage } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

const TEAL  = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const INDIGO = '#4338CA';

// ─── Date separator ──────────────────────────────────────────────────────────
function dateSep(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeStr(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ─── Add date separators to message list ────────────────────────────────────
function withSeparators(messages) {
  const items = [];
  let lastSep = '';
  messages.forEach((msg, i) => {
    const sep = dateSep(msg.timestamp);
    if (sep !== lastSep) {
      items.push({ type: 'sep', id: `sep-${i}`, label: sep });
      lastSep = sep;
    }
    items.push({ type: 'msg', ...msg, id: msg.id || String(i) });
  });
  return items;
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function Bubble({ item }) {
  if (item.type === 'sep') {
    return (
      <View style={s.sepRow}>
        <View style={s.sepLine} />
        <Text style={s.sepText}>{item.label}</Text>
        <View style={s.sepLine} />
      </View>
    );
  }

  const isUser = item.sender === 'user';
  const isDoc  = item.sender === 'doctor';
  const isSys  = item.sender === 'system';

  if (isSys) {
    return (
      <View style={s.sysWrap}>
        <View style={s.sysBubble}>
          <Text style={s.sysIcon}>⚠️</Text>
          <Text style={s.sysText}>{item.message}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.row, isUser ? s.rowRight : s.rowLeft]}>
      {isDoc && (
        <View style={s.docAvatar}>
          <Ionicons name="medical" size={14} color={INDIGO} />
        </View>
      )}
      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleDoc]}>
        {isDoc && <Text style={s.senderLabel}>Dr. Your Doctor</Text>}
        <Text style={[s.bubbleText, isUser ? s.bubbleTextUser : s.bubbleTextDoc]}>
          {item.message}
        </Text>
        <Text style={[s.ts, isUser ? s.tsUser : s.tsDoc]}>{timeStr(item.timestamp)}</Text>
      </View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DoctorChatScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    try {
      const data = await apiGetDoctorMessages(100, 0);
      setMessages(data.messages || []);
    } catch {}
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 10000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages.length]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    // Optimistic update
    const optimistic = { id: `opt-${Date.now()}`, sender: 'user', message: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    try {
      const data = await apiSendDoctorMessage(text);
      setMessages(data.messages || []);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  const items = withSeparators(messages);

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={TEAL} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: TEAL }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Clinic Inbox</Text>
            <Text style={s.headerSub}>Your doctor · Read-Only mode for caretaker</Text>
          </View>
          <View style={s.onlineDot} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={TEAL} />
            <Text style={s.loaderText}>Loading messages…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <Bubble item={item} />}
            contentContainerStyle={s.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={52} color={COLORS.slate200} />
                <Text style={s.emptyTitle}>No messages yet</Text>
                <Text style={s.emptySub}>Send your first message to your doctor below.</Text>
              </View>
            }
          />
        )}

        <SafeAreaView edges={['bottom']} style={s.inputSafe}>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Message your doctor…"
              placeholderTextColor={COLORS.slate400}
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              activeOpacity={0.85}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
          <Text style={s.disclaimer}>Messages are securely stored and visible to your assigned doctor.</Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: '#F8FFFE' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub:  { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  onlineDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34D399', borderWidth: 2, borderColor: '#fff' },

  loader:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { fontSize: 14, color: COLORS.slate400 },

  list:       { padding: 16, paddingBottom: 8, flexGrow: 1 },

  sepRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  sepLine:    { flex: 1, height: 1, backgroundColor: COLORS.slate200 },
  sepText:    { fontSize: 11, fontWeight: '700', color: COLORS.slate400, textTransform: 'uppercase', letterSpacing: 0.5 },

  row:        { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end' },
  rowRight:   { justifyContent: 'flex-end' },
  rowLeft:    { justifyContent: 'flex-start' },

  docAvatar:  { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 2 },

  bubble:       { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser:   { backgroundColor: TEAL, borderBottomRightRadius: 4 },
  bubbleDoc:    { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  bubbleText:   { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextDoc:  { color: COLORS.slate800 },
  senderLabel:  { fontSize: 10, fontWeight: '800', color: INDIGO, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  ts:           { fontSize: 10, marginTop: 4 },
  tsUser:       { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  tsDoc:        { color: COLORS.slate400 },

  sysWrap:    { alignItems: 'center', marginVertical: 8 },
  sysBubble:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 14, padding: 12, maxWidth: '90%' },
  sysIcon:    { fontSize: 16 },
  sysText:    { fontSize: 13, color: '#92400E', flex: 1, lineHeight: 19, fontStyle: 'italic' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, minHeight: 300 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.slate600 },
  emptySub:   { fontSize: 14, color: COLORS.slate400, textAlign: 'center', lineHeight: 21 },

  inputSafe:  { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  inputRow:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 10 },
  input:      { flex: 1, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: 24, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 9, maxHeight: 120, fontSize: 15, color: COLORS.slate800 },
  sendBtn:    { width: 46, height: 46, borderRadius: 23, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.slate300 },
  disclaimer: { fontSize: 10, color: COLORS.slate400, textAlign: 'center', paddingBottom: 6 },
});

/**
 * screens/doctor/DoctorPatientChatScreen.js
 * Doctor replies to a specific patient — indigo clinical theme
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiDoctorSendReply, apiDoctorGetPatientThread, apiMarkDoctorMessagesSeen } from '../../services/api';
import { COLORS, FONTS, SPACING } from '../../theme';

const INDIGO = '#4338CA';
const INDIGO_LIGHT = '#EEF2FF';

function timeStr(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function dateSep(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function withSeparators(messages) {
  const items = []; let lastSep = '';
  messages.forEach((msg, i) => {
    const sep = dateSep(msg.timestamp);
    if (sep !== lastSep) { items.push({ type: 'sep', id: `sep-${i}`, label: sep }); lastSep = sep; }
    items.push({ type: 'msg', ...msg, id: msg.id || String(i) });
  });
  return items;
}

function Bubble({ item, patientName }) {
  if (item.type === 'sep') {
    return (
      <View style={s.sepRow}>
        <View style={s.sepLine} />
        <Text style={s.sepText}>{item.label}</Text>
        <View style={s.sepLine} />
      </View>
    );
  }
  const isDoc  = item.sender === 'doctor';
  const isUser = item.sender === 'user';
  const isSys  = item.sender === 'system';

  if (isSys) {
    return (
      <View style={s.sysWrap}>
        <View style={s.sysBubble}>
          <Text style={s.sysText}>⚠️ {item.message}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.row, isDoc ? s.rowRight : s.rowLeft]}>
      {isUser && (
        <View style={s.patAvatar}>
          <Text style={s.patAvatarText}>{patientName?.[0]?.toUpperCase() || 'P'}</Text>
        </View>
      )}
      <View style={[s.bubble, isDoc ? s.bubbleDoc : s.bubblePat]}>
        {isUser && <Text style={s.patLabel}>{patientName}</Text>}
        <Text style={[s.bubbleText, isDoc ? s.textDoc : s.textPat]}>{item.message}</Text>
        <Text style={[s.ts, isDoc ? s.tsDoc : s.tsPat]}>{timeStr(item.timestamp)}</Text>
      </View>
    </View>
  );
}

export default function DoctorPatientChatScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { patientId, patientName = 'Patient', riskLevel } = route.params || {};

  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!patientId) return;
    try {
      const data = await apiDoctorGetPatientThread(patientId);
      setMessages(data.messages || []);
    } catch {}
    if (!silent) setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
    // Mark patient messages as seen immediately on open
    if (patientId) apiMarkDoctorMessagesSeen(patientId).catch(() => {});
    pollRef.current = setInterval(() => load(true), 10000);
    return () => clearInterval(pollRef.current);
  }, [load, patientId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages.length]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || !patientId) return;
    setInput('');
    setSending(true);
    const opt = { id: `opt-${Date.now()}`, sender: 'doctor', message: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    try {
      const data = await apiDoctorSendReply(patientId, text);
      setMessages(data.messages || []);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== opt.id));
    } finally {
      setSending(false);
    }
  }

  const riskColor = riskLevel === 'high' ? '#DC2626' : riskLevel === 'medium' ? '#D97706' : '#059669';
  const items = withSeparators(messages);

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={INDIGO} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: INDIGO }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={s.patientAvatar}>
            <Text style={s.patientAvatarText}>{patientName?.[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerName}>{patientName}</Text>
            <Text style={s.headerId}>ID: {patientId?.slice(-8)}</Text>
          </View>
          {riskLevel && (
            <View style={[s.riskBadge, { backgroundColor: riskColor + '33' }]}>
              <Text style={[s.riskText, { color: riskColor }]}>{riskLevel?.toUpperCase()}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={INDIGO} />
            <Text style={s.loaderText}>Loading thread…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <Bubble item={item} patientName={patientName} />}
            contentContainerStyle={s.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={52} color={COLORS.slate200} />
                <Text style={s.emptyTitle}>No messages yet</Text>
                <Text style={s.emptySub}>Start the conversation with your patient.</Text>
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
              placeholder={`Reply to ${patientName}…`}
              placeholderTextColor={COLORS.slate400}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && s.sendDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              activeOpacity={0.85}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: '#F8FAFF' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  patientAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  patientAvatarText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  headerName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerId:   { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  riskBadge:  { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  riskText:   { fontSize: 11, fontWeight: '900' },

  loader:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { fontSize: 14, color: COLORS.slate400 },
  list:       { padding: 16, paddingBottom: 8, flexGrow: 1 },

  sepRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  sepLine: { flex: 1, height: 1, backgroundColor: COLORS.slate200 },
  sepText: { fontSize: 11, fontWeight: '700', color: COLORS.slate400, textTransform: 'uppercase' },

  row:      { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end' },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft:  { justifyContent: 'flex-start' },

  patAvatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.slate100, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  patAvatarText: { fontWeight: '900', fontSize: 12, color: COLORS.slate600 },
  patLabel:  { fontSize: 10, fontWeight: '800', color: COLORS.slate400, marginBottom: 3, textTransform: 'uppercase' },

  bubble:    { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleDoc: { backgroundColor: INDIGO, borderBottomRightRadius: 4 },
  bubblePat: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
  bubbleText:{ fontSize: 15, lineHeight: 22 },
  textDoc:   { color: '#fff' },
  textPat:   { color: COLORS.slate800 },
  ts:        { fontSize: 10, marginTop: 4 },
  tsDoc:     { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  tsPat:     { color: COLORS.slate400 },

  sysWrap:   { alignItems: 'center', marginVertical: 6 },
  sysBubble: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 12, padding: 10, maxWidth: '90%' },
  sysText:   { fontSize: 12, color: '#92400E', fontStyle: 'italic' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, minHeight: 280 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.slate600 },
  emptySub:   { fontSize: 14, color: COLORS.slate400, textAlign: 'center' },

  inputSafe: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  inputRow:  { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 10 },
  input:     { flex: 1, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: 24, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 9, maxHeight: 120, fontSize: 15, color: COLORS.slate800 },
  sendBtn:   { width: 46, height: 46, borderRadius: 23, backgroundColor: INDIGO, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: COLORS.slate300 },
});

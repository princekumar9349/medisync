/**
 * screens/patient/ChatScreen.js — Dual-mode Chat
 * Business Theme Overhaul
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';

import { apiChat, apiSendDoctorMessage, apiGetDoctorMessages } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const LANG_MAP = { EN: 'en-IN', HI: 'hi-IN' };

// ─── Root Component ───────────────────────────────────────────────────────────
export default function ChatScreen({ route }) {
  const language = route?.params?.language ?? 'EN';
  const voiceOn  = route?.params?.voiceOn  ?? false;
  const currentMedicines = route?.params?.currentMedicines ?? [];

  const [activeTab, setActiveTab] = useState('ai');
  const [doctorUnread, setDoctorUnread] = useState(0);

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* Header */}
      <View style={[S.headerBackground, { paddingBottom: 60 }]}>
        <Text style={S.headerTitle}>Assistant</Text>
        <Text style={S.headerSubtitle}>Always here to help</Text>
      </View>

      <View style={[S.overlapContainer, { marginTop: -40 }]}>
        {/* Custom Tab Header */}
        <View style={styles.tabHeader}>
          {[
            { id: 'ai',     label: 'AI Assistant', icon: 'sparkles' },
            { id: 'doctor', label: 'Doctor Chat',  icon: 'medical' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon} size={18} color={activeTab === tab.id ? COLORS.brand600 : COLORS.slate400} />
              <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {tab.id === 'doctor' && doctorUnread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{doctorUnread > 9 ? '9+' : doctorUnread}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'ai' ? (
          <AIChat
            language={language}
            voiceOn={voiceOn}
            currentMedicines={currentMedicines}
            onSwitchToDoctor={() => setActiveTab('doctor')}
          />
        ) : (
          <DoctorChat
            language={language}
            onUnreadChange={setDoctorUnread}
          />
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Chat
// ═══════════════════════════════════════════════════════════════════════════════
function AIChat({ language, voiceOn, currentMedicines, onSwitchToDoctor }) {
  const [messages, setMessages] = useState([{
    role: 'ai',
    text: "Hello! I'm your Medisync assistant. Ask me anything about your prescription, medicines, or health.",
  }]);
  const [input,    setInput]    = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isTyping]);

  function addMessage(role, text, extra = {}) {
    setMessages(prev => [...prev, { role, text, ...extra }]);
  }

  function speak(text) {
    if (!voiceOn) return;
    Speech.stop();
    Speech.speak(text, { language: LANG_MAP[language] || 'en-IN', rate: 0.95 });
  }

  async function handleSend(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || isTyping) return;

    setInput('');
    addMessage('user', text);
    setIsTyping(true);

    try {
      const user_data = currentMedicines.length > 0 ? { medicines: currentMedicines } : {};
      const lang = language === 'HI' ? 'hi' : 'en';
      const res = await apiChat(text, lang, user_data);
      const reply = res.response || 'Sorry, I could not understand that.';
      const hasDoctorHint = reply.includes('Doctor') || reply.includes('doctor');
      addMessage('ai', reply, { showDoctorBtn: hasDoctorHint });
      speak(reply);
    } catch {
      addMessage('ai', language === 'HI'
        ? 'माफ़ करें, अभी जवाब देने में समस्या है।'
        : "Sorry, I'm having trouble connecting right now. Please try again.");
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={{ padding: SPACING.lg, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, i) => (
          <View key={i} style={[
            styles.msgRow,
            msg.role === 'user' ? styles.msgRowUser : styles.msgRowAI,
          ]}>
            {msg.role === 'ai' && (
              <View style={styles.avatarAI}><Ionicons name="sparkles" size={16} color={COLORS.brand600} /></View>
            )}
            <View style={[styles.msgWrap, { maxWidth: '78%' }]}>
              <View style={[
                styles.bubble,
                msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
              ]}>
                <Text style={[styles.bubbleText, msg.role === 'user' && { color: COLORS.white }]}>
                  {msg.text}
                </Text>
              </View>
              {msg.showDoctorBtn && (
                <TouchableOpacity style={styles.doctorHint} onPress={onSwitchToDoctor}>
                  <Text style={styles.doctorHintText}>Connect to Doctor</Text>
                  <Ionicons name="arrow-forward" size={14} color={COLORS.brand600} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {isTyping && (
          <View style={styles.typingRow}>
            <View style={styles.avatarAI}><Ionicons name="sparkles" size={16} color={COLORS.brand600} /></View>
            <View style={styles.typingBubble}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[styles.typingDot, { opacity: 0.4 + i * 0.2 }]} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={language === 'HI' ? 'कुछ पूछें…' : 'Ask about your medicines…'}
          placeholderTextColor={COLORS.slate400}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
          editable={!isTyping}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: (!input.trim() || isTyping) ? 0.4 : 1 }]}
          onPress={() => handleSend()}
          disabled={!input.trim() || isTyping}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={18} color={COLORS.white} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Doctor Chat
// ═══════════════════════════════════════════════════════════════════════════════
function DoctorChat({ language, onUnreadChange }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const scrollRef = useRef(null);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetDoctorMessages();
      setMessages(data.messages || []);
      onUnreadChange?.(data.unread_count || 0);
    } catch {
      setError('Could not load doctor messages.');
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => { fetchThread(); }, [fetchThread]);
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      const data = await apiSendDoctorMessage(text);
      setMessages(data.messages || []);
      onUnreadChange?.(data.unread_count || 0);
    } catch {
      setError('Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.doctorBanner}>
        <View style={styles.doctorAvatar}><Ionicons name="medical" size={18} color={COLORS.brand600} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.doctorName}>Dr. Medisync</Text>
          <Text style={styles.doctorMeta}>Secure & Private Connection</Text>
        </View>
        <TouchableOpacity onPress={fetchThread} style={styles.refreshBtn2}>
          <Ionicons name="refresh" size={18} color={COLORS.brand600} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={{ padding: SPACING.lg, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={[S.center, { paddingVertical: 40 }]}>
            <ActivityIndicator color={COLORS.brand600} />
          </View>
        )}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={{ color: COLORS.red700, fontSize: FONTS.sm, flex: 1 }}>{error}</Text>
          </View>
        )}
        {!loading && !error && messages.length === 0 && (
          <View style={[S.center, { paddingVertical: 60 }]}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.slate300} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyDesc}>Send a message to your doctor.</Text>
          </View>
        )}
        {!loading && messages.map((msg, i) => {
          const isUser = msg.sender === 'user';
          const isSys  = msg.sender === 'system';
          return (
            <View key={msg.id || i} style={[
              styles.msgRow,
              isUser ? styles.msgRowUser : isSys ? styles.msgRowCenter : styles.msgRowAI,
            ]}>
              {!isUser && !isSys && (
                <View style={styles.avatarDoc}><Ionicons name="medical" size={14} color={COLORS.white} /></View>
              )}
              <View style={[
                styles.bubble,
                isUser ? styles.bubbleUser : isSys ? styles.bubbleSys : styles.bubbleDoc,
                { maxWidth: isSys ? '90%' : '78%' },
              ]}>
                <Text style={[styles.bubbleText, (isUser || !isUser && !isSys) && { color: COLORS.white }, isSys && { color: COLORS.slate600 }]}>
                  {msg.message}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={language === 'HI' ? 'डॉक्टर को संदेश लिखें…' : 'Message your doctor…'}
          placeholderTextColor={COLORS.slate400}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: (!input.trim() || sending) ? 0.4 : 1 }]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Ionicons name="send" size={18} color={COLORS.white} style={{ marginLeft: 4 }} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabHeader: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: 4, ...SHADOW.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: RADIUS.md },
  tabBtnActive: { backgroundColor: COLORS.brand50 },
  tabLabel:       { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate500 },
  tabLabelActive: { color: COLORS.brand600 },
  unreadBadge: { position: 'absolute', top: 4, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.red500, alignItems: 'center', justifyContent: 'center' },
  unreadText:  { color: COLORS.white, fontSize: 10, fontWeight: FONTS.bold },

  messages: { flex: 1, backgroundColor: COLORS.bgLight },

  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI:   { justifyContent: 'flex-start' },
  msgRowCenter: { justifyContent: 'center' },

  avatarAI:  { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.brand100, alignItems: 'center', justifyContent: 'center' },
  avatarDoc: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center' },

  bubble:     { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser: { backgroundColor: COLORS.brand600, borderBottomRightRadius: 4 },
  bubbleAI:   { backgroundColor: COLORS.white, borderBottomLeftRadius: 4, ...SHADOW.sm },
  bubbleDoc:  { backgroundColor: COLORS.brand500, borderBottomLeftRadius: 4 },
  bubbleSys:  { backgroundColor: COLORS.slate100, borderRadius: 12 },
  bubbleText: { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 22 },

  doctorHint:     { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  doctorHintText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand600 },

  typingRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.white, borderRadius: 20, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 14, ...SHADOW.sm },
  typingDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand300 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: SPACING.lg, paddingBottom: Platform.OS === 'ios' ? 30 : SPACING.lg, backgroundColor: COLORS.white, ...SHADOW.lg },
  textInput: { flex: 1, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, fontSize: FONTS.base, color: COLORS.slate800, maxHeight: 100 },
  sendBtn:     { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center' },

  doctorBanner:{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, ...SHADOW.sm },
  doctorAvatar:{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  doctorName:  { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  doctorMeta:  { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },
  refreshBtn2: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.slate50, alignItems: 'center', justifyContent: 'center' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 10 },
  emptyTitle:  { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate700, marginTop: 16 },
  emptyDesc:   { fontSize: FONTS.sm, color: COLORS.slate500, textAlign: 'center', marginTop: 4 },
});

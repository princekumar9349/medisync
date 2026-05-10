/**
 * screens/patient/ChatScreen.js — Dual-mode Chat
 * Clean Medical Theme — Teal/White
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { apiChat, apiChatAudio, apiSendDoctorMessage, apiGetDoctorMessages } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const LANG_MAP = { EN: 'en-IN', HI: 'hi-IN' };

export default function ChatScreen({ route }) {
  const language = route?.params?.language ?? 'EN';
  const voiceOn = route?.params?.voiceOn ?? false;
  const currentMedicines = route?.params?.currentMedicines ?? [];
  const [activeTab, setActiveTab] = useState('ai');
  const [doctorUnread, setDoctorUnread] = useState(0);

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Assistant</Text><Text style={S.headerSubtitle}>Always here to help</Text></View>

      {/* Tab Header */}
      <View style={styles.tabHeader}>
        {[{ id: 'ai', label: 'AI Assistant', icon: 'sparkles' }, { id: 'doctor', label: 'Doctor Chat', icon: 'medical' }].map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]} onPress={() => setActiveTab(tab.id)} activeOpacity={0.8}>
            <Ionicons name={tab.icon} size={16} color={activeTab === tab.id ? COLORS.brand600 : COLORS.slate400} />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
            {tab.id === 'doctor' && doctorUnread > 0 && (<View style={styles.unreadBadge}><Text style={styles.unreadText}>{doctorUnread > 9 ? '9+' : doctorUnread}</Text></View>)}
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'ai' ? <AIChat language={language} voiceOn={voiceOn} currentMedicines={currentMedicines} onSwitchToDoctor={() => setActiveTab('doctor')} /> : <DoctorChat language={language} onUnreadChange={setDoctorUnread} />}
    </View>
  );
}

function AIChat({ language, voiceOn, currentMedicines, onSwitchToDoctor }) {
  const [messages, setMessages] = useState([{ role: 'ai', text: "Hello! I'm your Medisync assistant. Ask me anything about your medicines or health." }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [messages, isTyping]);

  function speak(text) { if (!voiceOn) return; Speech.stop(); Speech.speak(text, { language: LANG_MAP[language] || 'en-IN', rate: 0.95 }); }

  async function handleSend(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || isTyping) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsTyping(true);
    try {
      const res = await apiChat(text, language === 'HI' ? 'hi' : 'en', currentMedicines.length > 0 ? { medicines: currentMedicines } : {});
      const reply = res.response || 'Sorry, I could not understand that.';
      setMessages(prev => [...prev, { role: 'ai', text: reply, showDoctorBtn: reply.toLowerCase().includes('doctor') }]);
      speak(reply);
    } catch { setMessages(prev => [...prev, { role: 'ai', text: language === 'HI' ? 'माफ़ करें, अभी जवाब देने में समस्या है।' : "Sorry, I'm having trouble right now." }]); }
    finally { setIsTyping(false); }
  }

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) { console.error('Failed to start recording', err); }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) handleSendAudio(uri);
  }

  async function handleSendAudio(uri) {
    setIsTyping(true);
    setMessages(prev => [...prev, { role: 'user', text: '🎤 (Voice Message)' }]);
    try {
      const res = await apiChatAudio(uri, language === 'HI' ? 'hi' : 'en');
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { role: 'user', text: res.user_text || '(Voice)' };
        return newMsgs;
      });
      const reply = res.response || 'Sorry, I could not understand that.';
      setMessages(prev => [...prev, { role: 'ai', text: reply, showDoctorBtn: reply.toLowerCase().includes('doctor') }]);
      speak(reply);
    } catch { 
      setMessages(prev => [...prev, { role: 'ai', text: language === 'HI' ? 'माफ़ करें, अभी जवाब देने में समस्या है।' : "Sorry, I'm having trouble right now." }]); 
    } finally { setIsTyping(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: SPACING.lg, gap: 14 }} showsVerticalScrollIndicator={false}>
        {messages.map((msg, i) => (
          <View key={i} style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowAI]}>
            {msg.role === 'ai' && <View style={styles.avatarAI}><Ionicons name="sparkles" size={14} color={COLORS.brand600} /></View>}
            <View style={{ maxWidth: '78%' }}>
              <View style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
                <Text style={[styles.bubbleText, msg.role === 'user' && { color: COLORS.white }]}>{msg.text}</Text>
              </View>
              {msg.showDoctorBtn && (<TouchableOpacity style={styles.doctorHint} onPress={onSwitchToDoctor}><Text style={styles.doctorHintText}>Connect to Doctor</Text><Ionicons name="arrow-forward" size={12} color={COLORS.brand600} style={{ marginLeft: 4 }} /></TouchableOpacity>)}
            </View>
          </View>
        ))}
        {isTyping && (<View style={styles.msgRow}><View style={styles.avatarAI}><Ionicons name="sparkles" size={14} color={COLORS.brand600} /></View><View style={styles.typingBubble}>{[0,1,2].map(i => <View key={i} style={[styles.typingDot, { opacity: 0.4 + i * 0.2 }]} />)}</View></View>)}
      </ScrollView>
      <View style={styles.inputBar}>
        <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder={language === 'HI' ? 'कुछ पूछें…' : 'Ask about your medicines…'} placeholderTextColor={COLORS.slate400} onSubmitEditing={() => handleSend()} returnKeyType="send" editable={!isTyping && !isRecording} multiline />
        {input.trim().length > 0 ? (
          <TouchableOpacity style={[styles.sendBtn, { opacity: isTyping ? 0.4 : 1 }]} onPress={() => handleSend()} disabled={isTyping} activeOpacity={0.8}>
            <Ionicons name="send" size={16} color={COLORS.white} style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: isRecording ? COLORS.red500 : COLORS.brand600 }]} onPressIn={startRecording} onPressOut={stopRecording} disabled={isTyping} activeOpacity={0.8}>
            <Ionicons name={isRecording ? "mic" : "mic-outline"} size={20} color={COLORS.white} />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function DoctorChat({ language, onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const fetchThread = useCallback(async () => {
    setLoading(true); setError(null);
    try { const data = await apiGetDoctorMessages(); setMessages(data.messages || []); onUnreadChange?.(data.unread_count || 0); }
    catch { setError('Could not load messages.'); }
    finally { setLoading(false); }
  }, [onUnreadChange]);

  useEffect(() => { fetchThread(); }, [fetchThread]);
  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setSending(true);
    try { const data = await apiSendDoctorMessage(text); setMessages(data.messages || []); onUnreadChange?.(data.unread_count || 0); }
    catch { setError('Failed to send.'); }
    finally { setSending(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={styles.doctorBanner}>
        <View style={styles.doctorAvatar}><Ionicons name="medical" size={16} color={COLORS.brand600} /></View>
        <View style={{ flex: 1 }}><Text style={styles.doctorName}>Dr. Medisync</Text><Text style={styles.doctorMeta}>Secure & Private</Text></View>
        <TouchableOpacity onPress={fetchThread} style={styles.refreshBtn2}><Ionicons name="refresh" size={16} color={COLORS.brand600} /></TouchableOpacity>
      </View>
      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: SPACING.lg, gap: 14 }} showsVerticalScrollIndicator={false}>
        {loading && <View style={[S.center, { paddingVertical: 40 }]}><ActivityIndicator color={COLORS.brand600} /></View>}
        {error && <View style={styles.errorBanner}><Text style={{ color: COLORS.red700, fontSize: FONTS.sm, flex: 1 }}>{error}</Text></View>}
        {!loading && !error && messages.length === 0 && (<View style={[S.center, { paddingVertical: 60 }]}><Ionicons name="chatbubbles-outline" size={44} color={COLORS.slate300} /><Text style={{ fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate700, marginTop: 14 }}>No messages yet</Text><Text style={{ fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 4 }}>Send a message to your doctor.</Text></View>)}
        {!loading && messages.map((msg, i) => {
          const isUser = msg.sender === 'user', isSys = msg.sender === 'system';
          return (
            <View key={msg.id || i} style={[styles.msgRow, isUser ? styles.msgRowUser : isSys ? { justifyContent: 'center' } : styles.msgRowAI]}>
              {!isUser && !isSys && <View style={styles.avatarDoc}><Ionicons name="medical" size={12} color={COLORS.white} /></View>}
              <View style={[styles.bubble, isUser ? styles.bubbleUser : isSys ? styles.bubbleSys : styles.bubbleDoc, { maxWidth: isSys ? '90%' : '78%' }]}>
                <Text style={[styles.bubbleText, isUser && { color: COLORS.white }, !isUser && !isSys && { color: COLORS.white }, isSys && { color: COLORS.slate600 }]}>{msg.message}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.inputBar}>
        <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder={language === 'HI' ? 'डॉक्टर को संदेश…' : 'Message your doctor…'} placeholderTextColor={COLORS.slate400} onSubmitEditing={handleSend} returnKeyType="send" editable={!sending} />
        <TouchableOpacity style={[styles.sendBtn, { opacity: (!input.trim() || sending) ? 0.4 : 1 }]} onPress={handleSend} disabled={!input.trim() || sending} activeOpacity={0.8}>
          {sending ? <ActivityIndicator size="small" color={COLORS.white} /> : <Ionicons name="send" size={16} color={COLORS.white} style={{ marginLeft: 3 }} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabHeader: { flexDirection: 'row', backgroundColor: COLORS.white, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.xs, padding: 3, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.sm },
  tabBtnActive: { backgroundColor: COLORS.brand50 },
  tabLabel: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate500 },
  tabLabelActive: { color: COLORS.brand600 },
  unreadBadge: { position: 'absolute', top: 4, right: 8, width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.red500, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: COLORS.white, fontSize: 9, fontWeight: FONTS.bold },
  messages: { flex: 1, backgroundColor: COLORS.bgLight },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI: { justifyContent: 'flex-start' },
  avatarAI: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.brand200 },
  avatarDoc: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: COLORS.brand600, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: COLORS.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  bubbleDoc: { backgroundColor: COLORS.brand500, borderBottomLeftRadius: 4 },
  bubbleSys: { backgroundColor: COLORS.slate100, borderRadius: 12 },
  bubbleText: { fontSize: FONTS.base, color: COLORS.slate800, lineHeight: 21 },
  doctorHint: { flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.brand200 },
  doctorHintText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.brand600 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.white, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.brand300 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: SPACING.lg, paddingBottom: Platform.OS === 'ios' ? 28 : SPACING.lg, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border },
  textInput: { flex: 1, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.border, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10, fontSize: FONTS.base, color: COLORS.slate800, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center' },
  doctorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, backgroundColor: COLORS.white, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  doctorAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  doctorName: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.slate800 },
  doctorMeta: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 1 },
  refreshBtn2: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.sm, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.red200 },
});

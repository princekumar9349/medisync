import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { apiGetDoctorMessages, apiSendDoctorMessage } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

export default function DoctorChatScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    async function loadThread() {
      try {
        const data = await apiGetDoctorMessages(50, 0);
        setMessages(data.messages || []);
      } catch (err) {
        Alert.alert("Error", err.message);
      } finally {
        setLoading(false);
      }
    }
    loadThread();
    // Poll every 10 seconds for new doctor messages
    const interval = setInterval(loadThread, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    try {
      const data = await apiSendDoctorMessage(text);
      setMessages(data.messages || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.emerald500} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👨‍⚕️ Clinic Inbox</Text>
        <Text style={styles.headerSub}>Connect with your assigned doctor</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.chatContainer}
          contentContainerStyle={{ padding: 16 }}
          ref={scrollRef}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <Text style={styles.emptyText}>No messages yet. Say hello to your doctor!</Text>
          ) : (
            messages.map((msg, i) => {
              const isUser = msg.sender === 'user';
              const isSys = msg.sender === 'system';
              return (
                <View key={i} style={[styles.msgRow, isUser ? { justifyContent: 'flex-end' } : isSys ? { justifyContent: 'center' } : { justifyContent: 'flex-start' }]}>
                  <View style={[styles.msgBubble, isUser ? styles.msgUser : isSys ? styles.msgSys : styles.msgDoc]}>
                    {isDocMessage(msg) && <Text style={styles.senderLabel}>Doctor</Text>}
                    {isSys && <Text style={styles.sysLabel}>⚠️ System Alert</Text>}
                    <Text style={[styles.msgText, isUser ? { color: COLORS.white } : isSys ? { color: COLORS.amber800, fontStyle: 'italic', fontSize: 13 } : { color: COLORS.slate800 }]}>
                      {msg.message}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type your message..."
            placeholderTextColor={COLORS.slate400}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || !input.trim()}>
            {sending ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>➤</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isDocMessage(msg) {
  return msg.sender === 'doctor';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { paddingHorizontal: SPACING.lg, paddingVertical: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.slate200 },
  headerTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  headerSub: { fontSize: 12, color: COLORS.slate500, marginTop: 2 },
  
  chatContainer: { flex: 1 },
  emptyText: { textAlign: 'center', color: COLORS.slate400, marginTop: 40 },

  msgRow: { flexDirection: 'row', marginBottom: 16 },
  msgBubble: { maxWidth: '85%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18 },
  msgUser: { backgroundColor: COLORS.brand600, borderBottomRightRadius: 4 },
  msgDoc: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.slate200, borderBottomLeftRadius: 4 },
  msgSys: { backgroundColor: COLORS.amber100, borderWidth: 1, borderColor: COLORS.amber300, paddingVertical: 8, maxWidth: '90%' },
  
  msgText: { fontSize: 15, lineHeight: 22 },
  senderLabel: { fontSize: 10, fontWeight: 'bold', color: COLORS.emerald600, marginBottom: 4, textTransform: 'uppercase' },
  sysLabel: { fontSize: 11, fontWeight: 'bold', color: COLORS.amber800, marginBottom: 4 },

  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: COLORS.white, borderTopWidth: 1, borderColor: COLORS.slate200, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: 24, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, maxHeight: 120, fontSize: 15 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});

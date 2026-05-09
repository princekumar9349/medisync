/**
 * screens/doctor/DoctorPatientDetailScreen.js
 * Business Theme Overhaul
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';
import { apiGetPatientProfile, apiGetDoctorMessages, apiDoctorSendReply } from '../../services/api';

// ─── Simple SVG-less Charts using React Native Views ─────────────────────────

function ProgressBar({ label, percentage, color }) {
  return (
    <View style={styles.progressRow}>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.progressValue}>{percentage}%</Text>
    </View>
  );
}

function MiniBarChart({ data }) {
  if (!data || data.length === 0) return <Text style={styles.emptyText}>No data</Text>;
  
  return (
    <View style={styles.barChartContainer}>
      {data.map((d, i) => (
        <View key={i} style={styles.barCol}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { height: `${d.percentage}%` }]} />
          </View>
          <Text style={styles.barLabel}>{d.day}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DoctorPatientDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { patientId } = route.params;

  const [activeTab, setActiveTab] = useState('profile'); // 'chat' | 'profile'
  
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [profData, chatData] = await Promise.all([
        apiGetPatientProfile(patientId),
        apiGetDoctorMessages(100, 0)
      ]);
      
      setProfile(profData);
      
      const allMsgs = chatData.messages || [];
      setMessages(allMsgs.filter(m => m.user_id === patientId));
    } catch (err) {
      console.error("Failed to load details", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [patientId]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      const data = await apiDoctorSendReply(patientId, text);
      const allMsgs = data.messages || [];
      setMessages(allMsgs.filter(m => m.user_id === patientId));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function handleQuickAlert(msgText) {
    setSending(true);
    try {
      const data = await apiDoctorSendReply(patientId, `[ALERT] ${msgText}`);
      const allMsgs = data.messages || [];
      setMessages(allMsgs.filter(m => m.user_id === patientId));
      setActiveTab('chat');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  if (loading || !profile) {
    return (
      <View style={[S.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.white} />
        <Text style={{ color: COLORS.brand100, marginTop: 12 }}>Loading patient profile…</Text>
      </View>
    );
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={[S.headerBackground, { paddingBottom: 60, flexDirection: 'row', alignItems: 'flex-start' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={S.headerTitle}>{profile.name}</Text>
          <Text style={S.headerSubtitle}>ID: {profile.patient_id} · Age {profile.age} · {profile.condition}</Text>
        </View>
      </View>

      <View style={[S.overlapContainer, { marginTop: -40 }]}>
        {/* ── Toggle Tabs ─────────────────────────────────────────── */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'profile' && styles.tabBtnActive]}
            onPress={() => setActiveTab('profile')}
          >
            <Ionicons name="stats-chart" size={16} color={activeTab === 'profile' ? COLORS.brand600 : COLORS.slate400} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'chat' && styles.tabBtnActive]}
            onPress={() => setActiveTab('chat')}
          >
            <Ionicons name="chatbubbles" size={16} color={activeTab === 'chat' ? COLORS.brand600 : COLORS.slate400} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>Chat</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tab Content ─────────────────────────────────────────── */}
        {activeTab === 'profile' ? (
          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            
            {/* Risk Level */}
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
               <Text style={styles.sectionTitle}>Risk Indicator</Text>
               <View style={[styles.badge, profile.risk_level === 'high' ? styles.badgeHigh : profile.risk_level === 'medium' ? styles.badgeMed : styles.badgeLow]}>
                 <Text style={[styles.badgeText, profile.risk_level === 'high' ? styles.textHigh : profile.risk_level === 'medium' ? styles.textMed : styles.textLow]}>
                   {profile.risk_level.toUpperCase()}
                 </Text>
               </View>
            </View>

            {/* Smart Insights */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Smart Insights</Text>
              {profile.recommendations.map((rec, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={14} color={COLORS.brand400} style={{ marginTop: 2, marginRight: 8 }} />
                  <Text style={styles.insightText}>{rec}</Text>
                </View>
              ))}
            </View>

            {/* Analytics */}
            <View style={styles.card}>
               <Text style={styles.sectionTitle}>Adherence Analytics</Text>
               
               <View style={styles.statsRow}>
                 <View style={styles.statBox}>
                   <Text style={styles.statVal}>{profile.adherence_stats.weekly_percentage}%</Text>
                   <Text style={styles.statLabel}>Weekly</Text>
                 </View>
                 <View style={styles.statBox}>
                   <Text style={[styles.statVal, { color: COLORS.emerald600 }]}>{profile.adherence_stats.today_taken}</Text>
                   <Text style={styles.statLabel}>Taken Today</Text>
                 </View>
                 <View style={styles.statBox}>
                   <Text style={[styles.statVal, { color: COLORS.red500 }]}>{profile.adherence_stats.today_missed}</Text>
                   <Text style={styles.statLabel}>Missed Today</Text>
                 </View>
               </View>

               {profile.adherence_stats.missed_medicines_today && profile.adherence_stats.missed_medicines_today.length > 0 && (
                 <View style={styles.missedMedsBox}>
                   <Ionicons name="warning" size={16} color={COLORS.red600} style={{ marginRight: 6 }} />
                   <View style={{ flex: 1 }}>
                     <Text style={{ fontSize: FONTS.xs, fontWeight: 'bold', color: COLORS.red700 }}>Missed Medicines:</Text>
                     <Text style={{ fontSize: FONTS.sm, color: COLORS.red800, marginTop: 2 }}>
                       {profile.adherence_stats.missed_medicines_today.join(', ')}
                     </Text>
                   </View>
                 </View>
               )}

               <Text style={styles.subTitle}>7-Day Trend</Text>
               <MiniBarChart data={profile.graph_data.daily_adherence} />

               <Text style={[styles.subTitle, { marginTop: 20 }]}>Time-Slot Consistency</Text>
               <ProgressBar label="Morning" percentage={Math.round((profile.graph_data.time_slot_adherence.morning / Math.max(1, profile.graph_data.missed_vs_taken.taken)) * 100) || 0} color={COLORS.brand400} />
               <ProgressBar label="Afternoon" percentage={Math.round((profile.graph_data.time_slot_adherence.afternoon / Math.max(1, profile.graph_data.missed_vs_taken.taken)) * 100) || 0} color={COLORS.brand500} />
               <ProgressBar label="Night" percentage={Math.round((profile.graph_data.time_slot_adherence.night / Math.max(1, profile.graph_data.missed_vs_taken.taken)) * 100) || 0} color={COLORS.brand700} />
            </View>

            {/* Symptoms */}
            <View style={styles.card}>
               <Text style={styles.sectionTitle}>Reported Symptoms</Text>
               <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                 {profile.symptoms.length === 0 ? <Text style={styles.emptyText}>No symptoms reported.</Text> : null}
                 {profile.symptoms.map((sym, i) => (
                   <View key={i} style={styles.symTag}>
                     <Text style={styles.symTagText}>{sym}</Text>
                   </View>
                 ))}
               </View>
            </View>

            {/* Medicines */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Active Prescriptions</Text>
              {profile.medicines.length === 0 ? <Text style={styles.emptyText}>No active medicines.</Text> : null}
              {profile.medicines.map((m, i) => (
                <View key={i} style={styles.medRow}>
                  <View style={styles.medIcon}><Ionicons name="medkit" size={16} color={COLORS.brand600} /></View>
                  <View>
                    <Text style={styles.medName}>{m.name}</Text>
                    <Text style={styles.medDosage}>{m.dosage} · {m.timing}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Actionable Alerts */}
            <View style={styles.card}>
               <Text style={styles.sectionTitle}>Quick Actions</Text>
               <TouchableOpacity style={styles.actionBtnWarn} onPress={() => handleQuickAlert('Please remember to take your missed medications today.')}>
                 <Ionicons name="notifications" size={18} color={COLORS.amber700} style={{ marginRight: 8 }} />
                 <Text style={styles.actionBtnWarnText}>Send Missed Dose Reminder</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.actionBtnCrit} onPress={() => handleQuickAlert('Your recent symptoms are concerning. Please book a consultation immediately.')}>
                 <Ionicons name="calendar" size={18} color={COLORS.red700} style={{ marginRight: 8 }} />
                 <Text style={styles.actionBtnCritText}>Recommend Consultation</Text>
               </TouchableOpacity>
            </View>

          </ScrollView>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView 
              style={styles.chatContainer} 
              contentContainerStyle={{ padding: SPACING.lg }}
              ref={scrollRef}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} colors={[COLORS.brand600]} />}
            >
              {messages.length === 0 ? (
                <View style={[S.center, { marginTop: 40 }]}>
                  <Ionicons name="chatbubbles-outline" size={48} color={COLORS.slate300} />
                  <Text style={styles.emptyText}>No messages yet.</Text>
                </View>
              ) : (
                messages.map((msg, i) => {
                  const isDoc = msg.sender === 'doctor';
                  const isSys = msg.sender === 'system';
                  return (
                    <View key={i} style={[styles.msgRow, isDoc ? { justifyContent: 'flex-end' } : isSys ? { justifyContent: 'center' } : { justifyContent: 'flex-start' }]}>
                      <View style={[styles.msgBubble, isDoc ? styles.msgDoc : isSys ? styles.msgSys : styles.msgUser]}>
                        <Text style={[styles.msgText, isDoc ? { color: COLORS.white } : isSys ? { color: COLORS.amber800, fontStyle: 'italic', fontSize: FONTS.xs } : { color: COLORS.slate800 }]}>
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
                placeholder="Reply to patient..."
                placeholderTextColor={COLORS.slate400}
                multiline
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || !input.trim()}>
                {sending ? <ActivityIndicator color={COLORS.white} /> : <Ionicons name="send" size={18} color={COLORS.white} style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start', marginTop: 4 },

  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: 4, ...SHADOW.sm },
  tabBtn: { flex: 1, flexDirection: 'row', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  tabBtnActive: { backgroundColor: COLORS.brand50 },
  tabText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate500 },
  tabTextActive: { color: COLORS.brand600 },

  content: { flex: 1, padding: SPACING.lg },

  card: { backgroundColor: COLORS.white, padding: SPACING.lg, borderRadius: RADIUS.xl, marginBottom: SPACING.md, ...SHADOW.sm },
  sectionTitle: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate500, textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },

  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  badgeHigh: { backgroundColor: COLORS.red50, borderColor: COLORS.red200 },
  textHigh: { color: COLORS.red700, fontWeight: FONTS.bold, fontSize: FONTS.xs },
  badgeMed: { backgroundColor: COLORS.amber50, borderColor: COLORS.amber200 },
  textMed: { color: COLORS.amber700, fontWeight: FONTS.bold, fontSize: FONTS.xs },
  badgeLow: { backgroundColor: COLORS.emerald50, borderColor: COLORS.emerald200 },
  textLow: { color: COLORS.emerald700, fontWeight: FONTS.bold, fontSize: FONTS.xs },

  insightText: { fontSize: FONTS.sm, color: COLORS.slate700, lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: COLORS.slate50, padding: 12, borderRadius: RADIUS.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.slate100 },
  statVal: { fontSize: FONTS.xl, fontWeight: FONTS.extrabold, color: COLORS.slate800 },
  statLabel: { fontSize: 10, color: COLORS.slate500, fontWeight: FONTS.bold, marginTop: 4, textTransform: 'uppercase' },

  missedMedsBox: { flexDirection: 'row', backgroundColor: COLORS.red50, padding: 12, borderRadius: RADIUS.lg, marginBottom: 16, borderWidth: 1, borderColor: COLORS.red200 },

  subTitle: { fontSize: 11, fontWeight: FONTS.bold, color: COLORS.slate400, textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  progressLabel: { width: 65, fontSize: 11, fontWeight: FONTS.bold, color: COLORS.slate500 },
  track: { flex: 1, height: 8, backgroundColor: COLORS.slate100, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  progressValue: { width: 30, textAlign: 'right', fontSize: 11, fontWeight: FONTS.bold, color: COLORS.slate700 },

  barChartContainer: { flexDirection: 'row', height: 100, alignItems: 'flex-end', gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '100%', backgroundColor: COLORS.slate100, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: COLORS.brand400, borderRadius: 4 },
  barLabel: { fontSize: 9, color: COLORS.slate400, marginTop: 4, fontWeight: 'bold' },

  symTag: { backgroundColor: COLORS.red50, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.red100 },
  symTagText: { color: COLORS.red700, fontSize: FONTS.xs, fontWeight: FONTS.bold },

  emptyText: { textAlign: 'center', color: COLORS.slate400, fontSize: FONTS.sm, marginVertical: 12 },

  medRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.slate50 },
  medIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  medName: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate800 },
  medDosage: { fontSize: 11, color: COLORS.slate500, marginTop: 2, fontWeight: '600' },

  actionBtnWarn: { flexDirection: 'row', padding: 14, backgroundColor: COLORS.amber50, borderWidth: 1, borderColor: COLORS.amber200, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionBtnWarnText: { color: COLORS.amber800, fontWeight: FONTS.bold, fontSize: FONTS.sm },
  actionBtnCrit: { flexDirection: 'row', padding: 14, backgroundColor: COLORS.red50, borderWidth: 1, borderColor: COLORS.red200, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  actionBtnCritText: { color: COLORS.red700, fontWeight: FONTS.bold, fontSize: FONTS.sm },

  chatContainer: { flex: 1, backgroundColor: COLORS.bgLight },
  msgRow: { flexDirection: 'row', marginBottom: 12 },
  msgBubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  msgDoc: { backgroundColor: COLORS.brand600, borderBottomRightRadius: 4 },
  msgUser: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.slate200, borderBottomLeftRadius: 4, ...SHADOW.sm },
  msgSys: { backgroundColor: COLORS.amber100, borderWidth: 1, borderColor: COLORS.amber200, paddingVertical: 6 },
  msgText: { fontSize: FONTS.sm, lineHeight: 20 },

  inputContainer: { flexDirection: 'row', padding: SPACING.lg, paddingBottom: Platform.OS === 'ios' ? 30 : SPACING.lg, backgroundColor: COLORS.white, borderTopWidth: 1, borderColor: COLORS.slate100, alignItems: 'flex-end', ...SHADOW.lg },
  input: { flex: 1, backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, maxHeight: 100, fontSize: FONTS.base },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});

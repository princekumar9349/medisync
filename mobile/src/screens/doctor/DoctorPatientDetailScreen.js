import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, RefreshControl, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiGetPatientProfile, apiDoctorSendReply, apiDoctorGetPatientThread, apiAddClinicalNote, apiGetClinicalNotes, apiAddFollowUp, apiAddMedicine, apiDeleteMedicine } from '../../services/api';

const C = { bg:'#F0F4F8', surface:'#FFF', primary:'#0A4A6E', accent:'#0EA5E9', emerald:'#10B981', amber:'#F59E0B', red:'#EF4444', slate:'#64748B', dark:'#0F172A', border:'#E2E8F0' };

const TABS = ['Overview','Adherence','Medicines','Notes','Chat'];

function BarChart({ data }) {
  if (!data?.length) return <Text style={{ color: C.slate, fontSize: 12 }}>No data</Text>;
  const max = Math.max(...data.map(d => d.percentage), 1);
  return (
    <View style={{ flexDirection:'row', height:80, alignItems:'flex-end', gap:4 }}>
      {data.map((d,i) => {
        const h = (d.percentage / max) * 70;
        const col = d.percentage >= 75 ? C.emerald : d.percentage >= 50 ? C.amber : C.red;
        return (
          <View key={i} style={{ flex:1, alignItems:'center' }}>
            <View style={{ width:'100%', height:70, justifyContent:'flex-end' }}>
              <View style={{ height:Math.max(h,2), backgroundColor:col, borderRadius:4 }} />
            </View>
            <Text style={{ fontSize:9, color:C.slate, marginTop:2, fontWeight:'700' }}>{d.day}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Ring({ pct }) {
  const col = pct >= 75 ? C.emerald : pct >= 50 ? C.amber : C.red;
  return (
    <View style={{ alignItems:'center', justifyContent:'center', width:90, height:90, borderRadius:45, borderWidth:8, borderColor:'#E2E8F0', position:'relative' }}>
      <Text style={{ fontSize:20, fontWeight:'900', color:col }}>{pct}%</Text>
      <Text style={{ fontSize:9, color:C.slate, fontWeight:'700' }}>ADHERENCE</Text>
    </View>
  );
}

function ProgressRow({ label, pct, color }) {
  return (
    <View style={{ marginBottom:10 }}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}>
        <Text style={{ fontSize:13, color:C.slate, fontWeight:'600' }}>{label}</Text>
        <Text style={{ fontSize:13, color, fontWeight:'800' }}>{pct}%</Text>
      </View>
      <View style={{ height:7, backgroundColor:'#E2E8F0', borderRadius:4, overflow:'hidden' }}>
        <View style={{ height:'100%', width:`${pct}%`, backgroundColor:color, borderRadius:4 }} />
      </View>
    </View>
  );
}

export default function DoctorPatientDetailScreen() {
  const navigation = useNavigation();
  const { patientId } = useRoute().params || {};
  const [tab, setTab] = useState('Overview');
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addingMed, setAddingMed] = useState(false);
  const [newMed, setNewMed] = useState({ name:'', dosage:'', timing:'', morning:false, afternoon:false, night:false, duration:'', instructions:'', is_critical:false });
  const [showMedForm, setShowMedForm] = useState(false);
  const scrollRef = useRef(null);

  // Guard: if patientId is missing/undefined, bail early
  if (!patientId || patientId === 'undefined') {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:C.bg, gap:14 }}>
        <Ionicons name="warning-outline" size={44} color={C.amber} />
        <Text style={{ fontSize:16, fontWeight:'800', color:C.dark }}>Patient Not Found</Text>
        <Text style={{ color:C.slate, textAlign:'center', paddingHorizontal:32 }}>No patient ID was provided. Go back and select a patient.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ backgroundColor:C.primary, borderRadius:12, paddingHorizontal:24, paddingVertical:12 }}>
          <Text style={{ color:'#fff', fontWeight:'700' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    try {
      const [prof, chat, n] = await Promise.allSettled([
        apiGetPatientProfile(patientId),
        apiDoctorGetPatientThread(patientId),
        apiGetClinicalNotes(patientId),
      ]);
      if (prof.status === 'fulfilled') setProfile(prof.value);
      if (chat.status === 'fulfilled') setMessages(chat.value.messages || []);
      if (n.status === 'fulfilled') setNotes(n.value.notes || []);
    } catch {}
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function sendMsg() {
    if (!input.trim()) return;
    const txt = input.trim(); setInput(''); setSending(true);
    try {
      const d = await apiDoctorSendReply(patientId, txt);
      setMessages(d.messages || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated:true }), 100);
    } catch { setInput(txt); }
    setSending(false);
  }

  async function saveNote() {
    if (!noteInput.trim()) return;
    setAddingNote(true);
    try {
      await apiAddClinicalNote(patientId, noteInput.trim());
      setNoteInput('');
      await load(true);
      if (Platform.OS === 'web') window.alert('Note saved!');
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to save note');
      else Alert.alert('Error','Failed to save note');
    }
    setAddingNote(false);
  }

  async function addMed() {
    if (!newMed.name.trim()) return;
    setAddingMed(true);
    try {
      await apiAddMedicine({ patient_id: patientId, ...newMed });
      setShowMedForm(false);
      setNewMed({ name:'', dosage:'', timing:'', morning:false, afternoon:false, night:false, duration:'', instructions:'', is_critical:false });
      await load(true);
      if (Platform.OS === 'web') window.alert('Medicine added!');
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to add medicine');
      else Alert.alert('Error','Failed to add medicine');
    }
    setAddingMed(false);
  }

  async function delMed(idx) {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to remove this medicine?')) {
        try { await apiDeleteMedicine(patientId, idx); await load(true); window.alert('Removed!'); }
        catch { window.alert('Failed to remove'); }
      }
      return;
    }
    Alert.alert('Remove Medicine','Are you sure?', [
      { text:'Cancel', style:'cancel' },
      { text:'Remove', style:'destructive', onPress: async () => {
        try { await apiDeleteMedicine(patientId, idx); await load(true); }
        catch { Alert.alert('Error','Failed to remove'); }
      }},
    ]);
  }

  async function scheduleFollowUp() {
    const date = new Date(); date.setDate(date.getDate() + 7);
    try {
      await apiAddFollowUp(patientId, 'Routine follow-up check', date.toISOString());
      if (Platform.OS === 'web') window.alert('✅ Follow-up scheduled for 7 days');
      else Alert.alert('✅ Follow-up scheduled for 7 days');
    } catch {
      if (Platform.OS === 'web') window.alert('❌ Failed to schedule');
      else Alert.alert('❌ Failed to schedule');
    }
  }

  if (loading || !profile) return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:C.bg }}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={{ color:C.slate, marginTop:12 }}>Loading patient...</Text>
    </View>
  );

  const st = profile.adherence_stats || {};
  const gd = profile.graph_data || {};
  const weekPct = Math.round(st.weekly_percentage || 0);
  const morPct  = Math.round(((gd.time_slot_adherence?.morning||0) / Math.max(1, gd.missed_vs_taken?.taken||1)) * 100);
  const aftPct  = Math.round(((gd.time_slot_adherence?.afternoon||0) / Math.max(1, gd.missed_vs_taken?.taken||1)) * 100);
  const ngtPct  = Math.round(((gd.time_slot_adherence?.night||0) / Math.max(1, gd.missed_vs_taken?.taken||1)) * 100);
  const riskCfg = { high:{ color:C.red, bg:'#FEF2F2', border:'#FECACA' }, medium:{ color:C.amber, bg:'#FFFBEB', border:'#FDE68A' }, low:{ color:C.emerald, bg:'#ECFDF5', border:'#A7F3D0' } }[profile.risk_level] || { color:C.slate, bg:'#F8FAFC', border:C.border };

  return (
    <View style={{ flex:1, backgroundColor:C.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.primary} />
        </TouchableOpacity>
        <View style={{ flex:1, marginLeft:12 }}>
          <Text style={s.headerName}>{profile.name}</Text>
          <Text style={s.headerSub}>Age {profile.age} · {profile.condition}</Text>
        </View>
        <View style={[s.riskBadge, { backgroundColor:riskCfg.bg, borderColor:riskCfg.border }]}>
          <Text style={[s.riskText, { color:riskCfg.color }]}>{(profile.risk_level||'low').toUpperCase()}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal:16, gap:6, paddingVertical:8 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab===t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab===t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* OVERVIEW */}
      {tab === 'Overview' && (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Quick Stats</Text>
            <View style={{ flexDirection:'row', gap:10 }}>
              {[
                { label:'Taken Today', val:st.today_taken||0, color:C.emerald },
                { label:'Missed Today', val:st.today_missed||0, color:C.red },
                { label:'Weekly', val:`${weekPct}%`, color:C.primary },
              ].map(item => (
                <View key={item.label} style={s.statBox}>
                  <Text style={[s.statVal, { color:item.color }]}>{item.val}</Text>
                  <Text style={s.statLbl}>{item.label}</Text>
                </View>
              ))}
            </View>
            {st.missed_medicines_today?.length > 0 && (
              <View style={s.missedBox}>
                <Ionicons name="warning" size={14} color={C.red} />
                <Text style={s.missedText}>Missed: {st.missed_medicines_today.join(', ')}</Text>
              </View>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>AI Insights</Text>
            {(profile.recommendations||[]).map((r,i) => (
              <View key={i} style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
                <Ionicons name="sparkles" size={14} color={C.accent} style={{ marginTop:2 }} />
                <Text style={{ fontSize:13, color:C.slate, flex:1, lineHeight:19 }}>{r}</Text>
              </View>
            ))}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Recent Symptoms</Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
              {(profile.symptoms||[]).map((sym,i) => (
                <View key={i} style={s.symTag}>
                  <Text style={s.symText}>{sym}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Quick Actions</Text>
            {[
              { icon:'notifications', label:'Send Missed Dose Reminder', color:C.amber, onPress: async () => {
                try {
                  await apiDoctorSendReply(patientId,'Please take your missed medicines today.');
                  if (Platform.OS === 'web') window.alert('Reminder sent!'); else Alert.alert('Reminder sent!');
                } catch {
                  if (Platform.OS === 'web') window.alert('Failed to send reminder.'); else Alert.alert('Failed to send reminder.');
                }
              }},
              { icon:'calendar', label:'Schedule Follow-up (7 days)', color:C.primary, onPress:scheduleFollowUp },
              { icon:'chatbubbles', label:'Go to Chat', color:C.accent, onPress:()=>setTab('Chat') },
            ].map(a => (
              <TouchableOpacity key={a.label} style={[s.actionBtn, { borderColor:a.color+'44', backgroundColor:a.color+'10' }]} onPress={a.onPress} activeOpacity={0.8}>
                <Ionicons name={a.icon} size={18} color={a.color} />
                <Text style={[s.actionText, { color:a.color }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ADHERENCE */}
      {tab === 'Adherence' && (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Weekly Adherence</Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:20, marginBottom:20 }}>
              <Ring pct={weekPct} />
              <View style={{ flex:1 }}>
                <ProgressRow label="Morning" pct={Math.min(morPct,100)} color={C.primary} />
                <ProgressRow label="Afternoon" pct={Math.min(aftPct,100)} color={C.accent} />
                <ProgressRow label="Night" pct={Math.min(ngtPct,100)} color={C.primary} />
              </View>
            </View>
            <Text style={[s.cardTitle, { marginBottom:12 }]}>7-Day Trend</Text>
            <BarChart data={gd.daily_adherence||[]} />
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Doses Summary</Text>
            <View style={{ flexDirection:'row', gap:10 }}>
              <View style={[s.statBox, { flex:1, backgroundColor:'#ECFDF5' }]}>
                <Text style={[s.statVal, { color:C.emerald }]}>{gd.missed_vs_taken?.taken||0}</Text>
                <Text style={s.statLbl}>Taken (7d)</Text>
              </View>
              <View style={[s.statBox, { flex:1, backgroundColor:'#FEF2F2' }]}>
                <Text style={[s.statVal, { color:C.red }]}>{gd.missed_vs_taken?.missed||0}</Text>
                <Text style={s.statLbl}>Missed (7d)</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* MEDICINES */}
      {tab === 'Medicines' && (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.card}>
            <View style={{ flexDirection:'row', alignItems:'center', marginBottom:12 }}>
              <Text style={[s.cardTitle, { flex:1 }]}>Active Prescriptions</Text>
              <TouchableOpacity style={s.addMedBtn} onPress={() => setShowMedForm(!showMedForm)}>
                <Ionicons name={showMedForm ? 'close' : 'add'} size={18} color={C.primary} />
                <Text style={s.addMedText}>{showMedForm ? 'Cancel' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
            {showMedForm && (
              <View style={s.medForm}>
                {[['name','Medicine Name *'],['dosage','Dosage (e.g. 500mg)'],['duration','Duration (e.g. 5 days)'],['instructions','Instructions']].map(([k,ph]) => (
                  <TextInput key={k} style={s.medInput} value={newMed[k]} onChangeText={v => setNewMed(p=>({...p,[k]:v}))} placeholder={ph} placeholderTextColor={C.slate} />
                ))}
                <View style={{ flexDirection:'row', gap:8, marginBottom:10 }}>
                  {['morning','afternoon','night'].map(slot => (
                    <TouchableOpacity key={slot} style={[s.slotBtn, newMed[slot] && s.slotBtnActive]} onPress={() => setNewMed(p=>({...p,[slot]:!p[slot]}))}>
                      <Text style={[s.slotText, newMed[slot] && { color:'#FFF' }]}>{slot.charAt(0).toUpperCase()+slot.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[s.addMedSubmit, { opacity: addingMed ? 0.6 : 1 }]} onPress={addMed} disabled={addingMed}>
                  {addingMed ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color:'#FFF', fontWeight:'800', fontSize:14 }}>Add Medicine</Text>}
                </TouchableOpacity>
              </View>
            )}
            {(profile.medicines||[]).length === 0 ? (
              <Text style={{ color:C.slate, textAlign:'center', paddingVertical:20 }}>No active medicines</Text>
            ) : profile.medicines.map((m,i) => (
              <View key={i} style={s.medRow}>
                <View style={[s.medIcon, m.is_critical && { backgroundColor:'#FEF2F2' }]}>
                  <Ionicons name="medkit" size={16} color={m.is_critical ? C.red : C.primary} />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={s.medName}>{m.name} {m.is_critical && '⚠️'}</Text>
                  <Text style={s.medDose}>{m.dosage} · {m.timing || [m.morning&&'Morning',m.afternoon&&'Afternoon',m.night&&'Night'].filter(Boolean).join(', ') || '—'}</Text>
                </View>
                <TouchableOpacity onPress={() => delMed(i)}>
                  <Ionicons name="trash-outline" size={18} color={C.red} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* NOTES */}
      {tab === 'Notes' && (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Clinical Notes (Private)</Text>
            <TextInput style={s.noteInput} value={noteInput} onChangeText={setNoteInput} placeholder="Write a clinical note..." placeholderTextColor={C.slate} multiline numberOfLines={3} textAlignVertical="top" />
            <TouchableOpacity style={[s.addMedSubmit, { opacity: addingNote ? 0.6 : 1 }]} onPress={saveNote} disabled={addingNote}>
              {addingNote ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color:'#FFF', fontWeight:'800' }}>Save Note</Text>}
            </TouchableOpacity>
          </View>
          {notes.map(n => (
            <View key={n.id} style={s.noteCard}>
              <Text style={s.noteText}>{n.note}</Text>
              <Text style={s.noteTime}>{new Date(n.timestamp).toLocaleDateString()}</Text>
            </View>
          ))}
          {notes.length === 0 && <Text style={{ color:C.slate, textAlign:'center', marginTop:20 }}>No notes yet</Text>}
        </ScrollView>
      )}

      {/* CHAT */}
      {tab === 'Chat' && (
        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
          <ScrollView ref={scrollRef} style={{ flex:1 }} contentContainerStyle={{ padding:16 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated:true })}>
            {messages.length === 0 ? (
              <View style={{ alignItems:'center', marginTop:40 }}>
                <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
                <Text style={{ color:C.slate, marginTop:12 }}>No messages yet</Text>
              </View>
            ) : messages.map((m,i) => {
              const isDoc = m.sender === 'doctor';
              const isSys = m.sender === 'system';
              return (
                <View key={i} style={{ flexDirection:'row', justifyContent: isDoc?'flex-end':isSys?'center':'flex-start', marginBottom:10 }}>
                  <View style={{ maxWidth:'80%', padding:12, borderRadius:16, backgroundColor: isDoc?C.primary:isSys?'#FFF9C4':'#F1F5F9', borderBottomRightRadius:isDoc?2:16, borderBottomLeftRadius:isDoc?16:isSys?16:2 }}>
                    <Text style={{ color: isDoc?'#FFF':isSys?C.amber:C.dark, fontSize:14, lineHeight:20 }}>{m.message}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={s.chatInput}>
            <TextInput style={s.chatBox} value={input} onChangeText={setInput} placeholder="Reply to patient..." placeholderTextColor={C.slate} multiline />
            <TouchableOpacity style={[s.sendBtn, { opacity: (!input.trim()||sending)?0.5:1 }]} onPress={sendMsg} disabled={!input.trim()||sending}>
              {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="send" size={18} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header:{ flexDirection:'row', alignItems:'center', backgroundColor:C.surface, paddingTop:Platform.OS==='ios'?56:48, paddingHorizontal:16, paddingBottom:14, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:{ width:40, height:40, borderRadius:20, backgroundColor:'#F8FAFC', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.border },
  headerName:{ fontSize:18, fontWeight:'800', color:C.dark },
  headerSub:{ fontSize:12, color:C.slate, marginTop:2 },
  riskBadge:{ paddingHorizontal:10, paddingVertical:5, borderRadius:12, borderWidth:1 },
  riskText:{ fontSize:11, fontWeight:'800', letterSpacing:0.5 },
  tabBar:{ backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border, maxHeight:52 },
  tabBtn:{ paddingHorizontal:16, paddingVertical:8, borderRadius:20, backgroundColor:'#F8FAFC' },
  tabBtnActive:{ backgroundColor:C.primary },
  tabText:{ fontSize:13, fontWeight:'700', color:C.slate },
  tabTextActive:{ color:'#FFF' },
  content:{ padding:16, paddingBottom:40 },
  card:{ backgroundColor:C.surface, borderRadius:20, padding:16, marginBottom:14, borderWidth:1, borderColor:C.border, shadowColor:'#0A4A6E', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  cardTitle:{ fontSize:15, fontWeight:'800', color:C.dark, marginBottom:14 },
  statBox:{ flex:1, alignItems:'center', backgroundColor:'#F8FAFC', borderRadius:12, padding:12, borderWidth:1, borderColor:C.border },
  statVal:{ fontSize:24, fontWeight:'900' },
  statLbl:{ fontSize:10, color:C.slate, fontWeight:'700', textTransform:'uppercase', marginTop:2 },
  missedBox:{ flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#FEF2F2', padding:10, borderRadius:10, marginTop:10, borderWidth:1, borderColor:'#FECACA' },
  missedText:{ fontSize:13, color:C.red, fontWeight:'600', flex:1 },
  symTag:{ backgroundColor:'#FEF2F2', paddingHorizontal:12, paddingVertical:5, borderRadius:20, borderWidth:1, borderColor:'#FECACA' },
  symText:{ color:C.red, fontSize:12, fontWeight:'700' },
  actionBtn:{ flexDirection:'row', alignItems:'center', gap:10, padding:13, borderRadius:14, borderWidth:1.5, marginBottom:8 },
  actionText:{ fontWeight:'700', fontSize:14 },
  medRow:{ flexDirection:'row', alignItems:'center', paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#F1F5F9', gap:12 },
  medIcon:{ width:36, height:36, borderRadius:12, backgroundColor:'#EFF6FF', alignItems:'center', justifyContent:'center' },
  medName:{ fontSize:14, fontWeight:'800', color:C.dark },
  medDose:{ fontSize:12, color:C.slate, marginTop:2 },
  addMedBtn:{ flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:12, paddingVertical:6, backgroundColor:'#EFF6FF', borderRadius:20, borderWidth:1, borderColor:'#BFDBFE' },
  addMedText:{ fontSize:13, fontWeight:'700', color:C.primary },
  medForm:{ backgroundColor:'#F8FAFC', borderRadius:14, padding:14, marginBottom:12, gap:8 },
  medInput:{ backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:10, padding:10, fontSize:14, color:C.dark },
  slotBtn:{ flex:1, paddingVertical:8, borderRadius:10, borderWidth:1, borderColor:C.border, alignItems:'center', backgroundColor:C.surface },
  slotBtnActive:{ backgroundColor:C.primary, borderColor:C.primary },
  slotText:{ fontSize:12, fontWeight:'700', color:C.slate },
  addMedSubmit:{ backgroundColor:C.primary, borderRadius:12, paddingVertical:12, alignItems:'center' },
  noteInput:{ backgroundColor:'#F8FAFC', borderWidth:1, borderColor:C.border, borderRadius:12, padding:12, fontSize:14, color:C.dark, minHeight:80, marginBottom:12 },
  noteCard:{ backgroundColor:C.surface, borderRadius:14, padding:14, marginBottom:10, borderWidth:1, borderColor:C.border, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.04, shadowRadius:4, elevation:1 },
  noteText:{ fontSize:14, color:C.dark, lineHeight:20 },
  noteTime:{ fontSize:11, color:C.slate, marginTop:6 },
  chatInput:{ flexDirection:'row', padding:12, paddingBottom:Platform.OS==='ios'?28:12, backgroundColor:C.surface, borderTopWidth:1, borderTopColor:C.border, gap:10, alignItems:'flex-end' },
  chatBox:{ flex:1, backgroundColor:'#F8FAFC', borderWidth:1, borderColor:C.border, borderRadius:20, paddingHorizontal:16, paddingTop:10, paddingBottom:10, maxHeight:100, fontSize:14, color:C.dark },
  sendBtn:{ width:46, height:46, borderRadius:23, backgroundColor:C.primary, alignItems:'center', justifyContent:'center' },
});

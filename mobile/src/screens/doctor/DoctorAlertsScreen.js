import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StatusBar, Animated, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiBroadcastAlert } from '../../services/api';

const C = { bg:'#F0F4F8', surface:'#FFF', primary:'#0A4A6E', accent:'#0EA5E9', emerald:'#10B981', amber:'#F59E0B', red:'#EF4444', slate:'#64748B', dark:'#0F172A', border:'#E2E8F0' };

const SEVERITIES = [
  { id:'info',    label:'INFO',     icon:'information-circle', color:'#0EA5E9', bg:'#EFF6FF' },
  { id:'warning', label:'WARNING',  icon:'warning',            color:'#F59E0B', bg:'#FFFBEB' },
  { id:'urgent',  label:'URGENT',   icon:'alert-circle',       color:'#EF4444', bg:'#FEF2F2' },
];

function SeverityBtn({ cfg, selected, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      style={[s.sevBtn, selected && { borderColor:cfg.color, backgroundColor:cfg.bg }]}
      onPress={() => { Animated.sequence([Animated.timing(scale,{toValue:0.92,duration:80,useNativeDriver:true}),Animated.timing(scale,{toValue:1,duration:80,useNativeDriver:true})]).start(); onPress(); }}
      activeOpacity={0.85}
    >
      <Ionicons name={cfg.icon} size={26} color={selected?cfg.color:'#94A3B8'} />
      <Text style={[s.sevLabel, { color:selected?cfg.color:'#94A3B8' }]}>{cfg.label}</Text>
    </TouchableOpacity>
  );
}

export default function DoctorAlertsScreen() {
  const { user } = useAuth();
  const [msg, setMsg]         = useState('');
  const [severity, setSev]    = useState('info');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState(null);
  const [log, setLog]         = useState([]);
  const MAX = 300;

  async function sendAlert() {
    if (!msg.trim() || msg.length > MAX) return;
    setSending(true); setError(null);
    try {
      await apiBroadcastAlert(`[${severity.toUpperCase()} ALERT] ${msg.trim()}`, severity);
      setLog(prev => [{ id:Date.now(), severity, message:msg.trim(), ts:new Date().toISOString() }, ...prev]);
      setMsg(''); setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch { setError('Failed to send. Please try again.'); }
    setSending(false);
  }

  const sevCfg = SEVERITIES.find(s => s.id === severity);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.docAvatar}><Text style={s.docAvatarTxt}>{user?.name?.charAt(0)?.toUpperCase()||'D'}</Text></View>
          <View style={{ marginLeft:14, flex:1 }}>
            <Text style={s.headerGreet}>System Broadcast</Text>
            <Text style={s.headerName}>Dr. {user?.name||'Doctor'}</Text>
          </View>
        </View>
        <Text style={s.pageTitle}>Send Alert</Text>
        <Text style={s.pageSub}>Transmit advisories to your patients</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.sectionTitle}>Alert Severity</Text>
          <View style={s.sevRow}>
            {SEVERITIES.map(cfg => (
              <SeverityBtn key={cfg.id} cfg={cfg} selected={severity===cfg.id} onPress={()=>setSev(cfg.id)} />
            ))}
          </View>

          <View style={s.msgHeader}>
            <Text style={s.sectionTitle}>Message</Text>
            <Text style={[s.charCount, msg.length>MAX&&{color:C.red}]}>{msg.length}/{MAX}</Text>
          </View>

          <View style={[s.inputWrap, msg.length>0&&{borderColor:sevCfg?.color}]}>
            <TextInput
              style={s.msgInput}
              value={msg}
              onChangeText={setMsg}
              placeholder="Type your alert message..."
              placeholderTextColor={C.slate}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={18} color={C.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {sent ? (
            <View style={s.sentBox}>
              <Ionicons name="checkmark-circle" size={22} color={C.emerald} />
              <Text style={s.sentText}>Alert dispatched successfully!</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor:sevCfg?.color||C.primary, opacity:(!msg.trim()||msg.length>MAX||sending)?0.55:1 }]}
              disabled={!msg.trim()||msg.length>MAX||sending}
              onPress={sendAlert}
              activeOpacity={0.85}
            >
              {sending ? <ActivityIndicator color="#FFF" /> : (
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <Text style={s.sendBtnText}>Send Alert</Text>
                  <Ionicons name="send" size={18} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Alert Log */}
        <Text style={s.logTitle}>Recent Transmissions</Text>
        {log.length === 0 ? (
          <View style={s.emptyLog}>
            <Ionicons name="megaphone-outline" size={40} color="#CBD5E1" />
            <Text style={s.emptyLogText}>No alerts sent yet</Text>
          </View>
        ) : log.map(a => {
          const cfg = SEVERITIES.find(sc => sc.id === a.severity) || SEVERITIES[0];
          return (
            <View key={a.id} style={[s.logCard, { borderLeftColor:cfg.color }]}>
              <View style={[s.logIcon, { backgroundColor:cfg.bg }]}>
                <Ionicons name={cfg.icon} size={18} color={cfg.color} />
              </View>
              <View style={{ flex:1 }}>
                <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:3}}>
                  <Text style={[s.logSev, { color:cfg.color }]}>{cfg.label}</Text>
                  <Text style={s.logTime}>{new Date(a.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</Text>
                </View>
                <Text style={s.logMsg}>{a.message}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:{ flex:1, backgroundColor:C.bg },
  header:{ backgroundColor:C.surface, paddingTop:Platform.OS==='ios'?56:48, paddingHorizontal:22, paddingBottom:14, borderBottomWidth:1, borderBottomColor:C.border },
  headerTop:{ flexDirection:'row', alignItems:'center', marginBottom:16 },
  docAvatar:{ width:48, height:48, borderRadius:24, backgroundColor:C.primary, alignItems:'center', justifyContent:'center' },
  docAvatarTxt:{ color:'#FFF', fontSize:18, fontWeight:'900' },
  headerGreet:{ fontSize:12, color:C.slate, fontWeight:'600' },
  headerName:{ fontSize:18, color:C.dark, fontWeight:'800' },
  pageTitle:{ fontSize:30, fontWeight:'900', color:C.dark, letterSpacing:-0.5, marginBottom:2 },
  pageSub:{ fontSize:13, color:C.slate, fontWeight:'500' },
  content:{ padding:20, paddingBottom:120 },
  card:{ backgroundColor:C.surface, borderRadius:22, padding:22, marginBottom:24, shadowColor:'#0A4A6E', shadowOffset:{width:0,height:4}, shadowOpacity:0.08, shadowRadius:12, elevation:4 },
  sectionTitle:{ fontSize:13, fontWeight:'800', color:C.dark, marginBottom:14, textTransform:'uppercase', letterSpacing:0.5 },
  sevRow:{ flexDirection:'row', gap:10, marginBottom:22 },
  sevBtn:{ flex:1, alignItems:'center', paddingVertical:14, borderRadius:16, borderWidth:1.5, borderColor:C.border, backgroundColor:'#F8FAFC', gap:8 },
  sevLabel:{ fontSize:11, fontWeight:'800', letterSpacing:0.5 },
  msgHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  charCount:{ fontSize:12, fontWeight:'600', color:C.slate, marginBottom:14 },
  inputWrap:{ borderWidth:1.5, borderColor:C.border, borderRadius:16, backgroundColor:'#F8FAFC', marginBottom:20 },
  msgInput:{ padding:16, fontSize:15, color:C.dark, minHeight:130, textAlignVertical:'top', fontWeight:'500' },
  errorBox:{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#FEF2F2', borderWidth:1, borderColor:'#FECACA', borderRadius:14, padding:13, marginBottom:16 },
  errorText:{ color:C.red, fontSize:13, fontWeight:'700', flex:1 },
  sentBox:{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, backgroundColor:'#ECFDF5', borderWidth:1, borderColor:'#A7F3D0', borderRadius:16, paddingVertical:16 },
  sentText:{ color:C.dark, fontSize:15, fontWeight:'800' },
  sendBtn:{ borderRadius:16, paddingVertical:17, alignItems:'center', justifyContent:'center' },
  sendBtnText:{ color:'#FFF', fontSize:16, fontWeight:'800' },
  logTitle:{ fontSize:14, fontWeight:'800', color:C.slate, textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 },
  logCard:{ flexDirection:'row', alignItems:'flex-start', gap:12, backgroundColor:C.surface, borderRadius:18, padding:14, marginBottom:10, borderLeftWidth:4, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.04, shadowRadius:6, elevation:2 },
  logIcon:{ width:40, height:40, borderRadius:12, alignItems:'center', justifyContent:'center' },
  logSev:{ fontSize:11, fontWeight:'900', letterSpacing:0.5 },
  logTime:{ fontSize:11, color:C.slate, fontWeight:'600' },
  logMsg:{ fontSize:13, color:C.dark, fontWeight:'500', lineHeight:18 },
  emptyLog:{ alignItems:'center', paddingVertical:40, gap:10 },
  emptyLogText:{ fontSize:14, color:'#94A3B8', fontWeight:'500' },
});

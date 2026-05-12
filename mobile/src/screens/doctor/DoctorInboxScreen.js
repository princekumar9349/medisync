import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StatusBar, RefreshControl, Platform, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { apiDoctorGetInbox } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const C = { bg:'#F0F4F8', surface:'#FFF', primary:'#0A4A6E', accent:'#0EA5E9', emerald:'#10B981', amber:'#F59E0B', red:'#EF4444', slate:'#64748B', dark:'#0F172A', border:'#E2E8F0' };

const TABS = [
  { id:'chats',       label:'Chats',       icon:'chatbubbles'   },
  { id:'alerts',      label:'Alerts',      icon:'warning'       },
  { id:'emergencies', label:'Emergency',   icon:'alert-circle'  },
];

function getCategory(msg='') {
  const m = msg.toUpperCase();
  if (m.includes('[URGENT') || m.includes('CRITICAL') || m.includes('EMERGENCY') || m.includes('SOS')) return 'emergencies';
  if (m.includes('[WARNING') || m.includes('[INFO') || m.includes('[ALERT') || m.includes('MISSED')) return 'alerts';
  return 'chats';
}

function ThreadCard({ thread, onPress, category }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isEmergency = category === 'emergencies';
  const isAlert     = category === 'alerts';
  const hasUnread   = thread.unread_count > 0;
  const initial     = thread.patient_name?.charAt(0)?.toUpperCase() || 'P';
  const timeStr     = thread.timestamp ? new Date(thread.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';

  const press = () => {
    Animated.sequence([
      Animated.timing(scale,{toValue:0.96,duration:80,useNativeDriver:true}),
      Animated.timing(scale,{toValue:1,duration:80,useNativeDriver:true}),
    ]).start();
    onPress?.();
  };

  return (
    <Animated.View style={{ transform:[{scale}] }}>
      <TouchableOpacity
        style={[s.threadCard, isEmergency && s.emergencyCard, isAlert && s.alertCard, hasUnread && !isEmergency && !isAlert && s.unreadCard]}
        onPress={press}
        activeOpacity={0.9}
      >
        {isEmergency && <View style={s.emergencyStripe} />}
        <View style={[s.threadAvatar, { backgroundColor: isEmergency?'#FEE2E2':isAlert?'#FEF9C3':'#EFF6FF' }]}>
          <Text style={[s.threadAvatarText, { color: isEmergency?C.red:isAlert?C.amber:C.primary }]}>{initial}</Text>
          {isEmergency && <View style={s.pulseDot} />}
        </View>
        <View style={s.threadContent}>
          <View style={s.threadHeader}>
            <Text style={[s.threadName, hasUnread&&{fontWeight:'900',color:C.dark}]}>{thread.patient_name}</Text>
            <Text style={[s.threadTime, hasUnread&&{color:C.accent,fontWeight:'700'}]}>{timeStr}</Text>
          </View>
          {isEmergency && <View style={s.emergencyPill}><Text style={s.emergencyPillText}>🚨 EMERGENCY</Text></View>}
          {isAlert && !isEmergency && <View style={s.alertPill}><Text style={s.alertPillText}>⚠️ ALERT</Text></View>}
          <Text style={[s.threadMsg, hasUnread&&{color:C.dark,fontWeight:'600'}]} numberOfLines={2}>{thread.latest_message}</Text>
        </View>
        {hasUnread && (
          <View style={[s.unreadBadge, { backgroundColor: isEmergency?C.red:C.primary }]}>
            <Text style={s.unreadCount}>{thread.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DoctorInboxScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [threads, setThreads]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('chats');
  const [search, setSearch]       = useState('');

  const fetch = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    try {
      const d = await apiDoctorGetInbox();
      setThreads(d.threads || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetch(true));
    fetch();
    return unsub;
  }, [navigation, fetch]);

  const categorized = threads.filter(t => {
    if (search && !t.patient_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return getCategory(t.latest_message) === activeTab;
  });

  const counts = {
    chats:       threads.filter(t => getCategory(t.latest_message)==='chats'       && t.unread_count>0).length,
    alerts:      threads.filter(t => getCategory(t.latest_message)==='alerts'      && t.unread_count>0).length,
    emergencies: threads.filter(t => getCategory(t.latest_message)==='emergencies' && t.unread_count>0).length,
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.pageTitle}>Inbox</Text>
            <Text style={s.pageSub}>Secure · Assigned Patients Only</Text>
          </View>
          <TouchableOpacity style={s.avatarBtn} onPress={() => navigation.navigate('DoctorProfile')}>
            <Text style={s.avatarTxt}>{user?.name?.charAt(0)?.toUpperCase()||'D'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={C.slate} style={{marginRight:8}} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search patients..." placeholderTextColor={C.slate} />
          {search.length>0 && <TouchableOpacity onPress={()=>setSearch('')}><Ionicons name="close-circle" size={18} color={C.slate} /></TouchableOpacity>}
        </View>

        <View style={s.tabRow}>
          {TABS.map(t => {
            const cnt = counts[t.id];
            const active = activeTab === t.id;
            const isEmer = t.id === 'emergencies';
            return (
              <TouchableOpacity key={t.id} style={[s.tabBtn, active && (isEmer?s.tabBtnEmergency:s.tabBtnActive)]} onPress={() => setActiveTab(t.id)}>
                <Ionicons name={t.icon} size={15} color={active?(isEmer?'#FFF':C.primary):C.slate} />
                <Text style={[s.tabLabel, active&&(isEmer?{color:'#FFF'}:{color:C.primary})]}>{t.label}</Text>
                {cnt > 0 && <View style={[s.tabBadge, {backgroundColor:isEmer?C.red:C.primary}]}><Text style={s.tabBadgeText}>{cnt}</Text></View>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetch(true);}} tintColor={C.primary} />}
        >
          {activeTab === 'emergencies' && (
            <View style={s.emergencyBanner}>
              <Ionicons name="shield-checkmark" size={18} color="#FFF" />
              <Text style={s.emergencyBannerText}>Emergency channel — respond immediately</Text>
            </View>
          )}
          {categorized.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name={activeTab==='emergencies'?'shield-checkmark':activeTab==='alerts'?'checkmark-circle':'chatbubbles-outline'} size={52} color="#CBD5E1" />
              <Text style={s.emptyTitle}>{activeTab==='emergencies'?'No emergencies':'All clear'}</Text>
              <Text style={s.emptySub}>Nothing in {activeTab} right now</Text>
            </View>
          ) : (
            categorized.map(t => (
              <ThreadCard
                key={t.patient_id}
                thread={t}
                category={activeTab}
                onPress={() => navigation.navigate('DoctorPatientChat', {
                  patientId:   t.patient_id,
                  patientName: t.patient_name,
                })}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:{ flex:1, backgroundColor:C.bg },
  header:{ backgroundColor:C.surface, paddingTop:Platform.OS==='ios'?56:48, paddingHorizontal:20, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.border },
  headerTop:{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  pageTitle:{ fontSize:28, fontWeight:'900', color:C.dark, letterSpacing:-0.5 },
  pageSub:{ fontSize:11, color:C.emerald, fontWeight:'700', marginTop:2 },
  avatarBtn:{ width:42, height:42, borderRadius:21, backgroundColor:C.primary, alignItems:'center', justifyContent:'center' },
  avatarTxt:{ color:'#FFF', fontSize:16, fontWeight:'800' },
  searchBar:{ flexDirection:'row', alignItems:'center', backgroundColor:'#F8FAFC', borderWidth:1, borderColor:C.border, borderRadius:14, paddingHorizontal:14, paddingVertical:10, marginBottom:12 },
  searchInput:{ flex:1, fontSize:14, color:C.dark },
  tabRow:{ flexDirection:'row', gap:8, paddingBottom:4 },
  tabBtn:{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:9, borderRadius:20, backgroundColor:'#F1F5F9', borderWidth:1, borderColor:C.border },
  tabBtnActive:{ backgroundColor:'#EFF6FF', borderColor:'#BFDBFE' },
  tabBtnEmergency:{ backgroundColor:C.red, borderColor:C.red },
  tabLabel:{ fontSize:12, fontWeight:'700', color:C.slate },
  tabBadge:{ borderRadius:10, paddingHorizontal:6, paddingVertical:1, minWidth:18, alignItems:'center' },
  tabBadgeText:{ color:'#FFF', fontSize:10, fontWeight:'900' },
  list:{ padding:16, paddingBottom:100, gap:10 },
  emergencyBanner:{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:C.red, borderRadius:14, padding:12, marginBottom:8 },
  emergencyBannerText:{ color:'#FFF', fontWeight:'800', fontSize:13 },
  threadCard:{ backgroundColor:C.surface, borderRadius:18, padding:14, flexDirection:'row', alignItems:'center', gap:12, borderWidth:1, borderColor:C.border, shadowColor:'#0A4A6E', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:2 },
  emergencyCard:{ borderColor:C.red, borderWidth:2, backgroundColor:'#FFF5F5', overflow:'hidden' },
  alertCard:{ borderColor:C.amber, borderWidth:1.5 },
  unreadCard:{ borderLeftWidth:4, borderLeftColor:C.accent },
  emergencyStripe:{ position:'absolute', left:0, top:0, bottom:0, width:4, backgroundColor:C.red },
  threadAvatar:{ width:50, height:50, borderRadius:25, alignItems:'center', justifyContent:'center', position:'relative' },
  threadAvatarText:{ fontSize:20, fontWeight:'900' },
  pulseDot:{ position:'absolute', top:2, right:2, width:12, height:12, borderRadius:6, backgroundColor:C.red, borderWidth:2, borderColor:'#FFF' },
  threadContent:{ flex:1 },
  threadHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  threadName:{ fontSize:15, fontWeight:'700', color:C.dark },
  threadTime:{ fontSize:11, color:C.slate },
  emergencyPill:{ backgroundColor:'#FEE2E2', borderRadius:8, paddingHorizontal:8, paddingVertical:2, alignSelf:'flex-start', marginBottom:4 },
  emergencyPillText:{ fontSize:10, fontWeight:'900', color:C.red, letterSpacing:0.5 },
  alertPill:{ backgroundColor:'#FEF3C7', borderRadius:8, paddingHorizontal:8, paddingVertical:2, alignSelf:'flex-start', marginBottom:4 },
  alertPillText:{ fontSize:10, fontWeight:'900', color:C.amber, letterSpacing:0.5 },
  threadMsg:{ fontSize:13, color:C.slate, lineHeight:18 },
  unreadBadge:{ minWidth:22, height:22, borderRadius:11, alignItems:'center', justifyContent:'center', paddingHorizontal:5 },
  unreadCount:{ color:'#FFF', fontSize:11, fontWeight:'900' },
  empty:{ alignItems:'center', paddingVertical:60, gap:12 },
  emptyTitle:{ fontSize:20, fontWeight:'800', color:C.dark },
  emptySub:{ fontSize:14, color:C.slate },
});

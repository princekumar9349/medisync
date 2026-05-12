import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StatusBar, Platform, Alert, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiGetDoctorProfile, apiUpdateDoctorProfile } from '../../services/api';

const C = { bg:'#F0F4F8', surface:'#FFF', primary:'#0A4A6E', accent:'#0EA5E9', emerald:'#10B981', amber:'#F59E0B', red:'#EF4444', slate:'#64748B', dark:'#0F172A', border:'#E2E8F0' };

const STATUS_OPTIONS = [
  { id:'available',       label:'Available',       icon:'checkmark-circle', color:C.emerald },
  { id:'busy',            label:'Busy',             icon:'time',             color:C.amber   },
  { id:'emergency_only',  label:'Emergency Only',   icon:'alert-circle',     color:C.red     },
  { id:'offline',         label:'Offline',          icon:'ellipse',          color:C.slate   },
];

export default function DoctorProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ specialization:'', clinic_name:'', clinic_address:'', consultation_timings:'', availability_status:'available', emergency_available:true });

  useEffect(() => {
    (async () => {
      try {
        const d = await apiGetDoctorProfile();
        setProfile(d);
        setForm(f => ({
          ...f,
          specialization: d.specialization || '',
          clinic_name: d.clinic_name || '',
          clinic_address: d.clinic_address || '',
          consultation_timings: d.consultation_timings || '',
          availability_status: d.availability_status || 'available',
          emergency_available: d.emergency_available !== false,
        }));
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiUpdateDoctorProfile(form);
      Alert.alert('✅ Profile updated');
    } catch { Alert.alert('Error', 'Failed to update profile'); }
    setSaving(false);
  }

  function confirmLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text:'Cancel', style:'cancel' },
      { text:'Sign Out', style:'destructive', onPress: logout },
    ]);
  }

  const statusCfg = STATUS_OPTIONS.find(s => s.id === form.availability_status) || STATUS_OPTIONS[0];

  if (loading) return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:C.bg }}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  );

  return (
    <View style={{ flex:1, backgroundColor:C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Hero Header */}
      <View style={s.heroHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <View style={s.avatarCircle}>
          <Text style={s.avatarText}>{user?.name?.charAt(0)?.toUpperCase()||'D'}</Text>
          <View style={[s.statusDot, { backgroundColor: statusCfg.color }]} />
        </View>
        <Text style={s.heroName}>Dr. {user?.name||'Doctor'}</Text>
        <Text style={s.heroEmail}>{user?.email||''}</Text>
        {profile?.patient_id && <View style={s.idBadge}><Text style={s.idText}>ID: {profile.patient_id}</Text></View>}
        <View style={[s.availBadge, { backgroundColor:statusCfg.color+'33', borderColor:statusCfg.color }]}>
          <Ionicons name={statusCfg.icon} size={14} color={statusCfg.color} />
          <Text style={[s.availText, { color:statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Availability Status */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Availability Status</Text>
          <View style={s.statusGrid}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[s.statusBtn, form.availability_status===opt.id && { borderColor:opt.color, backgroundColor:opt.color+'15' }]}
                onPress={() => setForm(f => ({...f, availability_status:opt.id}))}
                activeOpacity={0.8}
              >
                <Ionicons name={opt.icon} size={20} color={form.availability_status===opt.id?opt.color:C.slate} />
                <Text style={[s.statusBtnText, form.availability_status===opt.id&&{color:opt.color,fontWeight:'800'}]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.switchRow}>
            <View style={{ flex:1 }}>
              <Text style={s.switchLabel}>Emergency Available</Text>
              <Text style={s.switchSub}>Receive emergency escalations from unassigned patients</Text>
            </View>
            <Switch value={form.emergency_available} onValueChange={v => setForm(f=>({...f,emergency_available:v}))} trackColor={{ false:'#E2E8F0', true:C.red }} thumbColor={form.emergency_available?'#FFF':'#FFF'} />
          </View>
        </View>

        {/* Professional Info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Professional Details</Text>
          {[
            { key:'specialization', label:'Specialization', placeholder:'e.g. Cardiologist, General Physician' },
            { key:'clinic_name',    label:'Clinic / Hospital Name', placeholder:'e.g. City Medical Center' },
            { key:'clinic_address', label:'Address', placeholder:'Full clinic address' },
            { key:'consultation_timings', label:'Consultation Hours', placeholder:'e.g. Mon-Sat, 9AM - 5PM' },
          ].map(f => (
            <View key={f.key} style={{ marginBottom:14 }}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <TextInput
                style={s.input}
                value={form[f.key]}
                onChangeText={v => setForm(p=>({...p,[f.key]:v}))}
                placeholder={f.placeholder}
                placeholderTextColor={C.slate}
              />
            </View>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity style={[s.saveBtn, { opacity:saving?0.7:1 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color="#FFF" /> : (
            <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={s.saveBtnText}>Save Profile</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={s.versionText}>MediSync Doctor v2.0 · Secure Session</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  heroHeader:{ backgroundColor:C.primary, paddingTop:Platform.OS==='ios'?56:50, paddingBottom:28, alignItems:'center', paddingHorizontal:20, position:'relative' },
  backBtn:{ position:'absolute', top:Platform.OS==='ios'?56:50, left:16, width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  avatarCircle:{ width:80, height:80, borderRadius:40, backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center', borderWidth:3, borderColor:'rgba(255,255,255,0.4)', marginBottom:10, position:'relative' },
  avatarText:{ color:'#FFF', fontSize:32, fontWeight:'900' },
  statusDot:{ position:'absolute', bottom:4, right:4, width:16, height:16, borderRadius:8, borderWidth:2, borderColor:C.primary },
  heroName:{ color:'#FFF', fontSize:22, fontWeight:'900', letterSpacing:-0.5 },
  heroEmail:{ color:'rgba(255,255,255,0.7)', fontSize:13, marginTop:3 },
  idBadge:{ backgroundColor:'rgba(255,255,255,0.15)', borderRadius:20, paddingHorizontal:12, paddingVertical:4, marginTop:8, borderWidth:1, borderColor:'rgba(255,255,255,0.3)' },
  idText:{ color:'rgba(255,255,255,0.9)', fontSize:12, fontWeight:'700', letterSpacing:0.5 },
  availBadge:{ flexDirection:'row', alignItems:'center', gap:6, borderRadius:20, paddingHorizontal:14, paddingVertical:6, marginTop:10, borderWidth:1.5 },
  availText:{ fontSize:13, fontWeight:'800' },
  content:{ padding:16, paddingBottom:60 },
  card:{ backgroundColor:C.surface, borderRadius:20, padding:18, marginBottom:14, borderWidth:1, borderColor:C.border, shadowColor:'#0A4A6E', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  cardTitle:{ fontSize:15, fontWeight:'800', color:C.dark, marginBottom:14 },
  statusGrid:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:16 },
  statusBtn:{ flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:14, paddingVertical:10, borderRadius:14, borderWidth:1.5, borderColor:C.border, backgroundColor:'#F8FAFC' },
  statusBtnText:{ fontSize:13, fontWeight:'600', color:C.slate },
  switchRow:{ flexDirection:'row', alignItems:'center', paddingTop:12, borderTopWidth:1, borderTopColor:'#F1F5F9' },
  switchLabel:{ fontSize:14, fontWeight:'700', color:C.dark },
  switchSub:{ fontSize:11, color:C.slate, marginTop:2, lineHeight:16 },
  fieldLabel:{ fontSize:12, fontWeight:'700', color:C.slate, marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 },
  input:{ backgroundColor:'#F8FAFC', borderWidth:1, borderColor:C.border, borderRadius:12, paddingHorizontal:14, paddingVertical:12, fontSize:14, color:C.dark },
  saveBtn:{ backgroundColor:C.primary, borderRadius:16, paddingVertical:16, alignItems:'center', marginBottom:12 },
  saveBtnText:{ color:'#FFF', fontSize:16, fontWeight:'800' },
  logoutBtn:{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#FEF2F2', borderWidth:1.5, borderColor:'#FECACA', borderRadius:16, paddingVertical:15, marginBottom:20 },
  logoutText:{ color:C.red, fontSize:16, fontWeight:'800' },
  versionText:{ textAlign:'center', fontSize:11, color:'#94A3B8', marginBottom:10 },
});

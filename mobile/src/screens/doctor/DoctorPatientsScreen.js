/**
 * screens/doctor/DoctorPatientsScreen.js — Patient List
 * Clean Medical Theme — Teal/White
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';
import { apiGetDoctorPatients } from '../../services/api';

const STATUS_CFG = {
  active:   { bg: COLORS.brand50,   border: COLORS.brand200,   text: COLORS.brand700,   label: 'Active'   },
  critical: { bg: COLORS.red50,     border: COLORS.red200,     text: COLORS.red700,     label: 'Critical' },
  stable:   { bg: COLORS.emerald50, border: COLORS.emerald200, text: COLORS.emerald700, label: 'Stable'   },
};

function PatientCard({ patient, onPress }) {
  const cfg = STATUS_CFG[patient.status] || STATUS_CFG.active;
  return (
    <TouchableOpacity style={styles.patientCard} onPress={onPress} activeOpacity={0.8}>
      <View style={S.row}>
        <View style={styles.patientAvatar}><Ionicons name="person" size={22} color={COLORS.brand600} /></View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.patientName}>{patient.name}</Text>
          <Text style={styles.patientMeta}>Age {patient.age} · {patient.condition}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DoctorPatientsScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchPatients() {
      try { const data = await apiGetDoctorPatients(); setPatients(data.patients || []); }
      catch (err) { console.error("Failed to fetch patients", err); }
      finally { setLoading(false); }
    }
    const unsubscribe = navigation.addListener('focus', () => { fetchPatients(); });
    fetchPatients();
    return unsubscribe;
  }, [navigation]);

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={[S.headerBar, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View>
          <View style={S.row}><Text style={S.headerTitle}>My Patients</Text><View style={styles.countBadge}><Text style={styles.countText}>{patients.length}</Text></View></View>
          <Text style={S.headerSubtitle}>Manage & monitor patients</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('SearchPatients')}><Ionicons name="person-add-outline" size={18} color={COLORS.brand600} /></TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}><Ionicons name="log-out-outline" size={18} color={COLORS.red500} /></TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.slate400} style={{ marginRight: 8 }} />
          <TextInput style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search Patient ID (e.g. P-1234)" placeholderTextColor={COLORS.slate400} onSubmitEditing={() => { const q = searchQuery.trim(); if (q) { setSearchQuery(''); navigation.navigate('PatientDetail', { patientId: q }); } }} returnKeyType="search" />
        </View>
      </View>

      <ScrollView contentContainerStyle={[S.scrollContent, { paddingTop: SPACING.sm }]} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={[S.center, { marginTop: 60 }]}><ActivityIndicator size="large" color={COLORS.brand500} /><Text style={{ color: COLORS.slate500, marginTop: 12 }}>Loading patients…</Text></View>
        ) : patients.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center', marginTop: 40 }}>
            <View style={styles.emptyCircle}><Ionicons name="people-outline" size={44} color={COLORS.brand400} /></View>
            <Text style={{ textAlign: 'center', color: COLORS.slate800, fontSize: FONTS.xl, fontWeight: FONTS.bold }}>No patients yet</Text>
            <Text style={{ textAlign: 'center', color: COLORS.slate500, marginTop: 8, fontSize: FONTS.base, lineHeight: 22 }}>Tap the + button to search and add patients.</Text>
            <TouchableOpacity style={{ marginTop: 20, backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => navigation.navigate('SearchPatients')}>
              <Ionicons name="search" size={16} color={COLORS.white} /><Text style={{ color: COLORS.white, fontWeight: FONTS.bold }}>Find Patients</Text>
            </TouchableOpacity>
          </View>
        ) : patients.map(patient => <PatientCard key={patient.id} patient={patient} onPress={() => navigation.navigate('PatientDetail', { patientId: patient.id })} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  countBadge: { backgroundColor: COLORS.brand50, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8, borderWidth: 1, borderColor: COLORS.brand200 },
  countText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.brand700 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.slate50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  searchContainer: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: FONTS.base, color: COLORS.slate800 },
  patientCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  patientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  patientName: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  patientMeta: { fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 3 },
  statusBadge: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  statusText: { fontSize: FONTS.xs, fontWeight: FONTS.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
});

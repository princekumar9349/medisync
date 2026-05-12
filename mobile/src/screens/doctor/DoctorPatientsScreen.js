/**
 * DoctorPatientsScreen.js — Premium Patient Management
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, Animated,
  RefreshControl, Platform, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiGetDoctorPatients } from '../../services/api';

const C = {
  bg: '#F0F4F8', surface: '#FFF', primary: '#0A4A6E', accent: '#0EA5E9',
  emerald: '#10B981', amber: '#F59E0B', red: '#EF4444',
  slate: '#64748B', dark: '#0F172A', border: '#E2E8F0',
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: '🔴 Critical' },
  { id: 'active', label: '🟡 Active' },
  { id: 'stable', label: '🟢 Stable' },
];

const RISK_CFG = {
  critical: { color: C.red, bg: '#FEF2F2', border: '#FECACA', label: 'Critical' },
  active:   { color: C.amber, bg: '#FFFBEB', border: '#FDE68A', label: 'Active' },
  stable:   { color: C.emerald, bg: '#ECFDF5', border: '#A7F3D0', label: 'Stable' },
};

function AdherenceMini({ pct }) {
  const w = Math.max(0, Math.min(100, pct || 0));
  const color = w >= 75 ? C.emerald : w >= 50 ? C.amber : C.red;
  return (
    <View>
      <View style={styles.miniTrack}>
        <View style={[styles.miniFill, { width: `${w}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.miniPct, { color }]}>{w}%</Text>
    </View>
  );
}

function PatientCard({ patient, onPress, index }) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const cfg = RISK_CFG[patient.status] || RISK_CFG.active;
  const initial = patient.name?.charAt(0)?.toUpperCase() || 'P';
  const isCritical = patient.status === 'critical';

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={[styles.patientCard, isCritical && styles.criticalCard]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {isCritical && <View style={styles.criticalStripe} />}
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[styles.avatarText, { color: cfg.color }]}>{initial}</Text>
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.nameRow}>
              <Text style={styles.patientName} numberOfLines={1}>{patient.name}</Text>
              {isCritical && <Ionicons name="alert-circle" size={14} color={C.red} style={{ marginLeft: 6 }} />}
            </View>
            <Text style={styles.patientSub}>Age {patient.age} · {patient.condition || 'General'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.metricBox}>
            <Ionicons name="stats-chart" size={12} color={C.slate} />
            <Text style={styles.metricLabel}>Adherence</Text>
            <AdherenceMini pct={patient.adherence_pct} />
          </View>
          <View style={styles.metricSep} />
          <View style={styles.metricBox}>
            <Ionicons name="medkit" size={12} color={C.slate} />
            <Text style={styles.metricLabel}>Medicines</Text>
            <Text style={styles.metricVal}>{patient.medicine_count ?? '—'}</Text>
          </View>
          <View style={styles.metricSep} />
          <View style={styles.metricBox}>
            <Ionicons name="warning" size={12} color={patient.missed_today > 0 ? C.red : C.slate} />
            <Text style={styles.metricLabel}>Missed Today</Text>
            <Text style={[styles.metricVal, patient.missed_today > 0 && { color: C.red, fontWeight: '800' }]}>
              {patient.missed_today ?? 0}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.border} style={{ alignSelf: 'center' }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={[styles.patientCard, { opacity: anim }]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#E2E8F0' }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 14, backgroundColor: '#E2E8F0', borderRadius: 6, width: '60%' }} />
          <View style={{ height: 11, backgroundColor: '#F1F5F9', borderRadius: 6, width: '40%' }} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function DoctorPatientsScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();
  const [patients, setPatients]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQ, setSearchQ]       = useState('');
  const [activeFilter, setFilter]   = useState('all');

  const fetchPatients = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGetDoctorPatients();
      setPatients(data.patients || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchPatients(true));
    fetchPatients();
    return unsub;
  }, [navigation, fetchPatients]);

  const filtered = patients.filter(p => {
    const q = searchQ.toLowerCase();
    const matchQ = !q || p.name?.toLowerCase().includes(q) || p.condition?.toLowerCase().includes(q);
    const matchF = activeFilter === 'all' || p.status === activeFilter;
    return matchQ && matchF;
  });

  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        logout();
      }
      return;
    }
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.pageTitle}>My Patients</Text>
            <Text style={styles.pageSubtitle}>{patients.length} patient{patients.length !== 1 ? 's' : ''} under care</Text>
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('SearchPatients')}>
              <Ionicons name="person-add-outline" size={20} color={C.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { borderColor: '#FECACA' }]} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={C.slate} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder="Search patients, conditions..."
            placeholderTextColor={C.slate}
          />
          {searchQ.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQ('')}>
              <Ionicons name="close-circle" size={18} color={C.slate} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, activeFilter === f.id && styles.chipActive]}
              onPress={() => setFilter(f.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, activeFilter === f.id && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Patient List */}
      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <PatientCard
              patient={item}
              index={index}
              onPress={() => navigation.navigate('PatientDetail', { patientId: item.id })}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPatients(true); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>{searchQ ? 'No results' : 'No patients yet'}</Text>
              <Text style={styles.emptySubtitle}>{searchQ ? 'Try a different search term' : 'Add patients using the + button'}</Text>
              {!searchQ && (
                <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('SearchPatients')}>
                  <Ionicons name="person-add" size={16} color="#FFF" />
                  <Text style={styles.addBtnText}>Add Patient</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.surface, paddingTop: Platform.OS === 'ios' ? 56 : 48, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  pageTitle: { fontSize: 28, fontWeight: '900', color: C.dark, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: C.slate, marginTop: 2, fontWeight: '500' },
  headerBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, color: C.dark },
  filterRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: C.slate },
  chipTextActive: { color: '#FFF' },
  listContent: { padding: 16, paddingBottom: 100, gap: 12 },
  patientCard: { backgroundColor: C.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#0A4A6E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, overflow: 'hidden' },
  criticalCard: { borderColor: '#FECACA', borderWidth: 1.5 },
  criticalStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.red },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: '900' },
  cardMeta: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  patientName: { fontSize: 16, fontWeight: '800', color: C.dark },
  patientSub: { fontSize: 12, color: C.slate, marginTop: 3, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, gap: 4 },
  metricBox: { flex: 1, alignItems: 'center', gap: 3 },
  metricLabel: { fontSize: 10, color: C.slate, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  metricVal: { fontSize: 15, fontWeight: '800', color: C.dark },
  metricSep: { width: 1, height: 30, backgroundColor: C.border },
  miniTrack: { height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, width: 48, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 3 },
  miniPct: { fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.dark },
  emptySubtitle: { fontSize: 14, color: C.slate, textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  addBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});

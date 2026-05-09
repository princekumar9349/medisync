/**
 * screens/doctor/DoctorSearchScreen.js
 * Search all patients and add them to the doctor's panel.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOW } from '../../theme';
import { apiSearchAllPatients, apiAssignPatient } from '../../services/api';
import { useFocusEffect } from '@react-navigation/native';

export default function DoctorSearchScreen({ navigation }) {
  const [query, setQuery]         = useState('');
  const [patients, setPatients]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assigning, setAssigning] = useState(null); // user_id being assigned

  const doSearch = useCallback(async (q = query) => {
    setLoading(true);
    try {
      const data = await apiSearchAllPatients(q);
      setPatients(data.patients || []);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to search patients');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => { doSearch(''); }, []));

  async function handleAssign(patient) {
    if (patient.is_assigned) {
      navigation.navigate('PatientDetail', { patient_id: patient.user_id });
      return;
    }
    setAssigning(patient.user_id);
    try {
      await apiAssignPatient(patient.user_id);
      setPatients(prev =>
        prev.map(p => p.user_id === patient.user_id ? { ...p, is_assigned: true } : p)
      );
      Alert.alert('✅ Added', `${patient.name} added to your panel.`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to assign patient');
    } finally {
      setAssigning(null);
    }
  }

  function renderPatient({ item }) {
    const isAssigning = assigning === item.user_id;
    return (
      <View style={styles.card}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {item.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.patientName}>{item.name}</Text>
          <Text style={styles.patientMeta}>
            ID: {item.patient_id || '—'} · Age: {item.age || '—'} · {item.gender || 'Unknown'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, item.is_assigned && styles.assignedBtn]}
          onPress={() => handleAssign(item)}
          disabled={isAssigning}
          activeOpacity={0.8}
        >
          {isAssigning ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons
              name={item.is_assigned ? 'checkmark-circle' : 'person-add'}
              size={20}
              color={COLORS.white}
            />
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bgLight} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.slate700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find Patients</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={COLORS.slate400} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => doSearch(query)}
          placeholder="Search by name or patient ID..."
          placeholderTextColor={COLORS.slate400}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); doSearch(''); }}>
            <Ionicons name="close-circle" size={20} color={COLORS.slate400} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.brand600} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : (
        <FlatList
          data={patients}
          keyExtractor={item => item.user_id}
          renderItem={renderPatient}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={COLORS.slate300} />
              <Text style={styles.emptyText}>
                {query ? 'No patients found' : 'No patients registered yet'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bgLight },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  backBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm },
  headerTitle: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.xl, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, marginBottom: SPACING.lg,
    ...SHADOW.sm,
  },
  searchInput: { flex: 1, fontSize: FONTS.base, color: COLORS.slate800 },

  list: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING['3xl'] },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  avatarCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.brand100,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText:  { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.brand600 },
  cardInfo:    { flex: 1 },
  patientName: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  patientMeta: { fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2 },

  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.brand600,
    alignItems: 'center', justifyContent: 'center',
  },
  assignedBtn: { backgroundColor: COLORS.emerald600 },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { color: COLORS.slate500, marginTop: SPACING.md },
  emptyText:   { color: COLORS.slate400, marginTop: SPACING.md, fontSize: FONTS.sm, textAlign: 'center' },
});

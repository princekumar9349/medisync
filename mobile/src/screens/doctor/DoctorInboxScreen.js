/**
 * screens/doctor/DoctorInboxScreen.js — Doctor's Message Inbox
 * Business Theme Overhaul
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiDoctorGetInbox } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

export default function DoctorInboxScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchInbox = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiDoctorGetInbox();
      setThreads(data.threads || []);
    } catch {
      setError('Could not load inbox.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  function handleThreadPress(patientId) {
    navigation.navigate('Patients', {
      screen: 'PatientDetail',
      params: { patientId }
    });
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* Header */}
      <View style={[S.headerBackground, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View>
          <Text style={S.headerTitle}>Inbox</Text>
          <Text style={S.headerSubtitle}>Dr. {user?.name || 'Doctor'}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchInbox()}>
          <Ionicons name="refresh" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={S.overlapContainer}>
        {/* Threads List */}
        <ScrollView
          style={styles.messages}
          contentContainerStyle={S.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchInbox(true); }} colors={[COLORS.brand600]} />}
        >
          {loading && (
            <View style={[S.center, { paddingVertical: 40 }]}>
              <ActivityIndicator color={COLORS.brand600} />
              <Text style={{ color: COLORS.slate500, marginTop: 12, fontSize: FONTS.base }}>Loading inbox…</Text>
            </View>
          )}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={24} color={COLORS.red600} style={{ marginRight: 8 }} />
              <Text style={{ color: COLORS.red700, fontSize: FONTS.sm, flex: 1 }}>{error}</Text>
              <TouchableOpacity onPress={() => fetchInbox()} style={{ padding: 4 }}>
                <Text style={{ color: COLORS.red600, fontWeight: FONTS.bold }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !error && threads.length === 0 && (
            <View style={[S.center, { paddingVertical: 60 }]}>
              <View style={styles.emptyCircle}>
                <Ionicons name="mail-open-outline" size={48} color={COLORS.brand300} />
              </View>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyDesc}>When patients send messages they'll appear here.</Text>
            </View>
          )}
          {!loading && threads.map((thread) => (
            <TouchableOpacity
              key={thread.patient_id}
              style={styles.threadCard}
              activeOpacity={0.8}
              onPress={() => handleThreadPress(thread.patient_id)}
            >
              <View style={styles.avatarUser}>
                <Ionicons name="person" size={20} color={COLORS.brand600} />
              </View>
              <View style={styles.threadInfo}>
                <View style={S.rowBetween}>
                  <Text style={styles.patientName}>{thread.patient_name}</Text>
                  <Text style={styles.timeText}>
                    {new Date(thread.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Text style={[styles.latestMsg, thread.unread_count > 0 && { color: COLORS.slate800, fontWeight: FONTS.bold }]} numberOfLines={2}>
                  {thread.latest_message}
                </Text>
              </View>
              {thread.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{thread.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  refreshBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  messages: { flex: 1 },

  threadCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    padding: SPACING.lg, borderRadius: RADIUS.xl, marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  avatarUser: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  threadInfo: { flex: 1 },
  patientName: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  timeText: { fontSize: FONTS.xs, color: COLORS.slate400, fontWeight: FONTS.medium },
  latestMsg: { fontSize: FONTS.sm, color: COLORS.slate500, marginTop: 4, lineHeight: 20 },

  unreadBadge: { backgroundColor: COLORS.brand600, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 12, paddingHorizontal: 6 },
  unreadText: { color: COLORS.white, fontSize: 12, fontWeight: FONTS.bold },

  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  emptyCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONTS.xl, fontWeight: FONTS.bold, color: COLORS.slate800, marginBottom: 8 },
  emptyDesc:  { fontSize: FONTS.base, color: COLORS.slate500, textAlign: 'center', maxWidth: 260, lineHeight: 22 },
});

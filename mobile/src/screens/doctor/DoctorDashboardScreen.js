/**
 * DoctorDashboardScreen.js — Premium Doctor Home Dashboard
 * Production-grade healthcare management interface
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated, RefreshControl, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiGetDoctorDashboard, apiGetFollowUps } from '../../services/api';

const C = {
  bg: '#F0F4F8',
  surface: '#FFFFFF',
  primary: '#0A4A6E',
  primaryLight: '#1565C0',
  accent: '#0EA5E9',
  cyan: '#06B6D4',
  emerald: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  slate: '#64748B',
  dark: '#0F172A',
  border: 'rgba(226,232,240,0.7)',
  cardShadow: { shadowColor: '#0A4A6E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
};

function SkeletonBox({ width, height, style }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={[{ width, height, borderRadius: 8, backgroundColor: '#E2E8F0', opacity: anim }, style]} />
  );
}

function StatCard({ icon, label, value, color, bgColor, onPress, trend }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => { Animated.sequence([Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }), Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true })]).start(); onPress?.(); };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]} onPress={press} activeOpacity={0.85}>
        <View style={[styles.statIconWrap, { backgroundColor: bgColor }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={styles.statInfo}>
          <Text style={[styles.statValue, { color }]}>{value}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
        {trend !== undefined && (
          <View style={[styles.trendBadge, { backgroundColor: trend >= 0 ? '#ECFDF5' : '#FEF2F2' }]}>
            <Ionicons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trend >= 0 ? C.emerald : C.red} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function AdherenceRing({ percentage }) {
  const size = 110;
  const strokeW = 10;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (percentage / 100) * circ;
  const color = percentage >= 75 ? C.emerald : percentage >= 50 ? C.amber : C.red;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: strokeW, borderColor: '#E2E8F0' }} />
      <View style={styles.ringCenter}>
        <Text style={[styles.ringPercent, { color }]}>{percentage}%</Text>
        <Text style={styles.ringLabel}>Adherence</Text>
      </View>
    </View>
  );
}

function ActivityItem({ item, onPress }) {
  const isAlert = item.severity && item.severity >= 4;
  const typeIcon = item.type === 'message' ? 'chatbubble' : 'alert-circle';
  const iconColor = isAlert ? C.red : C.accent;
  return (
    <TouchableOpacity style={[styles.activityItem, isAlert && styles.activityAlert]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.activityIcon, { backgroundColor: isAlert ? '#FEF2F2' : '#EFF6FF' }]}>
        <Ionicons name={typeIcon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityName}>{item.patient_name}</Text>
        <Text style={styles.activityContent} numberOfLines={1}>
          {item.content || item.symptom || 'New activity'}
        </Text>
      </View>
      <Text style={styles.activityTime}>
        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
      </Text>
    </TouchableOpacity>
  );
}

function FollowUpItem({ item, onPress }) {
  const daysLeft = Math.ceil((new Date(item.follow_up_date) - new Date()) / 86400000);
  const urgent = daysLeft <= 1;
  return (
    <TouchableOpacity style={[styles.followUpItem, urgent && styles.followUpUrgent]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="calendar" size={16} color={urgent ? C.red : C.amber} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.followUpName}>{item.patient_name}</Text>
        <Text style={styles.followUpNote} numberOfLines={1}>{item.note}</Text>
      </View>
      <Text style={[styles.followUpDays, { color: urgent ? C.red : C.slate }]}>
        {daysLeft <= 0 ? 'Today' : `${daysLeft}d`}
      </Text>
    </TouchableOpacity>
  );
}

export default function DoctorDashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [data, setData] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dash, fu] = await Promise.allSettled([
        apiGetDoctorDashboard(),
        apiGetFollowUps(),
      ]);
      if (dash.status === 'fulfilled') setData(dash.value);
      if (fu.status === 'fulfilled') setFollowUps(fu.value.followups || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchData(true));
    fetchData();
    return unsub;
  }, [navigation, fetchData]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const goToPatients = (filter) => navigation.navigate('Patients', { screen: 'PatientsList', params: { filter } });
  const goToPatient = (id) => navigation.navigate('Patients', { screen: 'PatientDetail', params: { patientId: id } });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} translucent />

      {/* Premium Header */}
      <View style={styles.header}>
        <View style={styles.headerBg} />
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.doctorName}>Dr. {user?.name || 'Doctor'}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Alerts')}>
              <Ionicons name="notifications-outline" size={22} color="#FFF" />
              {data?.critical_patients > 0 && <View style={styles.notifDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarBtn} onPress={() => navigation.navigate('DoctorProfile')}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || 'D'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Quick summary strip */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{data?.total_patients ?? '—'}</Text>
            <Text style={styles.summaryLbl}>Patients</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: '#FCA5A5' }]}>{data?.critical_patients ?? '—'}</Text>
            <Text style={styles.summaryLbl}>Critical</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: '#6EE7B7' }]}>{data?.weekly_adherence ?? '—'}%</Text>
            <Text style={styles.summaryLbl}>Adherence</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: '#FDE68A' }]}>{data?.unread_messages ?? '—'}</Text>
            <Text style={styles.summaryLbl}>Messages</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={C.primary} />}
      >
        {loading ? (
          <View style={{ gap: 16 }}>
            <SkeletonBox width="100%" height={100} />
            <SkeletonBox width="100%" height={100} />
            <SkeletonBox width="100%" height={180} />
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Emergency Alert Banner */}
            {data?.critical_patients > 0 && (
              <TouchableOpacity style={styles.emergencyBanner} onPress={() => goToPatients('critical')} activeOpacity={0.9}>
                <View style={styles.emergencyPulse}>
                  <Ionicons name="alert-circle" size={22} color="#FFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.emergencyTitle}>⚠️ {data.critical_patients} Critical Patient{data.critical_patients > 1 ? 's' : ''}</Text>
                  <Text style={styles.emergencySubtitle}>Immediate attention required</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* Stat Cards Grid */}
            <Text style={styles.sectionHeader}>Overview</Text>
            <View style={styles.statsGrid}>
              <StatCard icon="people" label="Total Patients" value={data?.total_patients ?? 0} color={C.primary} bgColor="#EFF6FF" onPress={() => goToPatients('all')} />
              <StatCard icon="alert-circle" label="Critical" value={data?.critical_patients ?? 0} color={C.red} bgColor="#FEF2F2" onPress={() => goToPatients('critical')} />
              <StatCard icon="chatbubble" label="Unread Msgs" value={data?.unread_messages ?? 0} color={C.cyan} bgColor="#ECFEFF" onPress={() => navigation.navigate('Inbox')} />
              <StatCard icon="trending-up" label="Adherence" value={`${Math.round(data?.weekly_adherence ?? 0)}%`} color={C.emerald} bgColor="#ECFDF5" onPress={() => goToPatients('all')} />
            </View>

            {/* Adherence Overview */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Patient Adherence</Text>
              <View style={styles.adherenceRow}>
                <AdherenceRing percentage={Math.round(data?.weekly_adherence ?? 0)} />
                <View style={styles.adherenceLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.emerald }]} />
                    <Text style={styles.legendText}>≥75% — Good adherence</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.amber }]} />
                    <Text style={styles.legendText}>50-74% — Needs attention</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.red }]} />
                    <Text style={styles.legendText}>{'<50%'} — Critical risk</Text>
                  </View>
                  <TouchableOpacity onPress={() => goToPatients('all')} style={styles.viewAllBtn}>
                    <Text style={styles.viewAllText}>View all patients →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionHeader}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              {[
                { icon: 'person-add', label: 'Add Patient', color: C.primary, action: () => navigation.navigate('Patients', { screen: 'SearchPatients' }) },
                { icon: 'chatbubbles', label: 'Messages', color: C.cyan, action: () => navigation.navigate('Inbox') },
                { icon: 'megaphone', label: 'Send Alert', color: C.amber, action: () => navigation.navigate('Alerts') },
                { icon: 'stats-chart', label: 'Analytics', color: C.emerald, action: () => goToPatients('all') },
              ].map(a => (
                <TouchableOpacity key={a.label} style={styles.quickAction} onPress={a.action} activeOpacity={0.8}>
                  <View style={[styles.qaIcon, { backgroundColor: a.color + '18' }]}>
                    <Ionicons name={a.icon} size={22} color={a.color} />
                  </View>
                  <Text style={styles.qaLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Follow-up Reminders */}
            {followUps.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Follow-ups</Text>
                  <View style={styles.badge}><Text style={styles.badgeText}>{followUps.length}</Text></View>
                </View>
                {followUps.slice(0, 3).map(f => (
                  <FollowUpItem key={f.id} item={f} onPress={() => goToPatient(f.patient_id)} />
                ))}
              </View>
            )}

            {/* Recent Alerts */}
            {data?.recent_alerts?.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>High-Severity Symptoms</Text>
                  <View style={[styles.badge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <Text style={[styles.badgeText, { color: C.red }]}>{data.recent_alerts.length}</Text>
                  </View>
                </View>
                {data.recent_alerts.map((a, i) => (
                  <ActivityItem key={i} item={{ ...a, type: 'alert' }} onPress={() => goToPatient(a.patient_id)} />
                ))}
              </View>
            )}

            {/* Activity Feed */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Activity</Text>
              {data?.activity_feed?.length > 0 ? (
                data.activity_feed.map((a, i) => (
                  <ActivityItem key={i} item={a} onPress={() => goToPatient(a.patient_id)} />
                ))
              ) : (
                <View style={styles.emptyFeed}>
                  <Ionicons name="pulse" size={36} color="#CBD5E1" />
                  <Text style={styles.emptyFeedText}>No recent patient activity</Text>
                </View>
              )}
            </View>

          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, paddingTop: Platform.OS === 'ios' ? 56 : 48, paddingBottom: 0, overflow: 'hidden' },
  headerBg: { position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  doctorName: { fontSize: 22, color: '#FFF', fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: C.red, borderWidth: 2, borderColor: C.primary },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  summaryStrip: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 14, paddingHorizontal: 8 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  summaryLbl: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  emergencyBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.red, borderRadius: 16, padding: 14, marginBottom: 16, ...C.cardShadow, shadowColor: C.red },
  emergencyPulse: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  emergencyTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  emergencySubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: C.slate, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 4 },
  statsGrid: { gap: 10, marginBottom: 16 },
  statCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 14, ...C.cardShadow },
  statIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  statInfo: { flex: 1 },
  statValue: { fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  statLabel: { fontSize: 13, color: C.slate, fontWeight: '600', marginTop: 1 },
  trendBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 16, ...C.cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.dark, flex: 1 },
  badge: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '800', color: C.primary },
  adherenceRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPercent: { fontSize: 20, fontWeight: '900' },
  ringLabel: { fontSize: 9, color: C.slate, fontWeight: '700', textTransform: 'uppercase' },
  adherenceLegend: { flex: 1, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: C.slate, fontWeight: '500' },
  viewAllBtn: { marginTop: 4 },
  viewAllText: { fontSize: 12, color: C.primary, fontWeight: '700' },
  quickActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickAction: { flex: 1, backgroundColor: C.surface, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, ...C.cardShadow },
  qaIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 11, color: C.dark, fontWeight: '700', textAlign: 'center' },
  activityItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 10 },
  activityAlert: { backgroundColor: '#FEF2F2', marginHorizontal: -16, paddingHorizontal: 16, borderBottomColor: '#FECACA' },
  activityIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityName: { fontSize: 14, fontWeight: '700', color: C.dark },
  activityContent: { fontSize: 12, color: C.slate, marginTop: 1 },
  activityTime: { fontSize: 11, color: C.slate },
  followUpItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  followUpUrgent: { backgroundColor: '#FEF2F2', marginHorizontal: -16, paddingHorizontal: 16 },
  followUpName: { fontSize: 14, fontWeight: '700', color: C.dark },
  followUpNote: { fontSize: 12, color: C.slate, marginTop: 1 },
  followUpDays: { fontSize: 13, fontWeight: '800' },
  emptyFeed: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  emptyFeedText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
});

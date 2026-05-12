/**
 * screens/patient/NotificationCenterScreen.js
 * Premium notification inbox — Messages | Reminders | Warnings | Emergencies | AI Alerts
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  StatusBar, RefreshControl, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  apiGetNotifications, apiMarkNotificationsRead,
  apiGetUnreadNotificationCount, apiNotificationAnalytics,
} from '../../services/api';

// ─── Config ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',            label: 'All',        icon: 'notifications' },
  { key: 'doctor_message', label: 'Messages',   icon: 'chatbubble' },
  { key: 'medicine',       label: 'Reminders',  icon: 'medkit' },
  { key: 'ai_warning',     label: 'AI',         icon: 'flash' },
  { key: 'emergency',      label: 'Emergency',  icon: 'alert-circle' },
  { key: 'caretaker',      label: 'Caretaker',  icon: 'people' },
];

const SEVERITY_CFG = {
  critical: { bg: '#FEF2F2', border: '#FECACA', icon: '#DC2626', text: '#DC2626', label: 'CRITICAL' },
  high:     { bg: '#FFF7ED', border: '#FED7AA', icon: '#EA580C', text: '#C2410C', label: 'HIGH'     },
  medium:   { bg: '#FFFBEB', border: '#FDE68A', icon: '#D97706', text: '#B45309', label: 'MEDIUM'   },
  low:      { bg: '#F0FDFA', border: '#99F6E4', icon: '#0D9488', text: '#0F766E', label: 'LOW'      },
};

const TYPE_CFG = {
  doctor_message: { icon: 'chatbubble',    color: '#4338CA', bg: '#EEF2FF' },
  medicine:       { icon: 'medkit',        color: '#0D9488', bg: '#F0FDFA' },
  emergency:      { icon: 'alert-circle',  color: '#DC2626', bg: '#FEF2F2' },
  ai_warning:     { icon: 'flash',         color: '#7C3AED', bg: '#F5F3FF' },
  caretaker:      { icon: 'people',        color: '#D97706', bg: '#FFFBEB' },
  system:         { icon: 'information',   color: '#475569', bg: '#F8FAFC' },
};

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Notification Card ────────────────────────────────────────────────────────
function NotifCard({ item, onPress, onMarkRead }) {
  const scale = useRef(new Animated.Value(1)).current;
  const sev   = SEVERITY_CFG[item.severity] || SEVERITY_CFG.low;
  const typ   = TYPE_CFG[item.type]         || TYPE_CFG.system;

  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    if (!item.read) onMarkRead(item.id);
    onPress(item);
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[s.card, { backgroundColor: sev.bg, borderColor: sev.border }, !item.read && s.cardUnread]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        {/* Unread dot */}
        {!item.read && <View style={s.unreadDot} />}

        <View style={[s.iconWrap, { backgroundColor: typ.bg }]}>
          <Ionicons name={typ.icon} size={22} color={typ.color} />
        </View>

        <View style={s.cardBody}>
          <View style={s.cardHeader}>
            <Text style={[s.cardTitle, !item.read && s.cardTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.cardTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={s.cardDesc} numberOfLines={2}>{item.body}</Text>
          <View style={s.cardFooter}>
            <View style={[s.severityBadge, { backgroundColor: sev.icon + '22' }]}>
              <Text style={[s.severityText, { color: sev.icon }]}>{sev.label}</Text>
            </View>
            {item.action_route ? (
              <View style={s.actionHint}>
                <Text style={s.actionHintText}>Tap to open</Text>
                <Ionicons name="chevron-forward" size={12} color="#94A3B8" />
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationCenterScreen() {
  const navigation  = useNavigation();
  const [tab,       setTab]       = useState('all');
  const [notifs,    setNotifs]    = useState([]);
  const [total,     setTotal]     = useState(0);
  const [unread,    setUnread]    = useState(0);
  const [unreadMap, setUnreadMap] = useState({});
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [inbox, count] = await Promise.allSettled([
        apiGetNotifications(100, 0, tab === 'all' ? null : tab),
        apiGetUnreadNotificationCount(),
      ]);
      if (inbox.status === 'fulfilled') {
        setNotifs(inbox.value.notifications || []);
        setTotal(inbox.value.total || 0);
        setUnread(inbox.value.unread || 0);
      }
      if (count.status === 'fulfilled') {
        setUnreadMap(count.value.by_type || {});
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkRead(id) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
    try {
      await apiMarkNotificationsRead([id]);
      await apiNotificationAnalytics(id, 'opened');
    } catch {}
  }

  async function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    try { await apiMarkNotificationsRead([], true); } catch {}
  }

  function handleNotifPress(item) {
    const route = item.action_route;
    if (!route) return;
    const navMap = {
      DoctorChat:         () => navigation.navigate('Chat'),
      Pillbox:            () => navigation.navigate('Pillbox'),
      Profile:            () => navigation.navigate('Profile'),
      CaretakerDashboard: () => navigation.navigate('CaretakerDashboard'),
    };
    navMap[route]?.();
  }

  const filtered = tab === 'all' ? notifs : notifs.filter(n => n.type === tab);

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#0F172A' }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Notifications</Text>
            <Text style={s.headerSub}>{unread > 0 ? `${unread} unread` : 'All caught up'}</Text>
          </View>
          {unread > 0 && (
            <TouchableOpacity style={s.markAllBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
              <Text style={s.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Bar */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={t => t.key}
          contentContainerStyle={s.tabs}
          renderItem={({ item: t }) => {
            const cnt = t.key === 'all' ? unread : (unreadMap[t.key] || 0);
            const isActive = tab === t.key;
            return (
              <TouchableOpacity
                style={[s.tab, isActive && s.tabActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={isActive ? t.icon : `${t.icon}-outline`}
                  size={14}
                  color={isActive ? '#fff' : 'rgba(255,255,255,0.5)'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[s.tabText, isActive && s.tabTextActive]}>{t.label}</Text>
                {cnt > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeText}>{cnt > 99 ? '99+' : cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>

      {/* Content */}
      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={s.loaderText}>Loading notifications…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              colors={['#0D9488']}
            />
          }
          renderItem={({ item }) => (
            <NotifCard
              item={item}
              onPress={handleNotifPress}
              onMarkRead={handleMarkRead}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyCircle}>
                <Ionicons name="notifications-off-outline" size={44} color="#94A3B8" />
              </View>
              <Text style={s.emptyTitle}>No notifications</Text>
              <Text style={s.emptySub}>
                {tab === 'all'
                  ? 'You have no notifications yet.'
                  : `No ${TABS.find(t => t.key === tab)?.label?.toLowerCase()} notifications.`}
              </Text>
            </View>
          }
          ListHeaderComponent={
            filtered.length > 0 ? (
              <Text style={s.listHeader}>
                {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
                {unread > 0 ? ` · ${unread} unread` : ''}
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: '#F8FAFC' },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  markAllBtn:{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  markAllText:{ fontSize: 12, fontWeight: '700', color: '#fff' },

  tabs:      { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  tab:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabActive: { backgroundColor: '#0D9488' },
  tabText:   { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  tabTextActive: { color: '#fff' },
  tabBadge:  { marginLeft: 5, backgroundColor: '#DC2626', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  loader:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText:{ fontSize: 14, color: '#64748B' },
  list:      { padding: 16, paddingBottom: 40 },
  listHeader:{ fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  card:      { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10, position: 'relative', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardUnread:{ shadowOpacity: 0.08, elevation: 3 },
  unreadDot: { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: '#0D9488' },
  iconWrap:  { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody:  { flex: 1 },
  cardHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 },
  cardTitleUnread: { fontWeight: '800' },
  cardTime:  { fontSize: 11, color: '#94A3B8', flexShrink: 0 },
  cardDesc:  { fontSize: 13, color: '#475569', lineHeight: 19, marginBottom: 8 },
  cardFooter:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  severityBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  severityText:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actionHint:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionHintText:{ fontSize: 11, color: '#94A3B8' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyCircle:{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#334155' },
  emptySub:   { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 40 },
});

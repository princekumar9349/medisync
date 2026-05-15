/**
 * DoctorNotificationsScreen.js
 * Unified screen: Doctor's received notifications + ability to send alerts
 * Tabs: Inbox (received) | Broadcast (send)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar, Animated, Platform, Alert, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiBroadcastAlert, apiGetNotifications, apiMarkNotificationsRead } from '../../services/api';

const C = {
  bg: '#F0F4F8', surface: '#FFF', primary: '#0A4A6E', accent: '#0EA5E9',
  emerald: '#10B981', amber: '#F59E0B', red: '#EF4444', slate: '#64748B',
  dark: '#0F172A', border: '#E2E8F0',
};

const SEVERITIES = [
  { id: 'info',    label: 'INFO',    icon: 'information-circle', color: '#0EA5E9', bg: '#EFF6FF' },
  { id: 'warning', label: 'WARNING', icon: 'warning',            color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'urgent',  label: 'URGENT',  icon: 'alert-circle',       color: '#EF4444', bg: '#FEF2F2' },
];

const NOTIF_TYPE_CFG = {
  doctor_message: { icon: 'chatbubble',   color: '#4338CA', bg: '#EEF2FF' },
  medicine:       { icon: 'medkit',       color: '#0D9488', bg: '#F0FDFA' },
  emergency:      { icon: 'alert-circle', color: '#DC2626', bg: '#FEF2F2' },
  ai_warning:     { icon: 'flash',        color: '#7C3AED', bg: '#F5F3FF' },
  caretaker:      { icon: 'people',       color: '#D97706', bg: '#FFFBEB' },
  system:         { icon: 'information',  color: '#475569', bg: '#F8FAFC' },
};

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Notification Card ────────────────────────────────────────────────────────
function NotifCard({ item, onMarkRead }) {
  const scale = useRef(new Animated.Value(1)).current;
  const typ = NOTIF_TYPE_CFG[item.type] || NOTIF_TYPE_CFG.system;

  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    if (!item.read) onMarkRead(item.id);
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[s.notifCard, !item.read && s.notifCardUnread]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        {!item.read && <View style={s.unreadDot} />}
        <View style={[s.notifIcon, { backgroundColor: typ.bg }]}>
          <Ionicons name={typ.icon} size={22} color={typ.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={[s.notifTitle, !item.read && { fontWeight: '800' }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.notifTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={s.notifBody} numberOfLines={2}>{item.body}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Severity Button ──────────────────────────────────────────────────────────
function SeverityBtn({ cfg, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.sevBtn, selected && { borderColor: cfg.color, backgroundColor: cfg.bg }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name={cfg.icon} size={24} color={selected ? cfg.color : '#94A3B8'} />
      <Text style={[s.sevLabel, { color: selected ? cfg.color : '#94A3B8' }]}>{cfg.label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DoctorNotificationsScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab]   = useState('inbox'); // 'inbox' | 'broadcast'

  // Inbox state
  const [notifs,     setNotifs]     = useState([]);
  const [loadingN,   setLoadingN]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Broadcast state
  const [msg,      setMsg]      = useState('');
  const [severity, setSev]      = useState('info');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState(null);
  const [broadLog, setBroadLog] = useState([]);
  const MAX = 300;

  // Load notifications
  const loadNotifs = useCallback(async (silent = false) => {
    if (!silent) setLoadingN(true);
    try {
      const res = await apiGetNotifications(50, 0, null, false);
      setNotifs(res.notifications || []);
    } catch {}
    setLoadingN(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  async function handleMarkRead(id) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await apiMarkNotificationsRead([id]); } catch {}
  }

  async function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    try { await apiMarkNotificationsRead([], true); } catch {}
  }

  // Send broadcast
  async function sendAlert() {
    if (!msg.trim() || msg.length > MAX) return;
    setSending(true); setError(null);
    try {
      await apiBroadcastAlert(`[${severity.toUpperCase()} ALERT] ${msg.trim()}`, severity);
      setBroadLog(prev => [{ id: Date.now(), severity, message: msg.trim(), ts: new Date().toISOString() }, ...prev]);
      setMsg(''); setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch { setError('Failed to send. Please try again.'); }
    setSending(false);
  }

  const sevCfg = SEVERITIES.find(s => s.id === severity);
  const unread = notifs.filter(n => !n.read).length;

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.docAvatar}>
          <Text style={s.docAvatarTxt}>{user?.name?.charAt(0)?.toUpperCase() || 'D'}</Text>
        </View>
        <View style={{ marginLeft: 14, flex: 1 }}>
          <Text style={s.headerGreet}>Notifications</Text>
          <Text style={s.headerName}>Dr. {user?.name || 'Doctor'}</Text>
        </View>
        {unread > 0 && activeTab === 'inbox' && (
          <TouchableOpacity style={s.markAllBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'inbox' && s.tabActive]}
          onPress={() => setActiveTab('inbox')}
          activeOpacity={0.8}
        >
          <Ionicons name={activeTab === 'inbox' ? 'notifications' : 'notifications-outline'} size={16} color={activeTab === 'inbox' ? C.primary : C.slate} />
          <Text style={[s.tabLabel, activeTab === 'inbox' && s.tabLabelActive]}>Inbox</Text>
          {unread > 0 && (
            <View style={s.tabBadge}>
              <Text style={s.tabBadgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'broadcast' && s.tabActive]}
          onPress={() => setActiveTab('broadcast')}
          activeOpacity={0.8}
        >
          <Ionicons name={activeTab === 'broadcast' ? 'megaphone' : 'megaphone-outline'} size={16} color={activeTab === 'broadcast' ? C.primary : C.slate} />
          <Text style={[s.tabLabel, activeTab === 'broadcast' && s.tabLabelActive]}>Send Alert</Text>
        </TouchableOpacity>
      </View>

      {/* ── INBOX TAB ── */}
      {activeTab === 'inbox' && (
        loadingN ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loaderText}>Loading notifications…</Text>
          </View>
        ) : (
          <FlatList
            data={notifs}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadNotifs(true); }}
                colors={[C.primary]}
              />
            }
            renderItem={({ item }) => (
              <NotifCard item={item} onMarkRead={handleMarkRead} />
            )}
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Ionicons name="notifications-off-outline" size={48} color="#CBD5E1" />
                <Text style={s.emptyTitle}>No notifications yet</Text>
                <Text style={s.emptySub}>Your alerts and messages will appear here.</Text>
              </View>
            }
          />
        )
      )}

      {/* ── BROADCAST TAB ── */}
      {activeTab === 'broadcast' && (
        <ScrollView contentContainerStyle={s.broadContent} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <Text style={s.sectionTitle}>Alert Severity</Text>
            <View style={s.sevRow}>
              {SEVERITIES.map(cfg => (
                <SeverityBtn key={cfg.id} cfg={cfg} selected={severity === cfg.id} onPress={() => setSev(cfg.id)} />
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.sectionTitle}>Message</Text>
              <Text style={[s.charCount, msg.length > MAX && { color: C.red }]}>{msg.length}/{MAX}</Text>
            </View>

            <View style={[s.inputWrap, msg.length > 0 && { borderColor: sevCfg?.color }]}>
              <TextInput
                style={s.msgInput}
                value={msg}
                onChangeText={setMsg}
                placeholder="Type your alert message to all patients…"
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
                <Text style={s.sentText}>Alert sent to all patients!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: sevCfg?.color || C.primary, opacity: (!msg.trim() || msg.length > MAX || sending) ? 0.55 : 1 }]}
                disabled={!msg.trim() || msg.length > MAX || sending}
                onPress={sendAlert}
                activeOpacity={0.85}
              >
                {sending ? <ActivityIndicator color="#FFF" /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.sendBtnText}>Send Broadcast Alert</Text>
                    <Ionicons name="send" size={18} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Broadcast Log */}
          <Text style={s.logTitle}>Recent Broadcasts</Text>
          {broadLog.length === 0 ? (
            <View style={s.emptyLog}>
              <Ionicons name="megaphone-outline" size={40} color="#CBD5E1" />
              <Text style={s.emptyLogText}>No alerts sent yet</Text>
            </View>
          ) : broadLog.map(a => {
            const cfg = SEVERITIES.find(sc => sc.id === a.severity) || SEVERITIES[0];
            return (
              <View key={a.id} style={[s.logCard, { borderLeftColor: cfg.color }]}>
                <View style={[s.logIcon, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={[s.logSev, { color: cfg.color }]}>{cfg.label}</Text>
                    <Text style={s.logTime}>{new Date(a.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <Text style={s.logMsg}>{a.message}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 48, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  docAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  docAvatarTxt: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  headerGreet: { fontSize: 11, color: C.slate, fontWeight: '600' },
  headerName: { fontSize: 16, color: C.dark, fontWeight: '800' },
  markAllBtn: { backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  markAllText: { fontSize: 11, fontWeight: '700', color: C.primary },

  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, marginRight: 8, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.primary },
  tabLabel: { fontSize: 13, fontWeight: '700', color: C.slate },
  tabLabelActive: { color: C.primary },
  tabBadge: { backgroundColor: C.red, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFF' },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { fontSize: 13, color: C.slate },

  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.surface,
    borderRadius: 16, padding: 14, marginBottom: 10, gap: 12, position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  notifCardUnread: { shadowOpacity: 0.08, elevation: 3, borderLeftWidth: 3, borderLeftColor: C.primary },
  unreadDot: { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  notifIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifTitle: { fontSize: 13, fontWeight: '600', color: C.dark, flex: 1 },
  notifTime: { fontSize: 11, color: '#94A3B8' },
  notifBody: { fontSize: 12, color: C.slate, lineHeight: 18 },

  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#334155' },
  emptySub: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  // Broadcast tab
  broadContent: { padding: 20, paddingBottom: 120 },
  card: { backgroundColor: C.surface, borderRadius: 22, padding: 22, marginBottom: 24, shadowColor: '#0A4A6E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: C.dark, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  sevRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  sevBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#F8FAFC', gap: 6 },
  sevLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  charCount: { fontSize: 12, fontWeight: '600', color: C.slate, marginBottom: 14 },
  inputWrap: { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, backgroundColor: '#F8FAFC', marginBottom: 16 },
  msgInput: { padding: 14, fontSize: 14, color: C.dark, minHeight: 120, textAlignVertical: 'top', fontWeight: '500' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { color: C.red, fontSize: 13, fontWeight: '700', flex: 1 },
  sentBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 14, paddingVertical: 14 },
  sentText: { color: C.dark, fontSize: 14, fontWeight: '800' },
  sendBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  logTitle: { fontSize: 13, fontWeight: '800', color: C.slate, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  logCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  logIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logSev: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  logTime: { fontSize: 11, color: C.slate, fontWeight: '600' },
  logMsg: { fontSize: 12, color: C.dark, fontWeight: '500', lineHeight: 18 },
  emptyLog: { alignItems: 'center', paddingVertical: 30, gap: 10 },
  emptyLogText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
});

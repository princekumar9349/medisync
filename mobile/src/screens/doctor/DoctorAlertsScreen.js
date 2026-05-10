/**
 * screens/doctor/DoctorAlertsScreen.js — Send Alerts
 * Clean Medical Theme — Teal/White
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiSendDoctorMessage } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const SEVERITY_CFG = {
  info:    { icon: 'information-circle', label: 'Info',    bg: COLORS.brand50,  border: COLORS.brand200, text: COLORS.brand700 },
  warning: { icon: 'warning',            label: 'Warning', bg: COLORS.amber50,  border: '#F3D5A0',       text: COLORS.amber700 },
  urgent:  { icon: 'alert-circle',       label: 'Urgent',  bg: COLORS.red50,    border: COLORS.red200,   text: COLORS.red700 },
};

export default function DoctorAlertsScreen() {
  const [alertMsg, setAlertMsg] = useState('');
  const [severity, setSeverity] = useState('info');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const cfg = SEVERITY_CFG[severity];

  async function sendAlert() {
    if (!alertMsg.trim()) return;
    setSending(true); setError(null);
    try {
      await apiSendDoctorMessage(`[${severity.toUpperCase()} ALERT] ${alertMsg.trim()}`);
      setRecentAlerts(prev => [{ id: Date.now(), severity, message: alertMsg.trim(), timestamp: new Date().toISOString() }, ...prev]);
      setSent(true); setAlertMsg(''); setTimeout(() => setSent(false), 3000);
    } catch { setError('Failed to send alert.'); }
    finally { setSending(false); }
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={S.headerBar}><Text style={S.headerTitle}>Send Alert</Text><Text style={S.headerSubtitle}>Notify patients about urgent matters</Text></View>

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={S.sectionTitle}>Alert Severity</Text>
          <View style={styles.severityRow}>
            {Object.entries(SEVERITY_CFG).map(([key, c]) => (
              <TouchableOpacity key={key} style={[styles.severityBtn, { borderColor: severity === key ? c.border : COLORS.border }, severity === key && { backgroundColor: c.bg }]} onPress={() => setSeverity(key)} activeOpacity={0.8}>
                <Ionicons name={c.icon} size={22} color={severity === key ? c.text : COLORS.slate400} />
                <Text style={[styles.severityLabel, { color: severity === key ? c.text : COLORS.slate500 }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[S.sectionTitle, { marginTop: SPACING.xl }]}>Message</Text>
          <TextInput style={styles.msgInput} value={alertMsg} onChangeText={setAlertMsg} placeholder="e.g., Please take your medication immediately." placeholderTextColor={COLORS.slate400} multiline numberOfLines={4} textAlignVertical="top" />

          {alertMsg.trim() ? (<View style={[styles.preview, { backgroundColor: cfg.bg, borderColor: cfg.border }]}><Text style={[styles.previewLabel, { color: cfg.text }]}>Preview:</Text><View style={S.row}><Ionicons name={cfg.icon} size={14} color={cfg.text} style={{ marginRight: 6 }} /><Text style={{ fontSize: FONTS.sm, color: cfg.text, flex: 1, lineHeight: 20 }}>[{severity.toUpperCase()}] {alertMsg}</Text></View></View>) : null}
          {error && (<View style={styles.errorBox}><Ionicons name="warning-outline" size={18} color={COLORS.red700} style={{ marginRight: 8 }} /><Text style={{ color: COLORS.red700, fontSize: FONTS.sm, flex: 1 }}>{error}</Text></View>)}

          {sent ? (
            <View style={styles.sentBanner}><Ionicons name="checkmark-circle" size={22} color={COLORS.emerald600} style={{ marginRight: 8 }} /><Text style={styles.sentText}>Alert sent!</Text></View>
          ) : (
            <TouchableOpacity style={[styles.sendBtn, { opacity: (!alertMsg.trim() || sending) ? 0.5 : 1 }]} onPress={sendAlert} disabled={!alertMsg.trim() || sending} activeOpacity={0.85}>
              {sending ? <ActivityIndicator color={COLORS.white} /> : (<><Ionicons name="send" size={18} color={COLORS.white} style={{ marginRight: 8 }} /><Text style={styles.sendBtnText}>Send Alert</Text></>)}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={S.sectionTitle}>Recent Alerts</Text>
          {recentAlerts.length === 0 ? (
            <View style={[S.center, { paddingVertical: 28 }]}><View style={styles.emptyCircle}><Ionicons name="mail-open-outline" size={36} color={COLORS.brand400} /></View><Text style={{ color: COLORS.slate500, fontSize: FONTS.sm, fontWeight: FONTS.bold, marginTop: 8 }}>No alerts sent yet</Text></View>
          ) : recentAlerts.map(alert => {
            const ac = SEVERITY_CFG[alert.severity] || SEVERITY_CFG.info;
            return (
              <View key={alert.id} style={[styles.alertHistItem, { backgroundColor: ac.bg, borderColor: ac.border }]}>
                <Ionicons name={ac.icon} size={22} color={ac.text} style={{ marginRight: 10, marginTop: 2 }} />
                <View style={{ flex: 1 }}><Text style={{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: ac.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>{alert.severity}</Text><Text style={{ fontSize: FONTS.sm, color: COLORS.slate800, marginTop: 4, lineHeight: 20 }}>{alert.message}</Text><Text style={{ fontSize: 11, color: COLORS.slate500, marginTop: 4 }}>{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  severityRow: { flexDirection: 'row', gap: 10 },
  severityBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1.5 },
  severityLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, marginTop: 6, textTransform: 'uppercase' },
  msgInput: { backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: 14, fontSize: FONTS.base, color: COLORS.slate800, minHeight: 110, textAlignVertical: 'top', marginBottom: SPACING.lg },
  preview: { borderWidth: 1, borderRadius: RADIUS.sm, padding: 14, marginBottom: SPACING.lg },
  previewLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, marginBottom: 6, textTransform: 'uppercase' },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderWidth: 1, borderColor: COLORS.red200, borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.lg },
  sentBanner: { flexDirection: 'row', backgroundColor: COLORS.emerald50, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.emerald200 },
  sentText: { color: COLORS.emerald700, fontSize: FONTS.base, fontWeight: FONTS.bold },
  sendBtn: { flexDirection: 'row', backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: COLORS.white, fontSize: FONTS.base, fontWeight: FONTS.bold },
  alertHistItem: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: RADIUS.sm, padding: 14, marginTop: 10 },
  emptyCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
});

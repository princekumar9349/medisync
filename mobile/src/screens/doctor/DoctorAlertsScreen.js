/**
 * screens/doctor/DoctorAlertsScreen.js — Send Alerts to Patients
 * Business Theme Overhaul
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { apiSendDoctorMessage } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const SEVERITY_CFG = {
  info:    { icon: 'information-circle', label: 'Info',    bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  warning: { icon: 'warning',            label: 'Warning', bg: COLORS.amber50, border: COLORS.amber200, text: COLORS.amber700 },
  urgent:  { icon: 'alert-circle',       label: 'Urgent',  bg: COLORS.red50,   border: COLORS.red200,   text: COLORS.red700 },
};

const RECENT_ALERTS = [];

export default function DoctorAlertsScreen() {
  const [alertMsg,  setAlertMsg]  = useState('');
  const [severity,  setSeverity]  = useState('info');
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [error,     setError]     = useState(null);
  const [recentAlerts, setRecentAlerts] = useState(RECENT_ALERTS);

  const cfg = SEVERITY_CFG[severity];

  async function sendAlert() {
    if (!alertMsg.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiSendDoctorMessage(`[${severity.toUpperCase()} ALERT] ${alertMsg.trim()}`);
      setRecentAlerts(prev => [{
        id: Date.now(),
        severity,
        message: alertMsg.trim(),
        timestamp: new Date().toISOString(),
      }, ...prev]);
      setSent(true);
      setAlertMsg('');
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setError('Failed to send alert. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand600} />

      {/* Header */}
      <View style={[S.headerBackground, { paddingBottom: 60 }]}>
        <Text style={S.headerTitle}>Send Alert</Text>
        <Text style={S.headerSubtitle}>Notify patients about urgent matters</Text>
      </View>

      <View style={[S.overlapContainer, { marginTop: -40 }]}>
        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Severity Selector */}
          <View style={styles.card}>
            <Text style={S.sectionTitle}>Alert Severity</Text>
            <View style={styles.severityRow}>
              {Object.entries(SEVERITY_CFG).map(([key, c]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.severityBtn,
                    { borderColor: severity === key ? c.border : COLORS.slate200 },
                    severity === key && { backgroundColor: c.bg },
                  ]}
                  onPress={() => setSeverity(key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={c.icon} size={24} color={severity === key ? c.text : COLORS.slate400} />
                  <Text style={[styles.severityLabel, { color: severity === key ? c.text : COLORS.slate500 }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Message */}
            <Text style={[S.sectionTitle, { marginTop: SPACING.xl }]}>Message</Text>
            <TextInput
              style={styles.msgInput}
              value={alertMsg}
              onChangeText={setAlertMsg}
              placeholder="e.g., Please take your blood pressure medication immediately."
              placeholderTextColor={COLORS.slate400}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Preview */}
            {alertMsg.trim() ? (
              <View style={[styles.preview, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                <Text style={[styles.previewLabel, { color: cfg.text }]}>Preview:</Text>
                <View style={S.row}>
                  <Ionicons name={cfg.icon} size={16} color={cfg.text} style={{ marginRight: 6 }} />
                  <Text style={[styles.previewText, { color: cfg.text, flex: 1 }]}>
                    [{severity.toUpperCase()}] {alertMsg}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={20} color={COLORS.red700} style={{ marginRight: 8 }} />
                <Text style={{ color: COLORS.red700, fontSize: FONTS.sm, flex: 1 }}>{error}</Text>
              </View>
            )}

            {/* Send Button */}
            {sent ? (
              <View style={styles.sentBanner}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.emerald600} style={{ marginRight: 8 }} />
                <Text style={styles.sentText}>Alert sent to patient!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, { opacity: (!alertMsg.trim() || sending) ? 0.5 : 1 }]}
                onPress={sendAlert}
                disabled={!alertMsg.trim() || sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="send" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                    <Text style={styles.sendBtnText}>Send Alert to Patient</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Recent Alerts */}
          <View style={styles.card}>
            <Text style={S.sectionTitle}>Recent Alerts</Text>
            {recentAlerts.length === 0 ? (
              <View style={[S.center, { paddingVertical: 32 }]}>
                <View style={styles.emptyCircle}>
                  <Ionicons name="mail-open-outline" size={40} color={COLORS.brand300} />
                </View>
                <Text style={{ color: COLORS.slate500, fontSize: FONTS.base, marginTop: 8, fontWeight: FONTS.bold }}>No alerts sent yet</Text>
              </View>
            ) : recentAlerts.map(alert => {
              const ac = SEVERITY_CFG[alert.severity] || SEVERITY_CFG.info;
              return (
                <View key={alert.id} style={[styles.alertHistItem, { backgroundColor: ac.bg, borderColor: ac.border }]}>
                  <Ionicons name={ac.icon} size={24} color={ac.text} style={{ marginRight: 12, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FONTS.xs, fontWeight: FONTS.bold, color: ac.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>{alert.severity}</Text>
                    <Text style={{ fontSize: FONTS.sm, color: COLORS.slate800, marginTop: 4, lineHeight: 20 }}>{alert.message}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.slate500, marginTop: 6, fontWeight: FONTS.medium }}>
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, ...SHADOW.sm },

  severityRow: { flexDirection: 'row', gap: 12 },
  severityBtn: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: RADIUS.lg, borderWidth: 2 },
  severityLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  msgInput: { backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200, borderRadius: RADIUS.md, padding: 16, fontSize: FONTS.base, color: COLORS.slate800, minHeight: 120, textAlignVertical: 'top', marginBottom: SPACING.lg },

  preview: { borderWidth: 1.5, borderRadius: RADIUS.md, padding: 16, marginBottom: SPACING.lg },
  previewLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewText:  { fontSize: FONTS.sm, lineHeight: 20 },

  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, borderWidth: 1, borderColor: COLORS.red200, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },

  sentBanner: { flexDirection: 'row', backgroundColor: COLORS.emerald50, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.emerald200 },
  sentText:   { color: COLORS.emerald700, fontSize: FONTS.base, fontWeight: FONTS.bold },

  sendBtn:     { flexDirection: 'row', backgroundColor: COLORS.brand600, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm },
  sendBtnText: { color: COLORS.white, fontSize: FONTS.base, fontWeight: FONTS.bold },

  alertHistItem: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: RADIUS.lg, padding: 16, marginTop: 12 },
  emptyCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
});

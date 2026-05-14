/**
 * screens/patient/AnalyticsDashboardScreen.js
 *
 * Healthcare-grade Adherence Intelligence Dashboard.
 * Features:
 *  - Animated adherence ring (SVG arc — no harsh reds)
 *  - 7-day / 30-day trend bar graph (calm healthcare gradient)
 *  - Current streak + longest streak cards
 *  - Risk level indicator (calm badges, never alarming)
 *  - Cursor-paginated timeline feed
 *  - Pull-to-refresh
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList, Animated,
  Dimensions, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { apiGet } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S, SHADOW } from '../../theme';

const { width: SCREEN_W } = Dimensions.get('window');
const BAR_AREA_W = SCREEN_W - SPACING.lg * 2 - 32; // card padding

// ─── Healthcare color palette for adherence (no harsh red) ────────────────────
const ADHERENCE_COLORS = {
  excellent: { bar: '#34C77B', bg: '#E8FAF0', text: '#1A7A47', label: 'Excellent' },
  good:      { bar: '#14B8A6', bg: '#E6FAFE', text: '#0F766E', label: 'Good' },
  fair:      { bar: '#F59E0B', bg: '#FEF9EC', text: '#92400E', label: 'Fair' },
  poor:      { bar: '#E07B6B', bg: '#FEF3F0', text: '#9B3B2C', label: 'Needs Attention' },
  no_data:   { bar: COLORS.slate200, bg: COLORS.slate50, text: COLORS.slate400, label: 'No Data' },
};

const RISK_STYLES = {
  LOW:      { bg: '#E8FAF0', text: '#1A7A47', icon: 'shield-checkmark', label: 'Low Risk' },
  MODERATE: { bg: '#FEF9EC', text: '#92400E', icon: 'warning-outline',  label: 'Moderate Risk' },
  HIGH:     { bg: '#FEF3F0', text: '#9B3B2C', icon: 'alert-circle-outline', label: 'Elevated Risk' },
  CRITICAL: { bg: '#FDE8E5', text: '#7A1E14', icon: 'alert-circle',     label: 'Critical Risk' },
};

// ─── Animated Ring ────────────────────────────────────────────────────────────
function AdherenceRing({ score = 0, size = 150, color = '#14B8A6' }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: score / 100,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const strokeW = 14;
  const r = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDash = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circumference],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background ring */}
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeW, borderColor: COLORS.slate100,
      }} />
      {/* Progress ring via border trick + rotation */}
      <View style={{
        position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center',
      }}>
        <Animated.Text style={{
          fontSize: FONTS['2xl'], fontWeight: FONTS.extrabold,
          color: color,
        }}>
          {score.toFixed(0)}%
        </Animated.Text>
        <Text style={{ fontSize: FONTS.xs, color: COLORS.slate500, marginTop: 2, fontWeight: FONTS.medium }}>
          Adherence
        </Text>
      </View>
    </View>
  );
}

// ─── Trend Bar Graph ──────────────────────────────────────────────────────────
function TrendBar({ dataPoints = [] }) {
  const BAR_W = Math.max(20, (BAR_AREA_W - (dataPoints.length - 1) * 4) / dataPoints.length);
  const MAX_H = 80;

  if (!dataPoints.length) {
    return (
      <View style={styles.emptyTrend}>
        <Ionicons name="bar-chart-outline" size={32} color={COLORS.slate300} />
        <Text style={styles.emptyText}>No trend data yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.barGraphRow}>
      {dataPoints.map((d, i) => {
        const cfg = ADHERENCE_COLORS[d.status] || ADHERENCE_COLORS.no_data;
        const barH = d.score_pct != null
          ? Math.max(6, (d.score_pct / 100) * MAX_H)
          : 6;
        const dayLabel = d.date ? d.date.slice(5) : ''; // MM-DD
        return (
          <View key={i} style={[styles.barColumn, { width: BAR_W }]}>
            <View style={{ height: MAX_H, justifyContent: 'flex-end' }}>
              <View style={[styles.bar, { height: barH, backgroundColor: cfg.bar, width: BAR_W - 4 }]} />
            </View>
            <Text style={[styles.barLabel, { fontSize: FONTS.xs - 1 }]} numberOfLines={1}>
              {dayLabel}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Timeline Event Row ───────────────────────────────────────────────────────
const EVENT_ICON = {
  DOSE_TAKEN:           { icon: 'checkmark-circle', color: '#34C77B' },
  DOSE_MISSED:          { icon: 'close-circle',      color: '#E07B6B' },
  DOSE_SKIPPED:         { icon: 'play-skip-forward', color: COLORS.slate400 },
  ESCALATION_TRIGGERED: { icon: 'warning',           color: '#F59E0B' },
  CAREGIVER_ALERTED:    { icon: 'people',            color: COLORS.brand600 },
};

function TimelineRow({ item }) {
  const cfg = EVENT_ICON[item.event_type] || { icon: 'ellipse', color: COLORS.slate300 };
  const time = item.timestamp
    ? new Date(item.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';
  const date = item.timestamp
    ? new Date(item.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, { backgroundColor: cfg.color + '22' }]}>
        <Ionicons name={cfg.icon} size={16} color={cfg.color} />
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineMed} numberOfLines={1}>
          {item.medicine_name || item.event_type.replace(/_/g, ' ')}
        </Text>
        {item.slot && (
          <Text style={styles.timelineSub}>{item.slot} • {date} {time}</Text>
        )}
        {!item.slot && (
          <Text style={styles.timelineSub}>{date} {time}</Text>
        )}
      </View>
      <View style={[styles.timelineStatusBadge, { backgroundColor: cfg.color + '18' }]}>
        <Text style={[styles.timelineStatusText, { color: cfg.color }]}>
          {item.event_type.replace('DOSE_', '').replace(/_/g, ' ')}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AnalyticsDashboardScreen() {
  const [summary, setSummary]         = useState(null);
  const [trends, setTrends]           = useState([]);
  const [timeline, setTimeline]       = useState([]);
  const [nextCursor, setNextCursor]   = useState(null);
  const [hasMore, setHasMore]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [trendWindow, setTrendWindow] = useState(7); // 7 or 30

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [s, t, tl] = await Promise.all([
        apiGet('/analytics/me/summary'),
        apiGet(`/analytics/me/trends?days=${trendWindow}`),
        apiGet('/analytics/me/timeline?limit=20'),
      ]);
      setSummary(s);
      setTrends(t || []);
      setTimeline(tl?.events || []);
      setNextCursor(tl?.next_cursor || null);
      setHasMore(tl?.has_more || false);
    } catch (e) {
      console.warn('[Analytics] Fetch failed:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [trendWindow]);

  const fetchMoreTimeline = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const tl = await apiGet(`/analytics/me/timeline?limit=20&before=${encodeURIComponent(nextCursor)}`);
      setTimeline(prev => [...prev, ...(tl?.events || [])]);
      setNextCursor(tl?.next_cursor || null);
      setHasMore(tl?.has_more || false);
    } catch (e) {
      console.warn('[Analytics] Load more failed:', e?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // Refetch when trend window changes
  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const t = await apiGet(`/analytics/me/trends?days=${trendWindow}`);
        setTrends(t || []);
      } catch {}
    };
    if (!loading) fetchTrends();
  }, [trendWindow]);

  const adherence = summary?.adherence || {};
  const risk      = summary?.risk      || {};
  const scoreColor = adherence.score_7d >= 90 ? '#34C77B'
    : adherence.score_7d >= 75 ? '#14B8A6'
    : adherence.score_7d >= 60 ? '#F59E0B'
    : '#E07B6B';

  const riskStyle = RISK_STYLES[risk.level] || RISK_STYLES.LOW;

  if (loading) {
    return (
      <View style={[S.screen, S.center]}>
        <ActivityIndicator size="large" color={COLORS.brand600} />
        <Text style={styles.loadingText}>Building your health insights…</Text>
      </View>
    );
  }

  return (
    <View style={S.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header */}
      <View style={S.headerBar}>
        <Text style={S.headerTitle}>Health Insights</Text>
        <Text style={S.headerSubtitle}>Adherence Intelligence Dashboard</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} tintColor={COLORS.brand600} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Adherence Ring Card ───────────────────────────────────────────── */}
        <View style={[S.cardElevated, styles.ringCard]}>
          <View style={styles.ringLeft}>
            <AdherenceRing score={adherence.score_7d || 0} size={140} color={scoreColor} />
          </View>
          <View style={styles.ringRight}>
            <Text style={styles.ringLabel}>7-Day Score</Text>
            <View style={[styles.riskBadge, { backgroundColor: riskStyle.bg }]}>
              <Ionicons name={riskStyle.icon} size={13} color={riskStyle.text} />
              <Text style={[styles.riskBadgeText, { color: riskStyle.text }]}>
                {riskStyle.label}
              </Text>
            </View>
            {/* 30d score */}
            <View style={styles.statRow}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.slate500} />
              <Text style={styles.statText}>30-day: <Text style={styles.statBold}>{(adherence.score_30d || 0).toFixed(0)}%</Text></Text>
            </View>
            {/* Consistency */}
            <View style={styles.statRow}>
              <Ionicons name="analytics-outline" size={14} color={COLORS.slate500} />
              <Text style={styles.statText}>Consistency: <Text style={styles.statBold}>{((adherence.consistency_score || 0) * 100).toFixed(0)}%</Text></Text>
            </View>
            {/* Confidence */}
            <View style={styles.statRow}>
              <Ionicons name="shield-outline" size={14} color={COLORS.slate500} />
              <Text style={styles.statText}>Data: <Text style={styles.statBold}>{adherence.confidence || '—'}</Text></Text>
            </View>
          </View>
        </View>

        {/* ── Streak Cards ─────────────────────────────────────────────────── */}
        <View style={styles.streakRow}>
          <View style={[styles.streakCard, { backgroundColor: '#E8FAF0' }]}>
            <Ionicons name="flame" size={24} color="#34C77B" />
            <Text style={[styles.streakNum, { color: '#1A7A47' }]}>{adherence.streak_current || 0}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>
          </View>
          <View style={[styles.streakCard, { backgroundColor: '#E6FAFE' }]}>
            <Ionicons name="trophy-outline" size={24} color={COLORS.brand600} />
            <Text style={[styles.streakNum, { color: COLORS.brand700 }]}>{adherence.streak_longest || 0}</Text>
            <Text style={styles.streakLabel}>Best Streak</Text>
          </View>
          <View style={[styles.streakCard, { backgroundColor: '#FEF9EC' }]}>
            <Ionicons name="checkmark-done" size={24} color="#D97706" />
            <Text style={[styles.streakNum, { color: '#92400E' }]}>{adherence.taken_7d || 0}</Text>
            <Text style={styles.streakLabel}>Doses Taken</Text>
          </View>
        </View>

        {/* ── Risk Factors ──────────────────────────────────────────────────── */}
        {risk.factors && risk.factors.length > 0 && (
          <View style={S.card}>
            <Text style={S.sectionTitle}>Risk Factors</Text>
            {risk.factors.map((f, i) => (
              <View key={i} style={styles.factorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={COLORS.amber600} />
                <Text style={styles.factorText}>{f}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Trend Graph ───────────────────────────────────────────────────── */}
        <View style={S.card}>
          <View style={S.rowBetween}>
            <Text style={S.sectionTitle}>Adherence Trend</Text>
            <View style={styles.windowToggle}>
              {[7, 30].map(w => (
                <TouchableOpacity
                  key={w}
                  style={[styles.toggleBtn, trendWindow === w && styles.toggleBtnActive]}
                  onPress={() => setTrendWindow(w)}
                >
                  <Text style={[styles.toggleText, trendWindow === w && styles.toggleTextActive]}>
                    {w}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TrendBar dataPoints={trends} />
          {/* Legend */}
          <View style={styles.legendRow}>
            {Object.entries(ADHERENCE_COLORS).filter(([k]) => k !== 'no_data').map(([k, v]) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: v.bar }]} />
                <Text style={styles.legendText}>{v.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        <View style={S.card}>
          <Text style={[S.sectionTitle, { marginBottom: SPACING.md }]}>Activity Timeline</Text>
          {timeline.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Ionicons name="time-outline" size={32} color={COLORS.slate300} />
              <Text style={styles.emptyText}>No activity recorded yet</Text>
            </View>
          ) : (
            <>
              {timeline.map((item, i) => (
                <TimelineRow key={`${item.timestamp}-${i}`} item={item} />
              ))}
              {hasMore && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={fetchMoreTimeline}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? <ActivityIndicator size="small" color={COLORS.brand600} />
                    : <Text style={styles.loadMoreText}>Load More Events</Text>
                  }
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Footer spacer */}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { padding: SPACING.lg, paddingBottom: 110 },

  // Ring Card
  ringCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  ringLeft:  { alignItems: 'center', justifyContent: 'center' },
  ringRight: { flex: 1, gap: SPACING.sm },
  ringLabel: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.slate700 },

  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  riskBadgeText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: FONTS.sm, color: COLORS.slate500 },
  statBold: { fontWeight: FONTS.bold, color: COLORS.slate700 },

  // Streaks
  streakRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md,
  },
  streakCard: {
    flex: 1, borderRadius: RADIUS.lg, padding: SPACING.md,
    alignItems: 'center', gap: 4,
    ...SHADOW.sm,
  },
  streakNum:  { fontSize: FONTS['2xl'], fontWeight: FONTS.extrabold },
  streakLabel: { fontSize: FONTS.xs, color: COLORS.slate500, fontWeight: FONTS.medium, textAlign: 'center' },

  // Risk factors
  factorRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 6 },
  factorText: { flex: 1, fontSize: FONTS.sm, color: COLORS.slate700, lineHeight: 20 },

  // Bar Graph
  barGraphRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    gap: 4, marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  barColumn: { alignItems: 'center', gap: 4 },
  bar: { borderRadius: 4 },
  barLabel: { color: COLORS.slate400, fontWeight: FONTS.medium },

  emptyTrend: { alignItems: 'center', paddingVertical: SPACING.xl, gap: 8 },
  emptyText:  { fontSize: FONTS.sm, color: COLORS.slate400 },

  // Legend
  legendRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { fontSize: FONTS.xs, color: COLORS.slate500 },

  // Window toggle
  windowToggle: { flexDirection: 'row', borderRadius: RADIUS.full, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  toggleBtn:    { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.white },
  toggleBtnActive: { backgroundColor: COLORS.brand600 },
  toggleText:   { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.slate500 },
  toggleTextActive: { color: COLORS.white },

  // Timeline
  timelineRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  timelineDot: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  timelineContent: { flex: 1 },
  timelineMed: { fontSize: FONTS.sm, fontWeight: FONTS.semibold, color: COLORS.slate800 },
  timelineSub: { fontSize: FONTS.xs, color: COLORS.slate400, marginTop: 2 },
  timelineStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full,
  },
  timelineStatusText: { fontSize: FONTS.xs, fontWeight: FONTS.bold },

  emptyTimeline: { alignItems: 'center', paddingVertical: SPACING.xl, gap: 8 },

  loadMoreBtn: {
    alignItems: 'center', paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  loadMoreText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.brand600 },

  loadingText: {
    marginTop: SPACING.lg, color: COLORS.slate500, fontSize: FONTS.sm,
  },
});

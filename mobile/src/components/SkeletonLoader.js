/**
 * components/SkeletonLoader.js — Shimmer placeholder for loading states.
 *
 * Replaces raw ActivityIndicator across the app.
 * Layout-preserving: renders the same spatial footprint as the real content,
 * dramatically improving perceived responsiveness on slow Indian mobile networks.
 */
import React from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { useShimmer } from '../utils/animations';
import { COLORS, RADIUS, SPACING } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Shimmer Bar ──────────────────────────────────────────────────────────────
function ShimmerBar({ width = '100%', height = 16, style, borderRadius = 8 }) {
  const shimmer = useShimmer();

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_W, SCREEN_W],
  });

  return (
    <View style={[{ width, height, borderRadius, backgroundColor: COLORS.slate200, overflow: 'hidden' }, style]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX: shimmerTranslate }],
          },
        ]}
      >
        {/* Shimmer highlight */}
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.55)',
            width: '40%',
          }}
        />
      </Animated.View>
    </View>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────
function SkeletonCard({ children }) {
  return (
    <View style={styles.card}>{children}</View>
  );
}

// ─── Preset: Dashboard Adherence Card ─────────────────────────────────────────
export function AdherenceCardSkeleton() {
  return (
    <SkeletonCard>
      <ShimmerBar width="50%" height={14} style={{ marginBottom: 16 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.slate200 }} />
        <View style={{ flex: 1, gap: 10 }}>
          <ShimmerBar height={12} width="80%" />
          <ShimmerBar height={12} width="60%" />
          <ShimmerBar height={12} width="70%" />
        </View>
      </View>
      <ShimmerBar height={40} style={{ marginTop: 14, borderRadius: RADIUS.md }} />
    </SkeletonCard>
  );
}

// ─── Preset: Prescription Card ────────────────────────────────────────────────
export function PrescriptionCardSkeleton() {
  return (
    <SkeletonCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.slate200 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <ShimmerBar height={14} width="65%" />
          <ShimmerBar height={11} width="40%" />
        </View>
      </View>
    </SkeletonCard>
  );
}

// ─── Preset: Pillbox Slot ─────────────────────────────────────────────────────
export function SlotSkeleton() {
  return (
    <SkeletonCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
        <ShimmerBar height={14} width="35%" />
        <ShimmerBar height={14} width="20%" />
      </View>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.slate200 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <ShimmerBar height={13} width="55%" />
            <ShimmerBar height={10} width="30%" />
          </View>
          <ShimmerBar height={32} width={72} borderRadius={RADIUS.full} />
        </View>
      ))}
    </SkeletonCard>
  );
}

// ─── Preset: Dashboard Full Screen ────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <View style={{ padding: SPACING.lg, paddingBottom: 110 }}>
      <AdherenceCardSkeleton />
      <SkeletonCard>
        <ShimmerBar height={13} width="40%" style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <View key={i} style={{ flex: 1, height: 80, borderRadius: RADIUS.md, backgroundColor: COLORS.slate200 }} />
          ))}
        </View>
      </SkeletonCard>
      <PrescriptionCardSkeleton />
      <PrescriptionCardSkeleton />
    </View>
  );
}

// ─── Preset: Pillbox Full Screen ──────────────────────────────────────────────
export function PillboxSkeleton() {
  return (
    <View style={{ padding: SPACING.lg }}>
      <SlotSkeleton />
      <SlotSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
});

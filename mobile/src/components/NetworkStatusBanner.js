/**
 * components/NetworkStatusBanner.js — Offline / Syncing / Restored status.
 *
 * Appears at the top of all screens when network state changes.
 * Healthcare principle: users must always understand connectivity state
 * since OCR polling, sync queues, and notifications all depend on it.
 *
 * Wraps NetInfo for real-time network detection.
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSlideInTop } from '../utils/animations';
import { COLORS, FONTS, SPACING, SEMANTIC } from '../theme';

const STATES = {
  offline: {
    bg: SEMANTIC.dangerBg,
    border: SEMANTIC.dangerBorder,
    text: SEMANTIC.danger,
    icon: 'cloud-offline-outline',
    message: 'You are offline. Actions will sync when reconnected.',
  },
  syncing: {
    bg: SEMANTIC.warningBg,
    border: SEMANTIC.warningBorder,
    text: SEMANTIC.warning,
    icon: 'sync-outline',
    message: 'Reconnected. Syncing pending actions…',
  },
  restored: {
    bg: SEMANTIC.successBg,
    border: SEMANTIC.successBorder,
    text: SEMANTIC.success,
    icon: 'checkmark-circle-outline',
    message: 'Back online.',
  },
};

export default function NetworkStatusBanner() {
  const [netState, setNetState] = useState(null); // null | 'offline' | 'syncing' | 'restored'
  const prevIsConnected = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected && state.isInternetReachable !== false;

      if (prevIsConnected.current === null) {
        // First check — don't show banner on initial mount if connected
        prevIsConnected.current = isConnected;
        return;
      }

      if (!isConnected && prevIsConnected.current) {
        // Just went offline
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setNetState('offline');
      } else if (isConnected && !prevIsConnected.current) {
        // Just came back online
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setNetState('syncing');
        // After 2s show "restored", then hide after 2 more
        hideTimer.current = setTimeout(() => {
          setNetState('restored');
          hideTimer.current = setTimeout(() => setNetState(null), 2000);
        }, 2000);
      }

      prevIsConnected.current = isConnected;
    });

    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!netState) return null;

  const cfg = STATES[netState];

  return <BannerSlide cfg={cfg} />;
}

function BannerSlide({ cfg }) {
  const anim = useSlideInTop(-56);

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: cfg.bg, borderBottomColor: cfg.border }, anim.style]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={cfg.message}
    >
      <Ionicons name={cfg.icon} size={16} color={cfg.text} />
      <Text style={[styles.bannerText, { color: cfg.text }]}>{cfg.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
  },
  bannerText: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold,
    flex: 1,
  },
});

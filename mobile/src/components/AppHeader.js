/**
 * components/AppHeader.js — MediSync Branded Header
 *
 * Usage:
 *   <AppHeader title="Pillbox" subtitle="Today's schedule" />
 *   <AppHeader title="Dashboard" right={<RefreshButton />} />
 */

import React from 'react';
import {
  View, Text, StyleSheet, Image, Platform, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';

// Logo — require once at module level so bundler resolves it at build time
const LOGO = require('../../assets/logo.png');

export default function AppHeader({
  title,
  subtitle,
  right,           // optional: JSX element rendered on far right
  showLogo = true, // show MediSync logo mark
  variant = 'light', // 'light' (default) | 'brand' (teal bg)
}) {
  const isBrand = variant === 'brand';

  return (
    <View style={[styles.header, isBrand && styles.headerBrand]}>
      <View style={styles.inner}>
        {/* Logo mark */}
        {showLogo && (
          <View style={[styles.logoWrap, isBrand && styles.logoWrapBrand]}>
            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="cover"
              onError={() => {}} // silently swallow load error
            />
          </View>
        )}

        {/* Title block */}
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, isBrand && { color: COLORS.white }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, isBrand && { color: 'rgba(255,255,255,0.75)' }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Right slot */}
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

/**
 * Reusable icon button for AppHeader right slot.
 * Usage: <AppHeader right={<AppHeaderBtn icon="refresh" onPress={...} />} />
 */
export function AppHeaderBtn({ icon, onPress, badge = 0 }) {
  return (
    <TouchableOpacity style={styles.iconBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={20} color={COLORS.brand600} />
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    // Elevation shadow
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  headerBrand: {
    backgroundColor: COLORS.brand600,
    borderBottomColor: COLORS.brand700,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: COLORS.brand50,
    borderWidth: 1,
    borderColor: COLORS.brand200,
  },
  logoWrapBrand: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: FONTS['2xl'],
    fontWeight: FONTS.bold,
    color: COLORS.slate800,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: FONTS.xs,
    color: COLORS.slate500,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.brand50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.brand100,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.red500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 8,
    fontWeight: 'bold',
  },
});

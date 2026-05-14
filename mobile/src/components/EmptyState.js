/**
 * components/EmptyState.js — Reusable, animated empty state.
 *
 * Healthcare design principles applied:
 * - Never show a blank screen.
 * - Always educate: tell the user what this section is for.
 * - Always reassure: make it clear the state is expected, not an error.
 * - Always guide: provide a clear next action.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFadeSlideIn } from '../utils/animations';
import { COLORS, FONTS, SPACING, RADIUS, SHADOW, SEMANTIC } from '../theme';

export default function EmptyState({
  icon = 'folder-open-outline',
  iconColor,
  iconBg,
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
  accessibilityLabel,
}) {
  const anim = useFadeSlideIn(0);
  const resolvedIconColor = iconColor || SEMANTIC.info;
  const resolvedIconBg    = iconBg || SEMANTIC.infoBg;

  return (
    <Animated.View
      style={[styles.container, compact && styles.containerCompact, anim.style]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || `${title}. ${body || ''}`}
    >
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: resolvedIconBg }]}>
        <Ionicons name={icon} size={compact ? 28 : 36} color={resolvedIconColor} />
      </View>

      {/* Text */}
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {body ? (
        <Text style={[styles.body, compact && styles.bodyCompact]}>{body}</Text>
      ) : null}

      {/* Action */}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={15} color={COLORS.white} />
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING['2xl'],
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  containerCompact: {
    paddingVertical: SPACING.lg,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.lg,
    fontWeight: FONTS.bold,
    color: COLORS.slate800,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  titleCompact: {
    fontSize: FONTS.base,
  },
  body: {
    fontSize: FONTS.sm,
    color: COLORS.slate500,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
    marginBottom: SPACING.lg,
  },
  bodyCompact: {
    marginBottom: SPACING.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    marginTop: SPACING.sm,
  },
  actionText: {
    color: COLORS.white,
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
  },
});

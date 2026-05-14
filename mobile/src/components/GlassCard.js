/**
 * components/GlassCard.js — Base card with optional animation & accessibility.
 *
 * Props:
 *   animated    — fade+slide in on mount (default false)
 *   delay       — stagger delay in ms if animated (default 0)
 *   onPress     — makes card tappable
 *   accessibilityLabel — screen reader label
 *   style       — additional style overrides
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useFadeSlideIn } from '../utils/animations';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';

export default function GlassCard({
  children,
  style,
  animated = false,
  delay = 0,
  onPress,
  accessibilityLabel,
}) {
  const anim = useFadeSlideIn(delay);

  const inner = (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );

  const content = animated ? (
    <Animated.View style={anim.style}>
      {onPress ? (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {inner}
        </TouchableOpacity>
      ) : (
        inner
      )}
    </Animated.View>
  ) : onPress ? (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {inner}
    </TouchableOpacity>
  ) : inner;

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
});

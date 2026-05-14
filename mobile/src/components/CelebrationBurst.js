/**
 * components/CelebrationBurst.js — Restrained milestone celebration.
 *
 * Triggered on:
 * - 100% daily adherence
 * - Streak milestones (3, 7, 14, 30 days)
 *
 * Healthcare design principle:
 * Motion should feel like a calm "well done" — not a casino jackpot.
 * Duration: 600ms. Palette: teal + emerald only. No particle explosions.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SEMANTIC } from '../theme';

// Small floating orbs that drift upward and fade
function Orb({ delay, x, color }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -40,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        bottom: 0,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

const ORB_CONFIG = [
  { delay: 0,   x: 10,  color: COLORS.emerald500 },
  { delay: 60,  x: 30,  color: COLORS.brand500 },
  { delay: 40,  x: 55,  color: COLORS.emerald400 },
  { delay: 100, x: 75,  color: COLORS.brand400 },
  { delay: 20,  x: 95,  color: COLORS.emerald600 },
  { delay: 80,  x: 115, color: COLORS.brand600 },
];

export default function CelebrationBurst({ title = 'Well done!', subtitle }) {
  const cardScale   = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: cardOpacity, transform: [{ scale: cardScale }] },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${subtitle || ''}`}
    >
      {/* Orb burst */}
      <View style={styles.orbContainer} pointerEvents="none">
        {ORB_CONFIG.map((o, i) => (
          <Orb key={i} {...o} />
        ))}
      </View>

      <View style={styles.iconCircle}>
        <Ionicons name="checkmark-circle" size={32} color={SEMANTIC.success} />
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SEMANTIC.successBg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SEMANTIC.successBorder,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  orbContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: FONTS.xl,
    fontWeight: FONTS.bold,
    color: SEMANTIC.success,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FONTS.sm,
    color: COLORS.slate600,
    textAlign: 'center',
  },
});

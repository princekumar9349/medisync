/**
 * theme.js — Medisync Design System for React Native
 * 
 * All colors, typography, spacing, and shared StyleSheet fragments.
 * Business Theme Overhaul.
 */

import { StyleSheet, Platform } from 'react-native';

// ─── Color Palette ─────────────────────────────────────────────────────────────
export const COLORS = {
  // Vibrant Business Blue (Primary Brand)
  brand50:  '#EAF0FF',
  brand100: '#CBE0FF',
  brand200: '#9BBEFF',
  brand300: '#6A9DFF',
  brand400: '#3A7CFF',
  brand500: '#1A61FF',
  brand600: '#0B56DE', // Main Theme Color
  brand700: '#0042BB',
  brand800: '#002E8A',
  brand900: '#001A59',

  // Emerald (Kept for specific status/success highlights, but not main theme)
  emerald50:  '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',

  // Amber
  amber50:  '#fffbeb',
  amber100: '#fef3c7',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',

  // Red
  red50:  '#fef2f2',
  red100: '#fee2e2',
  red200: '#fecaca',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',

  // Slate
  slate50:  '#F8F9FE', // Very soft off-white background
  slate100: '#F1F4F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B', // Darkest text
  slate900: '#0F172A',

  // Utility
  white:       '#ffffff',
  black:       '#000000',
  transparent: 'transparent',

  // Backgrounds
  bgLight:   '#F8F9FE',
  bgDoctor:  '#F8F9FE', // Unified!
};

// ─── Typography ────────────────────────────────────────────────────────────────
export const FONTS = {
  xs:   11,
  sm:   13,
  base: 15,
  lg:   18,
  xl:   22,
  '2xl': 26,
  '3xl': 32,

  normal:    '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
};

// ─── Spacing ───────────────────────────────────────────────────────────────────
export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  '2xl': 32,
  '3xl': 40,
};

// ─── Border Radius ─────────────────────────────────────────────────────────────
export const RADIUS = {
  sm:   12,
  md:   16,
  lg:   24,
  xl:   32,
  full: 9999,
};

// ─── Shadows ───────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: Platform.select({
    ios: { shadowColor: '#0042BB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#0042BB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12 },
    android: { elevation: 5 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#0042BB', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 24 },
    android: { elevation: 10 },
  }),
};

// ─── Shared Styles ─────────────────────────────────────────────────────────────
export const S = StyleSheet.create({
  // Cards
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.md,
  },
  cardBordered: {
    borderWidth: 1,
    borderColor: COLORS.slate100,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },

  // Buttons
  btnPrimary: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.full, // Pill-shaped
    paddingVertical: 16,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: COLORS.brand600, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10 },
    }),
  },
  btnPrimaryText: {
    color: COLORS.white,
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
  },
  btnSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.brand200,
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondaryText: {
    color: COLORS.brand600,
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
  },

  // Inputs
  input: {
    backgroundColor: COLORS.slate50,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.full, // Pill-shaped inputs for business modern look
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    fontSize: FONTS.base,
    color: COLORS.slate800,
  },
  inputFocused: {
    borderColor: COLORS.brand500,
    backgroundColor: COLORS.white,
  },

  // Layout Wrappers (Business Theme Header + Overlap)
  headerBackground: {
    backgroundColor: COLORS.brand600,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: SPACING.xl,
  },
  headerTitle: {
    fontSize: FONTS['2xl'],
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONTS.base,
    color: COLORS.brand100,
    marginTop: 4,
  },
  overlapContainer: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    marginTop: -20, // Overlap the blue header
    overflow: 'hidden',
  },

  // Screen
  screen: { flex: 1, backgroundColor: COLORS.brand600 }, // Blue base so overlaps look nice
  screenDoctor: { flex: 1, backgroundColor: COLORS.brand600 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 60 },

  // Flex helpers
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },

  // Text
  sectionTitle: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.slate700,
    marginBottom: 6,
    marginLeft: 8,
  },

  // Badge
  badge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },

  // Divider
  divider: { height: 1, backgroundColor: COLORS.slate200, marginVertical: SPACING.md },
});

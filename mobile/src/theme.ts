/**
 * theme.js — Medisync Design System for React Native
 * 
 * All colors, typography, spacing, and shared StyleSheet fragments.
 * Clean Medical Theme — Teal/Green + White
 */

import { StyleSheet, Platform } from 'react-native';

// ─── Color Palette ─────────────────────────────────────────────────────────────
export const COLORS = {
  // Teal (Primary Brand)
  brand50:  '#F0FDFA',
  brand100: '#CCFBF1',
  brand200: '#99F6E4',
  brand300: '#5EEAD4',
  brand400: '#2DD4BF',
  brand500: '#14B8A6',
  brand600: '#0D9488', // Main Theme Color
  brand700: '#0F766E',
  brand800: '#115E59',
  brand900: '#134E4A',

  // Emerald (Success / Adherence)
  emerald50:  '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',

  // Amber (Warning)
  amber50:  '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',
  amber800: '#92400e',

  // Red (Error / Danger)
  red50:  '#fef2f2',
  red100: '#fee2e2',
  red200: '#fecaca',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',
  red800: '#991b1b',

  // Neutral (Gray scale — warm tint)
  slate50:  '#FAFAFA',
  slate100: '#F5F5F5',
  slate200: '#E5E5E5',
  slate300: '#D4D4D4',
  slate400: '#A3A3A3',
  slate500: '#737373',
  slate600: '#525252',
  slate700: '#404040',
  slate800: '#262626',
  slate900: '#171717',

  // Utility
  white:       '#FFFFFF',
  black:       '#000000',
  transparent: 'transparent',

  // Backgrounds
  bgLight:   '#F7F9FC',
  bgDoctor:  '#FAFAFA',

  // Borders
  border:      '#E5E7EB',
  borderLight: '#F3F4F6',
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
} as const;

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
  lg:   20,
  xl:   24,
  full: 9999,
};

// ─── Shadows ───────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
    android: { elevation: 1 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    android: { elevation: 3 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
    android: { elevation: 6 },
  }),
};

// ─── Animation Tokens ──────────────────────────────────────────────────────────
export const ANIMATION = {
  // Durations (ms)
  fast:   150,
  normal: 250,
  slow:   400,
  // Standard easing for healthcare-grade motion (no bounce)
  easeOut: 'ease-out',
};

// ─── Semantic Color Aliases ────────────────────────────────────────────────────
// Use these in components instead of raw COLORS.brand600 etc.
// This makes intent clear and future re-theming trivial.
export const SEMANTIC = {
  success:     '#059669',  // COLORS.emerald600
  successBg:   '#ecfdf5',  // COLORS.emerald50
  successBorder:'#a7f3d0', // COLORS.emerald200
  warning:     '#d97706',  // COLORS.amber600
  warningBg:   '#fffbeb',  // COLORS.amber50
  warningBorder:'#fde68a', // COLORS.amber200
  danger:      '#dc2626',  // COLORS.red600
  dangerBg:    '#fef2f2',  // COLORS.red50
  dangerBorder:'#fecaca',  // COLORS.red200
  info:        '#0D9488',  // COLORS.brand600 (teal)
  infoBg:      '#F0FDFA',  // COLORS.brand50
  infoBorder:  '#99F6E4',  // COLORS.brand200
  surface:     '#FFFFFF',
  surfaceAlt:  '#F7F9FC',  // COLORS.bgLight
  textPrimary: '#262626',  // COLORS.slate800
  textSecondary:'#737373', // COLORS.slate500
  textMuted:   '#A3A3A3',  // COLORS.slate400
  border:      '#E5E7EB',
};

// ─── Touch Target Sizes ────────────────────────────────────────────────────────
// Per Apple HIG & Google Material: minimum 44×44pt for all interactive targets.
// Critical for elderly mode and accessibility compliance.
export const TOUCH = {
  min: 44,     // Minimum dimension for any tappable element
  comfortable: 48,
  large: 56,   // For primary actions (SOS, Save, Confirm)
};

// ─── Typography Line Heights ───────────────────────────────────────────────────
export const LINE_HEIGHT = {
  tight:   1.2,  // Use for headings (multiply by fontSize)
  normal:  1.5,  // Body text
  relaxed: 1.75, // Multi-line medical instructions / descriptions
};

// ─── Shared Styles ─────────────────────────────────────────────────────────────
export const S = StyleSheet.create({
  // Cards — clean bordered style
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardElevated: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.md,
  },
  cardBordered: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },

  // Buttons
  btnPrimary: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
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
    paddingVertical: 14,
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
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    fontSize: FONTS.base,
    color: COLORS.slate800,
  },
  inputFocused: {
    borderColor: COLORS.brand500,
    backgroundColor: COLORS.white,
  },

  // Clean Header Bar (replaces blue header)
  headerBar: {
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONTS['2xl'],
    fontWeight: FONTS.bold,
    color: COLORS.slate800,
  },
  headerSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.slate500,
    marginTop: 2,
  },

  screen: { flex: 1, backgroundColor: COLORS.bgLight },
  screenDoctor: { flex: 1, backgroundColor: COLORS.bgLight },
  scrollContent: { padding: SPACING.lg, paddingBottom: 110 },


  // Flex helpers
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },

  // Text
  sectionTitle: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.brand700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONTS.sm,
    fontWeight: FONTS.bold,
    color: COLORS.slate700,
    marginBottom: 6,
    marginLeft: 4,
  },

  // Badge
  badge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },

  // Divider
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
});
